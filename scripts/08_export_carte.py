"""Export des données de la carte : GeoPackage pour QGIS, GeoJSON/CSV pour Kepler.gl.

Entrées : data/processed/{indicateurs_iris, transports, dvf_appartements}.parquet, qpv*.parquet (optionnels)
Sorties : data/exports/carte.gpkg              (QGIS, Lambert-93, une couche par thème)
          data/exports/kepler/*.geojson|csv    (WGS84, à glisser dans https://kepler.gl/demo)
La carte HTML interactive est produite ensuite par scripts/09_carte_html.py.

Filtres (paramètres ci-dessous ou en ligne de commande) :
- budget : prix médian au m² de l'IRIS × surface cible <= budget (ancien et VEFA séparément,
  frais de notaire NON inclus) ;
- distance à vol d'oiseau à la station actuelle la plus proche (métro, RER, Transilien, tram, câble) ;
- revenu médian minimum de l'IRIS ;
- QPV : la part de l'IRIS dans le tampon de 300 m est fournie mais pas filtrée par défaut, car
  être dans le tampon peut ouvrir droit à la TVA à 5,5 % en VEFA (sous conditions de ressources).

La colonne `selection` combine les filtres budget (ancien OU VEFA) + distance + revenu.

Usage : uv run python scripts/08_export_carte.py [--budget-ancien 210000] ...
"""

import argparse
from pathlib import Path

import geopandas as gpd
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
PROC = ROOT / "data" / "processed"
EXPORT = ROOT / "data" / "exports"

# Paramètres par défaut : hypothèses à ajuster.
BUDGET_ANCIEN = 210_000
BUDGET_VEFA = 290_000
SURFACE_CIBLE_M2 = 45
DIST_STATION_MAX_M = 800
REVENU_MIN = 0


def parametres() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--budget-ancien", type=int, default=BUDGET_ANCIEN)
    p.add_argument("--budget-vefa", type=int, default=BUDGET_VEFA)
    p.add_argument("--surface", type=float, default=SURFACE_CIBLE_M2)
    p.add_argument("--dist-max", type=float, default=DIST_STATION_MAX_M)
    p.add_argument("--revenu-min", type=float, default=REVENU_MIN)
    return p.parse_args()


def preparer_iris(a: argparse.Namespace) -> gpd.GeoDataFrame:
    i = gpd.read_parquet(PROC / "indicateurs_iris.parquet")
    for t, budget in (("ancien", a.budget_ancien), ("vefa", a.budget_vefa)):
        prix = i[f"prix_m2_median_{t}_24m"]
        i[f"prix_estime_{t}"] = (prix * a.surface).round(-3)
        i[f"surface_achetable_{t}_m2"] = (budget / prix).round(1)
        i[f"dans_budget_{t}"] = prix * a.surface <= budget  # valeur exacte, pas l'estimation arrondie
    i["proche_station"] = i["dist_station_actuelle_m"] <= a.dist_max
    # Un IRIS au revenu secrétisé (NaN) n'est exclu que si un revenu minimum est demandé.
    i["revenu_suffisant"] = i["revenu_median"] >= a.revenu_min if a.revenu_min > 0 else True
    i["selection"] = (i["dans_budget_ancien"] | i["dans_budget_vefa"]) & i["proche_station"] & i["revenu_suffisant"]
    i["parametres"] = (f"budget ancien {a.budget_ancien} €, VEFA {a.budget_vefa} €, {a.surface} m², "
                       f"station <= {a.dist_max} m, revenu >= {a.revenu_min} €")
    return i


def ventes_recentes(iris: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    v = gpd.read_parquet(PROC / "dvf_appartements.parquet")
    debut, _ = iris["periode_24m"].iloc[0].split(" / ")
    v = v[~v["aberrant"] & v["coord_valide"] & (v["date_mutation"] >= pd.Timestamp(debut))]
    cols = ["id_mutation", "date_mutation", "type_vente", "valeur_fonciere", "surface_reelle_bati",
            "nombre_pieces_principales", "n_dependances", "prix_m2", "nom_commune", "adresse", "geometry"]
    v = v[cols].copy()
    v["date_mutation"] = v["date_mutation"].dt.strftime("%Y-%m-%d")
    v["prix_m2"] = v["prix_m2"].round()
    return v


def en_points(g: gpd.GeoDataFrame) -> pd.DataFrame:
    g = g.to_crs("EPSG:4326")
    df = pd.DataFrame(g.drop(columns="geometry"))
    df["lat"], df["lng"] = g.geometry.y.round(6), g.geometry.x.round(6)
    return df


def exporter_fichiers(couches: dict[str, gpd.GeoDataFrame]) -> None:
    gpkg = EXPORT / "carte.gpkg"
    gpkg.unlink(missing_ok=True)
    (EXPORT / "kepler").mkdir(parents=True, exist_ok=True)
    for nom, g in couches.items():
        g.to_file(gpkg, layer=nom, driver="GPKG")
        if g.geom_type.eq("Point").all():
            # Points : CSV lat/lng, bien plus léger que GeoJSON et lu nativement par Kepler.
            en_points(g).to_csv(EXPORT / "kepler" / f"{nom}.csv", index=False)
        else:
            g.to_crs("EPSG:4326").to_file(EXPORT / "kepler" / f"{nom}.geojson", driver="GeoJSON")
    print(f"écrits : {gpkg.relative_to(ROOT)} ({len(couches)} couches) et data/exports/kepler/")


def main() -> None:
    a = parametres()
    EXPORT.mkdir(parents=True, exist_ok=True)
    iris = preparer_iris(a)
    stations = gpd.read_parquet(PROC / "transports.parquet")
    stations = stations[stations.intersects(iris.union_all().envelope.buffer(5_000))]
    couches = {"iris_indicateurs": iris, "stations": stations, "ventes_24m": ventes_recentes(iris)}
    for nom in ("qpv", "qpv_tampon_300m"):
        if (PROC / f"{nom}.parquet").exists():
            couches[nom] = gpd.read_parquet(PROC / f"{nom}.parquet")
    exporter_fichiers(couches)

    pc = iris[iris["code_departement"] != "75"]
    print(f"IRIS de petite couronne sélectionnés : {int(pc['selection'].sum())} / {len(pc)} "
          f"({pc['parametres'].iloc[0]})")


if __name__ == "__main__":
    main()
