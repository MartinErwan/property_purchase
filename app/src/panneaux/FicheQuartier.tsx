import { useMemo } from 'react'
import { useEtat } from '../etat'
import { useRessources } from '../donnees/store'
import { useBudgets } from '../carte/useSynchroCarte'
import { couleurDe, fmt, pct } from '../logique/echelles'
import { NOM_ZONE } from '../logique/financement'
import { estSelectionne, type IrisCalcule } from '../logique/selection'
import { libelleDestination } from '../logique/trajet'
import { useQuartiers } from '../quartiers'

/** Fiche détaillée du quartier (IRIS) choisi sur la carte. */
export function FicheQuartier({ id }: { id: string }) {
  const donnees = useRessources((r) => r.donnees)
  const meta = useRessources((r) => r.meta)
  useRessources((r) => r.versionTrajet) // relit les temps de trajet recalculés
  const { filtres, destination } = useEtat()
  const budgets = useBudgets()
  const p = useMemo(() => donnees?.iris.features.find((f) => f.properties.id === id)?.properties as IrisCalcule | undefined,
    [donnees, id])
  if (!p) return <p>Quartier introuvable.</p>

  const dansFiltres = estSelectionne(p, filtres, budgets)
  const evol = p.ea == null ? null : `${p.ea > 0 ? '+' : ''}${Math.round(p.ea * 100)} % vs 2 ans avant`
  const dest = libelleDestination(destination, meta?.poles)
  const z = p.z && p.z !== 'C' ? p.z : null

  return (
    <div className="fiche">
      <p className="fiche-commune">{p.nc} · {donnees?.manifeste.departements[p.dep] ?? p.dep}
        {dansFiltres ? <span className="tag">dans les filtres</span> : <span className="tag tag-neutre">hors filtres</span>}</p>
      <BoutonEnregistrer id={p.id} />

      <div className="tuiles">
        <Tuile titre="Ancien" valeur={p.pa} unite="€/m²" ind="pa" detail={`${p.na} ventes${evol ? ` · ${evol}` : ''}`} />
        <Tuile titre="Neuf (VEFA)" valeur={p.pv} unite="€/m²" ind="pv" detail={`${p.nv} ventes`} />
        <Tuile titre="Revenu médian" valeur={p.rv} unite="€/an" ind="rv" detail={p.rs === 'commune' ? 'valeur communale' : 'par unité de conso.'} />
        <Tuile titre={`Trajet → ${dest || 'destination'}`} valeur={p.tt ?? null} unite="min" ind="tt"
          detail={p.tt == null ? 'pas de station à moins de 2,5 km' : `dont ${p.tmar} min à pied jusqu'à ${p.tvia}`} />
      </div>

      <table className="details">
        <tbody>
          {p.pa == null && <tr><td>Repère commune</td><td>{fmt(p.pac)} €/m² (ancien)</td></tr>}
          <tr><td>Pour {filtres.su} m²</td><td>ancien ≈ {p.pa ? `${fmt(Math.round(p.pa * filtres.su / 1000) * 1000)} €` : '—'} · neuf ≈{' '}
            {p.pv ? `${fmt(Math.round(p.pv * filtres.su / 1000) * 1000)} €` : '—'}</td></tr>
          {budgets && z && <tr><td>Mon budget ici</td><td>ancien {fmt(budgets.ancien[z].prix)} € · neuf {fmt(budgets.neuf[z].prix)} €</td></tr>}
          <tr><td>Zone A/B/C</td><td>{z ? NOM_ZONE[z] : p.z ?? '—'}</td></tr>
          <tr><td>Station</td><td>{p.sa ?? '—'} à {fmt(p.da)} m</td></tr>
          <tr><td>Future gare</td><td>{p.sf ?? '—'} à {fmt(p.df)} m</td></tr>
          <tr><td>QPV</td><td>{pct(p.q)} de la surface · tampon 300 m : {pct(p.tq)}</td></tr>
          <tr><td>Code IRIS</td><td>{p.id}</td></tr>
        </tbody>
      </table>
      <p className="note">Médianes des 24 derniers mois, calculées à partir de 5 ventes. Distances à vol d'oiseau depuis
        le centre du quartier.</p>
    </div>
  )
}

function Tuile({ titre, valeur, unite, ind, detail }: { titre: string; valeur: number | null; unite: string
                                                        ind: 'pa' | 'pv' | 'rv' | 'tt'; detail: string }) {
  return (
    <div className="tuile">
      <span className="tuile-titre">{titre}</span>
      <span className="tuile-valeur"><span className="puce" style={{ background: couleurDe(ind, valeur) }} />
        {valeur == null ? '—' : fmt(valeur)} <small>{valeur == null ? '' : unite}</small></span>
      <span className="tuile-detail">{detail}</span>
    </div>
  )
}

function BoutonEnregistrer({ id }: { id: string }) {
  const enregistre = useQuartiers((q) => q.enregistres.some((x) => x.id === id))
  const basculer = useQuartiers((q) => q.basculer)
  return (
    <button type="button" className={`bouton bouton-enregistrer${enregistre ? ' actif' : ''}`} aria-pressed={enregistre}
      onClick={() => basculer(id)}>
      {enregistre ? '★ Enregistré dans « Mes quartiers »' : '☆ Enregistrer ce quartier'}
    </button>
  )
}
