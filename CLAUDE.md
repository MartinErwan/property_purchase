# Carte de sélection de quartiers — petite couronne parisienne

## Contexte
Outil perso pour choisir où acheter (ou louer) un appartement en petite couronne (92, 93, 94),
avec un budget d'environ 210-290k€ selon le montage (ancien ou neuf + PTZ).
Objectif : une carte interactive qui croise transports, prix réels, profil socio-économique
des quartiers et zones de TVA réduite. Pas d'appli web pour l'instant : un pipeline de données
reproductible + une carte exploitable (Kepler.gl et/ou QGIS).

## Mode de travail (important)
- Je veux comprendre chaque étape, pas déléguer. Avance par petites étapes, explique les choix
  (jointures, projections, filtres) et attends ma validation avant de passer à l'étape suivante.
- Avant d'écrire du code sur une source, commence par l'explorer : schéma, volumétrie,
  valeurs manquantes, pièges connus.
- Signale explicitement toute hypothèse ou toute info réglementaire que tu n'as pas vérifiée.

## Stack
- Python + uv, geopandas, shapely, DuckDB (extension spatial) pour les agrégations.
- Stockage intermédiaire en GeoParquet dans `data/processed/`, données brutes dans `data/raw/`
  (non versionnées).
- Projection de travail : Lambert-93 (EPSG:2154) pour toutes les distances et tampons ;
  export en WGS84 (EPSG:4326) pour la visualisation.
- Sortie : fichiers GeoJSON/GeoParquet chargeables dans Kepler.gl et QGIS, plus un notebook
  d'exploration.

## Sources (URLs à retrouver et vérifier, ne pas en inventer)
1. **DVF géolocalisées** (Etalab, data.gouv.fr) — départements 75 (pour contexte), 92, 93, 94,
   5 dernières années disponibles.
2. **Gares et stations du réseau ferré d'Île-de-France** (IDFM, open data) — métro, RER, tram,
   Transilien.
3. **Gares du Grand Paris Express** (Société des grands projets, data.gouv.fr) — avec la ligne
   et, si disponible, la date de mise en service prévue.
4. **Quartiers prioritaires de la politique de la ville, génération 2024** (ANCT, data.gouv.fr).
5. **Revenus disponibles par IRIS — Filosofi** (INSEE) + **contours IRIS** (IGN) du même
   millésime géographique.
6. Optionnel : **RPLS géolocalisé** (parc locatif social, ministère du Logement).

## Pièges connus à traiter
- DVF : une mutation = plusieurs lignes (lots, dépendances). Ne calculer un prix/m² que sur
  les mutations « Vente » ou « VEFA » portant sur un seul appartement (hors dépendances),
  avec surface bâtie renseignée. Distinguer ancien (Vente) et neuf (VEFA).
- DVF : filtrer les valeurs aberrantes (prix/m² hors d'une fourchette plausible, ventes à 1€,
  ventes en bloc).
- IRIS : vérifier que le millésime des contours correspond à celui de Filosofi, sinon la
  jointure perd des IRIS.
- Filosofi : certaines valeurs sont secrétisées (IRIS peu peuplés) → garder des NaN, ne pas
  imputer silencieusement.
- QPV : tampon de 300 m pour la zone de TVA à 5,5 % (500 m pour certains quartiers en
  rénovation urbaine — à vérifier, ne pas coder en dur sans source).

## Étapes
1. Téléchargement et exploration de chaque source (un script par source, notebook de
   contrôle).
2. Nettoyage DVF → table des ventes d'appartements avec prix/m², date, type (ancien/VEFA).
3. Couche transports : stations actuelles + futures gares GPE, typées par mode.
4. Couche QPV + tampon 300 m ; couche IRIS avec revenu médian.
5. Indicateurs par IRIS : prix/m² médian ancien et VEFA sur 24 mois (avec nombre de ventes),
   tendance, distance à la station la plus proche par mode, part de surface en QPV,
   revenu médian.
6. Export Kepler.gl / QGIS + filtres : budget, distance à pied à une station, revenu médian
   minimum, hors QPV.
7. Plus tard, quand le lieu de travail est connu : isochrones de trajet (Navitia/IDFM ou
   OpenTripPlanner avec les données horaires GTFS d'IDFM).

## Hors périmètre pour l'instant
Scraping d'annonces, prévision des taux, module de financement.
