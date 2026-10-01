import { create } from 'zustand'
import type { Map as CarteMapLibre } from 'maplibre-gl'
import type { Donnees, MetaTrajet } from './types'
import type { Matrice } from '../logique/trajet'

/** Objets lourds ou non sérialisables, partagés entre composants (hors état d'interface). */
interface Ressources {
  donnees: Donnees | null
  erreur: string | null
  carte: CarteMapLibre | null
  meta: MetaTrajet | null
  matrices: Record<string, Matrice>
  /** Incrémenté quand les temps de trajet des IRIS ont été recalculés. */
  versionTrajet: number
}

export const useRessources = create<Ressources>()(() => ({
  donnees: null, erreur: null, carte: null, meta: null, matrices: {}, versionTrajet: 0,
}))

// Débogage en développement : inspecter les ressources depuis la console (window.__ressources).
if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__ressources = useRessources
