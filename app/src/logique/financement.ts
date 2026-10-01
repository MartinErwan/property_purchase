// Financement : PTZ, prêt Action Logement, crédit bancaire → prix maximal finançable par zone.
// Portage à l'identique du calcul de carte.html (scripts/carte_template.html), vérifié par
// financement.test.ts qui exécute l'original et compare les résultats.
// Barèmes 2026 issus de sources secondaires, NON vérifiés au texte officiel (voir README).

export type ZoneFin = 'Abis' | 'A' | 'B1' | 'B2'
export type TypeAchat = 'ancien' | 'neuf'

export const ZONES_FIN: ZoneFin[] = ['Abis', 'A', 'B1', 'B2']
export const NOM_ZONE: Record<ZoneFin, string> = { Abis: 'A bis', A: 'A', B1: 'B1', B2: 'B2' }

export const FIN = {
  coef: [1, 1.5, 1.8, 2.1, 2.4, 2.7, 3.0, 3.3],                  // coefficient familial PTZ (1 à 8+ personnes)
  tranches: { Abis: [25000, 31000, 37000, 49000], A: [25000, 31000, 37000, 49000],
              B1: [21500, 26000, 30000, 34500], B2: [18000, 22500, 27000, 31500] } as Record<ZoneFin, number[]>,
  plafondOperation: { Abis: 150000, A: 150000, B1: 135000, B2: 110000 } as Record<ZoneFin, number>, // × coef (≤ 2,4)
  quotiteNeuf: [0.5, 0.4, 0.4, 0.2],                              // logement collectif neuf, tranches 1 à 4
  dureePtzMois: [300, 240, 180, 120],
  differePtzMois: [120, 96, 24, 0],
  // Plafonds de ressources du prêt Action Logement (1 à 6 personnes, puis par personne supplémentaire).
  plafondsAL: {
    Abis: [44344, 66276, 86878, 103727, 123415, 138874, 15471],
    A: [44344, 66276, 79666, 95427, 112968, 127122, 14164],
    B1: [36144, 48268, 58043, 70073, 82432, 92900, 10364],
    B2: [32530, 43439, 52239, 63066, 74189, 83611, 9325],
  } as Record<ZoneFin, number[]>,
  pretAL: 30000, tauxAL: 0.01, dureeALMois: 300, partMaxAL: 0.4,
  tauxEffortMax: 0.35,
  fraisNotaire: { ancien: 0.075, neuf: 0.025 } as Record<TypeAchat, number>,
}

export interface Profil {
  pers: number      // personnes dans le foyer
  rfr: number       // revenu fiscal de référence N-2 (€)
  rev: number       // revenus nets mensuels (€)
  cred: number      // crédits en cours (€/mois)
  apport: number    // apport personnel (€)
  taux: number      // taux du crédit bancaire (%/an)
  ass: number       // assurance emprunteur (% du capital/an)
  duree: number     // durée du crédit bancaire (ans)
  primo: boolean    // primo-accédant
  al: boolean       // salarié éligible au prêt Action Logement
  actif: boolean    // utiliser le profil pour le filtre de budget
}

export const PROFIL_DEFAUT: Profil = { pers: 1, rfr: 40000, rev: 2800, cred: 0, apport: 20000, taux: 3.3, ass: 0.3,
                                       duree: 25, primo: true, al: false, actif: false }

/** Bornes appliquées aux saisies (identiques au formulaire de carte.html). */
export function normaliserProfil(p: Profil): Profil {
  const n = (v: number) => Math.max(0, Number.isFinite(v) ? v : 0)
  return { ...p, pers: Math.max(1, Math.round(n(p.pers))), rfr: n(p.rfr), rev: n(p.rev), cred: n(p.cred),
           apport: n(p.apport), taux: n(p.taux), ass: n(p.ass), duree: Math.min(25, Math.max(5, n(p.duree))) }
}

export interface ResultatPtz { montant: number; raison?: string; tranche?: number; quotite?: number; dureeMois?: number; differeMois?: number }
export interface ResultatAL { montant: number; raison?: string }
export interface Plan {
  prix: number; frais: number; ptz: ResultatPtz; al: ResultatAL; banque: number; mois: number
  mensualite: number; effort: number
}

const fmt = (n: number) => Math.round(n).toLocaleString('fr-FR')

