import type { Geometry } from 'geojson'

// Liens de recherche préremplis vers les sites d'annonces (pas de scraping : on ouvre leur propre recherche).
// Formats d'URL relevés sur des sources secondaires (octobre 2026), à revérifier si un site change :
// - Leboncoin : /recherche?category=9 (ventes immobilières)&real_estate_type=2 (appartement)
//   &price=min-<max>&square=<min>-max&locations=<Nom>__<lat>_<lng>_<rayon en m>  (recherche autour d'un point)
// - Bien'ici : /recherche/achat/<commune>-<code postal>/appartement ; filtres prix-max et surface-min NON
//   vérifiés (ignorés par le site s'ils sont faux : la recherche reste celle de la commune).
// - SeLoger : /classified-search?distributionTypes=Buy&estateTypes=Apartment&locations=<identifiant SeLoger>
//   &priceMax=<max>&spaceMin=<min> ; spaceMin NON vérifié. Voir idSeloger pour les identifiants de commune.

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

// Identifiants de lieu SeLoger (internes au site, pas le code INSEE). Relevés sur des pages seloger.com indexées
// (octobre 2026), ils sont consécutifs dans l'ordre des codes INSEE pour les 92, 93 et 94 ; règle vérifiée sur
// Antony 36599, Courbevoie 36611, Bobigny 36639, Montreuil 36654, Villepinte 36673, Vincennes 36720,
// Vitry-sur-Seine 36721. Paris : un identifiant par arrondissement (AD09FR, 11e = 36, 15e = 40, 20e = 45).
// Grande couronne non couverte : la règle y est cassée par les fusions de communes (écart constaté dans le 78).
const SELOGER_COMMUNES: Record<string, [number, string]> = {
  '92': [36599, '002 004 007 009 012 014 019 020 022 023 024 025 026 032 033 035 036 040 044 046 047 048 049 050 051 060 062 063 064 071 072 073 075 076 077 078'],
  '93': [36635, '001 005 006 007 008 010 013 014 015 027 029 030 031 032 033 039 045 046 047 048 049 050 051 053 055 057 059 061 062 063 064 066 070 071 072 073 074 077 078 079'],
  '94': [36675, '001 002 003 004 011 015 016 017 018 019 021 022 028 033 034 037 038 041 042 043 044 046 047 048 052 053 054 055 056 058 059 060 065 067 068 069 070 071 073 074 075 076 077 078 079 080 081'],
}
/** Saint-Denis et Pierrefitte-sur-Seine ont fusionné en 2025 : SeLoger les regroupe sous un nouvel identifiant. */
const SELOGER_SAINT_DENIS = 'AD08FR37125'

/** Identifiant SeLoger d'une commune (code INSEE), ou null hors de Paris et de la petite couronne. */
export function idSeloger(codeInsee: string): string | null {
  if (codeInsee === '93066' || codeInsee === '93059') return SELOGER_SAINT_DENIS
  const arr = /^751(0[1-9]|1\d|20)$/.exec(codeInsee)
  if (arr) return `AD09FR${25 + Number(arr[1])}`
  const dep = SELOGER_COMMUNES[codeInsee.slice(0, 2)]
  if (!dep) return null
  const rang = dep[1].split(' ').indexOf(codeInsee.slice(2))
  return rang < 0 ? null : `AD08FR${dep[0] + rang}`
}

export function lienSeloger(c: CritereAnnonce, idLieu: string): string {
  const p = new URLSearchParams({
    distributionTypes: 'Buy', estateTypes: 'Apartment', locations: idLieu,
    priceMax: String(Math.round(c.prixMax)), spaceMin: String(Math.round(c.surfaceMin)),
  })
  return `https://www.seloger.com/classified-search?${p}`
}

/** Centre (milieu de l'emprise) d'une géométrie de quartier. */
export function centreGeometrie(g: Geometry): [number, number] | null {
  const pts = (g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []).flat(2) as [number, number][]
  if (!pts.length) return null
  const lng = pts.map((q) => q[0]), lat = pts.map((q) => q[1])
  return [(Math.min(...lng) + Math.max(...lng)) / 2, (Math.min(...lat) + Math.max(...lat)) / 2]
}
