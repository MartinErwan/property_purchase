import { useEffect, useRef } from 'react'
import { Map as CarteMapLibre, NavigationControl, ScaleControl, setWorkerUrl } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
// MapLibre v6 cherche son worker à côté de son propre fichier, absent du bundle : Vite l'empaquette
// séparément (avec le code partagé qu'il importe) et on lui indique son adresse.
import urlWorker from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { STYLE_FOND, VUE_INITIALE } from './fond'

interface Props {
  /** Appelé une fois le style chargé : c'est là qu'on ajoute sources et couches. */
  surPrete: (carte: CarteMapLibre) => void
}

setWorkerUrl(urlWorker)

/** Carte plein cadre. L'instance MapLibre est créée une seule fois et transmise au parent. */
export function Carte({ surPrete }: Props) {
  const conteneur = useRef<HTMLDivElement>(null)
  const rappel = useRef(surPrete)
  useEffect(() => { rappel.current = surPrete })

  useEffect(() => {
    if (!conteneur.current) return
    const carte = new CarteMapLibre({
      container: conteneur.current,
      style: STYLE_FOND,
      ...VUE_INITIALE,
      minZoom: 7.5,
      maxZoom: 17,
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
    })
    carte.touchZoomRotate.disableRotation()
    carte.addControl(new NavigationControl({ showCompass: false }), 'top-right')
    carte.addControl(new ScaleControl({ unit: 'metric' }), 'bottom-right')
    // « style.load » plutôt que « load » : « load » attend aussi les tuiles du fond de plan, et ne se
    // déclenche jamais si le service IGN est lent ou injoignable ; nos couches n'en dépendent pas.
    carte.once('style.load', () => rappel.current(carte))
    return () => carte.remove()
  }, [])

  return <div ref={conteneur} className="carte" />
}
