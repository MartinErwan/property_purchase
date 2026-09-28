"""Couche transports : stations actuelles + gares et stations en projet, typées par mode.

Entrée  : data/raw/transports/*.geojson (scripts/03_download_transports.py)
Sorties : data/processed/transports.parquet (GeoParquet, Lambert-93 / EPSG:2154)
          Une ligne par couple station × ligne (une station en correspondance apparaît
          une fois par ligne, ce qui ne gêne pas le calcul de la station la plus proche par mode).
          data/processed/lignes.parquet : tracés des lignes en service et en projet, avec leur
          couleur officielle (et la date de mise en service estimée pour les projets).

Choix (validés) :
- Réseau actuel (emplacement-des-gares-idf) : modes metro, rer, transilien, tram, cable.
  VAL exclu (Orlyval, CDGVal, funiculaire de Montmartre). Gares hors IDF (idf = 0) exclues.
- Projets (projets_arrets_idf) : métro (GPE, lignes 15 à 18), tram et train ; bus exclus.
  Modes metro_futur, tram_futur, rer_futur. Date de mise en service estimée par IDFM
  (projets_lignes_idf, champ mes_off_tx) rattachée à chaque arrêt par son opération.
- Un arrêt en projet situé à moins de DOUBLON_M d'une station actuelle de la même ligne
  est retiré (station déjà ouverte, ex. terminus d'un prolongement).
- Couleur : couleur officielle IDFM de la ligne (tracés en service, et champ rvb des projets) ;
  une ligne sans couleur connue reçoit COULEUR_SANS_TRACE.
"""

from pathlib import Path

import geopandas as gpd
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw" / "transports"
OUT = ROOT / "data" / "processed" / "transports.parquet"

DOUBLON_M = 200
COULEUR_SANS_TRACE = "#555555"
MODES_TRACES = {"METRO": "metro", "RER": "rer", "TRAIN": "transilien", "TRAMWAY": "tram", "CABLE": "cable"}

MODES_ACTUELS = {
    "METRO": "metro",
    "RER": "rer",
    "TRAIN": "transilien",
    "TRAMWAY": "tram",
    "TRAM": "tram",
    "CABLE": "cable",
}
MODES_PROJETS = {"métro": "metro_futur", "tram": "tram_futur", "train": "rer_futur"}

COLONNES = ["nom", "ligne", "mode", "couleur", "existant", "statut", "phase", "projet", "mise_en_service",
            "exploitant", "id_ref_zdc", "geometry"]


def stations_actuelles() -> gpd.GeoDataFrame:
    g = gpd.read_file(RAW / "emplacement-des-gares-idf.geojson").to_crs("EPSG:2154")
    g = g[(g["idf"] == 1) & g["mode"].isin(MODES_ACTUELS)]
    return gpd.GeoDataFrame(
        {
            "nom": g["nom_gares"],
            "ligne": g["res_com"],
            "mode": g["mode"].map(MODES_ACTUELS),
            "existant": True,
            "statut": "en service",
            "phase": pd.NA,
            "projet": pd.NA,
            "exploitant": g["exploitant"],
            "id_ref_zdc": g["id_ref_zdc"].astype(str),
        },
        geometry=g.geometry,
    )


