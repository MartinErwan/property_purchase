import { describe, expect, it } from 'vitest'
import { fusionnerListes, listeValide } from '../quartiers'
import { trier } from './tri'

describe('quartiers enregistrés', () => {
  it('fusion : union, date d\'ajout la plus ancienne, plus récent en tête', () => {
    const appareil = [{ id: '920260204', ajoute: '2026-10-02T10:00:00Z' }, { id: '930080101', ajoute: '2026-10-01T09:00:00Z' }]
    const compte = [{ id: '920260204', ajoute: '2026-09-30T08:00:00Z' }, { id: '940280000', ajoute: '2026-10-03T12:00:00Z' }]
    expect(fusionnerListes(appareil, compte)).toEqual([
      { id: '940280000', ajoute: '2026-10-03T12:00:00Z' },
      { id: '930080101', ajoute: '2026-10-01T09:00:00Z' },
      { id: '920260204', ajoute: '2026-09-30T08:00:00Z' },
    ])
  })
  it('liste venue du compte : entrées mal formées écartées', () => {
    expect(listeValide([{ id: '920260204', ajoute: 'x' }, { id: '<script>', ajoute: 'x' }, null, 3, { id: '930080101' }]))
      .toEqual([{ id: '920260204', ajoute: 'x' }])
    expect(listeValide('pas une liste')).toEqual([])
  })
})

describe('tri de « Mes quartiers »', () => {
  const L = [
    { id: 'a', ajoute: '2026-10-01', p: { pa: 5000, tt: 40, rv: 20000 } },
    { id: 'b', ajoute: '2026-10-03', p: { pa: null, tt: 25, rv: 30000 } },
    { id: 'c', ajoute: '2026-10-02', p: { pa: 3500, tt: null, rv: null } },
  ]
  it('par date, du plus récent', () => expect(trier(L, 'ajout').map((x) => x.id)).toEqual(['b', 'c', 'a']))
  it('prix croissant, absents à la fin', () => expect(trier(L, 'pa').map((x) => x.id)).toEqual(['c', 'a', 'b']))
  it('trajet le plus court, absents à la fin', () => expect(trier(L, 'tt').map((x) => x.id)).toEqual(['b', 'a', 'c']))
  it('revenu décroissant, absents à la fin', () => expect(trier(L, 'rv').map((x) => x.id)).toEqual(['b', 'a', 'c']))
})
