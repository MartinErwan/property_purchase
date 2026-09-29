# Où acheter en Île-de-France — pipeline de données + application web (PWA)

## Contexte
Outil perso pour choisir où acheter (ou louer) un appartement en Île-de-France (départ : petite
couronne 92, 93, 94, étendu aux 8 départements), avec un budget d'environ 210-290k€ selon le montage
(ancien ou neuf + PTZ). Deux briques :
- un **pipeline de données** Python reproductible qui croise transports, prix réels, profil
  socio-économique des quartiers (IRIS) et zones de TVA réduite ;
- une **application web installable (PWA)**, utilisable sur ordinateur et téléphone, qui affiche la
  carte et fait tous les calculs interactifs (filtres, financement, temps de trajet) dans le navigateur.
Utilisateur : moi d'abord ; ouverture éventuelle à d'autres plus tard si l'outil a de la valeur.

## Mode de travail (important)
- Je veux comprendre chaque étape, pas déléguer. Pour les **données** (pipeline, exports, calculs de
  temps de trajet) et tout ce qui est **réglementaire** (financement, PTZ, TVA, conditions de
  réutilisation des données) : petites étapes, choix expliqués (jointures, projections, filtres),
  validation avant l'étape suivante.
- Pour le **front** (interface, composants, style, outillage) : autonomie, avec une explication des
  choix à chaque jalon.
