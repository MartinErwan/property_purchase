// Tri de la liste « Mes quartiers ».

export type Tri = 'ajout' | 'pa' | 'pv' | 'tt' | 'rv' | 'da'

export const TRIS: { id: Tri; libelle: string; sens: 1 | -1 }[] = [
  { id: 'ajout', libelle: 'Ajout le plus récent', sens: -1 },
  { id: 'pa', libelle: 'Prix ancien (croissant)', sens: 1 },
  { id: 'pv', libelle: 'Prix neuf (croissant)', sens: 1 },
  { id: 'tt', libelle: 'Trajet (le plus court)', sens: 1 },
  { id: 'rv', libelle: 'Revenu médian (décroissant)', sens: -1 },
  { id: 'da', libelle: 'Station la plus proche', sens: 1 },
]

/** Trie les quartiers ; les valeurs absentes (moins de 5 ventes, secret statistique…) vont en fin de liste. */
export function trier<T extends { ajoute: string; p: Partial<Record<Exclude<Tri, 'ajout'>, number | null>> }>(liste: T[], tri: Tri): T[] {
  const { sens } = TRIS.find((t) => t.id === tri)!
  return [...liste].sort((a, b) => {
    if (tri === 'ajout') return sens * a.ajoute.localeCompare(b.ajoute)
    const va = a.p[tri], vb = b.p[tri]
    if (va == null && vb == null) return 0
    if (va == null) return 1
    if (vb == null) return -1
    return sens * (va - vb)
  })
}
