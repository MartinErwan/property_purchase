"""Temps de trajet en transports en commun entre toutes les stations ferrées d'Île-de-France,
calculé sur les horaires réels (GTFS IDFM), correspondances comprises.

Entrées : data/raw/gtfs/IDFM-gtfs.zip (horaires IDFM, 30 jours glissants ; téléchargé si absent depuis GTFS_URL)
          data/processed/transports.parquet (stations de la carte)
Sorties : data/processed/stations_trajet.parquet  une ligne par station de la carte (clé = id_ref_zdc),
                                                  avec le pôle auquel elle appartient
          data/processed/poles_trajet.parquet     une ligne par pôle de destination
          data/processed/temps_trajet.npy         matrice stations × pôles (minutes, uint8 ; 255 = injoignable)
          data/processed/temps_trajet_gpe_<année>.npy  idem avec les tronçons du Grand Paris Express ouverts
                                                  à cet horizon (une matrice par année de mise en service)
          data/processed/iris_stations_trajet.parquet  pour chaque IRIS, les stations accessibles à pied
                                                  (jusqu'à N_STATIONS_IRIS, à moins de MARCHE_MAX_M) et le temps de marche

Méthode (Connection Scan Algorithm à rebours) :
- Réseau : métro, RER, Transilien, TER, tram, câble C1 (bus exclus) ; circulations d'un mardi
  ordinaire (JOUR), départs entre DEBUT et la dernière heure d'arrivée.
- Pour une destination et une heure d'arrivée H, on parcourt les circulations de la plus tardive à la
  plus précoce et on calcule, pour chaque quai, le départ le plus tardif permettant d'arriver avant H.
  Correspondances : temps officiels IDFM entre quais (transfers.txt) ; CHANGEMENT_QUAI_S pour
  changer de train sur un même quai.
- Temps de trajet d'une station = H − départ le plus tardif, moyenné sur plusieurs heures d'arrivée
  (ARRIVEES) pour ne pas dépendre de la chance d'un horaire. L'attente au départ n'est donc comptée
  que si les horaires l'imposent (on part « juste à temps », comme avec un calculateur d'itinéraire).
- Les quais GTFS sont rattachés à la station de la carte la plus proche (≤ RATTACHEMENT_M).
- Destinations = pôles : stations reliées par une correspondance à pied d'au plus POLE_S
  (ex. Châtelet et Châtelet-Les Halles). Arriver à n'importe quel quai du pôle suffit.
- Marche IRIS → station : distance à vol d'oiseau depuis le point de référence de l'IRIS
  × DETOUR, à VITESSE_MARCHE_M_MIN. Le temps IRIS → destination (calculé dans la carte) est le
  minimum sur ces stations de (marche + trajet).
- Grand Paris Express (variante « avec GPE », hypothèses non vérifiées) : les lignes 15 à 18 n'ont
  pas d'horaires ; on leur crée des circulations fictives sur leur tracé IDFM (projets_lignes_idf),
  une toutes les GPE_INTERVALLE_S, à GPE_VITESSE_KMH de vitesse commerciale (arrêts compris),
  distance mesurée le long du tracé. Une matrice par horizon : un tronçon est ouvert à l'horizon A si
  sa date de mise en service estimée par IDFM (champ mes_off_tx, « fin 2028 » → 2028) est ≤ A.
  Correspondance avec le réseau existant : marche (× DETOUR) + GPE_PROFONDEUR_S (gares profondes).
  Les gares du GPE deviennent aussi des stations de départ pour les IRIS voisins.
"""

import re
import time
import zipfile
from pathlib import Path

import duckdb
from shapely.ops import linemerge, unary_union
import requests
import geopandas as gpd
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
GTFS_ZIP = ROOT / "data" / "raw" / "gtfs" / "IDFM-gtfs.zip"
GTFS = GTFS_ZIP.parent
GTFS_URL = ("https://data.iledefrance-mobilites.fr/explore/dataset/offre-horaires-tc-gtfs-idfm/files/"
            "a925e164271e4bca93433756d6a340d1/download/")
PROC = ROOT / "data" / "processed"

