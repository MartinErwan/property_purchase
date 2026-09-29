"""Carte HTML interactive autonome (MapLibre GL) : IRIS dans les filtres colorés par prix, tracés
des lignes à leur couleur officielle avec un point par station, QPV hachurés, filtres budget /
distance / revenu / QPV réglables dans la page.

Entrées : data/exports/carte.gpkg (scripts/09_export_carte.py)
          data/processed/{stations_trajet,poles_trajet,iris_stations_trajet}.parquet, temps_trajet.npy
          (scripts/08_temps_trajet.py)
Sortie  : data/exports/carte.html (un seul fichier ; seul le fond de plan est chargé depuis internet :
          Plan IGN v2 de la Géoplateforme, sans clé d'API)

La bibliothèque MapLibre GL JS (licence BSD-3) est téléchargée une fois depuis le registre npm
dans data/raw/vendor/ puis intégrée dans la page.

Usage : uv run python scripts/10_carte_html.py
"""

import base64
import io
import json
import re
import tarfile
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd
import requests

from zone import DEPARTEMENTS

ROOT = Path(__file__).resolve().parents[1]
EXPORT = ROOT / "data" / "exports"
PROC = ROOT / "data" / "processed"
VENDOR = ROOT / "data" / "raw" / "vendor" / "maplibre-gl-4.7.1"
MAPLIBRE_TGZ = "https://registry.npmjs.org/maplibre-gl/-/maplibre-gl-4.7.1.tgz"

SIMPLIFICATION_M = 4  # simplification des contours pour l'affichage uniquement
DECIMALES = 5  # ~1 m en latitude
DESTINATION_DEFAUT = "Châtelet-Les Halles"   # pôle de destination initial du temps de trajet
TRAJET_MAX_DEFAUT = 60                        # minutes (120 = pas de filtre)


def maplibre() -> tuple[str, str]:
    js, css = VENDOR / "maplibre-gl.js", VENDOR / "maplibre-gl.css"
    if not js.exists():
        VENDOR.mkdir(parents=True, exist_ok=True)
        r = requests.get(MAPLIBRE_TGZ, timeout=120)
        r.raise_for_status()
        with tarfile.open(fileobj=io.BytesIO(r.content)) as t:
            for nom, dest in (("package/dist/maplibre-gl.js", js), ("package/dist/maplibre-gl.css", css),
                              ("package/LICENSE.txt", VENDOR / "LICENSE.txt")):
                dest.write_bytes(t.extractfile(nom).read())
    return js.read_text(), css.read_text()


def geojson(g: gpd.GeoDataFrame, colonnes: dict[str, str]) -> dict:
    """GeoJSON WGS84 compact : colonnes renommées en clés courtes, coordonnées arrondies."""
    g = g[list(colonnes) + ["geometry"]].rename(columns=colonnes)
    g = g.to_crs("EPSG:4326")
    txt = g.to_json(drop_id=True, na="null")
    txt = re.sub(r"(-?\d+\.\d{%d})\d+" % DECIMALES, r"\1", txt)
    return json.loads(txt)


def arrondir(s: pd.Series, n: int = 0) -> pd.Series:
    return s.round(n).astype("Float64") if n else s.round().astype("Int64")


