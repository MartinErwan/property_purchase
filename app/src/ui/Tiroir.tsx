import { useRef, useState, type PointerEvent, type ReactNode } from 'react'

export type Hauteur = 'mi' | 'plein'

interface Props {
  titre: string
  hauteur: Hauteur
  surHauteur: (h: Hauteur) => void
  surFermer: () => void
  children: ReactNode
}

const SEUIL_PX = 60 // glissement minimal pour changer de hauteur

/** Tiroir mobile au-dessus de la barre d'onglets : poignée à glisser (mi-hauteur ↔ plein écran ↔ fermé). */
export function Tiroir({ titre, hauteur, surHauteur, surFermer, children }: Props) {
  const depart = useRef<number | null>(null)
  const [decalage, setDecalage] = useState(0)

  const debut = (e: PointerEvent) => {
    depart.current = e.clientY
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const mouvement = (e: PointerEvent) => {
    if (depart.current != null) setDecalage(e.clientY - depart.current)
  }
  const fin = () => {
    if (depart.current == null) return
    if (decalage < -SEUIL_PX) surHauteur('plein')
    else if (decalage > SEUIL_PX) { if (hauteur === 'plein') surHauteur('mi'); else surFermer() }
    else if (Math.abs(decalage) < 4) surHauteur(hauteur === 'mi' ? 'plein' : 'mi') // simple toucher
    depart.current = null
    setDecalage(0)
  }

  return (
    <section className={`tiroir tiroir-${hauteur}`} aria-label={titre}
      style={decalage ? { transform: `translateY(${Math.max(decalage, -40)}px)`, transition: 'none' } : undefined}>
      <div className="tiroir-poignee" role="button" tabIndex={0} aria-label="Agrandir ou réduire le panneau"
        onPointerDown={debut} onPointerMove={mouvement} onPointerUp={fin} onPointerCancel={fin}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') surHauteur(hauteur === 'mi' ? 'plein' : 'mi') }}>
        <span />
      </div>
      <header className="tiroir-entete">
        <h2>{titre}</h2>
        <button type="button" className="bouton-icone" onClick={surFermer} aria-label="Fermer le panneau">×</button>
      </header>
      <div className="tiroir-contenu">{children}</div>
    </section>
  )
}
