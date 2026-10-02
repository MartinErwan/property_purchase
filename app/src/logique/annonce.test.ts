import { describe, expect, it } from 'vitest'
import { annoncesValides, codeFavori, ecartMedian, extraire, fusionnerAnnonces, prixM2, siteDe, urlSure, type Annonce } from './annonce'

const A = (id: string, modifie: string, extra: Partial<Annonce> = {}): Annonce => ({
  id, url: `https://www.leboncoin.fr/ad/ventes_immobilieres/${id}`, site: 'Leboncoin', titre: 'T', prix: 200000,
  surface: 50, pieces: 2, image: null, note: '', iris: null, ajoute: '2026-10-01T00:00:00Z', modifie, ...extra,
})

describe('adresses', () => {
  it("n'accepte que http(s)", () => {
    expect(urlSure('https://www.seloger.com/annonces/1.htm')).toBe('https://www.seloger.com/annonces/1.htm')
    expect(urlSure('javascript:alert(1)')).toBeNull()
    expect(urlSure('data:text/html,x')).toBeNull()
    expect(urlSure('pas une adresse')).toBeNull()
    expect(urlSure('')).toBeNull()
  })
  it('reconnaît les sites', () => {
    expect(siteDe('https://www.leboncoin.fr/ad/ventes_immobilieres/1')).toBe('Leboncoin')
    expect(siteDe('https://m.seloger.com/x')).toBe('SeLoger')
    expect(siteDe('https://www.bienici.com/annonce/x')).toBe("Bien'ici")
    expect(siteDe('https://www.agence-dupont.fr/bien/12')).toBe('agence-dupont.fr')
  })
})

describe('extraction', () => {
  it('valeurs structurées (JSON-LD) en priorité', () => {
    const b = extraire({ url: 'https://www.seloger.com/annonces/1.htm', titre: 'Appartement 3 pièces 62 m²', prix: '249000', surface: '61.5' })
    expect(b).toMatchObject({ site: 'SeLoger', prix: 249000, surface: 61.5, pieces: 3 })
  })
  it('titre et texte : prix avec espaces fines, surface, pièces', () => {
    const b = extraire({
      url: 'https://www.leboncoin.fr/ad/ventes_immobilieres/123',
      titre: 'Appartement 3 pièces 62 m² - Bobigny',
      texte: 'Bobigny 93000\n249 000 €\n4 016 €/m²\nFrais d\'agence inclus',
    })
    expect(b).toMatchObject({ prix: 249000, surface: 62, pieces: 3, titre: 'Appartement 3 pièces 62 m² - Bobigny' })
  })
  it('ignore les prix au m², les loyers et les valeurs implausibles', () => {
    const b = extraire({ url: 'https://x.fr/a', titre: 'T2', texte: '4 016 €/m² · charges 1 200 €/mois · 12 € · 199 000 euros · 3 m²' })
    expect(b.prix).toBe(199000)
    expect(b.surface).toBeNull()
    expect(b.pieces).toBe(2)
  })
  it('partage Android : lien dans le texte, studio', () => {
    const b = extraire({ titre: '', texte: 'Studio 22 m2 à Montreuil https://www.leboncoin.fr/ad/ventes_immobilieres/42 165000 €' })
    expect(b.url).toBe('https://www.leboncoin.fr/ad/ventes_immobilieres/42')
    expect(b).toMatchObject({ site: 'Leboncoin', surface: 22, pieces: 1, prix: 165000 })
  })
  it('titre réduit au nom du site : remplacé par le début du texte partagé', () => {
    const b = extraire({ titre: 'leboncoin', texte: 'Studio 22 m2 à Montreuil\nhttps://www.leboncoin.fr/ad/ventes_immobilieres/42' })
    expect(b.titre).toBe('Studio 22 m2 à Montreuil')
    expect(extraire({ titre: 'T3 lumineux', url: 'https://www.leboncoin.fr/ad/1' }).titre).toBe('T3 lumineux')
  })
  it('image : adresse sûre seulement', () => {
    expect(extraire({ url: 'https://x.fr', image: 'https://img.x.fr/1.jpg' }).image).toBe('https://img.x.fr/1.jpg')
    expect(extraire({ url: 'https://x.fr', image: 'javascript:alert(1)' }).image).toBeNull()
  })
})

describe('calculs', () => {
  it('prix au m² et écart au médian', () => {
    expect(prixM2({ prix: 250000, surface: 50 })).toBe(5000)
    expect(prixM2({ prix: null, surface: 50 })).toBeNull()
    expect(ecartMedian({ prix: 225000, surface: 50 }, 5000)).toBeCloseTo(-0.1)
    expect(ecartMedian({ prix: 225000, surface: 50 }, null)).toBeNull()
  })
})

describe('synchronisation', () => {
  it('validation des données du compte', () => {
    const ok = A('1', '2026-10-01T00:00:00Z', { iris: '930080101' })
    const v = annoncesValides([ok, { ...ok, id: 2, url: 'https://x.fr' }, { ...ok, id: '3', url: 'javascript:alert(1)' },
      { ...ok, id: '4', image: 'javascript:x', iris: 'pas-un-iris' }, null, 'x'])
    expect(v.map((a) => a.id)).toEqual(['1', '4'])
    expect(v[1]).toMatchObject({ image: null, iris: null })
    expect(annoncesValides({})).toEqual([])
  })
  it('fusion : la modification la plus récente gagne', () => {
    const f = fusionnerAnnonces([A('1', '2026-10-02T00:00:00Z', { note: 'appareil' }), A('2', '2026-10-01T00:00:00Z')],
      [A('1', '2026-10-01T00:00:00Z', { note: 'compte' }), A('3', '2026-10-01T00:00:00Z')])
    expect(f.map((a) => a.id).sort()).toEqual(['1', '2', '3'])
    expect(f.find((a) => a.id === '1')?.note).toBe('appareil')
  })
})

describe('favori', () => {
  it("ouvre /ajout de l'application avec ce qu'il a lu", () => {
    const c = codeFavori('https://ou-acheter-2qp.pages.dev')
    expect(c.startsWith('javascript:')).toBe(true)
    const js = decodeURIComponent(c.slice('javascript:'.length))
    expect(js).toContain('"https://ou-acheter-2qp.pages.dev"+\'/ajout?\'')
    expect(() => new Function(js)).not.toThrow() // syntaxe valide
  })
})