def preparer() -> dict:
    gpkg = EXPORT / "carte.gpkg"
    couches = set(gpd.list_layers(gpkg)["name"])

    i = gpd.read_file(gpkg, layer="iris_indicateurs")

    # Contours de communes (repère visuel et recherche) : fusion des IRIS AVANT simplification,
    # sinon les IRIS simplifiés un à un laissent des interstices ; le tampon ±1 m bouche les microtrous.
    communes = i.dissolve(by="code_commune", as_index=False)[["code_commune", "nom_commune", "geometry"]]
    communes["geometry"] = communes.buffer(1).buffer(-1).boundary.simplify(SIMPLIFICATION_M)
    communes = geojson(communes, {"nom_commune": "n", "code_commune": "c"})

    i["geometry"] = i.geometry.simplify(SIMPLIFICATION_M)
    # Stations accessibles à pied de chaque IRIS (indices de lignes de la matrice) et temps de marche.
    acces = pd.read_parquet(PROC / "iris_stations_trajet.parquet")
    i = i.merge(acces.rename(columns={"stations": "acces_stations", "marche_min": "acces_marche"}), on="code_iris", how="left")
    i["acces_stations"] = i["acces_stations"].map(lambda v: [int(x) for x in v] if isinstance(v, (list, np.ndarray)) else [])
    i["acces_marche"] = i["acces_marche"].map(lambda v: [float(x) for x in v] if isinstance(v, (list, np.ndarray)) else [])
    for c in ("prix_m2_median_ancien_24m", "prix_m2_median_vefa_24m", "prix_m2_median_ancien_commune_24m",
              "revenu_median", "dist_station_actuelle_m", "dist_station_future_m"):
        i[c] = arrondir(i[c])
    for c in ("evol_prix_m2_ancien", "part_surface_qpv", "part_surface_tampon_qpv_300m"):
        i[c] = arrondir(i[c], 3)
    iris = geojson(i, {
        "code_iris": "id", "nom_iris": "ni", "nom_commune": "nc", "code_departement": "dep", "type_iris": "ty",
        "prix_m2_median_ancien_24m": "pa", "n_ventes_ancien_24m": "na",
        "prix_m2_median_vefa_24m": "pv", "n_ventes_vefa_24m": "nv",
        "prix_m2_median_ancien_commune_24m": "pac", "evol_prix_m2_ancien": "ea",
        "revenu_median": "rv", "source_revenu": "rs",
        "dist_station_actuelle_m": "da", "station_actuelle_proche": "sa",
        "dist_station_future_m": "df", "station_future_proche": "sf",
        "part_surface_qpv": "q", "part_surface_tampon_qpv_300m": "tq",
        "acces_stations": "ts", "acces_marche": "tm",
    })

    # Stations : un point par station (toutes lignes regroupées). Stations actuelles regroupées par
    # zone d'arrêt IDFM (id_ref_zdc), futures par nom. Une correspondance (plusieurs lignes) est
    # dessinée à part ; sinon le point prend la couleur de sa ligne.
    s = gpd.read_file(gpkg, layer="stations")
    s["cle"] = s["id_ref_zdc"].where(s["existant"], "futur:" + s["nom"])
    s = (s.groupby("cle", as_index=False)
          .agg(nom=("nom", "first"), lignes=("ligne", lambda x: ", ".join(sorted(set(x)))),
               n_lignes=("ligne", "nunique"), couleur=("couleur", "first"), statut=("statut", "first"),
               mise_en_service=("mise_en_service", "first"), existant=("existant", "first"),
               geometry=("geometry", "first")))
    s["correspondance"] = s["n_lignes"] > 1
    # Ligne de la station dans la matrice des temps de trajet (stations en service uniquement).
    st_trajet = gpd.read_parquet(PROC / "stations_trajet.parquet")
    # Gares futures du GPE : ligne « gpe:<nom> » de la matrice (utilisée seulement avec l'option GPE).
    lignes_matrice = dict(zip(st_trajet["id_ref_zdc"].astype(str), st_trajet.index))
    s["k"] = s["cle"].map(lambda c: lignes_matrice.get(c, lignes_matrice.get(c.replace("futur:", "gpe:", 1)))).astype("Int64")
    s = gpd.GeoDataFrame(s, geometry="geometry", crs="EPSG:2154")
    stations = geojson(s, {"nom": "n", "lignes": "l", "couleur": "c", "statut": "st", "existant": "e",
                           "correspondance": "x", "mise_en_service": "ms", "k": "k"})

    lg = gpd.read_file(gpkg, layer="lignes")
    lg["geometry"] = lg.geometry.simplify(SIMPLIFICATION_M)
    lignes = geojson(lg, {"ligne": "l", "mode": "m", "couleur": "c", "existant": "e", "statut": "st",
                          "projet": "p", "mise_en_service": "ms"})

    # Valeurs initiales des filtres = paramètres utilisés par le script 09 (texte de la colonne `parametres`).
    budget_ancien, budget_vefa, surface, dist_max, revenu_min = map(
        float, re.findall(r"\d+(?:\.\d+)?", i["parametres"].iloc[0]))
    donnees = {"iris": iris, "communes": communes, "stations": stations, "lignes": lignes, "departements": DEPARTEMENTS,
               "periode": i["periode_24m"].iloc[0],
               "defauts": {"budget_ancien": budget_ancien, "budget_vefa": budget_vefa, "surface": surface,
                           "dist_max": dist_max, "revenu_min": revenu_min, "trajet_max": TRAJET_MAX_DEFAUT},
               "trajet": trajet(st_trajet)}

    if {"qpv", "qpv_tampon_300m"} <= couches:
        q = gpd.read_file(gpkg, layer="qpv")
        q["geometry"] = q.geometry.simplify(SIMPLIFICATION_M)
        donnees["qpv"] = geojson(q, {"code_qp": "c", "lib_qp": "n", "lib_com": "cm"})
        t = gpd.read_file(gpkg, layer="qpv_tampon_300m")
        contour = gpd.GeoDataFrame(geometry=[t.union_all().boundary.simplify(SIMPLIFICATION_M)], crs=t.crs)
        donnees["tampon"] = geojson(contour, {})

    # Ventes : tableau compact [lng, lat, prix_m2, type, date, surface, prix total] reconstruit en JS.
    v = gpd.read_file(gpkg, layer="ventes_24m").to_crs("EPSG:4326")
    donnees["ventes"] = list(zip(
        v.geometry.x.round(DECIMALES), v.geometry.y.round(DECIMALES), v["prix_m2"].round().astype(int),
        v["type_vente"].str[0], v["date_mutation"], v["surface_reelle_bati"].round().astype(int),
        v["valeur_fonciere"].round().astype(int),
    ))
    return donnees


