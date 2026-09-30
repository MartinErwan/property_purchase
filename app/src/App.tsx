import { useCallback, useEffect, useRef, useState } from 'react'
import type { Map as CarteMapLibre } from 'maplibre-gl'
import { Carte } from './carte/Carte'
import { Infobulle } from './carte/Infobulle'
import { useSynchroCarte } from './carte/useSynchroCarte'
import { chargerDonnees, chargerMatrice, chargerMetaTrajet } from './donnees/chargement'
import { useRessources } from './donnees/store'
import { useEtat } from './etat'
import { decoder } from './logique/url'
import { RECHERCHE_INITIALE } from './compte/retourConnexion'
import { useSynchroCompte } from './compte/useSynchroCompte'
import { useVentes } from './compte/useVentes'
import { useVueEncodee } from './vue'
import { FicheQuartier } from './panneaux/FicheQuartier'
import { PanneauCarte } from './panneaux/PanneauCarte'
import { PanneauCompte } from './panneaux/PanneauCompte'
import { PanneauFiltres } from './panneaux/PanneauFiltres'
import { PanneauFinancement } from './panneaux/PanneauFinancement'
import { PanneauTrajet } from './panneaux/PanneauTrajet'
import { ONGLETS, type Onglet } from './ui/definitionOnglets'
import { BarreOnglets } from './ui/onglets'
import { RechercheVille } from './ui/RechercheVille'
import { Tiroir, type Hauteur } from './ui/Tiroir'
import { useEcranLarge } from './ui/useEcranLarge'

const PANNEAUX: Record<Onglet, () => React.ReactElement> = {
  carte: PanneauCarte, filtres: PanneauFiltres, financement: PanneauFinancement, trajet: PanneauTrajet, compte: PanneauCompte,
}

/** Chargement des données au démarrage, puis de la matrice de l'horizon choisi à la demande. */
function useChargement(): void {
  const horizon = useEtat((e) => e.horizon)
  const donnees = useRessources((r) => r.donnees)

  useEffect(() => {
    let annule = false
    ;(async () => {
      try {
        const d = await chargerDonnees()
        if (annule) return
        // Valeurs par défaut du manifeste, puis état de l'URL par-dessus.
        const url = decoder(RECHERCHE_INITIALE)
        const etat = useEtat.getState()
        etat.initialiser(d.manifeste)
        if (url.filtres) etat.majFiltres(url.filtres)
        etat.set({ ind: url.ind ?? etat.ind, horizon: url.horizon ?? 'actuel', irisChoisi: url.iris ?? null })
        useRessources.setState({ donnees: d })
        const meta = await chargerMetaTrajet(d.manifeste)
        if (annule) return
        const dest = url.destination?.type === 'pole' && !meta.poles[url.destination.pole] ? undefined : url.destination
        useRessources.setState({ meta })
        useEtat.getState().set({ destination: dest ?? { type: 'pole', pole: meta.pole_defaut } })
      } catch (e) {
        if (!annule) useRessources.setState({ erreur: (e as Error).message })
      }
    })()
    return () => { annule = true }
  }, [])

  useEffect(() => {
    if (!donnees || useRessources.getState().matrices[horizon]) return
    const meta = useRessources.getState().meta
    const cle = donnees.manifeste.fichiers[`trajet_${horizon}`] ? horizon : 'actuel'
    chargerMatrice(donnees.manifeste, cle)
      .then((octets) => {
        const nbPoles = donnees.manifeste.fichiers[`trajet_${cle}`].forme![1]
        useRessources.setState((r) => ({ matrices: { ...r.matrices, [horizon]: { octets, nbPoles } } }))
        if (meta && meta.poles.length !== nbPoles) console.warn('Matrice et pôles incohérents')
      })
      .catch((e: Error) => useRessources.setState({ erreur: e.message }))
  }, [donnees, horizon])
}

/** L'adresse de la page reflète l'état (lien partageable), sans créer d'entrée d'historique. */
function useSynchroUrl(): void {
  const q = useVueEncodee()
  useEffect(() => {
    if (q == null) return
    const minuteur = setTimeout(() => window.history.replaceState(null, '', q ? `?${q}` : window.location.pathname), 300)
    return () => clearTimeout(minuteur)
  }, [q])
}

