import { VERSION_SCHEMA, type Donnees, type Manifeste, type MetaTrajet } from './types'

/** Adresse des données : /donnees/ par défaut, surchargeable (VITE_URL_DONNEES) pour un stockage séparé. */
export const URL_DONNEES: string = import.meta.env.VITE_URL_DONNEES ?? '/donnees/'

async function lire(url: string, init?: RequestInit): Promise<Response> {
  const r = await fetch(url, init)
  if (!r.ok) throw new Error(`${url} : HTTP ${r.status}`)
  return r
}

export async function chargerManifeste(base = URL_DONNEES): Promise<Manifeste> {
  // Jamais depuis le cache : c'est lui qui indique les noms (par empreinte) des autres fichiers.
  const m = (await (await lire(`${base}manifest.json`, { cache: 'no-cache' })).json()) as Manifeste
  if (m.version_schema !== VERSION_SCHEMA) {
    throw new Error(`Données au schéma ${m.version_schema}, application au schéma ${VERSION_SCHEMA} : republier l'une ou l'autre`)
  }
  return m
}

function url(m: Manifeste, cle: string, base: string): string | null {
  const f = m.fichiers[cle]
  return f ? `${base}${f.fichier}` : null
}

async function json<T>(m: Manifeste, cle: string, base: string): Promise<T | null> {
  const u = url(m, cle, base)
  return u ? ((await (await lire(u)).json()) as T) : null
}

/** Couches affichées au démarrage, chargées en parallèle. */
export async function chargerDonnees(base = URL_DONNEES): Promise<Donnees> {
  const manifeste = await chargerManifeste(base)
  const [iris, communes, stations, lignes, qpv, tampon] = await Promise.all([
    json<Donnees['iris']>(manifeste, 'iris', base),
    json<Donnees['communes']>(manifeste, 'communes', base),
    json<Donnees['stations']>(manifeste, 'stations', base),
    json<Donnees['lignes']>(manifeste, 'lignes', base),
    json<Donnees['qpv']>(manifeste, 'qpv', base),
    json<Donnees['tampon']>(manifeste, 'tampon', base),
  ])
  if (!iris || !communes || !stations || !lignes) throw new Error('Manifeste incomplet : couche obligatoire absente')
  return { manifeste, iris, communes, stations, lignes, qpv, tampon }
}

/** Métadonnées du temps de trajet (pôles, noms des stations, horizons GPE). */
export async function chargerMetaTrajet(m: Manifeste, base = URL_DONNEES): Promise<MetaTrajet> {
  const meta = await json<MetaTrajet>(m, 'trajet', base)
  if (!meta) throw new Error('Données de temps de trajet absentes')
  return meta
}

/** Matrice stations × pôles d'un horizon (« actuel » ou année), en minutes ; 255 = injoignable. */
export async function chargerMatrice(m: Manifeste, horizon: string, base = URL_DONNEES): Promise<Uint8Array> {
  const cle = `trajet_${horizon}`
  const f = m.fichiers[cle]
  if (!f?.forme) throw new Error(`Matrice ${cle} absente`)
  const octets = new Uint8Array(await (await lire(`${base}${f.fichier}`)).arrayBuffer())
  if (octets.length !== f.forme[0] * f.forme[1]) throw new Error(`Matrice ${cle} : taille inattendue`)
  return octets
}
