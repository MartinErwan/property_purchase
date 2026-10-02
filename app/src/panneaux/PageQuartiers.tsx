import { useMemo, useState } from 'react'
import { useEtat } from '../etat'
import { useRessources } from '../donnees/store'
import { useBudgets } from '../carte/useSynchroCarte'
import { centrerSurIris } from '../carte/centrer'
import { useNavigation } from '../navigation'
import { useQuartiers } from '../quartiers'
import { couleurDe, fmt } from '../logique/echelles'
import { estSelectionne, type IrisCalcule } from '../logique/selection'
import { libelleDestination } from '../logique/trajet'
import { TRIS, trier, type Tri } from '../logique/tri'
import { useEcranLarge } from '../ui/useEcranLarge'
import { centreGeometrie } from '../logique/annonces'
import type { Budgets } from '../logique/financement'
import type { Filtres } from '../logique/selection'
import { LiensAnnonces } from './LiensAnnonces'
import { nouvelleAnnonce, useAnnonces } from '../annonces'
import { AideFavori, ListeAnnonces } from './Annonces'

/** Page « Mes quartiers » : les quartiers enregistrés depuis leur fiche, triables, avec accès à la carte. */
export function PageQuartiers() {
  const enregistres = useQuartiers((q) => q.enregistres)
  const retirer = useQuartiers((q) => q.retirer)
  const donnees = useRessources((r) => r.donnees)
  const meta = useRessources((r) => r.meta)
  const carte = useRessources((r) => r.carte)
  const versionTrajet = useRessources((r) => r.versionTrajet)
  const { filtres, destination } = useEtat()
  const budgets = useBudgets()
  const [tri, setTri] = useState<Tri>('ajout')
  const large = useEcranLarge()
  const annonces = useAnnonces((a) => a.annonces)

  const lignes = useMemo(() => {
    if (!donnees || versionTrajet < 0) return []
    const parId = new Map(donnees.iris.features.map((f) => [f.properties.id, f]))
    return enregistres.flatMap((q) => {
      const f = parId.get(q.id)
      return f ? [{ ...q, f, p: f.properties as IrisCalcule }] : []
    })
  }, [donnees, enregistres, versionTrajet])
  const tries = useMemo(() => trier(lignes, tri), [lignes, tri])
  const dest = libelleDestination(destination, meta?.poles)
  const ids = new Set(enregistres.map((q) => q.id))
  const aClasser = annonces.filter((a) => !a.iris || !ids.has(a.iris))

  const voir = (f: (typeof lignes)[number]['f']) => {
    useEtat.getState().set({ irisChoisi: f.properties.id })
    // Sur ordinateur, la carte est déjà visible à côté de la liste : on reste sur la page.
    if (!large) useNavigation.getState().naviguer('carte')
    if (carte) centrerSurIris(carte, f)
  }

  if (!enregistres.length && !annonces.length) {
    return (
      <>
      <div className="vide">
        <p><b>Aucun quartier enregistré pour l'instant.</b></p>
        <p>Sur la carte, touche un quartier puis « ☆ Enregistrer » dans sa fiche : il apparaîtra ici, et sera
          souligné en doré sur la carte.</p>
        <button type="button" className="bouton bouton-principal" onClick={() => useNavigation.getState().naviguer('carte')}>
          Aller à la carte</button>
      </div>
      <AideFavori />
      </>
    )
  }

  return (
    <>
      {aClasser.length > 0 && (
        <section className="a-classer">
          <h3>Annonces à classer</h3>
          <ListeAnnonces annonces={aClasser} median={null} />
        </section>
      )}
      {lignes.length > 0 && <label className="tri">
        <span>Trier par</span>
        <select value={tri} onChange={(e) => setTri(e.target.value as Tri)}>
          {TRIS.map((t) => <option key={t.id} value={t.id}>{t.libelle}</option>)}
        </select>
      </label>}
      <ul className="liste-quartiers">
        {tries.map(({ id, ajoute, f, p }) => (
          <li key={id} className="carte-quartier">
            <div className="carte-quartier-entete">
              <div>
                <b>{p.ni}</b>
                <span className="discret"> · {p.nc}</span>
              </div>
              {estSelectionne(p, filtres, budgets)
                ? <span className="tag">dans les filtres</span> : <span className="tag tag-neutre">hors filtres</span>}
            </div>
            <dl className="mesures">
              <Mesure titre="Ancien" valeur={p.pa} unite="€/m²" ind="pa" />
              <Mesure titre="Neuf" valeur={p.pv} unite="€/m²" ind="pv" />
              <Mesure titre={`Trajet${dest ? ` → ${dest}` : ''}`} valeur={p.tt ?? null} unite="min" ind="tt" />
              <Mesure titre="Revenu médian" valeur={p.rv} unite="€" ind="rv" />
            </dl>
            <p className="discret petit">Station : {p.sa ?? '—'} à {fmt(p.da)} m · enregistré le {new Date(ajoute).toLocaleDateString('fr-FR')}</p>
            <LiensQuartier p={p} centre={centreGeometrie(f.geometry)} filtres={filtres} budgets={budgets} />
            <ListeAnnonces annonces={annonces.filter((a) => a.iris === id)} median={p.pa} />
            <div className="actions">
              <button type="button" className="bouton bouton-petit" onClick={() => voir(f)}>Voir sur la carte</button>
              <button type="button" className="bouton bouton-petit" onClick={() => nouvelleAnnonce(id)}>＋ Annonce</button>
              <button type="button" className="lien lien-danger" onClick={() => retirer(id)}>Retirer</button>
            </div>
          </li>
        ))}
      </ul>
      {lignes.length < enregistres.length && (
        <p className="note">{enregistres.length - lignes.length} quartier(s) enregistré(s) introuvable(s) dans les données
          actuelles (découpage IRIS modifié ?).</p>
      )}
      <AideFavori />
    </>
  )
}

function Mesure({ titre, valeur, unite, ind }: { titre: string; valeur: number | null; unite: string; ind: 'pa' | 'pv' | 'rv' | 'tt' }) {
  return (
    <div>
      <dt>{titre}</dt>
      <dd><span className="puce" style={{ background: couleurDe(ind, valeur) }} />{valeur == null ? '—' : `${fmt(valeur)} ${unite}`}</dd>
    </div>
  )
}

/** Budget du quartier (le plus haut entre ancien et neuf : profil de financement selon la zone, sinon curseurs). */
function LiensQuartier({ p, centre, filtres, budgets }: { p: IrisCalcule; centre: [number, number] | null
                                                          filtres: Filtres; budgets: Budgets | null }) {
  if (!centre) return null
  const z = p.z && p.z !== 'C' ? p.z : null
  const prixMax = budgets ? (z ? Math.max(budgets.ancien[z].prix, budgets.neuf[z].prix) : 0) : Math.max(filtres.ba, filtres.bv)
  if (prixMax <= 0) return null
  return <LiensAnnonces codeInsee={p.id.slice(0, 5)} critere={{ commune: p.nc, centre, prixMax, surfaceMin: filtres.su }} />
}
