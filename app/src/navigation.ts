import { create } from 'zustand'

// Pages de l'application, chacune avec son adresse (le bouton retour du navigateur / du téléphone marche).
// Les paramètres de vue (?ba=…&iris=…) sont conservés d'une page à l'autre.
export type Page = 'carte' | 'quartiers' | 'financement' | 'compte'
export type SousOnglet = 'filtres' | 'trajet' | 'affichage'

const CHEMINS: Record<Page, string> = { carte: '/', quartiers: '/quartiers', financement: '/financement', compte: '/compte' }

export function pageDe(chemin: string): Page {
  const p = (Object.keys(CHEMINS) as Page[]).find((k) => k !== 'carte' && chemin.replace(/\/+$/, '') === CHEMINS[k])
  return p ?? 'carte'
}

interface Navigation {
  page: Page
  /** Section affichée dans le panneau de la carte. */
  sousOnglet: SousOnglet
  naviguer: (p: Page) => void
  ouvrirReglages: (s: SousOnglet) => void
}

export const useNavigation = create<Navigation>()((set, get) => ({
  page: pageDe(window.location.pathname),
  sousOnglet: 'filtres',
  naviguer: (page) => {
    if (page === get().page) return
    window.history.pushState(null, '', `${CHEMINS[page]}${window.location.search}`)
    set({ page })
  },
  ouvrirReglages: (sousOnglet) => {
    get().naviguer('carte')
    set({ sousOnglet })
  },
}))

window.addEventListener('popstate', () => useNavigation.setState({ page: pageDe(window.location.pathname) }))
