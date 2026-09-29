// Non-régression : le calcul porté en TypeScript doit donner exactement les mêmes résultats que
// le code d'origine de carte.html (scripts/carte_template.html), exécuté ici tel quel.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { budgetMax, normaliserProfil, plan, PROFIL_DEFAUT, ZONES_FIN, type Profil, type TypeAchat, type ZoneFin } from './financement'

type Original = {
  plan: (p: Profil, z: ZoneFin, t: TypeAchat, prix: number) => ReturnType<typeof plan>
  budgetMax: (p: Profil, z: ZoneFin, t: TypeAchat) => ReturnType<typeof budgetMax>
}

/** Extrait le bloc « Financement » du modèle HTML et l'évalue dans une fonction isolée. */
function chargerOriginal(): Original {
  const html = readFileSync(resolve(import.meta.dirname, '../../../scripts/carte_template.html'), 'utf8')
  const debut = html.indexOf('// ---------- Financement')
  const fin = html.indexOf('let BUDGETS')
  if (debut < 0 || fin < 0) throw new Error('Bloc de financement introuvable dans carte_template.html')
  const code = html.slice(debut, fin)
  const fmt = (n: number | null) => (n == null ? '—' : Math.round(n).toLocaleString('fr-FR'))
  return new Function('fmt', `${code}; return { plan, budgetMax };`)(fmt) as Original
}

const original = chargerOriginal()

// Profils variés : seuils de tranches PTZ, familles nombreuses, sans revenus, taux nul, Action Logement…
const PROFILS: Profil[] = [
  PROFIL_DEFAUT,
  { ...PROFIL_DEFAUT, pers: 2, rfr: 52000, rev: 4800, apport: 35000, al: true },
  { ...PROFIL_DEFAUT, pers: 4, rfr: 60000, rev: 5200, cred: 300, apport: 10000, taux: 3.8, duree: 20 },
  { ...PROFIL_DEFAUT, pers: 1, rfr: 25000, rev: 1900, apport: 5000, al: true },
  { ...PROFIL_DEFAUT, pers: 3, rfr: 110000, rev: 9000, apport: 80000, primo: false },
  { ...PROFIL_DEFAUT, pers: 9, rfr: 70000, rev: 6000, apport: 0, al: true },
  { ...PROFIL_DEFAUT, rev: 0 },
  { ...PROFIL_DEFAUT, taux: 0, ass: 0 },
  { ...PROFIL_DEFAUT, pers: 2, rfr: 49000 * 1.5, rev: 5000 },   // pile au plafond de la tranche 4 (A)
  { ...PROFIL_DEFAUT, apport: 400000, rev: 3000 },               // l'apport couvre tout
]

describe('financement : identique à carte.html', () => {
  for (const [k, brut] of PROFILS.entries()) {
    const p = normaliserProfil(brut)
    for (const z of ZONES_FIN) {
      for (const t of ['ancien', 'neuf'] as const) {
        it(`profil ${k}, zone ${z}, ${t} : budget maximal`, () => {
          expect(budgetMax(p, z, t)).toEqual(original.budgetMax(p, z, t))
        })
      }
      it(`profil ${k}, zone ${z} : plans à prix fixés`, () => {
        for (const prix of [0, 90000, 150000, 210000, 290000, 450000]) {
          for (const t of ['ancien', 'neuf'] as const) expect(plan(p, z, t, prix)).toEqual(original.plan(p, z, t, prix))
        }
      })
    }
  }
})

describe('financement : cohérence', () => {
  it('le budget maximal respecte le taux d\'effort de 35 %', () => {
    const b = budgetMax(normaliserProfil(PROFIL_DEFAUT), 'A', 'neuf')
    expect(b.effort).toBeLessThanOrEqual(0.35)
    expect(plan(normaliserProfil(PROFIL_DEFAUT), 'A', 'neuf', b.prix + 1000).effort).toBeGreaterThan(0.35)
  })
  it('bornes du formulaire', () => {
    const p = normaliserProfil({ ...PROFIL_DEFAUT, pers: 0, duree: 40, rfr: -5, taux: Number.NaN })
    expect(p).toMatchObject({ pers: 1, duree: 25, rfr: 0, taux: 0 })
  })
})