# Mardi hors vacances scolaires, dans la fenêtre du GTFS téléchargé (30 jours glissants : à ajuster
# si le fichier est remplacé par une version plus récente).
JOUR = "20261006"
JOUR_SEMAINE = "tuesday"
DEBUT = 5 * 3600 + 30 * 60             # 05:30 (les trajets longs de grande couronne partent tôt)
ARRIVEES = [h * 3600 + m * 60 for h, m in ((8, 30), (8, 45), (9, 0), (9, 15))]
CHANGEMENT_QUAI_S = 60
RATTACHEMENT_M = 400
POLE_S = 360
TYPES_ROUTES = (0, 1, 2, 6)            # tram, métro, train (RER/Transilien/TER), câble
EXCLUES = ("CDG VAL", "ORLYVAL")
INJOIGNABLE = 255
GPE_LIGNES = ["METRO 15", "METRO 16", "METRO 17", "METRO 18"]
GPE_VITESSE_KMH = {"METRO 15": 55, "METRO 16": 65, "METRO 17": 65, "METRO 18": 65}
GPE_INTERVALLE_S = 180
GPE_PROFONDEUR_S = 120
GPE_CORRESPONDANCE_M = 400
GPE_CORRESPONDANCE_INTERNE_S = 180     # entre deux lignes du GPE dans une même gare
GPE_ACCROCHE_M = 200                   # distance max d'une gare à son tracé
N_GARES_GPE_IRIS = 3
MARCHE_MAX_M = 2500
N_STATIONS_IRIS = 6
DETOUR = 1.3
VITESSE_MARCHE_M_MIN = 75              # 4,5 km/h
FICHIERS = ["routes.txt", "trips.txt", "calendar.txt", "calendar_dates.txt", "stop_times.txt",
            "stops.txt", "transfers.txt"]


def extraire_gtfs() -> None:
    if not GTFS_ZIP.exists():
        GTFS.mkdir(parents=True, exist_ok=True)
        with requests.get(GTFS_URL, stream=True, timeout=300) as r:
            r.raise_for_status()
            with open(GTFS_ZIP, "wb") as f:
                for bloc in r.iter_content(1 << 20):
                    f.write(bloc)
    manquants = [f for f in FICHIERS if not (GTFS / f).exists()]
    if manquants:
        with zipfile.ZipFile(GTFS_ZIP) as z:
            z.extractall(GTFS, members=manquants)


def connexions(con: duckdb.DuckDBPyConnection) -> pd.DataFrame:
    """Une ligne par tronçon (arrêt → arrêt suivant) d'une circulation ferrée du JOUR."""
    g = str(GTFS)
    hms = lambda c: (f"(split_part({c},':',1)::int*3600 + split_part({c},':',2)::int*60"  # noqa: E731
                     f" + split_part({c},':',3)::int)")
    con.sql(f"""
    create or replace table services as
    with base as (
        select service_id from read_csv('{g}/calendar.txt', types={{'start_date':'VARCHAR','end_date':'VARCHAR'}})
        where {JOUR_SEMAINE} = 1 and start_date <= '{JOUR}' and end_date >= '{JOUR}'),
    ex as (select service_id, exception_type
           from read_csv('{g}/calendar_dates.txt', types={{'date':'VARCHAR'}}) where date = '{JOUR}')
    select service_id from base where service_id not in (select service_id from ex where exception_type = 2)
    union select service_id from ex where exception_type = 1;

    create or replace table trajets as
    select t.trip_id from read_csv('{g}/trips.txt', types={{'trip_id':'VARCHAR'}}) t
    join read_csv('{g}/routes.txt') r using (route_id)
    join services using (service_id)
    where r.route_type in {TYPES_ROUTES} and r.route_short_name not in {EXCLUES};

    create or replace table passages as
    select s.trip_id, s.stop_id, s.stop_sequence, coalesce(s.pickup_type, 0) montee,
           coalesce(s.drop_off_type, 0) descente, {hms('s.arrival_time')} arr, {hms('s.departure_time')} dep
    from read_csv('{g}/stop_times.txt', types={{'trip_id':'VARCHAR','stop_id':'VARCHAR',
                  'arrival_time':'VARCHAR','departure_time':'VARCHAR'}}) s
    join trajets using (trip_id);
    """)
    return con.sql(f"""
    select * from (
        select trip_id, stop_id dep_stop, dep, montee,
               lead(stop_id) over w arr_stop, lead(arr) over w arr, lead(descente) over w descente
        from passages window w as (partition by trip_id order by stop_sequence))
    where arr_stop is not null and dep >= {DEBUT} and arr <= {max(ARRIVEES)}
    order by dep desc, arr desc
    """).df()


