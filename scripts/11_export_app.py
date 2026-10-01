"""Données de l'application web (PWA) : fichiers séparés, nommés par empreinte, plus un manifeste.

Entrées : les mêmes que scripts/10_carte_html.py (carte.gpkg + fichiers du temps de trajet), dont on
          réutilise la préparation (clés courtes, arrondis, simplification des contours) pour que
          l'application et carte.html affichent exactement les mêmes valeurs.
Sorties : data/app/manifest.json          lu en premier par l'application (jamais mis en cache)
          data/app/<couche>.<empreinte>.geojson   iris, communes, stations, lignes, qpv, tampon
          data/app/trajet.<empreinte>.json        pôles de destination, noms des stations, horizons GPE
          data/app/trajet_<horizon>.<empreinte>.bin  matrices stations × pôles (uint8, minutes,
                                                  255 = injoignable), ligne par ligne ; horizon
                                                  « actuel » ou année de mise en service du GPE
          data/app/ventes_24m.<empreinte>.json   ventes individuelles [lng, lat, prix/m², type, date,
                                                  surface, prix] ; marquées « privé » : destinées au
                                                  stockage réservé aux utilisateurs connectés (jalon 7)

Nommage par empreinte (8 premiers caractères du SHA-256 du contenu) : un fichier inchangé garde son
nom et reste en cache dans le navigateur ; un fichier modifié change de nom. Seul le manifeste doit
être relu à chaque visite.

Usage : uv run python scripts/11_export_app.py
"""

import gzip
import hashlib
import importlib
import json
import shutil
from datetime import datetime, timezone
from pathlib import Path

import geopandas as gpd
import numpy as np

carte = importlib.import_module("10_carte_html")  # nom de module commençant par un chiffre

ROOT = Path(__file__).resolve().parents[1]
PROC = ROOT / "data" / "processed"
APP = ROOT / "data" / "app"

VERSION_SCHEMA = 1  # à incrémenter si les clés ou le format des fichiers changent


def ecrire(nom: str, extension: str, contenu: bytes, **meta) -> dict:
    """Écrit un fichier nommé par empreinte et renvoie sa description pour le manifeste."""
    empreinte = hashlib.sha256(contenu).hexdigest()
    fichier = f"{nom}.{empreinte[:8]}.{extension}"
    (APP / fichier).write_bytes(contenu)
    return {"fichier": fichier, "octets": len(contenu), "octets_gzip": len(gzip.compress(contenu, 9)),
            "sha256": empreinte, **meta}


def en_json(obj) -> bytes:
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":")).encode()


def matrices_trajet() -> tuple[dict, dict]:
    """Métadonnées du temps de trajet (JSON) et matrices brutes (une par horizon)."""
    st_trajet = gpd.read_parquet(PROC / "stations_trajet.parquet")
    meta = carte.trajet(st_trajet)  # pôles, noms des stations, pôle par défaut (+ matrices en base64)
    base = np.load(PROC / "temps_trajet.npy")
    assert base.dtype == np.uint8 and base.ndim == 2, base.dtype
    matrices = {"actuel": base}
    horizons = []
    for h in meta.pop("horizons"):
        m = np.load(PROC / f"temps_trajet_gpe_{h['annee']}.npy")
        assert m.shape[1] == base.shape[1], (m.shape, base.shape)  # mêmes pôles
        matrices[str(h["annee"])] = m
        horizons.append({"annee": h["annee"], "lignes": h["lignes"]})
    meta.pop("matrice")
    meta["horizons"] = horizons
    return meta, matrices


def main() -> None:
    if APP.exists():
        shutil.rmtree(APP)
    APP.mkdir(parents=True)

    donnees = carte.preparer()
    fichiers = {}
    for couche in ("iris", "communes", "stations", "lignes", "qpv", "tampon"):
        if couche in donnees:
            fichiers[couche] = ecrire(couche, "geojson", en_json(donnees[couche]),
                                      entites=len(donnees[couche]["features"]))
    fichiers["ventes_24m"] = ecrire("ventes_24m", "json", en_json(donnees["ventes"]),
                                    entites=len(donnees["ventes"]), prive=True,
                                    colonnes=["lng", "lat", "prix_m2", "type", "date", "surface", "prix"])

    meta, matrices = matrices_trajet()
    fichiers["trajet"] = ecrire("trajet", "json", en_json(meta), entites=len(meta["poles"]))
    for horizon, m in matrices.items():
        fichiers[f"trajet_{horizon}"] = ecrire(f"trajet_{horizon}", "bin", np.ascontiguousarray(m).tobytes(),
                                               forme=list(m.shape), type="uint8", injoignable=255)

    manifeste = {
        "version_schema": VERSION_SCHEMA,
        "genere_le": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "periode_24m": donnees["periode"],
        "departements": donnees["departements"],
        "defauts": donnees["defauts"],
        "fichiers": fichiers,
    }
    (APP / "manifest.json").write_text(json.dumps(manifeste, ensure_ascii=False, indent=2))

    print(f"{'fichier':<40} {'entités':>9} {'Mo':>7} {'Mo gzip':>8}")
    for f in fichiers.values():
        print(f"{f['fichier']:<40} {f.get('entites', ''):>9} {f['octets'] / 1e6:>7.2f} {f['octets_gzip'] / 1e6:>8.2f}")
    demarrage = [f for k, f in fichiers.items() if not k.startswith(("trajet", "ventes"))]
    print(f"premier affichage (couches) : {sum(f['octets_gzip'] for f in demarrage) / 1e6:.2f} Mo gzip")


if __name__ == "__main__":
    main()
