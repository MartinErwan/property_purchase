// État partageable encodé dans l'URL (?ba=…&su=…) : filtres, indicateur, destination, horizon, quartier.
// Le profil de financement (revenus) n'y figure JAMAIS : donnée personnelle.
import type { Indicateur } from './echelles'
import type { Filtres } from './selection'
import type { Destination } from './trajet'

export interface EtatUrl {
  ind?: Indicateur
  filtres?: Partial<Filtres>
  destination?: Destination
  horizon?: string
  iris?: string
}

const NUMERIQUES: (keyof Filtres)[] = ['ba', 'bv', 'su', 'di', 'rv', 'tt']
const INDICATEURS: Indicateur[] = ['pa', 'pv', 'rv', 'tt']

export function encoder(e: { ind: Indicateur; filtres: Filtres; destination: Destination | null; horizon: string; irisChoisi: string | null },
                        defauts: { filtres: Filtres; destinationDefaut: number | null }): string {
  const p = new URLSearchParams()
  if (e.ind !== 'pa') p.set('ind', e.ind)
  for (const k of NUMERIQUES) if (e.filtres[k] !== defauts.filtres[k]) p.set(k, String(e.filtres[k]))
  if (e.filtres.horsqpv) p.set('horsqpv', '1')
  const d = e.destination
  if (d?.type === 'pole' && d.pole !== defauts.destinationDefaut) p.set('dest', String(d.pole))
  if (d?.type === 'adresse') p.set('dest', `${d.lng.toFixed(5)},${d.lat.toFixed(5)},${d.libelle}`)
  if (e.horizon !== 'actuel') p.set('gpe', e.horizon)
  if (e.irisChoisi) p.set('iris', e.irisChoisi)
  return p.toString()
}

export function decoder(recherche: string): EtatUrl {
  const p = new URLSearchParams(recherche)
  const res: EtatUrl = {}
  const ind = p.get('ind') as Indicateur | null
  if (ind && INDICATEURS.includes(ind)) res.ind = ind
  const filtres: Partial<Filtres> = {}
  for (const k of NUMERIQUES) {
    const v = p.get(k)
    if (v != null && v !== '' && Number.isFinite(Number(v))) (filtres as Record<string, number>)[k] = Number(v)
  }
  if (p.get('horsqpv') === '1') filtres.horsqpv = true
  if (Object.keys(filtres).length) res.filtres = filtres
  const dest = p.get('dest')
  if (dest != null) {
    if (/^\d+$/.test(dest)) res.destination = { type: 'pole', pole: Number(dest) }
    else {
      const [lng, lat, ...libelle] = dest.split(',')
      if (Number.isFinite(Number(lng)) && Number.isFinite(Number(lat)) && lng && lat) {
        res.destination = { type: 'adresse', lng: Number(lng), lat: Number(lat), libelle: libelle.join(',') || 'Adresse' }
      }
    }
  }
  const gpe = p.get('gpe')
  if (gpe && /^\d{4}$/.test(gpe)) res.horizon = gpe
  const iris = p.get('iris')
  if (iris && /^[0-9A-Z]{9}$/.test(iris)) res.iris = iris
  return res
}
