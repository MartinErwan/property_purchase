/** Normalisation pour la recherche : sans accents ni casse, tirets et apostrophes = espaces,
 * « st » / « ste » = saint / sainte. */
export const normaliser = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[-'’]/g, ' ').replace(/\bste\b/g, 'sainte').replace(/\bst\b/g, 'saint').replace(/\s+/g, ' ').trim()

export interface Cherchable { cle: string; mots: string[] }

export function indexer<T>(elements: T[], texte: (e: T) => string): (T & Cherchable)[] {
  return elements.map((e) => {
    const cle = normaliser(texte(e))
    return { ...e, cle, mots: cle.split(' ') }
  })
}

/** Chaque mot tapé doit être le début d'un mot du nom (« paris 11 » → Paris 11e) ;
 * les noms qui commencent par la requête passent en tête. */
export function chercher<T extends Cherchable>(index: T[], texte: string, max = 8, departage?: (a: T, b: T) => number): T[] {
  const q = normaliser(texte)
  if (!q) return []
  const jetons = q.split(' ')
  return index
    .filter((c) => jetons.every((j) => c.mots.some((m) => m.startsWith(j))) || c.cle.includes(q))
    .sort((a, b) => (Number(b.cle.startsWith(q)) - Number(a.cle.startsWith(q))) || (departage ? departage(a, b) : 0))
    .slice(0, max)
}
