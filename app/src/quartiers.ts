import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/** Quartier enregistré par l'utilisateur (code IRIS + date d'ajout). */
export interface Enregistre { id: string; ajoute: string }

interface Quartiers {
  enregistres: Enregistre[]
  estEnregistre: (id: string) => boolean
  basculer: (id: string) => void
  retirer: (id: string) => void
  /** Fusion avec la liste du compte (union, date d'ajout la plus ancienne). */
  fusionner: (autres: Enregistre[]) => void
}

export function fusionnerListes(a: Enregistre[], b: Enregistre[]): Enregistre[] {
  const parId = new Map<string, Enregistre>()
  for (const q of [...a, ...b]) {
    const deja = parId.get(q.id)
    if (!deja || q.ajoute < deja.ajoute) parId.set(q.id, q)
  }
  return [...parId.values()].sort((x, y) => y.ajoute.localeCompare(x.ajoute))
}

/** Ne garde d'une liste venue du compte que des entrées bien formées (données extérieures à l'appli). */
export function listeValide(brut: unknown): Enregistre[] {
  if (!Array.isArray(brut)) return []
  return brut.filter((q): q is Enregistre => !!q && typeof q === 'object'
    && typeof (q as Enregistre).id === 'string' && /^[0-9A-Z]{9}$/.test((q as Enregistre).id)
    && typeof (q as Enregistre).ajoute === 'string')
}

export const useQuartiers = create<Quartiers>()(persist((set, get) => ({
  enregistres: [],
  estEnregistre: (id) => get().enregistres.some((q) => q.id === id),
  basculer: (id) => set((e) => ({
    enregistres: e.enregistres.some((q) => q.id === id)
      ? e.enregistres.filter((q) => q.id !== id)
      : [{ id, ajoute: new Date().toISOString() }, ...e.enregistres],
  })),
  retirer: (id) => set((e) => ({ enregistres: e.enregistres.filter((q) => q.id !== id) })),
  fusionner: (autres) => set((e) => ({ enregistres: fusionnerListes(e.enregistres, autres) })),
}), { name: 'ou-acheter:quartiers', version: 1, partialize: (e) => ({ enregistres: e.enregistres }) }))
