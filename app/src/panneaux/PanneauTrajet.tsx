import { useEffect, useMemo, useState } from 'react'
import { useEtat } from '../etat'
import { useRessources } from '../donnees/store'
import { chercher, indexer } from '../logique/recherche'
import { chercherAdresses, type Adresse } from '../logique/adresse'
import { libelleDestination, polesArrivee, type Destination } from '../logique/trajet'
import { Suggestions } from '../ui/Suggestions'
import { CURSEUR_TRAJET } from './curseurs'
import { Compteur, LigneCurseur } from './PanneauFiltres'

type Choix = { type: 'pole'; k: number; nom: string; detail: string } | { type: 'adresse'; a: Adresse }

export function PanneauTrajet() {
  const { destination, horizon, set } = useEtat()
  const meta = useRessources((r) => r.meta)
  const matrices = useRessources((r) => r.matrices)
  const [texte, setTexte] = useState<string | null>(null) // null = afficher la destination courante
  const [adresses, setAdresses] = useState<Adresse[]>([])
  const [erreurAdresse, setErreurAdresse] = useState<string | null>(null)

  const index = useMemo(() => indexer(
    (meta?.poles ?? []).map((p, k) => ({ k, nom: p.n, stations: p.s, desservi: p.d })).filter((p) => p.desservi),
    (p) => p.stations.replaceAll(' / ', ' ')), [meta])

  // Adresses : requête au service de géocodage, après une courte pause dans la frappe.
  useEffect(() => {
    if (!texte || texte.trim().length < 3) return
    const ctrl = new AbortController()
    const minuteur = setTimeout(() => {
      chercherAdresses(texte, ctrl.signal)
        .then((a) => { setAdresses(a); setErreurAdresse(null) })
        .catch((e: Error) => { if (e.name !== 'AbortError') setErreurAdresse('Recherche d\'adresse indisponible') })
    }, 250)
    return () => { clearTimeout(minuteur); ctrl.abort() }
  }, [texte])

  const resultats: Choix[] = useMemo(() => [
    ...chercher(index, texte ?? '', 5, (a, b) => a.nom.localeCompare(b.nom, 'fr'))
      .map((p) => ({ type: 'pole' as const, k: p.k, nom: p.nom, detail: p.stations !== p.nom ? p.stations : 'gare / station' })),
    ...(texte && texte.trim().length >= 3 ? adresses : []).map((a) => ({ type: 'adresse' as const, a })),
  ], [index, texte, adresses])

  const choisir = (c: Choix) => {
    if (c.type === 'pole') set({ destination: { type: 'pole', pole: c.k } })
    else {
      const d: Destination = { type: 'adresse', libelle: c.a.libelle, lng: c.a.lng, lat: c.a.lat }
      if (meta && polesArrivee(d, meta.poles).length === 0) { setErreurAdresse('Aucune gare à moins de 2,5 km de cette adresse'); return }
      set({ destination: d })
    }
    setTexte(null)
  }

  const libelle = libelleDestination(destination, meta?.poles)
  const h = meta?.horizons.find((x) => String(x.annee) === horizon)
  const chargement = horizon !== 'actuel' && !matrices[horizon]

  return (
    <>
      <Compteur />
      <h3>Destination</h3>
      <Suggestions valeur={texte ?? libelle} surSaisie={setTexte} resultats={resultats} surChoix={choisir}
        libelle="Destination : gare, station ou adresse" placeholder="Gare, station ou adresse…"
        aucun="Aucune gare ni adresse trouvée" className="champ-panneau"
        cle={(c) => (c.type === 'pole' ? `p${c.k}` : `a${c.a.libelle}`)}
        rendu={(c) => c.type === 'pole'
          ? <><span>🚉 {c.nom}</span><small>{c.detail}</small></>
          : <><span>📍 {c.a.libelle}</span><small>{c.a.contexte}</small></>}
        surBlur={() => setTexte(null)} />
      {erreurAdresse && <p className="etat erreur">{erreurAdresse}</p>}
      {destination?.type === 'adresse' && <p className="etat discret">Adresse reliée à pied aux gares à moins de 2,5 km
        (vol d'oiseau × 1,3 à 4,5 km/h).</p>}

      <h3>Réseau pris en compte</h3>
      <select value={horizon} onChange={(e) => set({ horizon: e.target.value })} aria-label="Réseau pris en compte">
        <option value="actuel">Réseau actuel</option>
        {meta?.horizons.map((x) => <option key={x.annee} value={String(x.annee)}>Avec le Grand Paris Express en {x.annee}</option>)}
      </select>
      {h && <p className="etat discret">Lignes ouvertes : {h.lignes}. Horaires fictifs : un train toutes les 3 min, 55 à 65 km/h.</p>}
      {chargement && <p className="etat discret">Chargement de la matrice…</p>}

      <LigneCurseur c={CURSEUR_TRAJET} />

      <p className="note">Horaires IDFM (GTFS) d'un mardi ordinaire, arrivée entre 8 h 30 et 9 h 15 (moyenne de 4 heures
        d'arrivée), métro, RER, Transilien, TER, tram et câble, correspondances comprises ; plus la marche jusqu'à la
        station (vol d'oiseau × 1,3 à 4,5 km/h). Bus non comptés. Lignes en projet non comptées, sauf le Grand Paris
        Express selon l'horizon choisi (tronçons ouverts à la date estimée par IDFM ; horaires fictifs, hypothèses non
        vérifiées).</p>
    </>
  )
}
