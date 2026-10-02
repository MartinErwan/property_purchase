import { useEffect, useRef, useState } from 'react'
import { nouvelleAnnonce, useAnnonces } from '../annonces'
import { useRessources } from '../donnees/store'
import { useQuartiers } from '../quartiers'
import { fmt } from '../logique/echelles'
import { codeFavori, ecartMedian, prixM2, siteDe, urlSure, type Annonce, type Brouillon } from '../logique/annonce'

/** Annonces enregistrées d'un quartier (ou « à classer »), avec comparaison au prix médian ancien du quartier. */
export function ListeAnnonces({ annonces, median }: { annonces: Annonce[]; median: number | null }) {
  if (!annonces.length) return null
  return (
    <ul className="liste-annonces">
      {annonces.map((a) => <CarteAnnonce key={a.id} a={a} median={median} />)}
    </ul>
  )
}

function CarteAnnonce({ a, median }: { a: Annonce; median: number | null }) {
  const [sansImage, setSansImage] = useState(false)
  const m2 = prixM2(a)
  const ecart = ecartMedian(a, median)
  const details = [a.prix && `${fmt(a.prix)} €`, a.surface && `${fmt(a.surface)} m²`, a.pieces && `${a.pieces} p.`,
    m2 && `${fmt(m2)} €/m²`].filter(Boolean).join(' · ')
  return (
    <li className="annonce">
      {a.image && !sansImage
        // Photo affichée depuis le site d'origine (non copiée) ; disparaît si l'annonce est retirée.
        ? <img src={a.image} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setSansImage(true)} />
        : <div className="annonce-sans-photo" aria-hidden="true">🏠</div>}
      <div className="annonce-corps">
        <a href={a.url} target="_blank" rel="noopener noreferrer" className="annonce-titre">{a.titre || 'Annonce'} ↗</a>
        <span className="discret petit">{a.site}</span>
        {details && <span className="annonce-details">{details}</span>}
        {ecart != null && (
          <span className={`tag ${ecart <= 0 ? 'tag-bon' : 'tag-neutre'}`} title="Prix au m² de l'annonce comparé au prix médian des ventes anciennes du quartier (24 mois)">
            {ecart > 0 ? '+' : '−'}{Math.abs(Math.round(ecart * 100))} % vs médian
          </span>
        )}
        {a.note && <p className="annonce-note">{a.note}</p>}
        <div className="annonce-actions">
          <button type="button" className="lien" onClick={() => useAnnonces.getState().ouvrir(a)}>Modifier</button>
          <button type="button" className="lien lien-danger" onClick={() => useAnnonces.getState().retirer(a.id)}>Retirer</button>
        </div>
      </div>
    </li>
  )
}

const champNombre = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')))

/** Formulaire d'annonce (fenêtre modale) : préremplie par le favori ou le partage, toujours vérifiée par l'utilisateur. */
export function FormulaireAnnonce() {
  const brouillon = useAnnonces((a) => a.brouillon)
  const fenetre = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = fenetre.current
    if (!d) return
    if (brouillon && !d.open) d.showModal()
    if (!brouillon && d.open) d.close()
  }, [brouillon])
  return (
    <dialog ref={fenetre} className="fenetre" onClose={() => useAnnonces.getState().fermer()} aria-label="Annonce">
      {brouillon && <Champs key={brouillon.id ?? 'nouvelle'} initial={brouillon} />}
    </dialog>
  )
}

