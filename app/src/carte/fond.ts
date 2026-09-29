import type { StyleSpecification } from 'maplibre-gl'

// Fond Plan IGN v2 (Géoplateforme, sans clé d'API), désaturé pour laisser ressortir les données.
const IGN = 'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0'
  + '&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&TILEMATRIXSET=PM&FORMAT=image/png'
  + '&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}'

export const STYLE_FOND: StyleSpecification = {
  version: 8,
  sources: {
    fond: {
      type: 'raster', tiles: [IGN], tileSize: 256, maxzoom: 18,
      attribution: '© IGN – Plan IGN v2 · données IDFM, INSEE, DVF, ANCT',
    },
  },
  layers: [
    { id: 'page', type: 'background', paint: { 'background-color': '#f4f3ef' } },
    { id: 'fond', type: 'raster', source: 'fond',
      paint: { 'raster-saturation': -0.85, 'raster-opacity': 0.75, 'raster-contrast': -0.1 } },
  ],
}

export const VUE_INITIALE = { center: [2.45, 48.8] as [number, number], zoom: 9.2 }
