import { useNavigation, type SousOnglet } from '../navigation'
import { PanneauCarte } from './PanneauCarte'
import { PanneauFiltres } from './PanneauFiltres'
import { PanneauTrajet } from './PanneauTrajet'

const SECTIONS: { id: SousOnglet; libelle: string }[] = [
  { id: 'filtres', libelle: 'Filtres' },
  { id: 'trajet', libelle: 'Trajet' },
  { id: 'affichage', libelle: 'Affichage' },
]

/** Réglages de la carte : filtres, trajet et affichage (couches, couleurs, légende). */
export function PanneauCartographie() {
  const sousOnglet = useNavigation((n) => n.sousOnglet)
  return (
    <>
      <div className="segments" role="tablist" aria-label="Réglages de la carte">
        {SECTIONS.map((s) => (
          <button key={s.id} type="button" role="tab" aria-selected={sousOnglet === s.id}
            onClick={() => useNavigation.setState({ sousOnglet: s.id })}>{s.libelle}</button>
        ))}
      </div>
      {sousOnglet === 'filtres' && <PanneauFiltres />}
      {sousOnglet === 'trajet' && <PanneauTrajet />}
      {sousOnglet === 'affichage' && <PanneauCarte />}
    </>
  )
}
