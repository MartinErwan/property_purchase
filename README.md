# Carte de sélection de quartiers — Île-de-France

Pipeline reproductible qui croise prix réels (DVF), transports (IDFM), revenus (Filosofi) et QPV
par IRIS, et exporte une carte interactive HTML ainsi que des fichiers pour QGIS et Kepler.gl. Contexte et règles : voir `CLAUDE.md`.

## Lancer le pipeline

```bash
uv sync
uv run python scripts/01_download_dvf.py         # DVF géolocalisées, 8 départements, 2021-2025
uv run python scripts/02_clean_dvf.py            # ventes d'appartements + prix/m²
uv run python scripts/03_download_transports.py  # gares IDFM actuelles + projets (GPE…)
uv run python scripts/04_build_transports.py     # couche transports typée par mode
uv run python scripts/05_download_socio.py       # Filosofi 2021, contours IRIS 2022, QPV 2024
uv run python scripts/06_build_iris_qpv.py       # IRIS + revenu médian, QPV + tampon 300 m
uv run python scripts/07_indicateurs_iris.py     # indicateurs par IRIS
uv run python scripts/08_temps_trajet.py         # temps de trajet (horaires GTFS IDFM)
uv run python scripts/09_export_carte.py         # exports QGIS / Kepler
uv run python scripts/10_carte_html.py           # carte HTML interactive
```

Les valeurs initiales des filtres se règlent en ligne de commande (script 09), par exemple :
`uv run python scripts/09_export_carte.py --budget-ancien 230000 --surface 50 --dist-max 600 --revenu-min 20000`.
Dans `carte.html`, tous les filtres restent modifiables à la souris.

Les notebooks `notebooks/0X_*.ipynb` contrôlent chaque étape (exploration puis vérification).

## Sorties (`data/exports/`, non versionnées)

| Fichier | Usage |
|---|---|
| `carte.gpkg` | QGIS : couches `iris_indicateurs`, `stations`, `ventes_24m` (+ `qpv`, `qpv_tampon_300m` si disponibles), Lambert-93 |
| `carte.html` | Carte interactive autonome (MapLibre GL intégré) : seuls les IRIS dans les filtres sont colorés (vert = bon marché → rouge = cher), tracés des lignes à leur couleur officielle IDFM avec un point par station, gares futures en points sombres, QPV hachurés, tampon de 300 m en tirets, filtres, infobulles et recherche de ville (hors ligne, zoom sur la commune). Seul le fond de plan (Plan IGN v2, sans clé d'API) vient d'internet |
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
- **Projets de transport** (GPE 15 à 18, tram, RER E) : tracés, couleurs et dates de mise en service
  **estimées par IDFM** (jeu `projets_lignes_idf`) ; ce sont des prévisions, susceptibles de glisser.
- **Zone** : les 8 départements d'Île-de-France (liste dans `scripts/zone.py`).
- **Temps de trajet** (`scripts/08_temps_trajet.py`) : horaires GTFS IDFM d'un mardi ordinaire, arrivée
  entre 8 h 30 et 9 h 15 (moyenne de 4 heures), métro/RER/Transilien/TER/tram/câble, correspondances
  officielles ; marche vers la station à vol d'oiseau × 1,3 à 4,5 km/h. Bus non comptés.
- **Horizons « avec Grand Paris Express »** (2026, 2027, 2028, 2030, 2031) : seuls les tronçons dont la
  mise en service estimée par IDFM est antérieure ou égale à l'année sont inclus. Horaires fictifs
  (hypothèses non vérifiées) : un train toutes les 3 min, 55 km/h (ligne 15) ou 65 km/h (16, 17, 18) de
  vitesse commerciale sur le tracé IDFM, 2 min de profondeur en correspondance.
- **Revenus** : Filosofi 2021 (dernier millésime, 2022 non produit par l'INSEE). Valeurs
  secrétisées laissées à NaN ; 7 communes non irisées → médiane communale (`source_revenu`).
- **Budget** : curseurs (frais de notaire non inclus ; surface cible par défaut 45 m²) ou **profil de
  financement** dans la carte, qui calcule un prix maximal par zone A bis / A / B1 / B2 :
  - zonage A/B/C en vigueur au 26 juin 2026 (liste ministérielle, data.gouv.fr) ; communes fusionnées
    depuis 2022 → zone de la commune voisine ;
  - PTZ (jusqu'au 31/12/2027) : primo-accédant, revenu retenu = max(RFR N-2, prix / 9) divisé par le
    coefficient familial → tranche 1 à 4 (plafonds A/A bis 25/31/37/49 k€, B1 21,5/26/30/34,5 k€,
    B2 18/22,5/27/31,5 k€) ; neuf partout, quotité 50/40/40/20 % de min(prix, plafond d'opération :
    150 k€ en A/A bis, 135 k€ en B1, 110 k€ en B2, × coefficient plafonné à 2,4) ; différé 10/8/2/0 ans,
    durée 25/20/15/10 ans ; PTZ ancien (zone B2, ≥ 25 % de travaux) non compté dans le budget ;
  - prêt Action Logement : 30 000 € à 1 % sur 25 ans, ≤ 40 % du prix, plafonds de ressources 2026 ;
  - crédit bancaire : taux d'effort ≤ 35 % assurance comprise (règle HCSF), plan lissé (mensualité
    constante sur la durée du plus long des prêts) ; frais de notaire 7,5 % ancien / 2,5 % neuf, payés
    d'abord par l'apport ;
  - ces barèmes viennent de sources secondaires (sites officiels inaccessibles depuis l'environnement de
    développement) : à vérifier ; estimation indicative, seule une banque peut confirmer.
- **QPV / TVA 5,5 %** : tampon de 300 m seulement. Le tampon de 500 m (QPV sous convention
  NPNRU) n'est pas appliqué : règle et liste non vérifiées à la source.
- **QPV 2024** : archive ANCT `qpv-2024.zip` (jeu « quartiers-prioritaires-de-la-politique-de-la-ville-qpv »
  sur data.gouv.fr), couche France hexagonale en Lambert-93, géométries réparées (`make_valid`).
  Si `static.data.gouv.fr` est injoignable, déposer l'archive à la main dans `data/raw/qpv/`.
