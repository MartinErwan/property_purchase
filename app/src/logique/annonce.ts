// Annonces enregistrées par l'utilisateur depuis un site tiers (Leboncoin, SeLoger…).
// Aucune page n'est téléchargée par l'application : les informations viennent de ce que l'utilisateur envoie
// (favori « ☆ Où acheter » qui lit la page ouverte dans SON navigateur, partage Android, ou saisie), puis il
// les vérifie. La photo n'est pas copiée : on garde l'adresse de l'image d'origine.

export interface Annonce {
  id: string
  url: string
  site: string
  titre: string
  prix: number | null
  surface: number | null
  pieces: number | null
  /** Adresse de la photo sur le site d'origine (non copiée). */
  image: string | null
  note: string
  /** Quartier (code IRIS) auquel l'annonce est rattachée, null = à classer. */
  iris: string | null
  ajoute: string
  modifie: string
}

/** Champs reçus à l'ouverture de /ajout (favori, partage Android) — tous facultatifs, non fiables. */
export interface Recu {
  url?: string | null
  titre?: string | null
  texte?: string | null
  desc?: string | null
  image?: string | null
  prix?: string | null
  surface?: string | null
}

export type Brouillon = Omit<Annonce, 'id' | 'ajoute' | 'modifie'> & { id?: string }

const LONGUEUR_URL_MAX = 2000
const PRIX_MIN = 20_000
const PRIX_MAX = 5_000_000
const SURFACE_MIN = 8
const SURFACE_MAX = 500

/** Adresse http(s) valide, sinon null (une adresse en javascript: ou data: ne doit jamais devenir un lien). */
export function urlSure(brut: string | null | undefined): string | null {
  if (!brut) return null
  const s = brut.trim()
  if (s.length > LONGUEUR_URL_MAX) return null
  try {
    const u = new URL(s)
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null
  } catch {
    return null
  }
}

const SITES: [RegExp, string][] = [
  [/(^|\.)leboncoin\.fr$/, 'Leboncoin'], [/(^|\.)seloger\.com$/, 'SeLoger'], [/(^|\.)bienici\.com$/, "Bien'ici"],
  [/(^|\.)pap\.fr$/, 'PAP'], [/(^|\.)logic-immo\.com$/, 'Logic-Immo'], [/(^|\.)century21\.fr$/, 'Century 21'],
  [/(^|\.)orpi\.com$/, 'Orpi'], [/(^|\.)laforet\.com$/, 'Laforêt'], [/(^|\.)paruvendu\.fr$/, 'ParuVendu'],
]

/** Nom lisible du site d'une annonce (sinon le domaine sans « www. »). */
export function siteDe(url: string): string {
  const hote = new URL(url).hostname.replace(/^www\./, '')
  return SITES.find(([re]) => re.test(hote))?.[1] ?? hote
}

/** « 249 000 », « 249.000 », « 249000 » → 249000. */
function nombre(s: string): number {
  return Number(s.replace(/[\s  .]/g, '').replace(',', '.'))
}

const RE_PRIX = /(\d{1,3}(?:[\s  .]\d{3})+|\d{5,7})\s?(?:€|euros?\b)(?!\s*(?:\/|par\s)\s*(?:m|mois))/gi
const RE_SURFACE = /(\d{1,3}(?:[.,]\d{1,2})?)\s?m(?:²|2)(?![\d/])/gi
const RE_PIECES = /(\d{1,2})\s?pi[eè]ces?\b/i
const RE_TYPE = /\b[TF]([1-9])\b/

function premier(sources: string[], re: RegExp, min: number, max: number): number | null {
  for (const s of sources) {
    for (const m of s.matchAll(re)) {
      const v = nombre(m[1])
      if (v >= min && v <= max) return v
    }
  }
  return null
}

function valeurDirecte(s: string | null | undefined, min: number, max: number): number | null {
  if (!s) return null
  // Valeur structurée (JSON-LD) : nombre simple, le point y est décimal.
  const v = Number(String(s).trim().replace(',', '.'))
  return Number.isFinite(v) && v >= min && v <= max ? v : null
}

/** Préremplit une annonce à partir de ce qui a été reçu ; l'utilisateur vérifie avant d'enregistrer.
 * Ordre de confiance : valeurs structurées de la page (JSON-LD), puis titre, description, texte visible. */