def rattacher_quais(con: duckdb.DuckDBPyConnection, quais: np.ndarray) -> tuple[gpd.GeoDataFrame, pd.Series]:
    """Stations de la carte (une par zone de correspondance) et station de rattachement de chaque quai."""
    t = gpd.read_parquet(PROC / "transports.parquet")
    t = t[t["existant"]]
    stations = (t.groupby("id_ref_zdc", as_index=False)
                  .agg(nom=("nom", "first"), lignes=("ligne", lambda x: ", ".join(sorted(set(x)))),
                       geometry=("geometry", "first")))
    stations = gpd.GeoDataFrame(stations, geometry="geometry", crs=t.crs).reset_index(drop=True)

    arrets = con.sql(f"select stop_id, stop_lon, stop_lat from read_csv('{GTFS}/stops.txt', "
                     f"types={{'stop_id':'VARCHAR'}})").df()
    arrets = arrets[arrets["stop_id"].isin(set(quais))]
    arrets = gpd.GeoDataFrame(arrets, geometry=gpd.points_from_xy(arrets["stop_lon"], arrets["stop_lat"]),
                              crs="EPSG:4326").to_crs(t.crs)
    j = gpd.sjoin_nearest(arrets, stations[["geometry"]], max_distance=RATTACHEMENT_M, how="left")
    j = j[~j.index.duplicated()]
    rattachement = pd.Series(j["index_right"].to_numpy(), index=j["stop_id"]).dropna().astype(int)
    print(f"quais rattachés à une station de la carte : {len(rattachement)} / {len(arrets)}")
    return stations, rattachement


def correspondances(con: duckdb.DuckDBPyConnection, index: dict[str, int]) -> pd.DataFrame:
    """Cheminements à pied entre quais ferrés (quai a → quai b, durée en secondes)."""
    tr = con.sql(f"select from_stop_id, to_stop_id, min_transfer_time from read_csv('{GTFS}/transfers.txt', "
                 f"types={{'from_stop_id':'VARCHAR','to_stop_id':'VARCHAR'}})").df()
    tr = tr[tr["from_stop_id"].isin(index) & tr["to_stop_id"].isin(index)]
    tr = pd.DataFrame({"a": tr["from_stop_id"].map(index), "b": tr["to_stop_id"].map(index),
                       "duree": tr["min_transfer_time"].fillna(0).astype(int)})
    return tr[tr["a"] != tr["b"]]


def entrants_par_quai(tr: pd.DataFrame, n_quais: int) -> list[list[tuple[int, int]]]:
    entrants: list[list[tuple[int, int]]] = [[] for _ in range(n_quais)]
    for a, b, d in zip(tr["a"], tr["b"], tr["duree"]):
        entrants[b].append((a, d))
    return entrants


def poles(stations: gpd.GeoDataFrame, tr: pd.DataFrame, quai_station: np.ndarray) -> np.ndarray:
    """Regroupe en pôles les stations reliées par une correspondance courte (union-find)."""
    parent = list(range(len(stations)))

    def racine(i: int) -> int:
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    courts = tr[tr["duree"] <= POLE_S]
    for a, b in zip(quai_station[courts["a"]], quai_station[courts["b"]]):
        if a >= 0 and b >= 0 and a != b:
            parent[racine(a)] = racine(b)
    racines = np.array([racine(i) for i in range(len(stations))])
    return pd.factorize(racines)[0]


