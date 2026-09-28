"""Couche transports : stations actuelles + gares et stations en projet, typées par mode.

Entrée  : data/raw/transports/*.geojson (scripts/03_download_transports.py)
Sortie  : data/processed/transports.parquet (GeoParquet, Lambert-93 / EPSG:2154)
          Une ligne par couple station × ligne (une station en correspondance apparaît
          une fois par ligne, ce qui ne gêne pas le calcul de la station la plus proche par mode).

Choix (validés) :
- Réseau actuel (emplacement-des-gares-idf) : modes metro, rer, transilien, tram, cable.
  VAL exclu (Orlyval, CDGVal, funiculaire de Montmartre). Gares hors IDF (idf = 0) exclues.
- Projets (projets_arrets_idf) : métro (GPE, lignes 15 à 18), tram et train ; bus exclus.
  Modes metro_futur, tram_futur, rer_futur. Pas de date de mise en service (absente de
  l'open data) : on garde ligne, phase, statut.
- Un arrêt en projet situé à moins de DOUBLON_M d'une station actuelle de la même ligne
  est retiré (station déjà ouverte, ex. terminus d'un prolongement).
"""

from pathlib import Path

import geopandas as gpd
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw" / "transports"
OUT = ROOT / "data" / "processed" / "transports.parquet"

DOUBLON_M = 200

MODES_ACTUELS = {
    "METRO": "metro",
    "RER": "rer",
    "TRAIN": "transilien",
    "TRAMWAY": "tram",
    "TRAM": "tram",
    "CABLE": "cable",
}
MODES_PROJETS = {"métro": "metro_futur", "tram": "tram_futur", "train": "rer_futur"}

COLONNES = ["nom", "ligne", "mode", "existant", "statut", "phase", "projet", "exploitant", "id_ref_zdc", "geometry"]


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


def main() -> None:
    actuelles = stations_actuelles()
    projets = stations_projets(actuelles)
    couche = pd.concat([actuelles, projets], ignore_index=True)[COLONNES]
    couche = gpd.GeoDataFrame(couche, geometry="geometry", crs="EPSG:2154")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    couche.to_parquet(OUT)
    print(f"{len(couche)} stations × lignes écrites dans {OUT.relative_to(ROOT)}")
    print(couche.groupby("mode").agg(lignes=("ligne", "nunique"), stations=("nom", "size")).to_string())


if __name__ == "__main__":
    main()
