"""Téléchargement des sources de l'étape 4 : Filosofi par IRIS, contours IRIS, QPV 2024.

- Filosofi 2021 par IRIS, revenus disponibles (INSEE, https://www.insee.fr/fr/statistiques/8229323).
  Millésime le plus récent trouvé ; géographie au 1er janvier 2022.
- Filosofi 2021 par commune (INSEE, https://www.insee.fr/fr/statistiques/7756729), pour les
  communes non découpées en IRIS. 2021 est le dernier millésime : l'INSEE a annoncé que 2022 ne
  sera pas produit.
- Contours IRIS édition 2022-01-01 (IGN, Géoplateforme) : même géographie que Filosofi 2021.
- Zonage A/B/C des communes en vigueur au 26 juin 2026 (ministère du Logement, data.gouv.fr, jeu
  « liste-des-communes-selon-le-zonage-abc ») : plafonds du PTZ et du prêt Action Logement.
- QPV génération 2024, archive complète des périmètres (GeoJSON, GPKG, SHP) (ANCT, data.gouv.fr,
  jeu « quartiers-prioritaires-de-la-politique-de-la-ville-qpv »). Si static.data.gouv.fr est
  injoignable, déposer `qpv-2024.zip` à la main dans data/raw/qpv/ : le script le dézippe.

Chaque source est téléchargée indépendamment : l'échec de l'une n'empêche pas les autres.

Usage : uv run python scripts/05_download_socio.py
"""

import zipfile
from pathlib import Path

import py7zr
import requests

RAW = Path(__file__).resolve().parents[1] / "data" / "raw"

SOURCES = {
    "filosofi": "https://www.insee.fr/fr/statistiques/fichier/8229323/BASE_TD_FILO_IRIS_2021_DISP_CSV.zip",
    "filosofi_communes": "https://www.insee.fr/fr/statistiques/fichier/7756729/base-cc-filosofi-2021-geo2024_csv.zip",
    "iris": (
        "https://data.geopf.fr/telechargement/download/CONTOURS-IRIS/"
        "CONTOURS-IRIS_2-1__SHP__FRA_2022-01-01/CONTOURS-IRIS_2-1__SHP__FRA_2022-01-01.7z"
    ),
    "zonage": (
        "https://static.data.gouv.fr/resources/liste-des-communes-selon-le-zonage-abc/20260703-091314/"
        "liste-ensemble-des-communes-zonage-abc-en-vigueur-26-juin-2026.csv"
    ),
    "qpv": (
        "https://static.data.gouv.fr/resources/quartiers-prioritaires-de-la-politique-de-la-ville-qpv/"
        "20260109-162140/qpv-2024.zip"
    ),
}


def telecharger(nom: str, url: str) -> Path:
    dest = RAW / nom / url.rsplit("/", 1)[-1]
    if dest.exists():
        print(f"déjà présent : {dest.relative_to(RAW.parent)}")
        return dest
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".part")
    with requests.get(url, stream=True, timeout=120) as r:
        r.raise_for_status()
        with open(tmp, "wb") as f:
            for chunk in r.iter_content(chunk_size=1 << 20):
                f.write(chunk)
    tmp.rename(dest)
    print(f"téléchargé : {url} ({dest.stat().st_size / 1e6:.1f} Mo)")
    return dest


def extraire(archive: Path) -> None:
    if archive.suffix == ".zip":
        with zipfile.ZipFile(archive) as z:
            z.extractall(archive.parent)
    elif archive.suffix == ".7z":
        with py7zr.SevenZipFile(archive) as z:
            z.extractall(archive.parent)


def main() -> None:
    for nom, url in SOURCES.items():
        try:
            extraire(telecharger(nom, url))
        except requests.RequestException as e:
            print(f"ÉCHEC {nom} : {e}")


if __name__ == "__main__":
    main()