def csa_rebours(c_dep, c_arr, c_dep_q, c_arr_q, c_trip, c_montee, c_descente, n_quais, n_trips,
                entrants, destinations: list[int], heure: int) -> np.ndarray:
    """Départ le plus tardif de chaque quai pour arriver à l'un des quais `destinations` avant `heure`."""
    moins_inf = -(10 ** 9)
    arrivee_max = [moins_inf] * n_quais     # heure d'arrivée (en véhicule) la plus tardive acceptable au quai
    depart_max = [moins_inf] * n_quais      # heure de départ (à pied, depuis le quai) la plus tardive
    trip_ok = [False] * n_trips
    for q in destinations:
        arrivee_max[q] = heure
        depart_max[q] = heure
        for x, d in entrants[q]:
            if heure - d > depart_max[x]:
                depart_max[x] = heure - d
            if heure - d > arrivee_max[x]:
                arrivee_max[x] = heure - d
    for i in range(len(c_dep)):
        a = c_arr[i]
        if a > heure:
            continue
        t = c_trip[i]
        if not (trip_ok[t] or (c_descente[i] != 1 and a <= arrivee_max[c_arr_q[i]])):
            continue
        trip_ok[t] = True
        if c_montee[i] == 1:
            continue
        d, q = c_dep[i], c_dep_q[i]
        if d > depart_max[q]:
            depart_max[q] = d
            if d - CHANGEMENT_QUAI_S > arrivee_max[q]:
                arrivee_max[q] = d - CHANGEMENT_QUAI_S
            for x, w in entrants[q]:
                if d - w > depart_max[x]:
                    depart_max[x] = d - w
                if d - w > arrivee_max[x]:
                    arrivee_max[x] = d - w
    return np.array(depart_max)


def annee(texte) -> int | None:
    """Année d'une date de mise en service IDFM (« 2027 », « fin 2028 », « mi 2031 ») ; None si inconnue."""
    m = re.search(r"(20\d\d)", str(texte))
    return int(m.group(1)) if m else None


def traces_gpe() -> gpd.GeoDataFrame:
    traces = gpd.read_parquet(PROC / "lignes.parquet")
    traces = traces[~traces["existant"] & traces["ligne"].isin(GPE_LIGNES)].copy()
    traces["annee"] = traces["mise_en_service"].map(annee).fillna(9999).astype(int)
    return traces


def troncons_gpe(gares: gpd.GeoDataFrame, horizon: int) -> list[tuple[str, str, str, float]]:
    """Liens (ligne, gare a, gare b, longueur en m) entre gares consécutives le long des tracés IDFM des
    tronçons ouverts à `horizon`. Les tracés d'une ligne sont d'abord fusionnés (un tronçon en tunnel et
    le viaduc qui le prolonge ne forment qu'un parcours) puis découpés aux embranchements."""
    traces = traces_gpe()
    traces = traces[traces["annee"] <= horizon]
    liens: dict[tuple, float] = {}
    for ligne, t in traces.groupby("ligne"):
        union = unary_union(t.geometry.tolist())
        fusion = linemerge(union) if union.geom_type == "MultiLineString" else union
        parties = [g for g in getattr(fusion, "geoms", [fusion]) if g.geom_type == "LineString"]
        for geom in parties:
            g = gares[(gares["ligne"] == ligne) & (gares.distance(geom) <= GPE_ACCROCHE_M)]
            positions = sorted((geom.project(pt), nom) for nom, pt in zip(g["nom"], g.geometry))
            for (pa, a), (pb, b) in zip(positions, positions[1:]):
                if a != b:
                    cle = (ligne, *sorted((a, b)))
                    liens[cle] = min(liens.get(cle, float("inf")), pb - pa)
    return [(l, a, b, d) for (l, a, b), d in liens.items()]


def parcours(liens: list[tuple[str, str, float]]) -> list[list[tuple[str, float]]]:
    """Découpe le graphe d'une ligne en parcours (gare, abscisse) entre terminus / embranchements."""
    voisins: dict[str, dict[str, float]] = {}
    for a, b, d in liens:
        voisins.setdefault(a, {})[b] = d
        voisins.setdefault(b, {})[a] = d
    vus, res = set(), []
    departs = [n for n, v in voisins.items() if len(v) != 2] or [next(iter(voisins))]  # boucle pure
    for n0 in departs:
        for n1 in voisins[n0]:
            if (n0, n1) in vus:
                continue
            chemin, x, prec, pos = [(n0, 0.0)], n1, n0, 0.0
            while True:
                vus.update({(prec, x), (x, prec)})
                pos += voisins[prec][x]
                chemin.append((x, pos))
                suivants = [y for y in voisins[x] if y != prec and (x, y) not in vus]
                if len(voisins[x]) != 2 or not suivants:
                    break
                prec, x = x, suivants[0]
            res.append(chemin)
    return res


