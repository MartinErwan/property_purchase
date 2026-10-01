import { useEffect, useMemo, useRef } from 'react'
import type { Feature } from 'geojson'
import { useEtat } from '../etat'
import { useRessources } from '../donnees/store'
import { budgetsParZone, normaliserProfil, type Budgets } from '../logique/financement'
import { exprCouleur, exprSelection, type IrisCalcule } from '../logique/selection'
import { polesArrivee, tempsIris } from '../logique/trajet'
import { ajouterCouches, majEnregistres, majIris, majSource, majVisibilite } from './couches'
import { centrerSurIris } from './centrer'
import { useQuartiers } from '../quartiers'

/** Budgets par zone quand le profil de financement pilote le filtre de budget, sinon null. */
export function useBudgets(): Budgets | null {
  const profil = useEtat((e) => e.profil)
  return useMemo(() => (profil.actif ? budgetsParZone(normaliserProfil(profil)) : null), [profil])
}

/** Répercute l'état de l'interface sur la carte MapLibre (couches, couleurs, filtres, trajets). */
export function useSynchroCarte(): void {
  const carte = useRessources((r) => r.carte)
  const donnees = useRessources((r) => r.donnees)
  const meta = useRessources((r) => r.meta)
  const matrices = useRessources((r) => r.matrices)
  const { ind, filtres, couches, destination, horizon, irisChoisi } = useEtat()
  const budgets = useBudgets()
  const prete = !!(carte && donnees)
  const versionTrajet = useRessources((r) => r.versionTrajet)

  useEffect(() => {
    if (carte && donnees && !carte.getSource('iris')) ajouterCouches(carte, donnees)
  }, [carte, donnees])

  useEffect(() => {
    if (prete) majIris(carte!, exprCouleur(ind), exprSelection(filtres, budgets))
  }, [prete, carte, ind, filtres, budgets, versionTrajet])

  useEffect(() => {
    if (prete) majVisibilite(carte!, couches)
  }, [prete, carte, couches])

  // Temps de trajet de chaque IRIS vers la destination, puis mise à jour de la source.
  const matrice = matrices[horizon]
  useEffect(() => {
    if (!prete || !meta || !matrice || !destination) return
    const arrivees = polesArrivee(destination, meta.poles)
    for (const f of donnees!.iris.features) {
      Object.assign(f.properties as IrisCalcule, tempsIris(f.properties, matrice, arrivees, meta.stations))
    }
    majSource(carte!, 'iris', donnees!.iris)
    const point: Feature = destination.type === 'pole'
      ? { type: 'Feature', geometry: { type: 'Point', coordinates: meta.poles[destination.pole].c }, properties: {} }
      : { type: 'Feature', geometry: { type: 'Point', coordinates: [destination.lng, destination.lat] }, properties: {} }
    majSource(carte!, 'destination', point)
    useRessources.setState((r) => ({ versionTrajet: r.versionTrajet + 1 }))
  }, [prete, carte, donnees, meta, matrice, destination])

  // Lien partagé avec un quartier (?iris=…) : centrer la carte dessus au premier affichage.
  const centre = useRef(false)
  useEffect(() => {
    if (!prete || centre.current) return
    centre.current = true
    const f = irisChoisi ? donnees!.iris.features.find((x) => x.properties.id === irisChoisi) : null
    if (f) centrerSurIris(carte!, f, false)
  }, [prete, carte, donnees, irisChoisi])

  // Quartiers enregistrés : contour doré.
  const enregistres = useQuartiers((q) => q.enregistres)
  useEffect(() => {
    if (prete) majEnregistres(carte!, enregistres.map((q) => q.id))
  }, [prete, carte, enregistres])

  // Quartier dont la fiche est ouverte : contour souligné.
  const precedent = useRef<string | null>(null)
  useEffect(() => {
    if (!prete) return
    if (precedent.current) carte!.setFeatureState({ source: 'iris', id: precedent.current }, { choisi: false })
    if (irisChoisi) carte!.setFeatureState({ source: 'iris', id: irisChoisi }, { choisi: true })
    precedent.current = irisChoisi
  }, [prete, carte, irisChoisi, versionTrajet])
}
