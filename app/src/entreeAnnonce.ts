import { extraire, type Brouillon } from './logique/annonce'

// Ouverture de l'application sur /ajout?… : favori « ☆ Où acheter » ou partage Android (share_target du
// manifeste). Lu une seule fois au chargement, AVANT les autres modules qui lisent l'adresse (navigation, vue) :
// l'adresse est aussitôt remplacée par /quartiers, sans ces paramètres.
const CHAMPS = ['url', 'titre', 'texte', 'desc', 'image', 'prix', 'surface'] as const

function lire(): Brouillon | null {
  if (window.location.pathname.replace(/\/+$/, '') !== '/ajout') return null
  const p = new URLSearchParams(window.location.search)
  const recu = Object.fromEntries(CHAMPS.map((k) => [k, p.get(k)]))
  for (const k of CHAMPS) p.delete(k)
  const reste = p.toString()
  window.history.replaceState(null, '', `/quartiers${reste ? `?${reste}` : ''}`)
  return extraire(recu)
}

export const BROUILLON_INITIAL = lire()