def lire_gares_gpe() -> gpd.GeoDataFrame:
    t = gpd.read_parquet(PROC / "transports.parquet")
    return t[(~t["existant"]) & t["ligne"].isin(GPE_LIGNES)][["nom", "ligne", "geometry"]]


def reseau_gpe(quais_existants: gpd.GeoDataFrame, horizon: int) -> tuple[pd.DataFrame, gpd.GeoDataFrame, pd.DataFrame]:
    """Circulations fictives des tronçons du GPE ouverts à `horizon`, quais du GPE desservis et
    cheminements vers le réseau existant."""
    gares = lire_gares_gpe()
    lignes_liens: dict[str, list] = {}
    for ligne, a, b, d in troncons_gpe(gares, horizon):
        lignes_liens.setdefault(ligne, []).append((a, b, d))

    lignes_c = []
    for ligne, liens in lignes_liens.items():
        v = GPE_VITESSE_KMH[ligne] / 3.6
        for k, chemin in enumerate(parcours(liens)):
            for sens, arrets in (("a", chemin), ("r", [(n, chemin[-1][1] - x) for n, x in reversed(chemin)])):
                for h0 in range(DEBUT, max(ARRIVEES), GPE_INTERVALLE_S):
                    trip = f"GPE:{ligne}:{k}{sens}:{h0}"
                    temps = [h0 + round(x / v) for _, x in arrets]
                    for (na, _), (nb, _), ta, tb in zip(arrets, arrets[1:], temps, temps[1:]):
                        lignes_c.append((trip, f"GPE:{ligne}:{na}", ta, 0, f"GPE:{ligne}:{nb}", tb, 0))
    c = pd.DataFrame(lignes_c, columns=["trip_id", "dep_stop", "dep", "montee", "arr_stop", "arr", "descente"])

    quais_gpe = gares.assign(stop_id="GPE:" + gares["ligne"] + ":" + gares["nom"]).drop_duplicates("stop_id")
    desservis = set(c["dep_stop"]) | set(c["arr_stop"])
    quais_gpe = quais_gpe[quais_gpe["stop_id"].isin(desservis)]
    # Cheminements : gare GPE ↔ quais existants proches, et entre lignes du GPE d'une même gare.
    chem = []
    tous = gpd.sjoin(gpd.GeoDataFrame(quais_gpe[["stop_id"]], geometry=quais_gpe.buffer(GPE_CORRESPONDANCE_M), crs=gares.crs),
                     quais_existants[["stop_id", "geometry"]].rename(columns={"stop_id": "q"}), predicate="contains")
    for sid, q, idx_g in zip(tous["stop_id"], tous["q"], tous.index):
        d = quais_gpe.geometry.loc[idx_g].distance(quais_existants.set_index("stop_id").geometry.loc[q])
        duree = int(d * DETOUR / VITESSE_MARCHE_M_MIN * 60 + GPE_PROFONDEUR_S)
        chem += [(sid, q, duree), (q, sid, duree)]
    for _, g in quais_gpe.groupby("nom"):
        for a in g["stop_id"]:
            for b in g["stop_id"]:
                if a != b:
                    chem.append((a, b, GPE_CORRESPONDANCE_INTERNE_S))
    chem = pd.DataFrame(chem, columns=["from", "to", "duree"])
    print(f"GPE {horizon} : {len(lignes_liens)} lignes, {quais_gpe['nom'].nunique()} gares, {c['trip_id'].nunique()} circulations "
          f"fictives, {len(chem)} cheminements")
    return c, quais_gpe, chem


