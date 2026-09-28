# Carte de sélection de quartiers — petite couronne

Pipeline reproductible qui croise prix réels (DVF), transports (IDFM), revenus (Filosofi) et QPV
par IRIS, et exporte une carte pour QGIS et Kepler.gl. Contexte et règles : voir `CLAUDE.md`.

## Lancer le pipeline

```bash
uv sync
uv run python scripts/01_download_dvf.py         # DVF géolocalisées 75/92/93/94, 2021-2025
uv run python scripts/02_clean_dvf.py            # ventes d'appartements + prix/m²
uv run python scripts/03_download_transports.py  # gares IDFM actuelles + projets (GPE…)
uv run python scripts/04_build_transports.py     # couche transports typée par mode
uv run python scripts/05_download_socio.py       # Filosofi 2021, contours IRIS 2022, QPV 2024
uv run python scripts/06_build_iris_qpv.py       # IRIS + revenu médian, QPV + tampon 300 m
uv run python scripts/07_indicateurs_iris.py     # indicateurs par IRIS
uv run --group carte python scripts/08_export_carte.py   # exports QGIS / Kepler
```

Les filtres de l'export se règlent en ligne de commande, par exemple :
`uv run --group carte python scripts/08_export_carte.py --budget-ancien 230000 --surface 50 --dist-max 600 --revenu-min 20000`

Les notebooks `notebooks/0X_*.ipynb` contrôlent chaque étape (exploration puis vérification).

## Sorties (`data/exports/`, non versionnées)

| Fichier | Usage |
|---|---|
| `carte.gpkg` | QGIS : couches `iris_indicateurs`, `stations`, `ventes_24m` (+ `qpv`, `qpv_tampon_300m` si disponibles), Lambert-93 |
| `carte_kepler.html` | Carte Kepler.gl autonome, filtres préréglés (nécessite internet pour charger les bibliothèques) |
| `kepler/*.geojson`, `kepler/*.csv` | À glisser dans https://kepler.gl/demo |

Colonnes principales de `iris_indicateurs` : `prix_m2_median_{ancien,vefa}_24m` et `n_ventes_*`,
`evol_prix_m2_*` (24 derniers mois vs 24 précédents), `dist_{metro,rer,transilien,tram,cable,metro_futur,tram_futur,rer_futur}_m`,
`station_actuelle_proche`, `station_future_proche`, `revenu_median`, `part_surface_qpv`,
`part_surface_tampon_qpv_300m`, `prix_estime_*`, `surface_achetable_*_m2`, `selection`.

## Hypothèses et limites

- **DVF** : mutations « Vente » (ancien) et VEFA d'un seul appartement, dépendances admises (prix/m²
  légèrement surestimé) ; valeurs aberrantes = prix/m² hors [0,3 ; 3] × médiane communale.
- **Médianes** calculées à partir de 5 ventes ; sinon NaN (repère communal fourni).
- **Distances** à vol d'oiseau depuis le centre de l'IRIS, pas de distance réseau piéton.
- **GPE** : pas de date de mise en service (absente de l'open data) ; `statut` et `phase` IDFM.
- **Revenus** : Filosofi 2021 (dernier millésime, 2022 non produit par l'INSEE). Valeurs
  secrétisées laissées à NaN ; 7 communes non irisées → médiane communale (`source_revenu`).
- **Budget** : frais de notaire non inclus ; surface cible par défaut 45 m² (hypothèse).
- **QPV / TVA 5,5 %** : tampon de 300 m seulement. Le tampon de 500 m (QPV sous convention
  NPNRU) n'est pas appliqué : règle et liste non vérifiées à la source.
- **QPV 2024** : archive ANCT `qpv-2024.zip` (jeu « quartiers-prioritaires-de-la-politique-de-la-ville-qpv »
  sur data.gouv.fr), couche France hexagonale en Lambert-93, géométries réparées (`make_valid`).
  Si `static.data.gouv.fr` est injoignable, déposer l'archive à la main dans `data/raw/qpv/`.
