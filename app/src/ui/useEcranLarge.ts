import { useSyncExternalStore } from 'react'

const REQUETE = '(min-width: 900px)'

/** Vrai sur ordinateur / tablette en paysage : panneau latéral au lieu du tiroir. */
export function useEcranLarge(): boolean {
  return useSyncExternalStore(
    (rappel) => {
      const m = window.matchMedia(REQUETE)
      m.addEventListener('change', rappel)
      return () => m.removeEventListener('change', rappel)
    },
    () => window.matchMedia(REQUETE).matches,
    () => true,
  )
}
