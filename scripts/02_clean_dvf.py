"""Nettoyage DVF → une ligne par vente d'appartement, avec prix/m².

Entrée  : data/raw/dvf/<année>/<dep>.csv.gz (scripts/01_download_dvf.py)
Sortie  : data/processed/dvf_appartements.parquet (GeoParquet, Lambert-93 / EPSG:2154)

Règles (validées) :
1. Natures « Vente » (→ ancien) et « Vente en l'état futur d'achèvement » (→ vefa).
2. Dédoublonnage des lignes strictement identiques sur le local : DVF répète un même
   local une fois par nature de culture de la parcelle.
3. Exactement 1 appartement par mutation, 0 maison, 0 local commercial ; les dépendances
   (caves, parkings, non distinguées dans DVF) sont admises et comptées dans n_dependances.
   Leur prix est inclus dans valeur_fonciere → léger biais à la hausse du prix/m².
4. surface_reelle_bati >= 9 m² et valeur_fonciere renseignée.
5. Valeurs aberrantes : NON supprimées ici, signalées par la colonne `aberrant`
   (prix/m² hors [RATIO_MIN, RATIO_MAX] × médiane de la commune pour le même type).

Le prix/m² utilise surface_reelle_bati (la surface Carrez manque sur ~3/4 des lots).
"""

from pathlib import Path

import duckdb
import geopandas as gpd

ROOT = Path(__file__).resolve().parents[1]
RAW_GLOB = str(ROOT / "data" / "raw" / "dvf" / "*" / "*.csv.gz")
OUT = ROOT / "data" / "processed" / "dvf_appartements.parquet"

SURFACE_MIN = 9
RATIO_MIN, RATIO_MAX = 0.3, 3.0
# Médiane de référence : commune × type, ou département × type si la commune a trop peu de ventes.
MIN_VENTES_MEDIANE_COMMUNE = 20
# Emprise large de l'Île-de-France (lon_min, lat_min, lon_max, lat_max) pour écarter les coordonnées absurdes.
IDF_BBOX = (1.4, 48.1, 3.6, 49.3)

SQL = f"""
-- Tout est lu en texte (l'inférence de type casse sur certains fichiers, ex. numero_volume = 'ET'),
-- puis seules les colonnes utiles sont converties.
create table brut as
select * replace (
    cast(date_mutation as date) as date_mutation,
    cast(valeur_fonciere as double) as valeur_fonciere,
    cast(surface_reelle_bati as double) as surface_reelle_bati,
    cast(nombre_pieces_principales as integer) as nombre_pieces_principales,
    cast(longitude as double) as longitude,
    cast(latitude as double) as latitude
)
from read_csv('{RAW_GLOB}', all_varchar = true, union_by_name = true)
where nature_mutation in ('Vente', 'Vente en l''état futur d''achèvement');

-- Règle 2 : un local = une ligne (on ignore les colonnes de nature de culture / terrain).
create table locaux as
select distinct
    id_mutation, date_mutation, nature_mutation, valeur_fonciere, numero_disposition,
    adresse_numero, adresse_suffixe, adresse_nom_voie, code_postal,
    code_commune, nom_commune, code_departement, id_parcelle,
    lot1_numero, lot2_numero, lot3_numero, lot4_numero, lot5_numero,
    type_local, surface_reelle_bati, nombre_pieces_principales, longitude, latitude
from brut
where type_local is not null;

-- Règle 3 : composition de chaque mutation.
create table compo as
select
    id_mutation,
    count(*) filter (where type_local = 'Appartement') as n_appartements,
    count(*) filter (where type_local = 'Dépendance') as n_dependances,
    count(*) filter (where type_local not in ('Appartement', 'Dépendance')) as n_autres
from locaux
group by 1;

create table ventes as
select
    l.id_mutation,
    l.date_mutation,
    year(l.date_mutation) as annee,
    case when l.nature_mutation = 'Vente' then 'ancien' else 'vefa' end as type_vente,
    l.valeur_fonciere,
    l.surface_reelle_bati,
    l.nombre_pieces_principales,
    c.n_dependances,
    l.valeur_fonciere / l.surface_reelle_bati as prix_m2,
    l.code_departement,
    l.code_commune,
    l.nom_commune,
    l.code_postal,
    concat_ws(' ', l.adresse_numero, l.adresse_suffixe, l.adresse_nom_voie) as adresse,
    l.id_parcelle,
    l.longitude,
    l.latitude
from locaux l
join compo c using (id_mutation)
where l.type_local = 'Appartement'
  and c.n_appartements = 1
  and c.n_autres = 0
  -- Règle 4
  and l.surface_reelle_bati >= {SURFACE_MIN}
  and l.valeur_fonciere > 0;

-- Règle 5 : signalement relatif à la médiane locale.
create table ventes_flag as
with med_commune as (
    select code_commune, type_vente, count(*) as n, median(prix_m2) as med
    from ventes group by all
),
med_dep as (
    select code_departement, type_vente, median(prix_m2) as med
    from ventes group by all
)
select
    v.*,
    case when mc.n >= {MIN_VENTES_MEDIANE_COMMUNE} then mc.med else md.med end as prix_m2_median_ref,
    v.prix_m2 / prix_m2_median_ref as ratio_median_ref,
    ratio_median_ref not between {RATIO_MIN} and {RATIO_MAX} as aberrant
from ventes v
join med_commune mc using (code_commune, type_vente)
join med_dep md using (code_departement, type_vente)
order by date_mutation, id_mutation;
"""


def main() -> None:
    con = duckdb.connect()
    con.sql(SQL)
    df = con.sql("select * from ventes_flag").df()

    # Géométrie : points WGS84 (lon/lat DVF) reprojetés en Lambert-93 pour le travail.
    # Les ventes sans coordonnées, ou avec des coordonnées hors Île-de-France (erreurs de
    # géocodage de la source, ex. latitude 83°), sont conservées avec une géométrie vide.
    lon_min, lat_min, lon_max, lat_max = IDF_BBOX
    df["coord_valide"] = df["longitude"].between(lon_min, lon_max) & df["latitude"].between(lat_min, lat_max)
    df.loc[~df["coord_valide"], ["longitude", "latitude"]] = None
    geom = gpd.points_from_xy(df["longitude"], df["latitude"], crs="EPSG:4326")
    gdf = gpd.GeoDataFrame(df, geometry=geom).to_crs("EPSG:2154")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    gdf.to_parquet(OUT)
    print(f"{len(gdf):,} ventes écrites dans {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
