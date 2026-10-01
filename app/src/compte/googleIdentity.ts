// Connexion Google par le bouton officiel (Google Identity Services) : Google renvoie un jeton d'identité
// directement à la page, que l'on transmet à Supabase (signInWithIdToken). Contrairement à la redirection
// OAuth via Supabase, l'écran de Google mentionne alors le site et non le domaine supabase.co.
// Google n'accepte que les origines déclarées une à une dans le client OAuth (pas de joker) : les
// préversions *.pages.dev gardent la redirection classique.

/** ID client OAuth « Application Web » (public par nature). Surchargeable au build. */
export const ID_CLIENT_GOOGLE: string = import.meta.env.VITE_GOOGLE_CLIENT_ID
  ?? '885075968921-ib3kd65u9fk4349560oql1e9p9g88f78.apps.googleusercontent.com'

/** Origines déclarées dans « Origines JavaScript autorisées » du client Google. */
const ORIGINES_AUTORISEES = ['https://ou-acheter-2qp.pages.dev', 'http://localhost:5173', 'http://localhost:4173']

export const boutonGoogleDisponible = (): boolean =>
  !!ID_CLIENT_GOOGLE && ORIGINES_AUTORISEES.includes(window.location.origin)

interface ReponseIdentifiant { credential: string }
interface GoogleId {
  initialize: (o: { client_id: string; nonce: string; callback: (r: ReponseIdentifiant) => void;
                    auto_select?: boolean; itp_support?: boolean; use_fedcm_for_button?: boolean }) => void
  renderButton: (el: HTMLElement, o: Record<string, string | number>) => void
}
declare global { interface Window { google?: { accounts: { id: GoogleId } } } }

let chargement: Promise<GoogleId> | null = null

/** Charge le script de Google une seule fois, à la demande (uniquement si l'onglet Compte s'affiche). */
export function chargerGoogle(): Promise<GoogleId> {
  chargement ??= new Promise((ok, echec) => {
    const s = document.createElement('script')
    s.src = 'https://accounts.google.com/gsi/client'
    s.async = true
    s.onload = () => (window.google ? ok(window.google.accounts.id) : echec(new Error('Google Identity indisponible')))
    s.onerror = () => { chargement = null; echec(new Error('Script Google inaccessible')) }
    document.head.append(s)
  })
  return chargement
}

/** Nonce aléatoire : Google reçoit son empreinte SHA-256 (hexadécimal), Supabase la valeur brute. */
export async function nouveauNonce(): Promise<{ brut: string; empreinte: string }> {
  const brut = Array.from(crypto.getRandomValues(new Uint8Array(32)), (o) => o.toString(16).padStart(2, '0')).join('')
  const hache = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(brut)))
  return { brut, empreinte: Array.from(hache, (o) => o.toString(16).padStart(2, '0')).join('') }
}
