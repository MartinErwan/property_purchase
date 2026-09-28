"""Téléchargement des DVF géolocalisées (Etalab) par département et par année.

Source : https://files.data.gouv.fr/geo-dvf/latest/csv/<année>/departements/<dep>.csv.gz
Les fichiers sont stockés tels quels (compressés) dans data/raw/dvf/.

Usage :
    uv run python scripts/01_download_dvf.py                 # 75, 92, 93, 94 × 2021-2025
    uv run python scripts/01_download_dvf.py --deps 92 --years 2024
"""

import argparse
from pathlib import Path

import requests

BASE_URL = "https://files.data.gouv.fr/geo-dvf/latest/csv"
RAW_DIR = Path(__file__).resolve().parents[1] / "data" / "raw" / "dvf"

DEFAULT_DEPS = ["75", "92", "93", "94"]
DEFAULT_YEARS = [2021, 2022, 2023, 2024, 2025]


def download(dep: str, year: int, force: bool = False) -> Path:
    dest = RAW_DIR / str(year) / f"{dep}.csv.gz"
    if dest.exists() and not force:
        print(f"déjà présent : {dest.relative_to(RAW_DIR.parents[1])}")
        return dest
    dest.parent.mkdir(parents=True, exist_ok=True)
    url = f"{BASE_URL}/{year}/departements/{dep}.csv.gz"
    with requests.get(url, stream=True, timeout=60) as r:
        r.raise_for_status()
        tmp = dest.with_suffix(".part")
        with open(tmp, "wb") as f:
            for chunk in r.iter_content(chunk_size=1 << 20):
                f.write(chunk)
        tmp.rename(dest)
    print(f"téléchargé : {url} ({dest.stat().st_size / 1e6:.1f} Mo)")
    return dest


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--deps", nargs="+", default=DEFAULT_DEPS)
    parser.add_argument("--years", nargs="+", type=int, default=DEFAULT_YEARS)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    for year in args.years:
        for dep in args.deps:
            download(dep, year, args.force)


if __name__ == "__main__":
    main()