export function extraire(r: Recu): Brouillon {
  const texte = (r.texte ?? '').slice(0, 5000)
  // Le partage Android met souvent le lien dans le texte plutôt que dans le champ « url ».
  const url = urlSure(r.url) ?? urlSure(texte.match(/https?:\/\/\S+/)?.[0]) ?? ''
  const texteSansLien = texte.replace(/https?:\/\/\S+/g, ' ').trim()
  const site = url ? siteDe(url) : ''
  // Un titre réduit au nom du site (partage de certaines applis) n'apprend rien : début du texte partagé à la place.
  const titreRecu = (r.titre ?? '').trim()
  const titre = (titreRecu && titreRecu.toLowerCase() !== site.toLowerCase() ? titreRecu
    : texteSansLien.split('\n')[0].replace(/\s+/g, ' ').trim()).slice(0, 160)
  const sources = [titre, r.desc ?? '', texteSansLien]
  const prix = valeurDirecte(r.prix, PRIX_MIN, PRIX_MAX) ?? premier(sources, RE_PRIX, PRIX_MIN, PRIX_MAX)
  const surface = valeurDirecte(r.surface, SURFACE_MIN, SURFACE_MAX) ?? premier(sources, RE_SURFACE, SURFACE_MIN, SURFACE_MAX)
  const tout = sources.join(' ')
  const p = tout.match(RE_PIECES)?.[1] ?? tout.match(RE_TYPE)?.[1] ?? (/\bstudio\b/i.test(tout) ? '1' : null)
  return {
    url, site, titre, prix, surface, pieces: p ? Number(p) : null,
    image: urlSure(r.image), note: '', iris: null,
  }
}

/** Prix au m² arrondi, ou null. */
export function prixM2(a: Pick<Annonce, 'prix' | 'surface'>): number | null {
  return a.prix && a.surface ? Math.round(a.prix / a.surface) : null
}

/** Écart relatif au prix médian du quartier (−0,08 = 8 % moins cher), ou null. */
export function ecartMedian(a: Pick<Annonce, 'prix' | 'surface'>, median: number | null): number | null {
  const m2 = prixM2(a)
  return m2 && median ? m2 / median - 1 : null
}

const nombreOuNull = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const texteBorne = (v: unknown, n: number) => (typeof v === 'string' ? v.slice(0, n) : '')

/** Ne garde d'une liste venue du compte que des annonces bien formées, aux adresses sûres. */
export function annoncesValides(brut: unknown): Annonce[] {
  if (!Array.isArray(brut)) return []
  return brut.flatMap((a): Annonce[] => {
    if (!a || typeof a !== 'object') return []
    const o = a as Record<string, unknown>
    const url = urlSure(typeof o.url === 'string' ? o.url : null)
    if (typeof o.id !== 'string' || !url || typeof o.ajoute !== 'string') return []
    return [{
      id: o.id.slice(0, 64), url, site: texteBorne(o.site, 40) || siteDe(url), titre: texteBorne(o.titre, 160),
      prix: nombreOuNull(o.prix), surface: nombreOuNull(o.surface), pieces: nombreOuNull(o.pieces),
      image: urlSure(typeof o.image === 'string' ? o.image : null), note: texteBorne(o.note, 2000),
      iris: typeof o.iris === 'string' && /^[0-9A-Z]{9}$/.test(o.iris) ? o.iris : null,
      ajoute: o.ajoute, modifie: typeof o.modifie === 'string' ? o.modifie : o.ajoute,
    }]
  })
}

/** Fusion appareil + compte : union par identifiant, la version modifiée le plus récemment l'emporte. */
export function fusionnerAnnonces(a: Annonce[], b: Annonce[]): Annonce[] {
  const parId = new Map<string, Annonce>()
  for (const x of [...a, ...b]) {
    const deja = parId.get(x.id)
    if (!deja || x.modifie > deja.modifie) parId.set(x.id, x)
  }
  return [...parId.values()].sort((x, y) => y.ajoute.localeCompare(x.ajoute))
}

/** Code du favori « ☆ Où acheter » : lit la page d'annonce ouverte dans le navigateur de l'utilisateur
 * (balises og:, données structurées JSON-LD, début du texte visible) et ouvre l'application préremplie. */
export function codeFavori(origine: string): string {
  const code = `(()=>{const m=n=>{const e=document.querySelector('meta[property="'+n+'"],meta[name="'+n+'"]');return e?e.content:''};`
    + `let prix='',surface='';for(const s of document.querySelectorAll('script[type="application/ld+json"]')){try{`
    + `for(const o of [].concat(JSON.parse(s.textContent)))for(const x of [].concat(o['@graph']||o)){`
    + `const f=[].concat(x.offers||[])[0];if(!prix&&f&&f.price)prix=f.price;`
    + `if(!surface&&x.floorSize)surface=x.floorSize.value||x.floorSize}}catch(e){}}`
    + `const p=new URLSearchParams({url:location.href,titre:m('og:title')||document.title,`
    + `desc:m('og:description')||m('description'),image:m('og:image'),prix:String(prix),surface:String(surface),`
    + `texte:(document.querySelector('main')||document.body).innerText.slice(0,2000)});`
    + `const u=${JSON.stringify(origine)}+'/ajout?'+p;const w=window.open(u,'_blank');if(!w)location.href=u})()`
  return `javascript:${encodeURIComponent(code)}`
}
