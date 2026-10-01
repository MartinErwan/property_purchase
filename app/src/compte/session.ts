import { create } from 'zustand'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './client'

interface EtatSession {
  session: Session | null
  /** false tant que Supabase n'a pas relu la session enregistrée (évite un « déconnecté » fugace). */
  pret: boolean
  synchro: 'inactive' | 'en cours' | 'à jour' | 'erreur'
  erreurSynchro: string | null
}

export const useSession = create<EtatSession>()(() => ({
  session: null, pret: !supabase, synchro: 'inactive', erreurSynchro: null,
}))

if (supabase) {
  supabase.auth.getSession().then(({ data }) => useSession.setState({ session: data.session, pret: true }))
  supabase.auth.onAuthStateChange((_evenement, session) => useSession.setState({ session, pret: true }))
}

export const useConnecte = (): boolean => useSession((s) => !!s.session)
