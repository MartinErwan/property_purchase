import { useQuartiers } from '../quartiers'
import type { Page } from '../navigation'
import { ONGLETS } from './definitionOnglets'

interface Props {
  actif: Page | null
  surChoix: (p: Page) => void
}

export function BarreOnglets({ actif, surChoix }: Props) {
  const nb = useQuartiers((q) => q.enregistres.length)
  return (
    <nav className="onglets" aria-label="Sections">
      {ONGLETS.map((o) => (
        <button key={o.id} type="button" className="onglet" aria-current={actif === o.id ? 'page' : undefined}
          onClick={() => surChoix(o.id)}>
          <span className="onglet-icone">{o.icone}{o.id === 'quartiers' && nb > 0 && <span className="pastille-nb">{nb}</span>}</span>
          <span>{o.libelle}</span>
        </button>
      ))}
    </nav>
  )
}
