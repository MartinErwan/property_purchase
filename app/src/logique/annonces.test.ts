import { describe, expect, it } from 'vitest'
import { centreGeometrie, lienBienici, lienLeboncoin, slug } from './annonces'

const C = { commune: 'Bobigny', centre: [2.44321, 48.90512] as [number, number], prixMax: 210000, surfaceMin: 45 }

describe('liens vers les annonces', () => {
  it('Leboncoin : appartements à vendre, budget, surface, autour du quartier', () => {
    const u = new URL(lienLeboncoin(C))
    expect(u.origin + u.pathname).toBe('https://www.leboncoin.fr/recherche')
    expect(Object.fromEntries(u.searchParams)).toEqual({
      category: '9', real_estate_type: '2', price: 'min-210000', square: '45-max', locations: 'Bobigny__48.90512_2.44321_1500',
    })
  })
  it("Bien'ici : commune + code postal", () => {
    expect(lienBienici(C, '93000')).toBe('https://www.bienici.com/recherche/achat/bobigny-93000/appartement?prix-max=210000&surface-min=45')
  })
  it('slug des noms de commune', () => {
    expect(slug('Saint-Maur-des-Fossés')).toBe('saint-maur-des-fosses')
    expect(slug("L'Haÿ-les-Roses")).toBe('l-hay-les-roses')
  })
  it("centre d'un polygone", () => {
    expect(centreGeometrie({ type: 'Polygon', coordinates: [[[2, 48], [3, 48], [3, 49], [2, 48]]] })).toEqual([2.5, 48.5])
  })
})
