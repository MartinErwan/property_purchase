"""Couche IRIS avec revenu médian (Filosofi 2021) + couche QPV 2024 et tampon de 300 m.

Entrées : data/raw/iris, data/raw/filosofi, data/raw/filosofi_communes, data/raw/qpv (optionnel)
Sorties : data/processed/iris_revenus.parquet
          data/processed/qpv.parquet et qpv_tampon_300m.parquet (si les QPV sont disponibles)

Choix :
- IRIS édition 2022 = géographie de Filosofi 2021 (jointure sans perte, sauf communes non irisées).
- Revenu : médiane du revenu disponible par UC (DISP_MED21). Valeurs secrétisées (ns) ou non
  disponibles (nd) laissées à NaN, statut conservé dans `revenu_statut`.
- Communes non découpées en IRIS (TYP_IRIS = Z) : médiane communale Filosofi 2021, signalée
  par `source_revenu = "commune"`.
- QPV : tampon de 300 m (TVA à 5,5 %). Le tampon de 500 m réservé aux QPV sous convention NPNRU
  n'est PAS appliqué : règle et liste NPNRU non vérifiées à la source. Colonne `npnru` vide.
"""

from pathlib import Path

import geopandas as gpd
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
OUT = ROOT / "data" / "processed"

DEPARTEMENTS = ["75", "92", "93", "94"]
TAMPON_QPV_M = 300


def lire_iris() -> gpd.GeoDataFrame:
    shp = next(RAW.glob("iris/**/*LAMB93_FXX*/CONTOURS-IRIS.shp"))
    filtre = " OR ".join(f"INSEE_COM LIKE '{d}%'" for d in DEPARTEMENTS)
    iris = gpd.read_file(shp, where=filtre).drop(columns="IRIS")
    # Le fichier déclare IGNF:LAMB93, identique à EPSG:2154 : on réaffecte le code standard.
    iris = iris.set_crs("EPSG:2154", allow_override=True)
    iris = iris.rename(columns={"CODE_IRIS": "code_iris", "NOM_IRIS": "nom_iris", "TYP_IRIS": "type_iris",
                                "INSEE_COM": "code_commune", "NOM_COM": "nom_commune"})
    iris["code_departement"] = iris["code_commune"].str[:2]
    return iris


def lire_filosofi() -> tuple[pd.DataFrame, pd.DataFrame]:
    f = pd.read_csv(RAW / "filosofi" / "BASE_TD_FILO_IRIS_2021_DISP.csv", sep=";", dtype=str)
    f = pd.DataFrame({
        "code_iris": f["IRIS"],
        "revenu_median": pd.to_numeric(f["DISP_MED21"], errors="coerce"),
        "revenu_statut": f["DISP_MED21"].where(f["DISP_MED21"].isin(["ns", "nd"]), "ok"),
        "taux_pauvrete": pd.to_numeric(f["DISP_TP6021"].str.replace(",", "."), errors="coerce"),
        "note_filosofi": f["DISP_NOTE21"],
    })
    c = pd.read_csv(RAW / "filosofi_communes" / "cc_filosofi_2021_COM.csv", sep=";", dtype=str)
    c = pd.DataFrame({
        "code_commune": c["CODGEO"],
        "revenu_median_commune": pd.to_numeric(c["MED21"], errors="coerce"),
    })
    return f, c


def construire_iris() -> gpd.GeoDataFrame:
    iris = lire_iris()
    f, c = lire_filosofi()
    iris = iris.merge(f, on="code_iris", how="left")
    iris["source_revenu"] = pd.Series("iris", index=iris.index).where(iris["revenu_statut"].notna())

    z = iris["type_iris"].eq("Z") & iris["revenu_statut"].isna()
    iris = iris.merge(c, on="code_commune", how="left")
    iris.loc[z, "revenu_median"] = iris.loc[z, "revenu_median_commune"]
    iris.loc[z, "revenu_statut"] = "ok"
    iris.loc[z, "source_revenu"] = "commune"
    iris = iris.drop(columns="revenu_median_commune")

    print(f"IRIS : {len(iris)} ; revenu renseigné : {iris['revenu_median'].notna().sum()} "
          f"(dont {z.sum()} via la commune) ; manquant : {iris['revenu_median'].isna().sum()}")
    return iris


def construire_qpv(zone: gpd.GeoDataFrame) -> tuple[gpd.GeoDataFrame, gpd.GeoDataFrame] | None:
    gpkgs = sorted((RAW / "qpv").glob("**/*.gpkg"))
    if not gpkgs:
        print("QPV : aucun fichier dans data/raw/qpv (téléchargement impossible) → couche non produite")
        return None
    qpv = gpd.read_file(gpkgs[0]).to_crs("EPSG:2154")
    # QPV de la zone d'étude : ceux qui touchent l'emprise des IRIS (tampon inclus, pour ne pas
    # rater un QPV voisin dont le tampon déborde sur la zone).
    emprise = zone.union_all().buffer(TAMPON_QPV_M)
    qpv = qpv[qpv.intersects(emprise)].copy()
    qpv["npnru"] = pd.NA
    tampon = qpv.copy()
    tampon["geometry"] = qpv.buffer(TAMPON_QPV_M)
    print(f"QPV dans la zone : {len(qpv)} (source : {gpkgs[0].name})")
    return qpv, tampon


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    iris = construire_iris()
    iris.to_parquet(OUT / "iris_revenus.parquet")

    res = construire_qpv(iris)
    if res is not None:
        qpv, tampon = res
        qpv.to_parquet(OUT / "qpv.parquet")
        tampon.to_parquet(OUT / "qpv_tampon_300m.parquet")
    else:
        for nom in ("qpv.parquet", "qpv_tampon_300m.parquet"):
            (OUT / nom).unlink(missing_ok=True)


if __name__ == "__main__":
    main()
