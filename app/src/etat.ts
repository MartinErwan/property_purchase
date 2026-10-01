import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Manifeste } from './donnees/types'
import type { Indicateur } from './logique/echelles'
import { PROFIL_DEFAUT, type Profil } from './logique/financement'
import type { Filtres } from './logique/selection'
import type { Destination } from './logique/trajet'

export interface Couches { stations: boolean; futures: boolean; qpv: boolean; ventes: boolean }

export interface Etat {
  ind: Indicateur
  filtres: Filtres
  couches: Couches
  /** null tant que les données de trajet ne sont pas chargées (pôle par défaut du manifeste). */
  destination: Destination | null
  horizon: string          // « actuel » ou année du GPE
  profil: Profil
  irisChoisi: string | null

  initialiser: (m: Manifeste) => void
  majFiltres: (f: Partial<Filtres>) => void
  majCouches: (c: Partial<Couches>) => void
  majProfil: (p: Partial<Profil>) => void
  set: (e: Partial<Pick<Etat, 'ind' | 'destination' | 'horizon' | 'irisChoisi'>>) => void
}

const FILTRES_DEFAUT: Filtres = { ba: 210000, bv: 290000, su: 45, di: 800, rv: 0, horsqpv: false, tt: 60 }

export const useEtat = create<Etat>()(persist((set) => ({
  ind: 'pa',
  filtres: FILTRES_DEFAUT,
  couches: { stations: true, futures: true, qpv: true, ventes: false },
  destination: null,
  horizon: 'actuel',
  profil: PROFIL_DEFAUT,
  irisChoisi: null,

  initialiser: (m) => set({
    filtres: { ba: m.defauts.budget_ancien, bv: m.defauts.budget_vefa, su: m.defauts.surface,
               di: m.defauts.dist_max, rv: m.defauts.revenu_min, horsqpv: false, tt: m.defauts.trajet_max },
  }),
  majFiltres: (f) => set((e) => ({ filtres: { ...e.filtres, ...f } })),
  majCouches: (c) => set((e) => ({ couches: { ...e.couches, ...c } })),
  majProfil: (p) => set((e) => ({ profil: { ...e.profil, ...p } })),
  set: (x) => set(x),
}), {
  // Seul le profil de financement est mémorisé sur l'appareil (les filtres vont dans l'URL, jalon 4).
  name: 'ou-acheter:profil',
  version: 1,
  partialize: (e) => ({ profil: e.profil }),
  merge: (enregistre, actuel) => ({ ...actuel, profil: { ...actuel.profil, ...(enregistre as Partial<Etat>)?.profil } }),
}))
