// Temps de trajet IRIS → destination, à partir des matrices stations × pôles précalculées
// (scripts/08_temps_trajet.py) : meilleur (marche vers une station proche + trajet).
import type { IrisProps, Pole } from '../donnees/types'

export const INJOIGNABLE = 255
// Hypothèses de marche identiques au pipeline (scripts/08_temps_trajet.py).
export const DETOUR = 1.3
export const VITESSE_MARCHE_M_MIN = 75   // 4,5 km/h
export const MARCHE_MAX_M = 2500

export interface Matrice { octets: Uint8Array; nbPoles: number }

export const tempsStation = (m: Matrice, station: number, pole: number): number | null => {
  const v = m.octets[station * m.nbPoles + pole]
  return v === INJOIGNABLE || v === undefined ? null : v
}

/** Destination : un pôle de gares, ou une adresse (reliée à pied aux pôles proches). */
export type Destination =
  | { type: 'pole'; pole: number }
  | { type: 'adresse'; libelle: string; lng: number; lat: number }

/** Distance à vol d'oiseau en mètres (approximation équirectangulaire, suffisante à l'échelle de l'IDF). */
export function distanceM(a: [number, number], b: [number, number]): number {
  const R = 6371000, rad = Math.PI / 180
  const x = (b[0] - a[0]) * rad * Math.cos(((a[1] + b[1]) / 2) * rad)
  const y = (b[1] - a[1]) * rad
  return Math.sqrt(x * x + y * y) * R
}

export const minutesMarche = (m: number): number => (m * DETOUR) / VITESSE_MARCHE_M_MIN

/** Pôles d'arrivée pour une destination, avec le temps de marche restant jusqu'à elle. */
export function polesArrivee(dest: Destination, poles: Pole[]): { pole: number; marche: number }[] {
  if (dest.type === 'pole') return [{ pole: dest.pole, marche: 0 }]
  const res: { pole: number; marche: number }[] = []
  poles.forEach((p, k) => {
    const d = distanceM([dest.lng, dest.lat], p.c)
    if (d <= MARCHE_MAX_M) res.push({ pole: k, marche: minutesMarche(d) })
  })
  return res
}

export interface TempsIris { tt: number | null; tvia: string | null; tmar: number | null }

/** Temps d'un IRIS vers la destination : min sur (station de départ s, pôle d'arrivée p) de
 * marche(IRIS → s) + trajet(s → p) + marche(p → adresse). Arrondi à la minute comme carte.html. */
export function tempsIris(p: Pick<IrisProps, 'ts' | 'tm'>, m: Matrice, arrivees: { pole: number; marche: number }[],
                          nomsStations: string[]): TempsIris {
  let meilleur: TempsIris = { tt: null, tvia: null, tmar: null }
  ;(p.ts ?? []).forEach((s, j) => {
    for (const a of arrivees) {
      const t = tempsStation(m, s, a.pole)
      if (t == null) continue
      const total = Math.round(t + p.tm[j] + a.marche)
      if (meilleur.tt == null || total < meilleur.tt) meilleur = { tt: total, tvia: nomsStations[s], tmar: Math.round(p.tm[j]) }
    }
  })
  return meilleur
}

export function libelleDestination(d: Destination | null, poles: { n: string }[] | undefined): string {
  if (!d) return ''
  return d.type === 'pole' ? poles?.[d.pole]?.n ?? '' : d.libelle
}
