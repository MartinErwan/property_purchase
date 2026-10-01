// Sources et couches MapLibre : portage du rendu de carte.html (mêmes styles et ordre d'empilement).
import type { ExpressionSpecification, GeoJSONSource, Map as CarteMapLibre } from 'maplibre-gl'
import type { Feature, FeatureCollection } from 'geojson'
import type { Donnees } from '../donnees/types'
import { ENCRE, VERT_ROUGE } from '../logique/echelles'
import type { Couches } from '../etat'

const VIDE: FeatureCollection = { type: 'FeatureCollection', features: [] }

/** Motif de hachures des QPV (dessiné dans un canvas, résolution ×2). */
export function hachure(): HTMLCanvasElement {
  const r = 2, s = 9, c = document.createElement('canvas')
  c.width = s * r; c.height = s * r
  const x = c.getContext('2d')!
  x.scale(r, r)
  x.strokeStyle = ENCRE; x.lineWidth = 1.1; x.lineCap = 'square'
  for (const d of [-s, 0, s]) { x.beginPath(); x.moveTo(d, s); x.lineTo(d + s, 0); x.stroke() }
  return c
}

// Épaisseur des tracés selon le mode et le zoom. MapLibre n'accepte le zoom qu'en tête
// d'expression : la variation par mode se place donc dans chaque palier.
const largeur = (marge: number): ExpressionSpecification => ['interpolate', ['linear'], ['zoom'],
  9, ['match', ['get', 'm'], ['rer', 'metro'], 1.6 + marge, 1.0 + marge],
  13, ['match', ['get', 'm'], ['rer', 'metro'], 3.6 + marge, 2.4 + marge],
  16, ['match', ['get', 'm'], ['rer', 'metro'], 6 + marge, 4 + marge]]
// Rayon des points de station : plus grand pour une correspondance (x) ou une gare future.
const rayon = (base: number, baseCorr?: number): ExpressionSpecification => ['interpolate', ['linear'], ['zoom'],
  ...[[9, 0.45], [12, 0.8], [15, 1.3]].flatMap(([z, k]) =>
    [z, baseCorr == null ? base * k : ['case', ['get', 'x'], baseCorr * k, base * k]])] as ExpressionSpecification

export const GROUPES_COUCHES: Record<keyof Couches, string[]> = {
  stations: ['lignes-lisere', 'lignes', 'stations'],
  futures: ['futures', 'lignes-futures', 'lignes-futures-lisere'],
  qpv: ['qpv', 'qpv-bord', 'tampon'],
  ventes: ['ventes'],
}

/** Couches interrogées au survol / au toucher, de la plus haute à la plus basse. */
export const COUCHES_INTERACTIVES = ['destination', 'futures', 'stations', 'lignes', 'lignes-futures', 'ventes', 'qpv', 'iris']