- Livraison : une PR par jalon (voir « Jalons de l'application »).
- Avant d'écrire du code sur une source, commence par l'explorer : schéma, volumétrie,
  valeurs manquantes, pièges connus.
- Signale explicitement toute hypothèse ou toute info réglementaire que tu n'as pas vérifiée.

## Stack
### Pipeline (`scripts/`, `notebooks/`)
- Python + uv, geopandas, shapely, DuckDB (extension spatial) pour les agrégations.
- Stockage intermédiaire en GeoParquet dans `data/processed/`, données brutes dans `data/raw/`
  (non versionnées).
- Projection de travail : Lambert-93 (EPSG:2154) pour toutes les distances et tampons ;
  export en WGS84 (EPSG:4326) pour la visualisation.
- Sorties : `data/exports/` (GeoPackage QGIS, Kepler.gl, `carte.html` autonome) et `data/app/`
  (fichiers consommés par l'application, voir ci-dessous). Non versionnées.

### Application (`app/`)
- Vite + React + TypeScript, MapLibre GL JS, fond Plan IGN v2 (Géoplateforme, sans clé d'API).
- PWA installable, en ligne uniquement (pas de mode hors ligne).
- Architecture **statique** : l'application lit des fichiers précalculés par le pipeline
  (`data/app/` : couches GeoJSON compactes — PMTiles si trop lourd sur mobile — matrices de temps
  de trajet, manifeste versionné). Pas de backend à nous.
- Mise en page : carte plein écran ; sur mobile, barre d'onglets en bas (Carte / Filtres /
  Financement / Trajet / Compte) et panneaux en tiroir ; sur ordinateur, panneau latéral.
- État des filtres encodé dans l'URL (lien partageable).
- Tests : Vitest, en priorité sur les calculs purs (financement, temps de trajet, filtres).

### Comptes et synchronisation (`supabase/`)
- Supabase (région UE, Francfort) : authentification Google + e-mail/mot de passe, stockage du
  profil de financement et des filtres enregistrés, synchronisés entre appareils.
- Règles d'accès par ligne (RLS) : chaque utilisateur ne lit et n'écrit que ses propres données.
  Le profil contient des revenus → données personnelles, ne rien stocker d'autre que le nécessaire.
- Schéma versionné sous forme de migrations SQL dans `supabase/migrations/`.
- Site public (carte consultable sans compte) ; connexion requise pour sauvegarder et pour voir les
  ventes DVF individuelles (servies depuis un stockage Supabase privé).

### Hébergement et automatisation
- Cloudflare Pages (gratuit), préversion déployée pour chaque PR.
- Pages non indexées par les moteurs de recherche (`robots.txt` + en-tête `X-Robots-Tag`).
- GitHub Actions : tests du front sur chaque PR ; pipeline de données planifié (mensuel) avec
  contrôles qualité avant publication. Faisabilité sur un runner gratuit (RAM, disque, durée) à
  vérifier ; à défaut, mise à jour manuelle depuis mon PC.
- Clés et identifiants uniquement dans les secrets GitHub / Cloudflare, jamais dans le dépôt.

## Sources (URLs à retrouver et vérifier, ne pas en inventer)
1. **DVF géolocalisées** (Etalab, data.gouv.fr) — 8 départements d'Île-de-France,
   5 dernières années disponibles.
2. **Gares et stations du réseau ferré d'Île-de-France** (IDFM, open data) — métro, RER, tram,
   Transilien.
3. **Projets de lignes** (IDFM, `projets_lignes_idf`) dont le Grand Paris Express — tracés, lignes
   et dates de mise en service estimées.
4. **Quartiers prioritaires de la politique de la ville, génération 2024** (ANCT, data.gouv.fr).
5. **Revenus disponibles par IRIS — Filosofi** (INSEE) + **contours IRIS** (IGN) du même
   millésime géographique.
6. **Horaires GTFS IDFM** — temps de trajet.
7. **Zonage A/B/C** (ministère du Logement, data.gouv.fr) — profil de financement.
8. **API Adresse** (géocodage, IGN/BAN) — destination de trajet par adresse, appelée depuis le
   navigateur.
9. Optionnel : **RPLS géolocalisé** (parc locatif social, ministère du Logement).

## Pièges connus à traiter
- DVF : une mutation = plusieurs lignes (lots, dépendances). Ne calculer un prix/m² que sur
  les mutations « Vente » ou « VEFA » portant sur un seul appartement (hors dépendances),
  avec surface bâtie renseignée. Distinguer ancien (Vente) et neuf (VEFA).
- DVF : filtrer les valeurs aberrantes (prix/m² hors d'une fourchette plausible, ventes à 1€,
  ventes en bloc).
- DVF : conditions de réutilisation des ventes individuelles (non-indexation par les moteurs de
  recherche, pas de ré-identification) — **à vérifier à la source** avant toute ouverture publique.
- IRIS : vérifier que le millésime des contours correspond à celui de Filosofi, sinon la
  jointure perd des IRIS.
- Filosofi : certaines valeurs sont secrétisées (IRIS peu peuplés) → garder des NaN, ne pas
  imputer silencieusement.
- QPV : tampon de 300 m pour la zone de TVA à 5,5 % (500 m pour certains quartiers en
  rénovation urbaine — à vérifier, ne pas coder en dur sans source).
- Financement : barèmes (PTZ, Action Logement, zonage) issus de sources secondaires → à vérifier ;
  tout portage du calcul en TypeScript doit reproduire à l'identique les résultats de `carte.html`
  (tests de non-régression).
- Application : le poids des données chargées sur mobile (viser quelques Mo compressés au
  premier affichage).

## Pipeline de données — étapes (faites)
1. Téléchargement et exploration de chaque source (un script par source, notebook de contrôle).
2. Nettoyage DVF → table des ventes d'appartements avec prix/m², date, type (ancien/VEFA).
3. Couche transports : stations actuelles + projets (GPE, tram, RER E), typées par mode.
4. Couche QPV + tampon 300 m ; couche IRIS avec revenu médian.
5. Indicateurs par IRIS : prix/m² médian ancien et VEFA sur 24 mois (avec nombre de ventes),
   tendance, distance à la station la plus proche par mode, part de surface en QPV,
   revenu médian.
6. Export Kepler.gl / QGIS + carte HTML autonome avec filtres et profil de financement.
7. Temps de trajet (GTFS IDFM, matrices stations × pôles, horizons GPE).

## Jalons de l'application (une PR chacun)
0. Cadrage : ce fichier, README, arborescence.
1. Export des données pour l'application (`scripts/11_export_app.py` → `data/app/`), contrôle
   des tailles.
2. Squelette PWA : mise en page responsive, carte, déploiement de préversion.
3. Couches, infobulles, recherche de ville, fiche quartier au clic.
4. Filtres, état dans l'URL.
5. Financement : calculs portés en TypeScript + tests de non-régression contre `carte.html`.
6. Temps de trajet : matrices, horizons GPE, destination par adresse (API Adresse + marche
   jusqu'aux stations proches).
7. Supabase : connexion, sauvegarde du profil et des filtres, ventes DVF réservées aux connectés.
8. GitHub Actions : pipeline planifié, contrôles qualité, déploiement ; tests du front sur PR.

## Hors périmètre pour l'instant
Scraping d'annonces, prévision des taux, application native (stores), mode hors ligne, itinéraires
en temps réel via API (Navitia/PRIM), favoris / comparateur / notes de visite (v2 possible).
