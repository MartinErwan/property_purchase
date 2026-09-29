# Application web (PWA)

Vite + React + TypeScript + MapLibre GL JS. Application **statique** : elle lit les fichiers produits par
`scripts/11_export_app.py` (`../data/app/`) et fait tous les calculs dans le navigateur.

## Commandes

```bash
npm install
npm run dev        # http://localhost:5173 — sert aussi ../data/app/ sous /donnees/
npm test           # tests unitaires (Vitest)
npm run typecheck  # vérification des types
npm run lint       # oxlint
npm run build      # dist/ + copie de ../data/app/ dans dist/donnees/ (sans les fichiers « privés »)
npm run preview    # sert dist/ sur http://localhost:4173
```

Il faut d'abord avoir lancé le pipeline jusqu'au script 11 (voir le README à la racine).

## Organisation

| Dossier | Rôle |
|---|---|
| `src/donnees/` | Schéma des fichiers (`types.ts`), chargement (manifeste puis fichiers nommés par empreinte) |
| `src/logique/` | Calculs purs et testés : financement, sélection (filtres), temps de trajet, URL, recherche |
| `src/carte/` | Carte MapLibre : couches (portage de `carte.html`), synchronisation avec l'état, infobulle |
| `src/panneaux/` | Contenu des onglets (Carte, Filtres, Financement, Trajet, Compte) et fiche quartier |
| `src/ui/` | Mise en page : onglets, tiroir mobile, champ de recherche avec suggestions |
| `src/etat.ts` | État de l'interface (zustand) ; seul le profil de financement est mémorisé sur l'appareil |

## Choix

- **Mise en page** : ≥ 900 px, panneau latéral à onglets et fiche quartier flottante ; en dessous, carte plein
  écran, barre d'onglets en bas et tiroir (mi-hauteur / plein écran, poignée à glisser).
- **État dans l'URL** : filtres, indicateur, destination, horizon GPE et quartier ouvert (`?ba=250000&iris=…`),
  pour partager ou retrouver une vue. Le profil de financement n'y figure jamais (revenus).
- **Financement** : `src/logique/financement.ts` reproduit à l'identique le calcul de `carte.html` ;
  `financement.test.ts` exécute le code d'origine extrait de `scripts/carte_template.html` et compare les résultats.
- **Filtres** : l'expression MapLibre et la fonction `estSelectionne` (compteur, fiche) sont testées l'une contre
  l'autre (`selection.test.ts`).
- **Temps de trajet vers une adresse** : géocodage Géoplateforme (IGN), puis marche à vol d'oiseau × 1,3 à
  4,5 km/h depuis les pôles de gares à moins de 2,5 km ; temps = min(marche départ + trajet + marche arrivée).
- **Hors ligne** : non. Le service worker ne met en cache que l'application ; les données passent par le cache
  HTTP (noms par empreinte, `public/_headers`).
- **Indexation** : `robots.txt`, `<meta name="robots">` et en-tête `X-Robots-Tag` (Cloudflare Pages).
