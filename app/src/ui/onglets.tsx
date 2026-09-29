import { ONGLETS, type Onglet } from './definitionOnglets'

interface Props {
  actif: Onglet | null
  surChoix: (o: Onglet) => void
}

export function BarreOnglets({ actif, surChoix }: Props) {
  return (
    <nav className="onglets" aria-label="Sections">
      {ONGLETS.map((o) => (
        <button key={o.id} type="button" className="onglet" aria-current={actif === o.id ? 'page' : undefined}
          onClick={() => surChoix(o.id)}>
          {o.icone}
          <span>{o.libelle}</span>
        </button>
      ))}
    </nav>
  )
}
