// Échelles de couleur des IRIS : vert (bon marché / aisé / proche) → rouge (cher / modeste / loin).
// Seuils identiques à carte.html.

export const VERT_ROUGE = ['#1a9850', '#91cf60', '#d9ef8b', '#ffffbf', '#fee08b', '#fc8d59', '#d73027']
export const SANS_DONNEE = '#bdbcb6'
export const ENCRE = '#1f1f1f'

export type Indicateur = 'pa' | 'pv' | 'rv' | 'tt'

export interface Echelle { seuils: number[]; unite: string; couleurs: string[]; libelle: string; sansDonnee: string }

export const ECHELLES: Record<Indicateur, Echelle> = {
  pa: { seuils: [3000, 4000, 5000, 6000, 7500, 10000], unite: '€/m²', couleurs: VERT_ROUGE,
        libelle: 'Prix/m² médian — ancien', sansDonnee: 'Moins de 5 ventes' },
  pv: { seuils: [4000, 5000, 6000, 7000, 8500, 11000], unite: '€/m²', couleurs: VERT_ROUGE,
        libelle: 'Prix/m² médian — neuf (VEFA)', sansDonnee: 'Moins de 5 ventes' },
  // Revenu : échelle inversée, vert = revenu élevé.
  rv: { seuils: [15000, 18000, 21000, 24000, 28000, 33000], unite: '€', couleurs: [...VERT_ROUGE].reverse(),
        libelle: 'Revenu médian disponible (€/an/UC)', sansDonnee: 'Secret statistique' },
  tt: { seuils: [20, 30, 40, 50, 60, 75], unite: 'min', couleurs: VERT_ROUGE,
        libelle: 'Temps de trajet vers la destination', sansDonnee: 'Pas de station à moins de 2,5 km' },
}

/** Couleur d'une valeur (même règle que l'expression « step » de MapLibre). */
export function couleurDe(ind: Indicateur, v: number | null | undefined): string {
  if (v == null) return SANS_DONNEE
  const { seuils, couleurs } = ECHELLES[ind]
  let k = 0
  while (k < seuils.length && v >= seuils[k]) k++
  return couleurs[k]
}

export const fmt = (n: number | null | undefined): string => (n == null ? '—' : Math.round(n).toLocaleString('fr-FR'))
export const pct = (x: number | null | undefined): string => (x == null ? '—' : `${Math.round(x * 100)} %`)