def calculer_matrice(c: pd.DataFrame, index: dict[str, int], tr: pd.DataFrame, quai_station: np.ndarray,
                     quais_par_pole: pd.Series, n: int, n_poles: int, titre: str) -> np.ndarray:
    c = c.sort_values(["dep", "arr"], ascending=False)
    trips = {t: k for k, t in enumerate(pd.unique(c["trip_id"]))}
    cols = dict(c_dep=c["dep"].tolist(), c_arr=c["arr"].tolist(), c_dep_q=c["dep_stop"].map(index).tolist(),
                c_arr_q=c["arr_stop"].map(index).tolist(), c_trip=c["trip_id"].map(trips).tolist(),
                c_montee=c["montee"].tolist(), c_descente=c["descente"].tolist())
    entrants = entrants_par_quai(tr, len(index))
    matrice = np.full((n, n_poles), INJOIGNABLE, dtype=np.uint8)
    debut = time.time()
    for k, (p_dest, quais_dest) in enumerate(quais_par_pole.items()):
        somme = np.zeros(n)
        ok = np.ones(n, dtype=bool)
        for h in ARRIVEES:
            dep = csa_rebours(**cols, n_quais=len(index), n_trips=len(trips), entrants=entrants,
                              destinations=quais_dest, heure=h)
            # Station de départ : le quai qui permet de partir le plus tard.
            par_station = pd.Series(dep).groupby(quai_station).max().drop(-1, errors="ignore")
            duree = (h - par_station.reindex(range(n))) / 60
            ok &= (duree >= 0).to_numpy() & (duree < INJOIGNABLE).to_numpy()
            somme += duree.fillna(0).to_numpy()
        colonne = np.where(ok, np.round(somme / len(ARRIVEES)), INJOIGNABLE)
        matrice[:, p_dest] = np.clip(colonne, 0, INJOIGNABLE).astype(np.uint8)
    print(f"matrice {titre} : {n} stations × {n_poles} pôles ({time.time() - debut:.0f} s)")
    return matrice


def stations_des_iris(stations: gpd.GeoDataFrame) -> pd.DataFrame:
    """Stations à distance de marche de chaque IRIS, avec le temps de marche estimé (minutes).
    On garde les N_STATIONS_IRIS stations en service les plus proches et les N_GARES_GPE_IRIS gares du GPE."""
    iris = gpd.read_parquet(PROC / "indicateurs_iris.parquet")[["code_iris", "geometry"]]
    centre = iris.centroid
    ref = centre.where(centre.within(iris.geometry), iris.representative_point())
    pts = gpd.GeoDataFrame({"code_iris": iris["code_iris"]}, geometry=ref, crs=iris.crs)
    zone = pts.buffer(MARCHE_MAX_M)
    j = gpd.sjoin(gpd.GeoDataFrame(pts[["code_iris"]], geometry=zone, crs=iris.crs),
                  stations[stations["desservie"]][["geometry"]], predicate="contains")
    j["station"] = j["index_right"]
    j["marche_min"] = (pts.geometry.loc[j.index].distance(stations.geometry.loc[j["station"]], align=False).to_numpy()
                       * DETOUR / VITESSE_MARCHE_M_MIN).round(1)
    j["gpe"] = stations["gpe"].loc[j["station"]].to_numpy()
    j = j.sort_values(["code_iris", "marche_min"])
    j = pd.concat([j[~j["gpe"]].groupby("code_iris").head(N_STATIONS_IRIS),
                   j[j["gpe"]].groupby("code_iris").head(N_GARES_GPE_IRIS)]).sort_values(["code_iris", "marche_min"])
    res = j.groupby("code_iris").agg(stations=("station", list), marche_min=("marche_min", list)).reset_index()
    print(f"IRIS avec au moins une station à moins de {MARCHE_MAX_M} m : {len(res)} / {len(iris)}")
    return res


