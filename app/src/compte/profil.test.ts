import { describe, expect, it } from 'vitest'
import { profilValide } from './profil'

describe('profil reçu du compte', () => {
  it('garde les champs connus et du bon type', () => {
    expect(profilValide({ pers: 2, rfr: 50000, primo: false, inconnu: 1, taux: '3', apport: Number.NaN }))
      .toEqual({ pers: 2, rfr: 50000, primo: false })
  })
  it('ignore les valeurs qui ne sont pas des objets', () => {
    expect(profilValide(null)).toEqual({})
    expect(profilValide('x')).toEqual({})
  })
})
