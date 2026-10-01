import { useMemo, useState } from 'react'
import type { LineString, MultiLineString } from 'geojson'
import { useRessources } from '../donnees/store'
import { chercher, indexer } from '../logique/recherche'
import { majSource } from '../carte/couches'
import { Suggestions } from './Suggestions'

/** Recherche de ville (hors ligne, sur les communes de la carte) avec zoom sur la commune. */
export function RechercheVille() {
  const donnees = useRessources((r) => r.donnees)
  const carte = useRessources((r) => r.carte)
  const [texte, setTexte] = useState('')

  const index = useMemo(() => {
    if (!donnees) return []
    const communes = donnees.communes.features.map((f) => {
      const g = f.geometry as LineString | MultiLineString
      const pts = g.type === 'LineString' ? g.coordinates : g.coordinates.flat()
      const lng = pts.map((p) => p[0]), lat = pts.map((p) => p[1])
      return { nom: f.properties.n, dep: f.properties.c.slice(0, 2), feature: f,
               bbox: [Math.min(...lng), Math.min(...lat), Math.max(...lng), Math.max(...lat)] as [number, number, number, number] }
    }).sort((a, b) => a.nom.localeCompare(b.nom, 'fr', { numeric: true }))
    return indexer(communes, (c) => c.nom)
  }, [donnees])

  const resultats = useMemo(() => chercher(index, texte), [index, texte])
  const deps = donnees?.manifeste.departements ?? {}

  return (
    <div className="recherche-ville">
      <Suggestions valeur={texte} surSaisie={setTexte} resultats={resultats} libelle="Rechercher une ville"
        placeholder="Rechercher une ville…" aucun="Aucune commune trouvée dans la zone" cle={(c) => c.feature.properties.c}
        rendu={(c) => <>{c.nom}<small>{deps[c.dep] ?? c.dep}</small></>}
        surChoix={(c) => {
          setTexte(c.nom)
          if (!carte) return
          majSource(carte, 'commune-active', c.feature)
          carte.fitBounds(c.bbox, { padding: 60, maxZoom: 14.5, duration: 900 })
        }} />
    </div>
  )
}
