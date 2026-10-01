import { distanceM } from './trajet'

// Géocodage d'adresse via le service de la Géoplateforme (IGN, Base Adresse Nationale), gratuit et sans clé.
// Successeur d'api-adresse.data.gouv.fr, même format de réponse GeoJSON (service testé en septembre 2026 ;
// conditions d'usage et quotas non vérifiés).
const URL_GEOCODAGE = 'https://data.geopf.fr/geocodage/search'
const PARIS: [number, number] = [2.3522, 48.8566]
const RAYON_IDF_M = 90000 // l'Île-de-France tient dans un cercle de ~90 km autour de Paris

export interface Adresse { libelle: string; contexte: string; lng: number; lat: number }

interface ReponseGeocodage {
  features: { geometry: { coordinates: [number, number] }; properties: { label: string; context?: string; id?: string } }[]
}

/** Recherche d'adresses, centrée sur Paris pour favoriser l'Île-de-France. */
export async function chercherAdresses(texte: string, signal?: AbortSignal): Promise<Adresse[]> {
  const q = texte.trim()
  if (q.length < 3) return []
  const params = new URLSearchParams({ q, index: 'address', limit: '10', lat: '48.8566', lon: '2.3522', autocomplete: '1' })
  const r = await fetch(`${URL_GEOCODAGE}?${params}`, { signal })
  if (!r.ok) throw new Error(`Géocodage : HTTP ${r.status}`)
  const json = (await r.json()) as ReponseGeocodage
  return json.features
    .filter((f) => distanceM(PARIS, f.geometry.coordinates) <= RAYON_IDF_M)
    .slice(0, 6)
    .map((f) => ({
      libelle: f.properties.label, contexte: f.properties.context ?? '',
      lng: f.geometry.coordinates[0], lat: f.geometry.coordinates[1],
    }))
}

const codesPostaux = new Map<string, Promise<string | null>>()

/** Code postal principal d'une commune (code INSEE), via le même service de géocodage ; mis en cache. */
export function codePostal(codeInsee: string, nom: string): Promise<string | null> {
  let r = codesPostaux.get(codeInsee)
  if (!r) {
    const params = new URLSearchParams({ q: nom, index: 'address', type: 'municipality', citycode: codeInsee, limit: '1' })
    r = fetch(`${URL_GEOCODAGE}?${params}`)
      .then((rep) => (rep.ok ? rep.json() : null))
      .then((j: { features?: { properties: { postcode?: string } }[] } | null) => j?.features?.[0]?.properties.postcode ?? null)
      .catch(() => null)
    codesPostaux.set(codeInsee, r)
  }
  return r
}
