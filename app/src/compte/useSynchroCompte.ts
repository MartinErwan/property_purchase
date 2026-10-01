import { useEffect, useRef } from 'react'
import { useRessources } from '../donnees/store'
import { useEtat } from '../etat'
import { decoder } from '../logique/url'
import { appliquerVue, useVueEncodee } from '../vue'
import { supabase } from './client'
import { profilValide } from './profil'
import { VUE_INITIALE_VIDE } from './retourConnexion'
import { useSession } from './session'

const DELAI_ENREGISTREMENT_MS = 1500

/** Synchronise le profil de financement et la dernière vue avec le compte (table preferences).
 * À la connexion : le profil du compte remplace celui de l'appareil (sinon celui de l'appareil est envoyé) ;
 * la dernière vue du compte est restaurée si la page a été ouverte sans vue imposée par l'URL.
 * Ensuite : chaque modification est enregistrée après une courte pause. */
export function useSynchroCompte(): void {
  const utilisateur = useSession((s) => s.session?.user.id ?? null)
  const donneesPretes = useRessources((r) => !!r.donnees && !!r.meta)
  const profil = useEtat((e) => e.profil)
  const vue = useVueEncodee()
  const charge = useRef<string | null>(null) // utilisateur dont les préférences ont été relues

  // 1. À la connexion : relire les préférences du compte.
  useEffect(() => {
    if (!supabase || !utilisateur || !donneesPretes || charge.current === utilisateur) return
    let annule = false
    useSession.setState({ synchro: 'en cours', erreurSynchro: null })
    supabase.from('preferences').select('profil, vue').eq('user_id', utilisateur).maybeSingle()
      .then(({ data, error }) => {
        if (annule) return
        if (error) { useSession.setState({ synchro: 'erreur', erreurSynchro: error.message }); return }
        if (data?.profil) useEtat.getState().majProfil(profilValide(data.profil))
        if (data?.vue && VUE_INITIALE_VIDE) appliquerVue(decoder(data.vue))
        charge.current = utilisateur
        useSession.setState({ synchro: 'à jour' })
        // Premier passage de ce compte : il reçoit le profil déjà saisi sur cet appareil.
        if (!data) {
          supabase!.from('preferences').insert({ user_id: utilisateur, profil: useEtat.getState().profil })
            .then(({ error: e }) => { if (e) useSession.setState({ synchro: 'erreur', erreurSynchro: e.message }) })
        }
      })
    return () => { annule = true }
  }, [utilisateur, donneesPretes])

  // Déconnexion : oublier l'utilisateur chargé.
  useEffect(() => { if (!utilisateur) { charge.current = null; useSession.setState({ synchro: 'inactive' }) } }, [utilisateur])

  // 2. Après chargement : enregistrer les modifications.
  useEffect(() => {
    if (!supabase || !utilisateur || charge.current !== utilisateur || vue == null) return
    const client = supabase
    const minuteur = setTimeout(() => {
      useSession.setState({ synchro: 'en cours' })
      client.from('preferences').upsert({ user_id: utilisateur, profil, vue })
        .then(({ error }) => useSession.setState(error
          ? { synchro: 'erreur', erreurSynchro: error.message } : { synchro: 'à jour', erreurSynchro: null }))
    }, DELAI_ENREGISTREMENT_MS)
    return () => clearTimeout(minuteur)
  }, [utilisateur, profil, vue])
}
