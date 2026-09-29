import { useEtat, type Couches } from '../etat'
import { useRessources } from '../donnees/store'
import { ECHELLES, ENCRE, SANS_DONNEE, fmt, type Indicateur } from '../logique/echelles'

function LegendeCouleurs({ ind }: { ind: Indicateur }) {
  const { seuils, unite, couleurs, sansDonnee } = ECHELLES[ind]
  return (
    <ul className="legende">
      {couleurs.map((c, k) => (
        <li key={c}>
          <span className="pastille" style={{ background: c }} />
          {k === 0 ? `moins de ${fmt(seuils[0])} ${unite}`
            : k === couleurs.length - 1 ? `${fmt(seuils[k - 1])} ${unite} et plus`
            : `${fmt(seuils[k - 1])} – ${fmt(seuils[k])} ${unite}`}
        </li>
      ))}
      <li><span className="pastille" style={{ background: SANS_DONNEE }} />{sansDonnee}</li>
      <li><span className="pastille" style={{ background: 'transparent' }} />Transparent = hors filtres</li>
    </ul>
  )
}

const SYMBOLES: [string, () => React.ReactElement][] = [
  ['Ligne en service (couleur officielle : RER, métro, tram, Transilien, câble)',
    () => <svg viewBox="0 0 28 20"><g strokeWidth="3" strokeLinecap="round"><path d="M2 5h24" stroke="#eb2132" />
      <path d="M2 10h24" stroke="#5091cb" /><path d="M2 15h24" stroke="#ffbe00" /></g></svg>],
  ['Station (cerclée de la couleur de sa ligne)',
    () => <svg viewBox="0 0 28 20"><path d="M0 10h28" stroke="#5091cb" strokeWidth="3" />
      <circle cx="14" cy="10" r="3.5" fill="#fff" stroke="#5091cb" strokeWidth="1.8" /></svg>],
  ['Station de correspondance',
    () => <svg viewBox="0 0 28 20"><circle cx="14" cy="10" r="4.5" fill="#fff" stroke={ENCRE} strokeWidth="1.8" /></svg>],
  ['Ligne en projet (GPE 15 à 18, tram, RER E) en tirets',
    () => <svg viewBox="0 0 28 20"><g strokeWidth="3" strokeDasharray="4 2.4"><path d="M2 6h24" stroke="#a50034" />
      <path d="M2 14h24" stroke="#ff82b4" /></g></svg>],
  ['Gare ou station future',
    () => <svg viewBox="0 0 28 20"><circle cx="14" cy="10" r="5.5" fill="#a50034" stroke={ENCRE} strokeWidth="2.6" /></svg>],
  ['Limite de commune',
    () => <svg viewBox="0 0 28 20"><path d="M2 10h24" stroke="#fff" strokeWidth="4" /><path d="M2 10h24" stroke="#3d3c38" strokeWidth="2" /></svg>],
  ['Limite de quartier (IRIS), visible en zoomant',
    () => <svg viewBox="0 0 28 20"><rect x="3" y="3" width="22" height="14" fill="none" stroke="#5c5b57" strokeWidth=".8" /></svg>],
  ['Quartier prioritaire (QPV 2024)',
    () => <svg viewBox="0 0 28 20"><defs><pattern id="hach" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <path d="M0 0v5" stroke={ENCRE} strokeWidth="1.1" /></pattern></defs>
      <rect x="2" y="2" width="24" height="16" fill="url(#hach)" stroke={ENCRE} strokeWidth="1.4" /></svg>],
  ['Limite des 300 m autour d\'un QPV',
    () => <svg viewBox="0 0 28 20"><path d="M2 10h24" stroke={ENCRE} strokeWidth="1.4" strokeDasharray="3 2" /></svg>],
  ['Destination du temps de trajet',
    () => <svg viewBox="0 0 28 20"><circle cx="14" cy="10" r="6" fill={ENCRE} stroke="#fff" strokeWidth="2.5" /></svg>],
]

const CASES: [keyof Couches, string][] = [
  ['stations', 'Lignes et stations en service'],
  ['futures', 'Gares et stations futures'],
  ['qpv', 'QPV et tampon 300 m'],
  ['ventes', 'Ventes des 24 derniers mois'],
]

export function PanneauCarte() {
  const { ind, couches, set, majCouches } = useEtat()
  const donnees = useRessources((r) => r.donnees)
  const sansQpv = !donnees?.qpv

  return (
    <>
      <h3>Couleur des quartiers retenus</h3>
      <select value={ind} onChange={(e) => set({ ind: e.target.value as Indicateur })} aria-label="Indicateur de couleur">
        {(Object.keys(ECHELLES) as Indicateur[]).map((k) => <option key={k} value={k}>{ECHELLES[k].libelle}</option>)}
      </select>
      <LegendeCouleurs ind={ind} />

      <h3>Couches</h3>
      {CASES.map(([cle, libelle]) => {
        const indisponible = (cle === 'qpv' && sansQpv) || cle === 'ventes'
        return (
          <label key={cle} className="case">
            <input type="checkbox" checked={couches[cle] && !indisponible} disabled={indisponible}
              onChange={(e) => majCouches({ [cle]: e.target.checked })} />
            <span>{libelle}
              {cle === 'ventes' && <small className="discret"> — réservé aux utilisateurs connectés (bientôt)</small>}
              {cle === 'qpv' && sansQpv && <small className="discret"> — non disponible dans ces données</small>}
            </span>
          </label>
        )
      })}

      <h3>Légende</h3>
      <ul className="legende symboles">
        {SYMBOLES.map(([txt, Dessin]) => <li key={txt}><Dessin />{txt}</li>)}
      </ul>

      <Sources />
    </>
  )
}

export function Sources() {
  const donnees = useRessources((r) => r.donnees)
  const periode = donnees?.manifeste.periode_24m.replace(' / ', ' → ')
  return (
    <p className="note">
      Ventes {periode} (DVF, appartements, dépendances incluses) ; prix médian calculé à partir de 5 ventes ;
      budget hors frais de notaire. Distances à vol d'oiseau. Revenus : Filosofi 2021 (INSEE), IRIS 2022.
      Transports : IDFM (dates de mise en service des projets estimées par IDFM). QPV 2024 : ANCT. Le tampon de
      300 m est le périmètre de TVA à 5,5 % en accession (conditions de ressources, non vérifiées ici).
      Fond : Plan IGN. Données générées le {donnees ? new Date(donnees.manifeste.genere_le).toLocaleDateString('fr-FR') : '—'}.
    </p>
  )
}