def stations_projets(actuelles: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    p = gpd.read_file(RAW / "projets_arrets_idf.geojson").to_crs("EPSG:2154")
    p = p[p["mode"].isin(MODES_PROJETS)]
    p = gpd.GeoDataFrame(
        {
            "nom": p["nom_arret"],
            "ligne": p["res_com"],
            "mode": p["mode"].map(MODES_PROJETS),
            "existant": False,
            "statut": p["statut"],
            "phase": p["phase"].astype("Int64"),
            "projet": p["operation"],
            "id_operation": p["id_operati"].astype(str),
            "exploitant": pd.NA,
            "id_ref_zdc": pd.NA,
        },
        geometry=p.geometry,
    )

    # Un même arrêt peut figurer dans deux opérations (ex. Petit-Colombes, T1 phases 3 et 4) :
    # on garde la phase la plus précoce.
    p = p.sort_values("phase").drop_duplicates(["nom", "ligne"], keep="first")

    # Arrêts déjà en service sur la même ligne → retirés.
    proches = gpd.sjoin_nearest(
        p, actuelles[["ligne", "geometry"]].rename(columns={"ligne": "ligne_actuelle"}),
        max_distance=DOUBLON_M, distance_col="distance",
    )
    deja_ouverts = proches.index[proches["ligne"] == proches["ligne_actuelle"]].unique()
    print(f"arrêts en projet déjà en service (retirés) : {len(deja_ouverts)}")
    print("  " + ", ".join(sorted(p.loc[deja_ouverts, "ligne"] + " " + p.loc[deja_ouverts, "nom"])))
    return p.drop(index=deja_ouverts)


def lignes() -> gpd.GeoDataFrame:
    t = gpd.read_file(RAW / "traces-du-reseau-ferre-idf.geojson").to_crs("EPSG:2154")
    t = t[(t["idf"] == 1) & t["mode"].isin(MODES_TRACES)]
    # Couleur par ligne (quelques tronçons n'ont pas la couleur renseignée : on prend celle de la ligne).
    couleur = t.dropna(subset=["colourweb_hexa"]).groupby("res_com")["colourweb_hexa"].first()
    t = t.dissolve(by="res_com", as_index=False, aggfunc="first")
    return gpd.GeoDataFrame(
        {"ligne": t["res_com"], "mode": t["mode"].map(MODES_TRACES), "couleur": "#" + t["res_com"].map(couleur)},
        geometry=t.geometry, crs="EPSG:2154",
    )


def rgb_en_hexa(rgb: str) -> str:
    r, g, b = (int(v) for v in rgb.removeprefix("rgb(").removesuffix(")").split(","))
    return f"#{r:02x}{g:02x}{b:02x}"


def lignes_projets() -> gpd.GeoDataFrame:
    t = gpd.read_file(RAW / "projets_lignes_idf.geojson").to_crs("EPSG:2154")
    t = t[t["mode"].isin(MODES_PROJETS)]
    return gpd.GeoDataFrame(
        {"ligne": t["res_com"], "mode": t["mode"].map(MODES_PROJETS), "couleur": t["rvb"].map(rgb_en_hexa),
         "existant": False, "statut": t["statut"], "projet": t["operation"],
         "id_operation": t["id_operati"].astype(str), "mise_en_service": t["mes_off_tx"]},
        geometry=t.geometry, crs="EPSG:2154",
    )


def main() -> None:
    traces = pd.concat([lignes().assign(existant=True), lignes_projets()], ignore_index=True)
    traces = gpd.GeoDataFrame(traces, geometry="geometry", crs="EPSG:2154")
    actuelles = stations_actuelles()
    projets = stations_projets(actuelles)

    # Date de mise en service d'un arrêt en projet = celle de son opération.
    dates = traces.dropna(subset=["id_operation"]).drop_duplicates("id_operation").set_index("id_operation")["mise_en_service"]
    projets["mise_en_service"] = projets["id_operation"].map(dates)
    print(f"arrêts en projet sans date de mise en service : {projets['mise_en_service'].isna().sum()} / {len(projets)}")

    couche = pd.concat([actuelles, projets], ignore_index=True)
    # Couleur : celle du tracé en service pour une station actuelle, celle du projet pour un arrêt futur.
    en_service, en_projet = traces[traces["existant"]], traces[~traces["existant"]]
    couleurs = {True: dict(zip(en_service["ligne"], en_service["couleur"])),
                False: dict(zip(en_projet["ligne"], en_projet["couleur"]))}
    couche["couleur"] = [couleurs[e].get(l) for l, e in zip(couche["ligne"], couche["existant"])]
    couche["couleur"] = couche["couleur"].fillna(COULEUR_SANS_TRACE)
    couche = couche.reindex(columns=COLONNES)
    couche = gpd.GeoDataFrame(couche, geometry="geometry", crs="EPSG:2154")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    couche.to_parquet(OUT)
    traces.drop(columns="id_operation").to_parquet(OUT.with_name("lignes.parquet"))
    print(f"{int(traces['existant'].sum())} lignes en service et {int((~traces['existant']).sum())} tronçons en projet tracés ; "
          f"stations sans couleur : "
          f"{sorted(couche.loc[couche['couleur'] == COULEUR_SANS_TRACE, 'ligne'].unique())}")
    print(f"{len(couche)} stations × lignes écrites dans {OUT.relative_to(ROOT)}")
    print(couche.groupby("mode").agg(lignes=("ligne", "nunique"), stations=("nom", "size")).to_string())


if __name__ == "__main__":
    main()
