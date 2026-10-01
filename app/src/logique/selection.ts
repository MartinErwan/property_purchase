import type { ExpressionSpecification } from 'maplibre-gl'
import type { IrisProps } from '../donnees/types'
import { ECHELLES, SANS_DONNEE, type Indicateur } from './echelles'
import { ZONES_FIN, type Budgets, type TypeAchat } from './financement'

export const TT_AUCUN = 120 // position du curseur « trajet maximum » qui désactive le filtre

export interface Filtres {
  ba: number        // budget ancien (€)
  bv: number        // budget neuf (€)
  su: number        // surface visée (m²)
  di: number        // distance maximale à une station (m)
  rv: number        // revenu médian minimum (€), 0 = pas de filtre
  horsqpv: boolean  // exclure les IRIS qui touchent un QPV ou son tampon
  tt: number        // trajet maximum (min), TT_AUCUN = pas de filtre
}

/** Propriétés d'un IRIS enrichies du temps de trajet calculé dans le navigateur. */
export interface IrisCalcule extends IrisProps {
  tt?: number | null    // minutes vers la destination
  tvia?: string | null  // station de départ retenue
  tmar?: number | null  // minutes de marche jusqu'à elle
}

function budget(f: Filtres, budgets: Budgets | null, p: IrisProps, type: TypeAchat): number {
  if (!budgets) return type === 'ancien' ? f.ba : f.bv
  const b = p.z && p.z !== 'C' ? budgets[type][p.z] : undefined
  return b ? b.prix : 0
}

/** Un IRIS passe-t-il les filtres ? (même règle que l'expression MapLibre ci-dessous) */
export function estSelectionne(p: IrisCalcule, f: Filtres, budgets: Budgets | null): boolean {
  const dansBudget = (p.pa != null && p.pa * f.su <= budget(f, budgets, p, 'ancien'))
    || (p.pv != null && p.pv * f.su <= budget(f, budgets, p, 'neuf'))
  const station = p.da != null && p.da <= f.di
  const revenu = f.rv <= 0 || (p.rv != null && p.rv >= f.rv)
  const qpv = !f.horsqpv || !((p.tq ?? 0) > 0)
  const trajet = f.tt >= TT_AUCUN || (p.tt != null && p.tt <= f.tt)
  return dansBudget && station && revenu && qpv && trajet
}

/** Expression MapLibre équivalente à estSelectionne (évaluée par la carte, sans reconstruire les données). */
export function exprSelection(f: Filtres, budgets: Budgets | null): ExpressionSpecification {
  const num = (k: string, defaut: number): ExpressionSpecification => ['coalesce', ['get', k], defaut]
  const budgetExpr = (type: TypeAchat): number | ExpressionSpecification => !budgets ? (type === 'ancien' ? f.ba : f.bv)
    : ['match', ['coalesce', ['get', 'z'], ''], ...ZONES_FIN.flatMap((z) => [z, budgets[type][z].prix]), 0] as unknown as ExpressionSpecification
  const e: ExpressionSpecification[] = [
    ['any',
      ['<=', ['*', num('pa', 1e12), f.su], budgetExpr('ancien')],
      ['<=', ['*', num('pv', 1e12), f.su], budgetExpr('neuf')]],
    ['<=', num('da', 1e12), f.di],
  ]
  if (f.rv > 0) e.push(['>=', num('rv', -1), f.rv])
  if (f.horsqpv) e.push(['<=', num('tq', 0), 0])
  if (f.tt < TT_AUCUN) e.push(['<=', num('tt', 1e12), f.tt])
  return ['all', ...e]
}

export function exprCouleur(ind: Indicateur): ExpressionSpecification {
  const { seuils, couleurs } = ECHELLES[ind]
  const pas: unknown[] = ['step', ['get', ind], couleurs[0]]
  seuils.forEach((s, k) => pas.push(s, couleurs[k + 1]))
  return ['case', ['==', ['typeof', ['get', ind]], 'number'], pas as ExpressionSpecification, SANS_DONNEE]
}
