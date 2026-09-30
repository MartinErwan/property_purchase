// La connexion Google quitte la page puis y revient avec ?code=… : on mémorise la vue (paramètres de l'URL)
// avant de partir pour la retrouver au retour.
const CLE = 'ou-acheter:vue-avant-connexion'
const PARAMETRES_CONNEXION = ['code', 'state', 'error', 'error_code', 'error_description']

export function memoriserVueAvantConnexion(): void {
  try { sessionStorage.setItem(CLE, window.location.search) } catch { /* stockage indisponible */ }
}

function lireRechercheInitiale(): string {
  const p = new URLSearchParams(window.location.search)
  for (const k of PARAMETRES_CONNEXION) p.delete(k)
  let q = p.toString()
  try {
    if (!q) q = (sessionStorage.getItem(CLE) ?? '').replace(/^\?/, '')
    sessionStorage.removeItem(CLE)
  } catch { /* stockage indisponible */ }
  return q
}

/** Paramètres de vue présents à l'ouverture de la page (lus une seule fois, au chargement du module). */
export const RECHERCHE_INITIALE = lireRechercheInitiale()
/** Vrai si la page a été ouverte sans vue imposée : la dernière vue du compte peut alors être restaurée. */
export const VUE_INITIALE_VIDE = RECHERCHE_INITIALE === ''
