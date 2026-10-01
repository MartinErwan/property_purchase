import { fmt } from '../logique/echelles'
import { TT_AUCUN, type Filtres } from '../logique/selection'

export interface Curseur { cle: keyof Filtres; libelle: string; min: number; max: number; pas: number; valeur: (v: number) => string }

export const CURSEURS: Curseur[] = [
  { cle: 'ba', libelle: 'Budget ancien', min: 100000, max: 600000, pas: 5000, valeur: (v) => `${fmt(v)} €` },
  { cle: 'bv', libelle: 'Budget neuf (VEFA)', min: 100000, max: 600000, pas: 5000, valeur: (v) => `${fmt(v)} €` },
  { cle: 'su', libelle: 'Surface visée', min: 20, max: 100, pas: 1, valeur: (v) => `${v} m²` },
  { cle: 'di', libelle: 'Station à moins de', min: 200, max: 2500, pas: 50, valeur: (v) => `${fmt(v)} m` },
  { cle: 'rv', libelle: 'Revenu médian minimum', min: 0, max: 40000, pas: 500, valeur: (v) => (v === 0 ? 'aucun' : `${fmt(v)} €`) },
]

export const CURSEUR_TRAJET: Curseur = {
  cle: 'tt', libelle: 'Trajet maximum', min: 10, max: TT_AUCUN, pas: 5, valeur: (v) => (v >= TT_AUCUN ? 'aucun' : `${v} min`),
}

