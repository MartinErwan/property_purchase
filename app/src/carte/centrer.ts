import type { Map as CarteMapLibre } from 'maplibre-gl'
import type { EntiteIris } from '../donnees/types'

/** Cadre la carte sur un quartier (lien partagé, « Voir sur la carte »). */
export function centrerSurIris(carte: CarteMapLibre, f: EntiteIris, anime = true): void {
  const g = f.geometry
  const pts = (g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []).flat(2) as [number, number][]
  if (!pts.length) return
  const lng = pts.map((q) => q[0]), lat = pts.map((q) => q[1])
  carte.fitBounds([Math.min(...lng), Math.min(...lat), Math.max(...lng), Math.max(...lat)],
    { padding: 80, maxZoom: 14, duration: anime ? 700 : 0 })
}
