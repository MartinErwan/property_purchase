import { useState, type FormEvent } from 'react'
import { supabase } from '../compte/client'
import { memoriserVueAvantConnexion } from '../compte/retourConnexion'
import { useSession } from '../compte/session'
import { Sources } from './PanneauCarte'

// Messages d'erreur Supabase les plus courants, en français.
const ERREURS: [RegExp, string][] = [
  [/invalid login credentials/i, 'E-mail ou mot de passe incorrect.'],
  [/email not confirmed/i, 'Adresse e-mail pas encore confirmée : clique sur le lien reçu par e-mail.'],
  [/user already registered/i, 'Un compte existe déjà avec cette adresse : connecte-toi.'],
  [/password should be at least/i, 'Mot de passe trop court (8 caractères minimum conseillés).'],
  [/signups? not allowed|signup is disabled/i, 'Les inscriptions sont fermées sur cette application.'],
  [/rate limit/i, 'Trop de tentatives : réessaie dans quelques minutes.'],
]
const traduire = (m: string) => ERREURS.find(([re]) => re.test(m))?.[1] ?? m

function Connexion() {
  const [mode, setMode] = useState<'connexion' | 'inscription'>('connexion')
  const [email, setEmail] = useState('')
  const [motDePasse, setMotDePasse] = useState('')
  const [message, setMessage] = useState<{ type: 'erreur' | 'info'; texte: string } | null>(null)
  const [envoi, setEnvoi] = useState(false)

  const google = async () => {
    memoriserVueAvantConnexion()
    const { error } = await supabase!.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}${window.location.pathname}` },
    })
    if (error) setMessage({ type: 'erreur', texte: traduire(error.message) })
  }

  const valider = async (e: FormEvent) => {
    e.preventDefault()
    setEnvoi(true)
    setMessage(null)
    if (mode === 'connexion') {
      const { error } = await supabase!.auth.signInWithPassword({ email, password: motDePasse })
      if (error) setMessage({ type: 'erreur', texte: traduire(error.message) })
    } else {
      const { data, error } = await supabase!.auth.signUp({
        email, password: motDePasse,
        options: { emailRedirectTo: `${window.location.origin}${window.location.pathname}` },
      })
      if (error) setMessage({ type: 'erreur', texte: traduire(error.message) })
      else if (!data.session) setMessage({ type: 'info', texte: 'Compte créé : confirme ton adresse avec le lien reçu par e-mail, puis connecte-toi.' })
    }
    setEnvoi(false)
  }

  return (
    <>
      <p>Connecte-toi pour retrouver ton profil de financement et ta dernière vue sur tous tes appareils, et pour
        afficher les ventes individuelles des 24 derniers mois.</p>
      <button type="button" className="bouton bouton-google" onClick={google}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M22.5 12.2c0-.8-.1-1.5-.2-2.2H12v4.2h5.9a5 5 0 0 1-2.2 3.3v2.7h3.6c2-1.9 3.2-4.7 3.2-8z" />
          <path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.8c-1 .7-2.2 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.5H2.1v2.8A11 11 0 0 0 12 23z" />
          <path fill="#FBBC05" d="M5.8 14.1a6.6 6.6 0 0 1 0-4.2V7.1H2.1a11 11 0 0 0 0 9.8l3.7-2.8z" />
          <path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0 0 2.1 7.1l3.7 2.8C6.7 7.3 9.1 5.4 12 5.4z" /></svg>
        Continuer avec Google
      </button>

      <div className="separateur"><span>ou</span></div>

      <form className="formulaire-compte" onSubmit={valider}>
        <label>E-mail<input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label>Mot de passe<input type="password" required minLength={8}
          autoComplete={mode === 'connexion' ? 'current-password' : 'new-password'}
          value={motDePasse} onChange={(e) => setMotDePasse(e.target.value)} /></label>
        <button type="submit" className="bouton bouton-principal" disabled={envoi}>
          {mode === 'connexion' ? 'Se connecter' : 'Créer mon compte'}</button>
      </form>
      {message && <p className={`etat ${message.type === 'erreur' ? 'erreur' : 'encart'}`} role="status">{message.texte}</p>}
      <p className="etat">
        {mode === 'connexion'
          ? <>Pas encore de compte ? <button type="button" className="lien" onClick={() => { setMode('inscription'); setMessage(null) }}>Créer un compte</button></>
          : <>Déjà un compte ? <button type="button" className="lien" onClick={() => { setMode('connexion'); setMessage(null) }}>Se connecter</button></>}
      </p>
    </>
  )
}

function Connecte() {
  const session = useSession((s) => s.session)!
  const synchro = useSession((s) => s.synchro)
  const erreur = useSession((s) => s.erreurSynchro)
  const [confirmer, setConfirmer] = useState(false)
  const [info, setInfo] = useState<string | null>(null)

  const effacer = async () => {
    const { error } = await supabase!.from('preferences').delete().eq('user_id', session.user.id)
    setConfirmer(false)
    setInfo(error ? `Échec : ${error.message}` : 'Données du compte effacées (le profil reste sur cet appareil).')
  }

  return (
    <>
      <p>Connecté : <b>{session.user.email}</b></p>
      <p className={`etat ${synchro === 'erreur' ? 'erreur' : 'discret'}`}>
        Synchronisation : {synchro === 'à jour' ? 'à jour ✓' : synchro === 'en cours' ? 'enregistrement…' : synchro === 'erreur' ? `erreur (${erreur})` : '—'}
      </p>
      <p className="note">Sont enregistrés dans ton compte : ton profil de financement et ta dernière vue de la carte
        (filtres, destination). Rien d'autre.</p>
      <button type="button" className="bouton" onClick={() => supabase!.auth.signOut()}>Se déconnecter</button>
      {!confirmer
        ? <button type="button" className="lien lien-danger" onClick={() => setConfirmer(true)}>Effacer mes données du compte</button>
        : <p className="etat erreur">Effacer le profil et la vue enregistrés dans le compte ?{' '}
            <button type="button" className="lien lien-danger" onClick={effacer}>Oui, effacer</button>{' '}
            <button type="button" className="lien" onClick={() => setConfirmer(false)}>Annuler</button></p>}
      {info && <p className="etat discret">{info}</p>}
    </>
  )
}

export function PanneauCompte() {
  const pret = useSession((s) => s.pret)
  const connecte = useSession((s) => !!s.session)
  return (
    <>
      {!supabase ? <p className="etat discret">Comptes désactivés dans cette version.</p>
        : !pret ? <p className="etat discret">Chargement…</p>
        : connecte ? <Connecte /> : <Connexion />}
      <p className="note">Sans compte, ton profil de financement reste enregistré sur cet appareil, et les filtres sont
        dans l'adresse de la page : copie-la pour la retrouver ou la partager.</p>
      <h3>Sources et méthode</h3>
      <Sources />
      <p className="note">Outil personnel, estimations indicatives. Données ouvertes : DVF (DGFiP / Etalab), IDFM, INSEE,
        IGN, ANCT, ministère du Logement.</p>
    </>
  )
}