def horizons_gpe() -> list[dict]:
    """Une entrée par horizon de mise en service du GPE : matrice encodée et libellé des lignes ouvertes."""
    traces = gpd.read_parquet(PROC / "lignes.parquet")
    traces = traces[~traces["existant"] & traces["ligne"].str.fullmatch(r"METRO 1[5-8]")].copy()
    traces["annee"] = traces["mise_en_service"].str.extract(r"(20\d\d)", expand=False).astype(float)
    res = []
    for f in sorted(PROC.glob("temps_trajet_gpe_*.npy")):
        an = int(f.stem.rsplit("_", 1)[1])
        lignes = []
        for ligne, t in traces.groupby("ligne"):
            ouverts = (t["annee"] <= an).sum()
            if ouverts:
                lignes.append(ligne.split()[1] + ("" if ouverts == len(t) else " partielle"))
        res.append({"annee": an, "lignes": ", ".join(lignes),
                    "matrice": base64.b64encode(np.load(f).tobytes()).decode()})
    return res


def trajet(st_trajet: gpd.GeoDataFrame) -> dict:
    """Matrice des temps (stations × pôles) encodée en base64, pôles de destination et noms des stations."""
    matrice = np.load(PROC / "temps_trajet.npy")
    poles = gpd.read_parquet(PROC / "poles_trajet.parquet").to_crs("EPSG:4326")
    defaut = poles.index[poles["stations"].str.split(" / ").map(lambda x: DESTINATION_DEFAUT in x)][0]
    return {
        "matrice": base64.b64encode(matrice.tobytes()).decode(),
        "horizons": horizons_gpe(),
        "poles": [{"n": n, "s": s, "d": bool(d), "c": [round(g.x, DECIMALES), round(g.y, DECIMALES)]}
                  for n, s, d, g in zip(poles["nom"], poles["stations"], poles["desservi"], poles.geometry)],
        "stations": (st_trajet["nom"] + st_trajet["gpe"].map({True: " (GPE)", False: ""})).tolist(),
        "pole_defaut": int(defaut),
    }


def main() -> None:
    js, css = maplibre()
    donnees = preparer()
    blob = json.dumps(donnees, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    html = (Path(__file__).with_name("carte_template.html").read_text()
            .replace("/*__MAPLIBRE_CSS__*/", css)
            .replace("/*__MAPLIBRE_JS__*/", js)
            .replace("/*__DATA__*/", f"const DATA = {blob};"))
    sortie = EXPORT / "carte.html"
    sortie.write_text(html)
    print(f"écrit : {sortie.relative_to(ROOT)} ({sortie.stat().st_size / 1e6:.1f} Mo)")


if __name__ == "__main__":
    main()
