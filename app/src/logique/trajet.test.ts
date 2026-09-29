import { describe, expect, it } from 'vitest'
import type { Pole } from '../donnees/types'
import { distanceM, INJOIGNABLE, polesArrivee, tempsIris, type Matrice } from './trajet'
import { decoder, encoder } from './url'
import { chercher, indexer, normaliser } from './recherche'

// 3 stations × 2 pôles
const M: Matrice = { nbPoles: 2, octets: Uint8Array.from([20, 35, INJOIGNABLE, 10, 5, INJOIGNABLE]) }
const POLES: Pole[] = [
  { n: 'Châtelet', s: 'Châtelet', d: true, c: [2.3467, 48.8597] },
  { n: 'La Défense', s: 'La Défense', d: true, c: [2.2382, 48.8919] },
]

describe('temps de trajet', () => {
  it('meilleure combinaison marche + trajet vers un pôle', () => {
    const r = tempsIris({ ts: [0, 2], tm: [4, 12] }, M, [{ pole: 0, marche: 0 }], ['A', 'B', 'C'])
    expect(r).toEqual({ tt: 17, tvia: 'C', tmar: 12 }) // 12 + 5 < 4 + 20
  })
  it('injoignable → null', () => {
    expect(tempsIris({ ts: [1], tm: [3] }, M, [{ pole: 0, marche: 0 }], ['A', 'B', 'C']).tt).toBeNull()
    expect(tempsIris({ ts: [], tm: [] }, M, [{ pole: 0, marche: 0 }], []).tt).toBeNull()
  })
  it('adresse : marche depuis les pôles à moins de 2,5 km', () => {
    const arrivees = polesArrivee({ type: 'adresse', libelle: 'x', lng: 2.35, lat: 48.86 }, POLES)
    expect(arrivees.map((a) => a.pole)).toEqual([0])
    expect(arrivees[0].marche).toBeGreaterThan(3)
    expect(arrivees[0].marche).toBeLessThan(6)
  })
  it('distance Châtelet – La Défense ≈ 8,7 km', () => {
    expect(distanceM(POLES[0].c, POLES[1].c)).toBeGreaterThan(8500)
    expect(distanceM(POLES[0].c, POLES[1].c)).toBeLessThan(8900)
  })
})

describe('état dans l\'URL', () => {
  const defauts = { filtres: { ba: 210000, bv: 290000, su: 45, di: 800, rv: 0, horsqpv: false, tt: 60 }, destinationDefaut: 36 }
  it('aller-retour', () => {
    const etat = { ind: 'rv' as const, filtres: { ...defauts.filtres, ba: 250000, horsqpv: true }, horizon: '2030',
                   destination: { type: 'adresse' as const, libelle: '1 rue de Rivoli, 75001 Paris', lng: 2.34, lat: 48.86 },
                   irisChoisi: '920260204' }
    const q = encoder(etat, defauts)
    expect(q).not.toContain('rfr') // jamais de données de profil
    const d = decoder(q)
    expect(d).toEqual({ ind: 'rv', filtres: { ba: 250000, horsqpv: true }, horizon: '2030', iris: '920260204',
                        destination: { type: 'adresse', libelle: '1 rue de Rivoli, 75001 Paris', lng: 2.34, lat: 48.86 } })
  })
  it('valeurs par défaut → URL vide', () => {
    expect(encoder({ ind: 'pa', filtres: defauts.filtres, destination: { type: 'pole', pole: 36 }, horizon: 'actuel', irisChoisi: null }, defauts)).toBe('')
  })
  it('entrées invalides ignorées', () => {
    expect(decoder('?ind=xx&ba=abc&gpe=20x&iris=<script>&dest=a,b')).toEqual({})
  })
})

describe('recherche', () => {
  it('normalisation', () => {
    expect(normaliser("St-Maur-des-Fossés")).toBe('saint maur des fosses')
    expect(normaliser("L'Haÿ-les-Roses")).toBe('l hay les roses')
  })
  it('préfixes de mots', () => {
    const index = indexer([{ nom: 'Vitry-sur-Seine' }, { nom: 'Paris 11e Arrondissement' }, { nom: 'Ivry-sur-Seine' }], (c) => c.nom)
    expect(chercher(index, 'vitry').map((c) => c.nom)).toEqual(['Vitry-sur-Seine'])
    expect(chercher(index, 'paris 11').map((c) => c.nom)).toEqual(['Paris 11e Arrondissement'])
    expect(chercher(index, 'sur seine').map((c) => c.nom)).toHaveLength(2)
  })
})
