import { useId, useState, type ReactNode } from 'react'

interface Props<T> {
  valeur: string
  surSaisie: (texte: string) => void
  resultats: T[]
  surChoix: (r: T) => void
  rendu: (r: T) => ReactNode
  cle: (r: T) => string
  placeholder?: string
  libelle: string
  aucun?: string
  className?: string
  surFocus?: () => void
  surBlur?: () => void
}

/** Champ de recherche avec liste de suggestions (clavier : flèches, Entrée, Échap). */
export function Suggestions<T>({ valeur, surSaisie, resultats, surChoix, rendu, cle, placeholder, libelle, aucun,
                                  className, surFocus, surBlur }: Props<T>) {
  const id = useId()
  const [actif, setActif] = useState(0)
  const [ouvert, setOuvert] = useState(false)
  const visible = ouvert && (resultats.length > 0 || (!!aucun && valeur.trim() !== ''))

  const choisir = (r: T) => { surChoix(r); setOuvert(false) }

  return (
    <div className={`suggestions-champ ${className ?? ''}`}>
      <input type="search" value={valeur} placeholder={placeholder} aria-label={libelle} autoComplete="off"
        role="combobox" aria-expanded={visible} aria-controls={id} enterKeyHint="search"
        aria-activedescendant={visible && resultats.length ? `${id}-${actif}` : undefined}
        onChange={(e) => { surSaisie(e.target.value); setActif(0); setOuvert(true) }}
        onFocus={(e) => { e.target.select(); setOuvert(true); surFocus?.() }}
        onBlur={() => setTimeout(() => { setOuvert(false); surBlur?.() }, 120)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && resultats.length) { setActif((actif + 1) % resultats.length); e.preventDefault() }
          else if (e.key === 'ArrowUp' && resultats.length) { setActif((actif - 1 + resultats.length) % resultats.length); e.preventDefault() }
          else if (e.key === 'Enter' && resultats.length) { choisir(resultats[Math.min(actif, resultats.length - 1)]); (e.target as HTMLInputElement).blur(); e.preventDefault() }
          else if (e.key === 'Escape') { setOuvert(false); (e.target as HTMLInputElement).blur() }
        }} />
      {visible && (
        <ul id={id} role="listbox" className="suggestions">
          {resultats.map((r, k) => (
            <li key={cle(r)} id={`${id}-${k}`} role="option" aria-selected={k === actif}
              onMouseDown={(e) => { e.preventDefault(); choisir(r) }}>
              {rendu(r)}
            </li>
          ))}
          {!resultats.length && <li aria-disabled="true"><small>{aucun}</small></li>}
        </ul>
      )}
    </div>
  )
}
