import type { Geometry } from 'geojson'

// Liens de recherche préremplis vers les sites d'annonces (pas de scraping : on ouvre leur propre recherche).
// Formats d'URL relevés sur des sources secondaires (octobre 2026), à revérifier si un site change :
// - Leboncoin : /recherche?category=9 (ventes immobilières)&real_estate_type=2 (appartement)
//   &price=min-<max>&square=<min>-max&locations=<Nom>__<lat>_<lng>_<rayon en m>  (recherche autour d'un point)
// - Bien'ici : /recherche/achat/<commune>-<code postal>/appartement ; filtres prix-max et surface-min NON
//   vérifiés (ignorés par le site s'ils sont faux : la recherche reste celle de la commune).

export interface CritereAnnonce {
  commune: string
  centre: [number, number]  // [lng, lat] du quartier
  prixMax: number
  surfaceMin: number
}

/** Rayon de recherche autour du centre du quartier (un IRIS fait typiquement 300 m à 1 km de large). */
export const RAYON_RECHERCHE_M = 1500

const arrondi = (x: number) => Math.round(x * 1e5) / 1e5

/** « Saint-Maur-des-Fossés » → « saint-maur-des-fosses » ; « L'Haÿ-les-Roses » → « l-hay-les-roses ». */
export function slug(nom: string): string {
  return nom.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

export function lienLeboncoin(c: CritereAnnonce): string {
  const [lng, lat] = c.centre
  const lieu = `${c.commune.replace(/[_\s]+/g, ' ')}__${arrondi(lat)}_${arrondi(lng)}_${RAYON_RECHERCHE_M}`
  const p = new URLSearchParams({
    category: '9', real_estate_type: '2',
    price: `min-${Math.round(c.prixMax)}`, square: `${Math.round(c.surfaceMin)}-max`, locations: lieu,
  })
  return `https://www.leboncoin.fr/recherche?${p}`
}

export function lienBienici(c: CritereAnnonce, codePostal: string): string {
  const p = new URLSearchParams({ 'prix-max': String(Math.round(c.prixMax)), 'surface-min': String(Math.round(c.surfaceMin)) })
  return `https://www.bienici.com/recherche/achat/${slug(c.commune)}-${codePostal}/appartement?${p}`
}

/** Centre (milieu de l'emprise) d'une géométrie de quartier. */
export function centreGeometrie(g: Geometry): [number, number] | null {
  const pts = (g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []).flat(2) as [number, number][]
  if (!pts.length) return null
  const lng = pts.map((q) => q[0]), lat = pts.map((q) => q[1])
  return [(Math.min(...lng) + Math.max(...lng)) / 2, (Math.min(...lat) + Math.max(...lat)) / 2]
}
