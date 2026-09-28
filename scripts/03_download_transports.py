"""Téléchargement des couches transports (open data IDFM) en GeoJSON.

- emplacement-des-gares-idf : gares et stations actuelles, une ligne par couple gare × ligne
  (métro, RER, Transilien, tram, VAL, câble).
- projets_arrets_idf : gares et arrêts en projet (dont Grand Paris Express, lignes 15 à 18),
  avec statut d'avancement mais SANS date de mise en service.
- traces-du-reseau-ferre-idf : tracés des lignes en service, avec la couleur officielle de chaque
  ligne (colourweb_hexa). Pas de tracé pour les lignes en projet.

Les jeux de la Société des grands projets sur data.gouv.fr datent de 2015-2017 et ne donnent
pas de dates de mise en service : non utilisés.

Usage : uv run python scripts/03_download_transports.py
"""

from pathlib import Path

import requests

API = "https://data.iledefrance-mobilites.fr/api/explore/v2.1/catalog/datasets"
DATASETS = ["emplacement-des-gares-idf", "projets_arrets_idf", "traces-du-reseau-ferre-idf"]
RAW_DIR = Path(__file__).resolve().parents[1] / "data" / "raw" / "transports"


def main() -> None:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    for ds in DATASETS:
        url = f"{API}/{ds}/exports/geojson"
        # requests décompresse le gzip de transfert (contrairement à un curl sans --compressed).
        r = requests.get(url, timeout=120)
        r.raise_for_status()
        dest = RAW_DIR / f"{ds}.geojson"
        dest.write_bytes(r.content)
        print(f"téléchargé : {url} ({len(r.content) / 1e3:.0f} ko)")


if __name__ == "__main__":
    main()
