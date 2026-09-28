"""Export de la carte : GeoPackage pour QGIS, GeoJSON pour Kepler.gl et carte Kepler HTML autonome.

Entrées : data/processed/{indicateurs_iris, transports, dvf_appartements}.parquet, qpv*.parquet (optionnels)
Sorties : data/exports/carte.gpkg              (QGIS, Lambert-93, une couche par thème)
          data/exports/kepler/*.geojson        (WGS84, à glisser dans https://kepler.gl/demo)
          data/exports/carte_kepler.html       (carte prête à l'emploi, filtres préréglés)

Filtres (paramètres ci-dessous ou en ligne de commande) :
- budget : prix médian au m² de l'IRIS × surface cible <= budget (ancien et VEFA séparément,
  frais de notaire NON inclus) ;
- distance à vol d'oiseau à la station actuelle la plus proche (métro, RER, Transilien, tram, câble) ;
- revenu médian minimum de l'IRIS ;
- QPV : la part de l'IRIS dans le tampon de 300 m est fournie mais pas filtrée par défaut, car
  être dans le tampon peut ouvrir droit à la TVA à 5,5 % en VEFA (sous conditions de ressources).

La colonne `selection` combine les filtres budget (ancien OU VEFA) + distance + revenu.

Usage : uv run --group carte python scripts/08_export_carte.py [--budget-ancien 210000] ...
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
SIMPLIFICATION_M = 3  # simplification des contours IRIS pour l'affichage uniquement

COULEURS_MODES = {
    "metro": "#1f77b4", "rer": "#d62728", "transilien": "#8c564b", "tram": "#2ca02c", "cable": "#9467bd",
    "metro_futur": "#17becf", "tram_futur": "#bcbd22", "rer_futur": "#ff7f0e",
}


def parametres() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--budget-ancien", type=int, default=BUDGET_ANCIEN)
    p.add_argument("--budget-vefa", type=int, default=BUDGET_VEFA)
    p.add_argument("--surface", type=float, default=SURFACE_CIBLE_M2)
    p.add_argument("--dist-max", type=float, default=DIST_STATION_MAX_M)
    p.add_argument("--revenu-min", type=float, default=REVENU_MIN)
    p.add_argument("--sans-html", action="store_true", help="ne pas produire la carte Kepler HTML")
    return p.parse_args()


def preparer_iris(a: argparse.Namespace) -> gpd.GeoDataFrame:
    i = gpd.read_parquet(PROC / "indicateurs_iris.parquet")
    for t, budget in (("ancien", a.budget_ancien), ("vefa", a.budget_vefa)):
        prix = i[f"prix_m2_median_{t}_24m"]
        i[f"prix_estime_{t}"] = (prix * a.surface).round(-3)
        i[f"surface_achetable_{t}_m2"] = (budget / prix).round(1)
        i[f"dans_budget_{t}"] = i[f"prix_estime_{t}"] <= budget
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


def config_kepler(iris: gpd.GeoDataFrame, a: argparse.Namespace, avec_qpv: bool) -> dict:
    def filtre(fid, data_id, champ, valeur):
        return {"id": fid, "dataId": [data_id], "name": [champ], "type": "range", "value": valeur,
                "enlarged": False, "plotType": "histogram", "yAxis": None}

    rev_max = float(iris["revenu_median"].max())
    filtres = [
        filtre("f_prix", "iris", "prix_m2_median_ancien_24m", [0, a.budget_ancien / a.surface]),
        filtre("f_dist", "iris", "dist_station_actuelle_m", [0, a.dist_max]),
        filtre("f_rev", "iris", "revenu_median", [a.revenu_min, rev_max]),
    ]
    palette = {"name": "Prix", "type": "sequential", "category": "Uber",
               "colors": ["#1a9850", "#91cf60", "#d9ef8b", "#fee08b", "#fc8d59", "#d73027"]}
    couches = [
        {"id": "l_iris", "type": "geojson", "config": {
            "dataId": "iris", "label": "IRIS — prix/m² ancien (24 mois)", "columns": {"geojson": "geometry"},
            "isVisible": True,
            "visConfig": {"opacity": 0.6, "strokeOpacity": 0.5, "thickness": 0.3, "strokeColor": [80, 80, 80],
                          "colorRange": palette, "filled": True, "stroked": True}},
         "visualChannels": {"colorField": {"name": "prix_m2_median_ancien_24m", "type": "real"}, "colorScale": "quantile"}},
        {"id": "l_stations", "type": "point", "config": {
            "dataId": "stations", "label": "Stations (actuelles et futures)",
            "columns": {"lat": "lat", "lng": "lng", "altitude": None}, "isVisible": True,
            "visConfig": {"radius": 4, "opacity": 0.9, "filled": True,
                          "colorRange": {"name": "Modes", "type": "qualitative", "category": "Custom",
                                         "colors": list(COULEURS_MODES.values())}}},
         "visualChannels": {"colorField": {"name": "mode", "type": "string"}, "colorScale": "ordinal"}},
        {"id": "l_ventes", "type": "point", "config": {
            "dataId": "ventes", "label": "Ventes (24 mois)", "columns": {"lat": "lat", "lng": "lng", "altitude": None},
            "isVisible": False, "visConfig": {"radius": 2, "opacity": 0.6, "colorRange": palette}},
         "visualChannels": {"colorField": {"name": "prix_m2", "type": "real"}, "colorScale": "quantile"}},
    ]
    if avec_qpv:
        couches.append({"id": "l_qpv", "type": "geojson", "config": {
            "dataId": "qpv_tampon_300m", "label": "QPV + 300 m", "columns": {"geojson": "geometry"}, "isVisible": True,
            "visConfig": {"opacity": 0.15, "strokeOpacity": 0.9, "thickness": 1, "strokeColor": [120, 0, 160],
                          "filled": True, "stroked": True}}})
    return {"version": "v1", "config": {
        "visState": {"filters": filtres, "layers": couches},
        "mapState": {"latitude": 48.86, "longitude": 2.40, "zoom": 10.3},
        "mapStyle": {"styleType": "positron"}}}


def exporter_html(couches: dict[str, gpd.GeoDataFrame], iris: gpd.GeoDataFrame, a: argparse.Namespace) -> None:
    try:
        from keplergl import KeplerGl
    except ImportError:
        print("keplergl absent : lancer avec `uv run --group carte ...` pour produire la carte HTML")
        return

    def wgs84(g):
        return g.to_crs("EPSG:4326")

    donnees = {
        "iris": wgs84(couches["iris_indicateurs"].assign(
            geometry=couches["iris_indicateurs"].geometry.simplify(SIMPLIFICATION_M))),
        "stations": en_points(couches["stations"]),
        "ventes": en_points(couches["ventes_24m"]).drop(columns=["id_mutation", "adresse"]),
    }
    if "qpv_tampon_300m" in couches:
        donnees["qpv_tampon_300m"] = wgs84(couches["qpv_tampon_300m"])
    carte = KeplerGl(data=donnees, config=config_kepler(iris, a, "qpv_tampon_300m" in couches))
    chemin = EXPORT / "carte_kepler.html"
    carte.save_to_html(file_name=str(chemin), read_only=False)
    print(f"écrit : {chemin.relative_to(ROOT)} ({chemin.stat().st_size / 1e6:.1f} Mo)")


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
    if not a.sans_html:
        exporter_html(couches, iris, a)


if __name__ == "__main__":
    main()