export const mensualite = (capital: number, tauxAnnuel: number, mois: number): number => tauxAnnuel === 0 ? capital / mois
  : capital * (tauxAnnuel / 12) / (1 - Math.pow(1 + tauxAnnuel / 12, -mois))

export function ptz(profil: Profil, zone: ZoneFin, prix: number): ResultatPtz {
  if (!profil.primo) return { montant: 0, raison: 'non primo-accédant' }
  const coef = FIN.coef[Math.min(profil.pers, 8) - 1]
  const revenu = Math.max(profil.rfr, prix / 9)                  // revenu retenu : RFR N-2 ou coût / 9
  const tranche = FIN.tranches[zone].findIndex((s) => revenu / coef <= s)
  if (tranche < 0) return { montant: 0, raison: 'revenus au-dessus du plafond' }
  const plafond = FIN.plafondOperation[zone] * Math.min(coef, 2.4)
  return { montant: FIN.quotiteNeuf[tranche] * Math.min(prix, plafond), tranche: tranche + 1,
           quotite: FIN.quotiteNeuf[tranche], dureeMois: FIN.dureePtzMois[tranche], differeMois: FIN.differePtzMois[tranche] }
}

export function pretAL(profil: Profil, zone: ZoneFin, prix: number): ResultatAL {
  if (!profil.al) return { montant: 0, raison: 'case non cochée' }
  const t = FIN.plafondsAL[zone], n = Math.min(profil.pers, 6)
  const plafond = t[n - 1] + Math.max(0, profil.pers - 6) * t[6]
  if (profil.rfr > plafond) return { montant: 0, raison: `revenus au-dessus du plafond (${fmt(plafond)} €)` }
  return { montant: Math.min(FIN.pretAL, FIN.partMaxAL * prix) }
}

/** Plan de financement d'un achat au prix `prix` (hors frais de notaire). */
export function plan(profil: Profil, zone: ZoneFin, type: TypeAchat, prix: number): Plan {
  const frais = prix * FIN.fraisNotaire[type]
  const p: ResultatPtz = type === 'neuf' ? ptz(profil, zone, prix)
    : { montant: 0, raison: 'ancien : seulement en zone B2 avec ≥ 25 % de travaux' }
  const al = pretAL(profil, zone, prix)
  const banque = Math.max(0, prix + frais - profil.apport - p.montant - al.montant)
  // Plan lissé : la banque ajuste son prêt pour que la mensualité totale (banque + PTZ + Action Logement)
  // soit constante. Mensualité = (capital bancaire + valeur actuelle des remboursements PTZ et AL, au taux
  // bancaire) / facteur d'annuité sur la durée la plus longue des trois prêts.
  const i = profil.taux / 100 / 12
  const annuite = (n: number) => (i === 0 ? n : (1 - Math.pow(1 + i, -n)) / i)
  const mois = Math.max(profil.duree * 12, p.montant ? p.dureeMois! : 0, al.montant ? FIN.dureeALMois : 0)
  const vaPTZ = p.montant ? p.montant / (p.dureeMois! - p.differeMois!) * annuite(p.dureeMois! - p.differeMois!)
    * Math.pow(1 + i, -p.differeMois!) : 0
  const vaAL = al.montant ? mensualite(al.montant, FIN.tauxAL, FIN.dureeALMois) * annuite(FIN.dureeALMois) : 0
  const mTotale = (banque + vaPTZ + vaAL) / annuite(mois) + banque * profil.ass / 100 / 12
  const charge = mTotale + profil.cred
  return { prix, frais, ptz: p, al, banque, mois, mensualite: mTotale, effort: profil.rev > 0 ? charge / profil.rev : Infinity }
}

/** Prix maximal finançable (pas de 1 000 €) : taux d'effort ≤ 35 %. */
export function budgetMax(profil: Profil, zone: ZoneFin, type: TypeAchat): Plan {
  for (let prix = 1500000; prix >= 0; prix -= 1000) {
    const pl = plan(profil, zone, type, prix)
    if (pl.effort <= FIN.tauxEffortMax || pl.banque === 0) return pl
  }
  return plan(profil, zone, type, 0)
}

export type Budgets = Record<TypeAchat, Record<ZoneFin, Plan>>

export function budgetsParZone(profil: Profil): Budgets {
  const res = { ancien: {}, neuf: {} } as Budgets
  for (const z of ZONES_FIN) for (const t of ['ancien', 'neuf'] as const) res[t][z] = budgetMax(profil, z, t)
  return res
}
