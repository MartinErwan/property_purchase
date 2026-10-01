import { useEffect } from 'react'
import type { FeatureCollection, Point } from 'geojson'
import { useRessources } from '../donnees/store'
import { useEtat } from '../etat'
import { majSource } from '../carte/couches'
import { BUCKET_PRIVE, supabase } from './client'
import { useConnecte } from './session'

type Vente = [number, number, number, string, string, number, number] // lng, lat, prix/m², type, date, surface, prix

let cache: { fichier: string; geo: FeatureCollection<Point> } | null = null

/** Ventes individuelles : téléchargées depuis le stockage privé quand la couche est affichée par un
 * utilisateur connecté ; retirées de la carte à la déconnexion. */
export function useVentes(): void {
  const connecte = useConnecte()
  const visible = useEtat((e) => e.couches.ventes)
  const carte = useRessources((r) => r.carte)
  const donnees = useRessources((r) => r.donnees)
  const fichier = donnees?.manifeste.fichiers.ventes_24m?.fichier

  useEffect(() => {
    if (!carte || !donnees?.iris || !carte.getSource('ventes')) return
    if (!connecte) { majSource(carte, 'ventes', null); return }
    if (!visible || !fichier || !supabase) return
    if (cache?.fichier === fichier) { majSource(carte, 'ventes', cache.geo); return }
    let annule = false
    supabase.storage.from(BUCKET_PRIVE).download(fichier).then(async ({ data, error }) => {
      if (annule) return
      if (error || !data) { useRessources.setState({ erreur: `Ventes indisponibles : ${error?.message ?? 'fichier vide'}` }); return }
      const lignes = JSON.parse(await data.text()) as Vente[]
      const geo: FeatureCollection<Point> = { type: 'FeatureCollection', features: lignes.map(([lng, lat, p, t, d, s, v]) => ({
        type: 'Feature', geometry: { type: 'Point', coordinates: [lng, lat] }, properties: { p, t, d, s, v } })) }
      cache = { fichier, geo }
      majSource(carte, 'ventes', geo)
    })
    return () => { annule = true }
  }, [connecte, visible, carte, donnees, fichier])
}