export function ajouterCouches(carte: CarteMapLibre, d: Donnees): void {
  const h = hachure()
  carte.addImage('hachure', h.getContext('2d')!.getImageData(0, 0, h.width, h.height), { pixelRatio: 2 })

  carte.addSource('iris', { type: 'geojson', data: d.iris, promoteId: 'id' })
  carte.addSource('communes', { type: 'geojson', data: d.communes })
  carte.addSource('lignes', { type: 'geojson', data: d.lignes })
  carte.addSource('stations', { type: 'geojson', data: d.stations })
  carte.addSource('ventes', { type: 'geojson', data: VIDE })

  // IRIS : seuls ceux qui passent les filtres sont colorés ; les autres restent transparents
  // (mais cliquables). Couleur et filtre posés ensuite par majIris().
  carte.addLayer({ id: 'iris', type: 'fill', source: 'iris', paint: { 'fill-opacity': 0 } })
  carte.addLayer({ id: 'iris-sel', type: 'line', source: 'iris', filter: ['boolean', false],
    paint: { 'line-color': '#ffffff', 'line-width': ['interpolate', ['linear'], ['zoom'], 9, 0.3, 13, 1.2] } })
  // Limites de quartier (IRIS) : apparaissent en zoomant, fines et grises.
  carte.addLayer({ id: 'iris-bord', type: 'line', source: 'iris', minzoom: 11,
    paint: { 'line-color': '#5c5b57', 'line-width': ['interpolate', ['linear'], ['zoom'], 11, 0.3, 13, 0.8, 16, 1.4],
             'line-opacity': ['interpolate', ['linear'], ['zoom'], 11, 0, 12, 0.75] } })
  // Limites de commune : trait sombre sur liseré blanc, épaississant avec le zoom.
  const epCommune = (marge: number): ExpressionSpecification =>
    ['interpolate', ['linear'], ['zoom'], 8, 0.25 + marge, 10, 0.6 + marge, 12, 1.6 + marge, 15, 2.6 + marge]
  carte.addLayer({ id: 'communes-lisere', type: 'line', source: 'communes', minzoom: 11,
    layout: { 'line-join': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': epCommune(2), 'line-opacity': 0.85 } })
  carte.addLayer({ id: 'communes', type: 'line', source: 'communes',
    layout: { 'line-join': 'round' }, paint: { 'line-color': '#3d3c38', 'line-width': epCommune(0),
      'line-opacity': ['interpolate', ['linear'], ['zoom'], 8, 0.35, 11, 1] } })
  // Quartier survolé (souris) ou choisi (fiche ouverte) : contour souligné, piloté par feature-state.
  const etatActif: ExpressionSpecification = ['any',
    ['boolean', ['feature-state', 'survol'], false], ['boolean', ['feature-state', 'choisi'], false]]
  carte.addLayer({ id: 'iris-survol', type: 'line', source: 'iris',
    paint: { 'line-color': '#2a78d6', 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1.5, 15, 3],
             'line-opacity': ['case', etatActif, 1, 0] } })
  // Commune trouvée par la recherche : contour souligné.
  carte.addSource('commune-active', { type: 'geojson', data: VIDE })
  carte.addLayer({ id: 'commune-active-lisere', type: 'line', source: 'commune-active',
    paint: { 'line-color': '#ffffff', 'line-width': 6, 'line-opacity': 0.9 } })
  carte.addLayer({ id: 'commune-active', type: 'line', source: 'commune-active',
    paint: { 'line-color': '#2a78d6', 'line-width': 3 } })

  if (d.qpv && d.tampon) {
    carte.addSource('qpv', { type: 'geojson', data: d.qpv })
    carte.addSource('tampon', { type: 'geojson', data: d.tampon })
    carte.addLayer({ id: 'qpv', type: 'fill', source: 'qpv', paint: { 'fill-pattern': 'hachure', 'fill-opacity': 0.7 } })
    carte.addLayer({ id: 'qpv-bord', type: 'line', source: 'qpv', paint: { 'line-color': ENCRE, 'line-width': 1.2 } })
    carte.addLayer({ id: 'tampon', type: 'line', source: 'tampon',
      paint: { 'line-color': ENCRE, 'line-width': 1, 'line-dasharray': [3, 2] } })
  }

  carte.addLayer({ id: 'ventes', type: 'circle', source: 'ventes', layout: { visibility: 'none' },
    paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 1.5, 15, 4.5],
             'circle-color': ['step', ['get', 'p'], VERT_ROUGE[0], 3000, VERT_ROUGE[1], 4000, VERT_ROUGE[2], 5000,
                              VERT_ROUGE[3], 6000, VERT_ROUGE[4], 7500, VERT_ROUGE[5], 10000, VERT_ROUGE[6]],
             'circle-stroke-color': '#ffffff', 'circle-stroke-width': 0.6 } })

  // Tracés en projet : couleur officielle en tirets, sous les lignes en service.
  const enService: ExpressionSpecification = ['==', ['get', 'e'], true]
  carte.addLayer({ id: 'lignes-futures-lisere', type: 'line', source: 'lignes', filter: ['!', enService],
    paint: { 'line-color': '#ffffff', 'line-opacity': 0.85,
             'line-width': ['interpolate', ['linear'], ['zoom'], 9, 3, 13, 5, 16, 7.5] } })
  carte.addLayer({ id: 'lignes-futures', type: 'line', source: 'lignes', filter: ['!', enService],
    paint: { 'line-color': ['get', 'c'], 'line-dasharray': [2, 1.2],
             'line-width': ['interpolate', ['linear'], ['zoom'], 9, 1.6, 13, 3.2, 16, 5] } })

  // Tracés en service : liseré blanc puis couleur officielle ; métro et RER au-dessus.
  const ordreTrace: ExpressionSpecification = ['match', ['get', 'm'], 'rer', 3, 'metro', 2, 1]
  carte.addLayer({ id: 'lignes-lisere', type: 'line', source: 'lignes', filter: enService,
    layout: { 'line-cap': 'round', 'line-sort-key': ordreTrace },
    paint: { 'line-color': '#ffffff', 'line-width': largeur(1.5), 'line-opacity': 0.85 } })
  carte.addLayer({ id: 'lignes', type: 'line', source: 'lignes', filter: enService,
    layout: { 'line-cap': 'round', 'line-sort-key': ordreTrace },
    paint: { 'line-color': ['get', 'c'], 'line-width': largeur(0) } })

  // Stations en service : point blanc cerclé de la couleur de la ligne ; correspondances cerclées de noir.
  carte.addLayer({ id: 'stations', type: 'circle', source: 'stations', filter: ['==', ['get', 'e'], true],
    paint: { 'circle-radius': rayon(3.2, 4.2), 'circle-color': '#ffffff',
             'circle-stroke-color': ['case', ['get', 'x'], ENCRE, ['get', 'c']],
             'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 9, 1, 13, 1.8] } })
  // Stations futures : anneau épais sombre avec cœur coloré, pour ne jamais les confondre.
  carte.addLayer({ id: 'futures', type: 'circle', source: 'stations', filter: ['==', ['get', 'e'], false],
    paint: { 'circle-radius': rayon(5), 'circle-color': ['get', 'c'],
             'circle-stroke-color': ENCRE, 'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 9, 1.4, 13, 2.6] } })

  // Destination du temps de trajet : gros point noir cerclé de blanc.
  carte.addSource('destination', { type: 'geojson', data: VIDE })
  carte.addLayer({ id: 'destination', type: 'circle', source: 'destination',
    paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 6, 14, 11], 'circle-color': ENCRE,
             'circle-stroke-color': '#ffffff', 'circle-stroke-width': 3 } })
}

export function majIris(carte: CarteMapLibre, couleur: ExpressionSpecification, selection: ExpressionSpecification): void {
  carte.setPaintProperty('iris', 'fill-color', couleur)
  carte.setPaintProperty('iris', 'fill-opacity', ['case', selection, 0.72, 0])
  carte.setFilter('iris-sel', selection)
}

export function majVisibilite(carte: CarteMapLibre, c: Couches): void {
  for (const [groupe, couches] of Object.entries(GROUPES_COUCHES)) {
    const visible = c[groupe as keyof Couches]
    for (const l of couches) if (carte.getLayer(l)) carte.setLayoutProperty(l, 'visibility', visible ? 'visible' : 'none')
  }
}

export function majSource(carte: CarteMapLibre, source: string, data: FeatureCollection | Feature | null): void {
  (carte.getSource(source) as GeoJSONSource | undefined)?.setData(data ?? VIDE)
}
