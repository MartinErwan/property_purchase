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
import { useQuartiers } from './quartiers'
import { useNavigation, type Page } from './navigation'
import { FicheQuartier } from './panneaux/FicheQuartier'
import { PageQuartiers } from './panneaux/PageQuartiers'
import { PanneauCartographie } from './panneaux/PanneauCartographie'
import { PanneauCompte } from './panneaux/PanneauCompte'
import { PanneauFinancement } from './panneaux/PanneauFinancement'
import { FormulaireAnnonce } from './panneaux/Annonces'
import { useAnnonces } from './annonces'
import { BROUILLON_INITIAL } from './entreeAnnonce'
import { BarreOnglets } from './ui/onglets'
import { ResumeFiltres } from './ui/ResumeFiltres'
import { RechercheVille } from './ui/RechercheVille'
import { Tiroir, type Hauteur } from './ui/Tiroir'
import { useEcranLarge } from './ui/useEcranLarge'

// Ouverture par le favori ou le partage (/ajout?…) : formulaire prérempli, rattaché au quartier affiché s'il est enregistré.
if (BROUILLON_INITIAL) {
  const iris = new URLSearchParams(window.location.search).get('iris')
  useAnnonces.getState().ouvrir({ ...BROUILLON_INITIAL, iris: iris && useQuartiers.getState().estEnregistre(iris) ? iris : null })
}

/** Pages autres que la carte : plein écran sur mobile, dans le panneau latéral sur ordinateur. */
const PAGES: Record<Exclude<Page, 'carte'>, { titre: string; Contenu: () => React.ReactElement }> = {
  quartiers: { titre: 'Mes quartiers', Contenu: PageQuartiers },
  financement: { titre: 'Financement', Contenu: PanneauFinancement },
  compte: { titre: 'Compte', Contenu: PanneauCompte },
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
  const page = useNavigation((n) => n.page)
  const naviguer = useNavigation((n) => n.naviguer)
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

  // Mobile : ouvrir la fiche d'un quartier touché sur la carte (ou choisi dans « Mes quartiers »).
  const dernierIris = useRef<string | null>(null)
  useEffect(() => {
    if (irisChoisi && irisChoisi !== dernierIris.current && !large) setTiroir((t) => ({ ouvert: true, hauteur: t.ouvert ? t.hauteur : 'mi' }))
    dernierIris.current = irisChoisi
  }, [irisChoisi, large])

  const ouvrirReglages = () => { fermerFiche(); setTiroir((t) => ({ ouvert: true, hauteur: t.ouvert ? t.hauteur : 'mi' })) }
  const charge = (contenu: React.ReactElement) => (!donnees ? <Attente erreur={erreur} /> : contenu)
  const pageCourante = page === 'carte' ? null : PAGES[page]

  return (
    <div className={`app ${large ? 'app-large' : 'app-mobile'}`}>
      {large && (
        <aside className="panneau">
          <header className="panneau-entete">
            <h1>Où acheter en Île-de-France</h1>
            <BarreOnglets actif={page} surChoix={naviguer} />
          </header>
          <div className="panneau-contenu">
            {pageCourante && <h2 className="titre-page">{pageCourante.titre}</h2>}
            {charge(pageCourante ? <pageCourante.Contenu /> : <PanneauCartographie />)}
          </div>
        </aside>
      )}
      <main className="zone-carte">
        <Carte surPrete={surPrete} />
        <RechercheVille />
        {!large && page === 'carte' && donnees && (
          <ResumeFiltres surOuvrir={ouvrirReglages} />
        )}
        <Infobulle survolActif={large} />
        {large && irisChoisi && (
          <aside className="fiche-flottante" aria-label={`Quartier ${nomIris ?? ''}`}>
            <header><h2>{nomIris}</h2><button type="button" className="bouton-icone" onClick={fermerFiche} aria-label="Fermer la fiche">×</button></header>
            <FicheQuartier id={irisChoisi} />
          </aside>
        )}
        {erreur && <div className="bandeau-erreur" role="alert">{erreur}</div>}
        {!large && pageCourante && (
          <section className="page-mobile" aria-label={pageCourante.titre}>
            <h1 className="titre-page">{pageCourante.titre}</h1>
            {charge(<pageCourante.Contenu />)}
          </section>
        )}
      </main>
      {!large && page === 'carte' && tiroir.ouvert && (
        irisChoisi
          ? <Tiroir titre={nomIris ?? 'Quartier'} hauteur={tiroir.hauteur} surHauteur={(h) => setTiroir({ ouvert: true, hauteur: h })}
              surFermer={() => { fermerFiche(); setTiroir({ ...tiroir, ouvert: false }) }}>
              <FicheQuartier id={irisChoisi} />
            </Tiroir>
          : <Tiroir titre="Réglages de la carte" hauteur={tiroir.hauteur} surHauteur={(h) => setTiroir({ ouvert: true, hauteur: h })}
              surFermer={() => setTiroir({ ...tiroir, ouvert: false })}>
              {charge(<PanneauCartographie />)}
            </Tiroir>
      )}
      <FormulaireAnnonce />
      {!large && <BarreOnglets actif={page} surChoix={(p) => {
        if (p === 'carte' && page === 'carte') { if (tiroir.ouvert) setTiroir({ ...tiroir, ouvert: false }); else ouvrirReglages() }
        naviguer(p)
      }} />}
    </div>
  )
}

function Attente({ erreur }: { erreur: string | null }) {
  return erreur ? <p className="etat erreur">Impossible de charger les données : {erreur}</p> : <p className="etat discret">Chargement des données…</p>
}