function Champs({ initial }: { initial: Brouillon }) {
  const [b, setB] = useState(initial)
  const quartiers = useQuartiers((q) => q.enregistres)
  const donnees = useRessources((r) => r.donnees)
  const nom = (id: string) => {
    const p = donnees?.iris.features.find((f) => f.properties.id === id)?.properties
    return p ? `${p.ni} · ${p.nc}` : id
  }
  const url = urlSure(b.url)
  const image = urlSure(b.image)
  const maj = (champ: Partial<Brouillon>) => setB((x) => ({ ...x, ...champ }))
  const preRempli = !initial.id && (initial.prix != null || initial.surface != null || !!initial.titre)

  const valider = (e: React.FormEvent) => {
    e.preventDefault()
    if (!url) return
    useAnnonces.getState().enregistrer({ ...b, url, image, site: siteDe(url), titre: b.titre.trim(), note: b.note.trim() })
  }

  return (
    <form className="formulaire-annonce" onSubmit={valider}>
      <header>
        <h2>{initial.id ? "Modifier l'annonce" : 'Enregistrer une annonce'}</h2>
        <button type="button" className="bouton-icone" onClick={() => useAnnonces.getState().fermer()} aria-label="Fermer">×</button>
      </header>
      {preRempli && <p className="encart">Rempli à partir de la page de l'annonce : vérifie le prix et la surface.</p>}
      {image && <img className="apercu" src={image} alt="" referrerPolicy="no-referrer" />}
      <label>Lien de l'annonce
        <input type="url" required value={b.url} placeholder="https://www.leboncoin.fr/ad/…" onChange={(e) => maj({ url: e.target.value })} />
      </label>
      {b.url && !url && <span className="erreur petit">Adresse invalide (elle doit commencer par https://).</span>}
      <label>Titre
        <input value={b.titre} maxLength={160} placeholder="Appartement 3 pièces…" onChange={(e) => maj({ titre: e.target.value })} />
      </label>
      <div className="trio">
        <label>Prix (€)
          <input type="number" inputMode="numeric" min={0} step={1000} value={b.prix ?? ''} onChange={(e) => maj({ prix: champNombre(e.target.value) })} />
        </label>
        <label>Surface (m²)
          <input type="number" inputMode="decimal" min={0} step="any" value={b.surface ?? ''} onChange={(e) => maj({ surface: champNombre(e.target.value) })} />
        </label>
        <label>Pièces
          <input type="number" inputMode="numeric" min={1} max={20} value={b.pieces ?? ''} onChange={(e) => maj({ pieces: champNombre(e.target.value) })} />
        </label>
      </div>
      {b.prix && b.surface ? <span className="discret petit">{fmt(Math.round(b.prix / b.surface))} €/m²</span> : null}
      <label>Quartier
        <select value={b.iris ?? ''} onChange={(e) => maj({ iris: e.target.value || null })}>
          <option value="">À classer</option>
          {quartiers.map((q) => <option key={q.id} value={q.id}>{nom(q.id)}</option>)}
        </select>
      </label>
      <label>Note
        <textarea value={b.note} maxLength={2000} rows={3} placeholder="Visite, étage, travaux…" onChange={(e) => maj({ note: e.target.value })} />
      </label>
      <label>Photo (adresse de l'image, facultatif)
        <input type="url" value={b.image ?? ''} onChange={(e) => maj({ image: e.target.value || null })} />
      </label>
      <div className="actions">
        <button type="button" className="lien" onClick={() => useAnnonces.getState().fermer()}>Annuler</button>
        <button type="submit" className="bouton bouton-principal bouton-petit" disabled={!url}>Enregistrer</button>
      </div>
    </form>
  )
}

/** Explique comment enregistrer une annonce depuis un site : favori (ordinateur, navigateur mobile), partage Android. */
export function AideFavori() {
  const lien = useRef<HTMLAnchorElement>(null)
  const code = codeFavori(window.location.origin)
  const [copie, setCopie] = useState(false)
  // React refuse les liens « javascript: » dans href : on le pose directement sur l'élément.
  useEffect(() => { lien.current?.setAttribute('href', code) }, [code])
  const copier = () => navigator.clipboard?.writeText(code).then(() => setCopie(true), () => setCopie(false))
  return (
    <details className="aide-favori">
      <summary>Enregistrer une annonce depuis Leboncoin, SeLoger…</summary>
      <p><b>Sur ordinateur</b> : fais glisser ce bouton dans ta barre de favoris, puis clique dessus sur la page d'une
        annonce. L'application s'ouvre avec le titre, le prix, la surface et la photo de l'annonce.</p>
      <p><a ref={lien} className="bouton bouton-petit favori" onClick={(e) => e.preventDefault()}>☆ Où acheter</a></p>
      <p><b>Sur téléphone, dans le navigateur</b> : crée un favori nommé « Où acheter » et remplace son adresse par
        ce code. Sur une annonce, tape « Où acheter » dans la barre d'adresse (Chrome) ou ouvre-le depuis les favoris
        (Safari).</p>
      <p><button type="button" className="bouton bouton-petit" onClick={copier}>{copie ? 'Code copié ✓' : 'Copier le code du favori'}</button></p>
      <p><b>Depuis l'appli Leboncoin ou SeLoger (Android)</b> : installe Où acheter sur l'écran d'accueil, puis
        « Partager » → « Où acheter ». Seuls le titre et le lien sont transmis : complète le prix et la surface.</p>
      <p><b>Sinon</b> : <button type="button" className="lien" onClick={() => nouvelleAnnonce(null)}>colle le lien</button> et
        saisis les informations.</p>
      <p className="discret petit">Le favori lit la page que tu as ouverte, dans ton navigateur : l'application ne
        télécharge jamais les sites d'annonces. La photo n'est pas copiée, elle s'affiche depuis le site d'origine.
        Installe-le depuis l'adresse habituelle de l'application : il ouvre toujours celle d'où il a été copié.</p>
    </details>
  )
}
