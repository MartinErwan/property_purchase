import { useEffect, useState } from 'react'
import { codePostal } from '../logique/adresse'
import { idSeloger, lienBienici, lienLeboncoin, lienSeloger, type CritereAnnonce } from '../logique/annonces'

/** Boutons « Voir les annonces » : recherche préremplie (quartier, budget, surface) sur les sites d'annonces. */
export function LiensAnnonces({ critere, codeInsee }: { critere: CritereAnnonce; codeInsee: string }) {
  const [cp, setCp] = useState<string | null>(null)
  useEffect(() => {
    let annule = false
    codePostal(codeInsee, critere.commune).then((c) => { if (!annule) setCp(c) })
    return () => { annule = true }
  }, [codeInsee, critere.commune])

  const seloger = idSeloger(codeInsee)
  return (
    <div className="annonces">
      <span className="discret petit">Annonces ≤ {Math.round(critere.prixMax / 1000)} k€, ≥ {critere.surfaceMin} m² :</span>
      <a className="bouton bouton-petit" href={lienLeboncoin(critere)} target="_blank" rel="noopener noreferrer">Leboncoin ↗</a>
      {seloger && <a className="bouton bouton-petit" href={lienSeloger(critere, seloger)} target="_blank" rel="noopener noreferrer">SeLoger ↗</a>}
      {cp && <a className="bouton bouton-petit" href={lienBienici(critere, cp)} target="_blank" rel="noopener noreferrer">Bien'ici ↗</a>}
    </div>
  )
}