def main() -> None:
    extraire_gtfs()
    con = duckdb.connect()
    debut = time.time()
    c = connexions(con)
    quais = pd.unique(pd.concat([c["dep_stop"], c["arr_stop"]]))
    index = {q: k for k, q in enumerate(quais)}
    trips = {t: k for k, t in enumerate(pd.unique(c["trip_id"]))}
    print(f"{len(c):,} tronçons, {len(quais)} quais, {len(trips):,} circulations ({time.time() - debut:.0f} s)")

    stations, rattachement = rattacher_quais(con, quais)
    tr = correspondances(con, index)

    quai_station = np.full(len(quais), -1)
    for q, s in rattachement.items():
        quai_station[index[q]] = s
    stations["pole"] = poles(stations, tr, quai_station)
    stations["gpe"] = False
    stations["desservie"] = stations.index.isin(pd.unique(quai_station[quai_station >= 0]))
    quai_pole = np.where(quai_station >= 0, stations["pole"].to_numpy()[quai_station], -1)
    quais_par_pole = pd.Series(np.arange(len(quais))).groupby(quai_pole).apply(list).drop(-1, errors="ignore")
    n_poles = stations["pole"].nunique()

    # Réseau GPE fictif : gares ajoutées en fin de liste des stations (lignes supplémentaires de la matrice).
    arrets = con.sql(f"select stop_id, stop_lon, stop_lat from read_csv('{GTFS}/stops.txt', "
                     f"types={{'stop_id':'VARCHAR'}})").df()
    arrets = arrets[arrets["stop_id"].isin(index)]
    quais_existants = gpd.GeoDataFrame(arrets[["stop_id"]], crs="EPSG:4326",
                                       geometry=gpd.points_from_xy(arrets["stop_lon"], arrets["stop_lat"])).to_crs(stations.crs)
    toutes_gares = lire_gares_gpe()
    gares_gpe = (toutes_gares.groupby("nom", as_index=False)
                 .agg(lignes=("ligne", lambda x: ", ".join(sorted(set(x)))), geometry=("geometry", "first")))
    gares_gpe = gpd.GeoDataFrame(gares_gpe, geometry="geometry", crs=stations.crs)
    gares_gpe = gares_gpe.assign(id_ref_zdc="gpe:" + gares_gpe["nom"], pole=-1, gpe=True, desservie=True)
    toutes = pd.concat([stations, gares_gpe], ignore_index=True)
    toutes = gpd.GeoDataFrame(toutes, geometry="geometry", crs=stations.crs)
    n = len(toutes)

    matrice = calculer_matrice(c, index, tr, quai_station, quais_par_pole, n, n_poles, "sans GPE")

    station_de_gare = dict(zip(gares_gpe["nom"], range(len(stations), n)))
    horizons = sorted(a for a in traces_gpe()["annee"].unique() if a < 9999)
    matrices_gpe = {}
    for horizon in horizons:
        c_gpe, quais_gpe, chem_gpe = reseau_gpe(quais_existants, horizon)
        index_gpe = {**index, **{q: len(index) + k for k, q in enumerate(quais_gpe["stop_id"])}}
        quai_station_gpe = np.concatenate([quai_station, quais_gpe["nom"].map(station_de_gare).to_numpy()])
        tr_gpe = pd.concat([tr, pd.DataFrame({"a": chem_gpe["from"].map(index_gpe), "b": chem_gpe["to"].map(index_gpe),
                                              "duree": chem_gpe["duree"]})], ignore_index=True)
        m = calculer_matrice(pd.concat([c, c_gpe], ignore_index=True), index_gpe, tr_gpe,
                             quai_station_gpe, quais_par_pole, n, n_poles, f"GPE {horizon}")
        # Ouvrir une ligne ne peut pas allonger un trajet (on peut l'ignorer) : on corrige les rares écarts
        # d'une minute ou deux dus à l'ordre des circulations de même horaire dans l'algorithme.
        precedente = matrices_gpe[max(matrices_gpe)] if matrices_gpe else matrice
        matrices_gpe[horizon] = np.minimum(m, precedente)
    stations = toutes
    # Pôle : nom = celui de sa station la plus connectée (le plus de lignes), position = centre des stations.
    stations["n_lignes"] = stations["lignes"].str.count(",") + 1
    tete = stations[~stations["gpe"]].sort_values("n_lignes", ascending=False).drop_duplicates("pole").set_index("pole")
    membres = stations[~stations["gpe"]].groupby("pole")["nom"].agg(lambda x: " / ".join(sorted(set(x))))
    centre = stations[~stations["gpe"]].dissolve(by="pole").centroid
    pole_df = gpd.GeoDataFrame({"nom": tete["nom"], "stations": membres,
                                "desservi": stations[~stations["gpe"]].groupby("pole")["desservie"].any()},
                               geometry=centre, crs=stations.crs).sort_index()
    stations.drop(columns="n_lignes").to_parquet(PROC / "stations_trajet.parquet")
    pole_df.to_parquet(PROC / "poles_trajet.parquet")
    np.save(PROC / "temps_trajet.npy", matrice)
    for ancien in PROC.glob("temps_trajet_gpe*.npy"):
        ancien.unlink()
    for horizon, m in matrices_gpe.items():
        np.save(PROC / f"temps_trajet_gpe_{horizon}.npy", m)
    stations_des_iris(stations).to_parquet(PROC / "iris_stations_trajet.parquet")


if __name__ == "__main__":
    main()
