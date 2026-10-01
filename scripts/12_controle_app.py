"""Contrôles qualité des données de l'application avant publication (bloquants en cas d'échec).

Entrée : data/app/ (scripts/11_export_app.py)
Sortie : code de retour 0 si tout est conforme, 1 sinon (liste des anomalies affichée).

Seuils calés sur l'export de septembre 2026 (5 265 IRIS, 3 874 avec un prix ancien, 298 QPV,
matrice actuelle joignable à 93 %) avec une marge : ils détectent une source manquante ou tronquée,
pas une évolution normale des données.

Usage : uv run python scripts/12_controle_app.py
"""

import json
import sys
from pathlib import Path

import numpy as np

APP = Path(__file__).resolve().parents[1] / "data" / "app"

OBLIGATOIRES = ["iris", "communes", "stations", "lignes", "qpv", "tampon", "trajet", "trajet_actuel", "ventes_24m"]
N_IRIS = (5000, 5600)
PART_PRIX_ANCIEN_MIN = 0.6     # IRIS avec au moins 5 ventes dans l'ancien
PART_REVENU_MIN = 0.85         # IRIS avec un revenu (hors secret statistique)
N_QPV_MIN = 250
N_VENTES_MIN = 100_000         # ventes d'appartements sur 24 mois, IDF
PART_JOIGNABLE_MIN = 0.5       # couples station × pôle joignables dans la matrice actuelle


def main() -> int:
    anomalies: list[str] = []
    m = json.loads((APP / "manifest.json").read_text())
    f = m["fichiers"]
    anomalies += [f"fichier manquant : {k}" for k in OBLIGATOIRES if k not in f]
    lire = lambda cle: json.loads((APP / f[cle]["fichier"]).read_text())  # noqa: E731

    if "iris" in f:
        props = [x["properties"] for x in lire("iris")["features"]]
        n = len(props)
        if not N_IRIS[0] <= n <= N_IRIS[1]:
            anomalies.append(f"{n} IRIS (attendu {N_IRIS[0]}–{N_IRIS[1]})")
        for cle, seuil, nom in (("pa", PART_PRIX_ANCIEN_MIN, "prix ancien"), ("rv", PART_REVENU_MIN, "revenu")):
            part = sum(p[cle] is not None for p in props) / max(n, 1)
            if part < seuil:
                anomalies.append(f"{nom} renseigné pour {part:.0%} des IRIS (< {seuil:.0%})")
        if not any(p.get("ts") for p in props):
            anomalies.append("aucun IRIS relié à une station (temps de trajet)")
    if "qpv" in f and (n := len(lire("qpv")["features"])) < N_QPV_MIN:
        anomalies.append(f"{n} QPV (< {N_QPV_MIN})")
    if "ventes_24m" in f and (n := f["ventes_24m"].get("entites", 0)) < N_VENTES_MIN:
        anomalies.append(f"{n} ventes sur 24 mois (< {N_VENTES_MIN})")
    for cle, info in f.items():
        if cle.startswith("trajet_"):
            octets = np.fromfile(APP / info["fichier"], dtype=np.uint8)
            if octets.size != info["forme"][0] * info["forme"][1]:
                anomalies.append(f"{cle} : taille {octets.size} ≠ {info['forme']}")
            elif (part := (octets != 255).mean()) < PART_JOIGNABLE_MIN:
                anomalies.append(f"{cle} : {part:.0%} de couples joignables (< {PART_JOIGNABLE_MIN:.0%})")
    for cle, info in f.items():
        if not (APP / info["fichier"]).exists():
            anomalies.append(f"{info['fichier']} listé dans le manifeste mais absent")

    if anomalies:
        print("CONTRÔLE ÉCHOUÉ :\n- " + "\n- ".join(anomalies))
        return 1
    print(f"contrôle OK : {len(f)} fichiers, période {m['periode_24m']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
