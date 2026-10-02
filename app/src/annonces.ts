import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { fusionnerAnnonces, type Annonce, type Brouillon } from './logique/annonce'

// Annonces enregistrées (mémorisées sur l'appareil, synchronisées avec le compte) et brouillon en cours de saisie.

interface Annonces {
  annonces: Annonce[]
  /** Annonce affichée dans le formulaire (nouvelle ou en modification), null = formulaire fermé. */
  brouillon: Brouillon | null
  ouvrir: (b: Brouillon) => void
  fermer: () => void
  /** Ajoute (sans id) ou met à jour (avec id) l'annonce du formulaire. */
  enregistrer: (b: Brouillon) => void
  retirer: (id: string) => void
  fusionner: (autres: Annonce[]) => void
}

const nouvelId = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`)

export const useAnnonces = create<Annonces>()(persist((set) => ({
  annonces: [],
  brouillon: null,
  ouvrir: (brouillon) => set({ brouillon }),
  fermer: () => set({ brouillon: null }),
  enregistrer: (b) => set((e) => {
    const maintenant = new Date().toISOString()
    const existante = b.id ? e.annonces.find((a) => a.id === b.id) : undefined
    const annonce: Annonce = existante
      ? { ...existante, ...b, id: existante.id, modifie: maintenant }
      : { ...b, id: nouvelId(), ajoute: maintenant, modifie: maintenant }
    return {
      brouillon: null,
      annonces: existante ? e.annonces.map((a) => (a.id === annonce.id ? annonce : a)) : [annonce, ...e.annonces],
    }
  }),
  retirer: (id) => set((e) => ({ annonces: e.annonces.filter((a) => a.id !== id) })),
  fusionner: (autres) => set((e) => ({ annonces: fusionnerAnnonces(e.annonces, autres) })),
}), { name: 'ou-acheter:annonces', version: 1, partialize: (e) => ({ annonces: e.annonces }) }))

const VIDE: Brouillon = { url: '', site: '', titre: '', prix: null, surface: null, pieces: null, image: null, note: '', iris: null }

/** Ouvre le formulaire pour une nouvelle annonce (rattachée à un quartier, ou à classer). */
export const nouvelleAnnonce = (iris: string | null) => useAnnonces.getState().ouvrir({ ...VIDE, iris })
