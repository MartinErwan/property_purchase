import { useMemo } from 'react'
import { useEtat } from '../etat'
import { useRessources } from '../donnees/store'
import { useBudgets } from '../carte/useSynchroCarte'
import { estSelectionne, type IrisCalcule } from '../logique/selection'
import { CURSEURS, CURSEUR_TRAJET, type Curseur } from './curseurs'

export function LigneCurseur({ c, desactive, remplacement }: { c: Curseur; desactive?: boolean; remplacement?: string }) {
  const valeur = useEtat((e) => e.filtres[c.cle]) as number
  const majFiltres = useEtat((e) => e.majFiltres)
  return (
    <label className="curseur">
      <span>{c.libelle}</span>
      <span className="val">{remplacement ?? c.valeur(valeur)}</span>
      <input type="range" min={c.min} max={c.max} step={c.pas} value={valeur} disabled={desactive}
        onChange={(e) => majFiltres({ [c.cle]: Number(e.target.value) })} />
    </label>
  )
}

/** Nombre d'IRIS hors Paris qui passent les filtres, par département. */
export function Compteur() {
  const donnees = useRessources((r) => r.donnees)
  const versionTrajet = useRessources((r) => r.versionTrajet)
  const filtres = useEtat((e) => e.filtres)
  const budgets = useBudgets()
  const res = useMemo(() => {
    // versionTrajet : les temps de trajet des IRIS ont été recalculés (propriétés modifiées en place).
    if (!donnees || versionTrajet < 0) return null
    const pc = donnees.iris.features.filter((f) => f.properties.dep !== '75')
    const parDep: Record<string, number> = {}
    for (const f of pc) if (estSelectionne(f.properties as IrisCalcule, filtres, budgets)) parDep[f.properties.dep] = (parDep[f.properties.dep] ?? 0) + 1
    return { total: Object.values(parDep).reduce((a, b) => a + b, 0), n: pc.length, parDep }
  }, [donnees, filtres, budgets, versionTrajet])
  if (!res || !donnees) return null
  const deps = Object.keys(donnees.manifeste.departements).filter((d) => d !== '75')
  return (
    <div className="compteur" aria-live="polite">
      <b>{res.total}</b> quartiers hors Paris sur {res.n} dans les filtres
      <div className="compteur-deps">{deps.map((d) => <span key={d}>{d} : {res.parDep[d] ?? 0}</span>)}</div>
    </div>
  )
}

export function PanneauFiltres() {
  const { filtres, majFiltres, profil } = useEtat()
  const donnees = useRessources((r) => r.donnees)
  return (
    <>
      <Compteur />
      {profil.actif && <p className="encart">Budget calculé par ton profil de financement, selon la zone de chaque quartier
        (onglet Financement).</p>}
      {CURSEURS.map((c) => (
        <LigneCurseur key={c.cle} c={c} desactive={profil.actif && (c.cle === 'ba' || c.cle === 'bv')}
          remplacement={profil.actif && (c.cle === 'ba' || c.cle === 'bv') ? 'selon profil' : undefined} />
      ))}
      <LigneCurseur c={CURSEUR_TRAJET} />
      <label className="case">
        <input type="checkbox" checked={filtres.horsqpv} disabled={!donnees?.qpv}
          onChange={(e) => majFiltres({ horsqpv: e.target.checked })} />
        <span>Exclure les quartiers qui touchent un QPV ou son tampon de 300 m</span>
      </label>
      <p className="note">Seuls les quartiers (IRIS) qui passent tous les filtres sont colorés sur la carte. Budget :
        prix médian au m² × surface visée, hors frais de notaire, ancien OU neuf. Distance à vol d'oiseau depuis le
        centre du quartier jusqu'à la station en service la plus proche.</p>
    </>
  )
}
