import { useMemo } from 'react'
import { useEtat } from '../etat'
import { useRessources } from '../donnees/store'
import { useBudgets } from '../carte/useSynchroCarte'
import { useNavigation, type SousOnglet } from '../navigation'
import { estSelectionne, TT_AUCUN, type IrisCalcule } from '../logique/selection'
import { libelleDestination } from '../logique/trajet'

const k = (v: number) => `${Math.round(v / 1000)} k€`

/** Pastilles en haut de la carte (mobile) : les filtres actifs d'un coup d'œil ; un appui ouvre le réglage. */
export function ResumeFiltres({ surOuvrir }: { surOuvrir: (s: SousOnglet) => void }) {
  const { filtres: f, profil, destination } = useEtat()
  const meta = useRessources((r) => r.meta)
  const donnees = useRessources((r) => r.donnees)
  const versionTrajet = useRessources((r) => r.versionTrajet)
  const budgets = useBudgets()
  const nb = useMemo(() => {
    if (!donnees || versionTrajet < 0) return null
    return donnees.iris.features.filter((x) => estSelectionne(x.properties as IrisCalcule, f, budgets)).length
  }, [donnees, f, budgets, versionTrajet])

  const pastilles: [string, SousOnglet][] = [
    [profil.actif ? 'Budget selon profil' : `Ancien ≤ ${k(f.ba)} · neuf ≤ ${k(f.bv)}`, 'filtres'],
    [`${f.su} m²`, 'filtres'],
    [`Station ≤ ${f.di} m`, 'filtres'],
  ]
  if (f.rv > 0) pastilles.push([`Revenu ≥ ${k(f.rv)}`, 'filtres'])
  if (f.horsqpv) pastilles.push(['Hors QPV', 'filtres'])
  if (f.tt < TT_AUCUN) pastilles.push([`≤ ${f.tt} min → ${libelleDestination(destination, meta?.poles) || '…'}`, 'trajet'])

  return (
    <div className="resume-filtres">
      <button type="button" className="pastille-filtre pastille-reglages" onClick={() => surOuvrir('filtres')}>⚙ Réglages</button>
      {nb != null && <span className="pastille-filtre pastille-compte">{nb} quartiers</span>}
      {pastilles.map(([texte, s]) => (
        <button key={texte} type="button" className="pastille-filtre" onClick={() => {
          useNavigation.setState({ sousOnglet: s }); surOuvrir(s)
        }}>{texte}</button>
      ))}
    </div>
  )
}
