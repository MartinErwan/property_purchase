import { useEffect, useRef, useState } from 'react'
import { useRessources } from '../donnees/store'
import { useEtat } from '../etat'
import { decoder } from '../logique/url'
import { appliquerVue, useVueEncodee } from '../vue'
import { supabase } from './client'
import { profilValide } from './profil'
import { listeValide, useQuartiers } from '../quartiers'
import { useAnnonces } from '../annonces'
import { annoncesValides } from '../logique/annonce'
import { VUE_INITIALE_VIDE } from './retourConnexion'
import { useSession } from './session'

const DELAI_ENREGISTREMENT_MS = 1500
const SANS_COLONNE_ANNONCES = 'Annonces non synchronisées : exécuter la migration 20261003000000_annonces.sql dans Supabase.'

/** La colonne « annonces » manque tant que sa migration n'a pas été exécutée : on synchronise le reste. */
const colonneAnnoncesAbsente = (message: string) => /annonces/i.test(message)

/** Synchronise le profil de financement, la dernière vue, les quartiers et les annonces enregistrés avec le compte
 * (table preferences).
 * À la connexion : le profil du compte remplace celui de l'appareil (sinon celui de l'appareil est envoyé) ;
 * la dernière vue du compte est restaurée si la page a été ouverte sans vue imposée par l'URL ; les quartiers
 * et annonces enregistrés sont fusionnés (union des deux listes), puis les listes fusionnées sont renvoyées au compte.
 * Ensuite : chaque modification est enregistrée après une courte pause. */
export function useSynchroCompte(): void {
  const utilisateur = useSession((s) => s.session?.user.id ?? null)
  const donneesPretes = useRessources((r) => !!r.donnees && !!r.meta)
  const profil = useEtat((e) => e.profil)
  const vue = useVueEncodee()
  const quartiers = useQuartiers((q) => q.enregistres)
  const annonces = useAnnonces((a) => a.annonces)
  const avecAnnonces = useRef(true)
  const charge = useRef<string | null>(null) // utilisateur dont les préférences ont été relues
  const [relu, setRelu] = useState(0) // incrémenté après lecture : force un premier enregistrement fusionné

  // 1. À la connexion : relire les préférences du compte.
  useEffect(() => {
    if (!supabase || !utilisateur || !donneesPretes || charge.current === utilisateur) return
    let annule = false
    const client = supabase
    useSession.setState({ synchro: 'en cours', erreurSynchro: null, avertissementSynchro: null })
    const lire = (colonnes: string) => client.from('preferences').select(colonnes).eq('user_id', utilisateur).maybeSingle()
    ;(async () => {
      let { data, error } = await lire('profil, vue, quartiers, annonces')
      avecAnnonces.current = !(error && colonneAnnoncesAbsente(error.message))
      if (!avecAnnonces.current) ({ data, error } = await lire('profil, vue, quartiers'))
      if (annule) return
      if (error) { useSession.setState({ synchro: 'erreur', erreurSynchro: error.message }); return }
      const d = data as { profil?: unknown; vue?: string; quartiers?: unknown; annonces?: unknown } | null
      if (d?.profil) useEtat.getState().majProfil(profilValide(d.profil))
      if (d?.vue && VUE_INITIALE_VIDE) appliquerVue(decoder(d.vue))
      if (d?.quartiers) useQuartiers.getState().fusionner(listeValide(d.quartiers))
      if (d?.annonces) useAnnonces.getState().fusionner(annoncesValides(d.annonces))
      if (!avecAnnonces.current) useSession.setState({ avertissementSynchro: SANS_COLONNE_ANNONCES })
      charge.current = utilisateur
      useSession.setState({ synchro: 'à jour' })
      // Renvoie au compte ce que l'appareil apporte (profil d'un premier passage, listes fusionnées).
      setRelu((n) => n + 1)
    })()
    return () => { annule = true }
  }, [utilisateur, donneesPretes])

  // Déconnexion : oublier l'utilisateur chargé.
  useEffect(() => { if (!utilisateur) { charge.current = null; useSession.setState({ synchro: 'inactive' }) } }, [utilisateur])

  // 2. Après chargement : enregistrer les modifications.
  useEffect(() => {
    if (!supabase || !utilisateur || charge.current !== utilisateur || vue == null || relu === 0) return
    const client = supabase
    const minuteur = setTimeout(() => {
      useSession.setState({ synchro: 'en cours' })
      const ligne = { user_id: utilisateur, profil, vue, quartiers, ...(avecAnnonces.current ? { annonces } : {}) }
      client.from('preferences').upsert(ligne)
        .then(({ error }) => useSession.setState(error
          ? { synchro: 'erreur', erreurSynchro: error.message } : { synchro: 'à jour', erreurSynchro: null }))
    }, DELAI_ENREGISTREMENT_MS)
    return () => clearTimeout(minuteur)
  }, [utilisateur, profil, vue, quartiers, annonces, relu])
}
