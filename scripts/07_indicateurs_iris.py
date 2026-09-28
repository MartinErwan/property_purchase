"""Indicateurs par IRIS : prix, tendance, distances aux transports, QPV, revenu.

Entrées : data/processed/{dvf_appartements, iris_revenus, transports}.parquet
          data/processed/qpv*.parquet (optionnels)
Sortie  : data/processed/indicateurs_iris.parquet (Lambert-93)

Choix :
- Ventes retenues : non signalées aberrantes et géolocalisées ; rattachées à l'IRIS qui contient
  le point (jointure spatiale point-dans-polygone, en Lambert-93).
- Fenêtre « 24 mois » : les 24 mois se terminant à la date de la dernière vente présente dans DVF.
  Tendance : médiane des 24 derniers mois / médiane des 24 mois précédents - 1.
- Une médiane n'est calculée que s'il y a au moins MIN_VENTES ventes (sinon NaN) ; le nombre de
  ventes est toujours fourni.
- Distances : à vol d'oiseau, en mètres, depuis un point de référence de l'IRIS (centroïde, ou
  point intérieur si le centroïde tombe hors de l'IRIS). Pas de distance réseau piéton.
- QPV : part de la surface de l'IRIS en QPV et dans le tampon de 300 m. NaN si la couche QPV
  n'est pas disponible.
"""

from pathlib import Path

import geopandas as gpd
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
PROC = ROOT / "data" / "processed"

MIN_VENTES = 5
MODES = ["metro", "rer", "transilien", "tram", "cable", "metro_futur", "tram_futur", "rer_futur"]
MODES_ACTUELS_LOURDS = ["metro", "rer", "transilien", "tram", "cable"]


def point_reference(iris: gpd.GeoDataFrame) -> gpd.GeoSeries:
    centroide = iris.centroid
    return centroide.where(centroide.within(iris.geometry), iris.representative_point())


def stats_prix(ventes: pd.DataFrame, cle: str, suffixe: str) -> pd.DataFrame:
    g = ventes.groupby([cle, "type_vente"])
    s = g.agg(n=("prix_m2", "size"), med=("prix_m2", "median"), surf=("surface_reelle_bati", "median"))
    s.loc[s["n"] < MIN_VENTES, ["med", "surf"]] = pd.NA
    s = s.unstack("type_vente")
    s.columns = [f"{'n_ventes' if m == 'n' else 'prix_m2_median' if m == 'med' else 'surface_mediane'}_{t}_{suffixe}"
                 for m, t in s.columns]
    return s


def indicateurs_prix(iris: gpd.GeoDataFrame) -> pd.DataFrame:
    v = gpd.read_parquet(PROC / "dvf_appartements.parquet")
    v = v[~v["aberrant"] & v["coord_valide"]]
    v = gpd.sjoin(v, iris[["code_iris", "geometry"]], predicate="within", how="inner")

    fin = v["date_mutation"].max()
    debut = fin - pd.DateOffset(months=24) + pd.Timedelta(days=1)
    debut_prec = debut - pd.DateOffset(months=24)
    print(f"fenêtre 24 mois : {debut.date()} → {fin.date()} ; précédente : {debut_prec.date()} → {(debut - pd.Timedelta(days=1)).date()}")

    recent = v[v["date_mutation"] >= debut]
    prec = v[(v["date_mutation"] >= debut_prec) & (v["date_mutation"] < debut)]

    res = stats_prix(recent, "code_iris", "24m").join(stats_prix(prec, "code_iris", "24m_prec"), how="outer")
    for t in ("ancien", "vefa"):
        res[f"evol_prix_m2_{t}"] = res[f"prix_m2_median_{t}_24m"] / res[f"prix_m2_median_{t}_24m_prec"] - 1
        n_col = f"n_ventes_{t}_24m"
        res[n_col] = res[n_col].fillna(0).astype(int)

    # Repère communal (même fenêtre), utile quand l'IRIS a trop peu de ventes.
    com = recent.groupby(["code_commune", "type_vente"])["prix_m2"].median().unstack("type_vente")
    com.columns = [f"prix_m2_median_{t}_commune_24m" for t in com.columns]

    res.attrs["periode"] = (debut.date().isoformat(), fin.date().isoformat())
    return res, com


def indicateurs_distances(iris: gpd.GeoDataFrame) -> pd.DataFrame:
    t = gpd.read_parquet(PROC / "transports.parquet")
    pts = gpd.GeoDataFrame({"code_iris": iris["code_iris"]}, geometry=point_reference(iris), crs=iris.crs)
    out = pd.DataFrame(index=iris["code_iris"])
    for mode in MODES:
        stations = t[t["mode"] == mode][["nom", "ligne", "geometry"]]
        j = gpd.sjoin_nearest(pts, stations, distance_col="d").drop_duplicates("code_iris").set_index("code_iris")
        out[f"dist_{mode}_m"] = j["d"].round()

    # Station actuelle la plus proche, tous modes confondus.
    actuelles = t[t["mode"].isin(MODES_ACTUELS_LOURDS)][["nom", "ligne", "mode", "geometry"]]
    j = gpd.sjoin_nearest(pts, actuelles, distance_col="d").drop_duplicates("code_iris").set_index("code_iris")
    out["dist_station_actuelle_m"] = j["d"].round()
    out["station_actuelle_proche"] = j["nom"] + " (" + j["ligne"] + ")"
    futures = t[~t["existant"]][["nom", "ligne", "geometry"]]
    j = gpd.sjoin_nearest(pts, futures, distance_col="d").drop_duplicates("code_iris").set_index("code_iris")
    out["dist_station_future_m"] = j["d"].round()
    out["station_future_proche"] = j["nom"] + " (" + j["ligne"] + ")"
    return out


def indicateurs_qpv(iris: gpd.GeoDataFrame) -> pd.DataFrame:
    out = pd.DataFrame(index=iris["code_iris"])
    chemins = {"part_surface_qpv": PROC / "qpv.parquet", "part_surface_tampon_qpv_300m": PROC / "qpv_tampon_300m.parquet"}
    for col, chemin in chemins.items():
        if not chemin.exists():
            out[col] = float("nan")
            continue
        zone = gpd.read_parquet(chemin).union_all()
        out[col] = (iris.geometry.intersection(zone).area / iris.geometry.area).round(3).to_numpy()
    return out


def main() -> None:
    iris = gpd.read_parquet(PROC / "iris_revenus.parquet")
    prix, com = indicateurs_prix(iris)
    ind = (
        iris.set_index("code_iris")
        .join(prix)
        .join(indicateurs_distances(iris))
        .join(indicateurs_qpv(iris))
        .reset_index()
        .merge(com, left_on="code_commune", right_index=True, how="left")
    )
    for t in ("ancien", "vefa"):
        ind[f"n_ventes_{t}_24m"] = ind[f"n_ventes_{t}_24m"].fillna(0).astype(int)
    debut, fin = prix.attrs["periode"]
    ind["periode_24m"] = f"{debut} / {fin}"

    ind = gpd.GeoDataFrame(ind, geometry="geometry", crs=iris.crs)
    ind.to_parquet(PROC / "indicateurs_iris.parquet")
    print(f"{len(ind)} IRIS écrits dans data/processed/indicateurs_iris.parquet ({ind.shape[1]} colonnes)")


if __name__ == "__main__":
    main()
