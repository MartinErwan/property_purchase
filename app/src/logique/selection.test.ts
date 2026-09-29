import { describe, expect, it } from 'vitest'
import { expression, type ExpressionSpecification } from '@maplibre/maplibre-gl-style-spec'
import type { IrisProps } from '../donnees/types'
import { budgetsParZone, PROFIL_DEFAUT } from './financement'
import { estSelectionne, exprSelection, TT_AUCUN, type Filtres, type IrisCalcule } from './selection'

const BASE: IrisProps = {
  id: '920260204', ni: 'Charcot', nc: 'Courbevoie', dep: '92', ty: 'H', pa: 4500, na: 62, pv: 6000, nv: 12, pac: 6667,
  ea: -0.07, rv: 25000, rs: 'iris', da: 500, sa: 'X', df: 700, sf: 'Y', q: 0, tq: 0, ts: [1], tm: [5], z: 'A',
}
const FILTRES: Filtres = { ba: 210000, bv: 290000, su: 45, di: 800, rv: 0, horsqpv: false, tt: 60 }

/** Évalue l'expression MapLibre sur un IRIS, comme le fait la carte. */
function evaluer(expr: ExpressionSpecification, p: IrisCalcule): boolean {
  const e = expression.createExpression(expr, 'layers[iris].filter')
  if (e.result !== 'success') throw new Error(JSON.stringify(e.value))
  return e.value.evaluate({ zoom: 10 }, { type: 'Polygon', properties: p as never, geometry: [] } as never) as boolean
}

// Variantes qui touchent chaque critère, y compris les valeurs absentes.
const IRIS: IrisCalcule[] = [
  { ...BASE, tt: 40 },
  { ...BASE, tt: 70 },
  { ...BASE, tt: null },
  { ...BASE, pa: null, tt: 30 },
  { ...BASE, pa: null, pv: null, tt: 30 },
  { ...BASE, pa: 5000, pv: 6500, tt: 30 },
  { ...BASE, da: null, tt: 30 },
  { ...BASE, da: 900, tt: 30 },
  { ...BASE, rv: null, tt: 30 },
  { ...BASE, rv: 15000, tt: 30 },
  { ...BASE, tq: 0.2, tt: 30 },
  { ...BASE, tq: null, tt: 30 },
  { ...BASE, z: 'B2', pa: 5200, tt: 30 },
  { ...BASE, z: null, tt: 30 },
]
const VARIANTES: Filtres[] = [
  FILTRES,
  { ...FILTRES, rv: 20000 },
  { ...FILTRES, horsqpv: true },
  { ...FILTRES, tt: TT_AUCUN },
  { ...FILTRES, su: 60, di: 1200 },
]

describe('sélection : expression MapLibre ≡ estSelectionne', () => {
  const budgets = budgetsParZone({ ...PROFIL_DEFAUT, rev: 4000, apport: 40000 })
  for (const [k, f] of VARIANTES.entries()) {
    for (const b of [null, budgets]) {
      it(`filtres ${k}, ${b ? 'budget selon profil' : 'budget curseurs'}`, () => {
        for (const p of IRIS) expect(evaluer(exprSelection(f, b), p), JSON.stringify(p)).toBe(estSelectionne(p, f, b))
      })
    }
  }
  it('cas de base', () => {
    expect(estSelectionne(IRIS[0], FILTRES, null)).toBe(true)
    expect(estSelectionne(IRIS[1], FILTRES, null)).toBe(false) // trajet trop long
    expect(estSelectionne(IRIS[2], { ...FILTRES, tt: TT_AUCUN }, null)).toBe(true)
  })
})