export default function App() {
  const large = useEcranLarge()
  const [onglet, setOnglet] = useState<Onglet>('filtres')
  const [tiroir, setTiroir] = useState<{ ouvert: boolean; hauteur: Hauteur }>({ ouvert: false, hauteur: 'mi' })
  const erreur = useRessources((r) => r.erreur)
  const donnees = useRessources((r) => r.donnees)
  const irisChoisi = useEtat((e) => e.irisChoisi)
  const nomIris = donnees?.iris.features.find((f) => f.properties.id === irisChoisi)?.properties.ni
  const fermerFiche = () => useEtat.getState().set({ irisChoisi: null })

  useChargement()
  useSynchroCarte()
  useSynchroUrl()
  useSynchroCompte()
  useVentes()

  const surPrete = useCallback((c: CarteMapLibre) => useRessources.setState({ carte: c }), [])

  // Mobile : ouvrir la fiche d'un quartier touché sur la carte.
  const dernierIris = useRef<string | null>(null)
  useEffect(() => {
    if (irisChoisi && irisChoisi !== dernierIris.current && !large) setTiroir((t) => ({ ouvert: true, hauteur: t.ouvert ? t.hauteur : 'mi' }))
    dernierIris.current = irisChoisi
  }, [irisChoisi, large])

  const choisirOnglet = (o: Onglet) => {
    fermerFiche()
    if (large) { setOnglet(o); return }
    if (o === 'carte' && onglet === 'carte' && tiroir.ouvert) { setTiroir({ ...tiroir, ouvert: false }); return }
    if (o === onglet && tiroir.ouvert) { setTiroir({ ...tiroir, ouvert: false }); return }
    setOnglet(o)
    setTiroir({ ouvert: true, hauteur: tiroir.ouvert ? tiroir.hauteur : 'mi' })
  }

  const Panneau = PANNEAUX[onglet]
  const titre = ONGLETS.find((o) => o.id === onglet)!.libelle
  const contenu = !donnees ? <Attente erreur={erreur} /> : <Panneau />

  return (
    <div className={`app ${large ? 'app-large' : 'app-mobile'}`}>
      {large && (
        <aside className="panneau">
          <header className="panneau-entete">
            <h1>Où acheter en Île-de-France</h1>
            <BarreOnglets actif={onglet} surChoix={choisirOnglet} />
          </header>
          <div className="panneau-contenu">{contenu}</div>
        </aside>
      )}
      <main className="zone-carte">
        <Carte surPrete={surPrete} />
        <RechercheVille />
        <Infobulle survolActif={large} />
        {large && irisChoisi && (
          <aside className="fiche-flottante" aria-label={`Quartier ${nomIris ?? ''}`}>
            <header><h2>{nomIris}</h2><button type="button" className="bouton-icone" onClick={fermerFiche} aria-label="Fermer la fiche">×</button></header>
            <FicheQuartier id={irisChoisi} />
          </aside>
        )}
        {erreur && <div className="bandeau-erreur" role="alert">{erreur}</div>}
      </main>
      {!large && tiroir.ouvert && (
        irisChoisi
          ? <Tiroir titre={nomIris ?? 'Quartier'} hauteur={tiroir.hauteur} surHauteur={(h) => setTiroir({ ouvert: true, hauteur: h })}
              surFermer={() => { fermerFiche(); setTiroir({ ...tiroir, ouvert: false }) }}>
              <FicheQuartier id={irisChoisi} />
            </Tiroir>
          : <Tiroir titre={titre} hauteur={tiroir.hauteur} surHauteur={(h) => setTiroir({ ouvert: true, hauteur: h })}
              surFermer={() => setTiroir({ ...tiroir, ouvert: false })}>
              {contenu}
            </Tiroir>
      )}
      {!large && <BarreOnglets actif={tiroir.ouvert && !irisChoisi ? onglet : null} surChoix={choisirOnglet} />}
    </div>
  )
}

function Attente({ erreur }: { erreur: string | null }) {
  return erreur ? <p className="etat erreur">Impossible de charger les données : {erreur}</p> : <p className="etat discret">Chargement des données…</p>
}
