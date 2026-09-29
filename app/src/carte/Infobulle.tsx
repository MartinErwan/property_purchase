import { useEffect, useRef, useState } from 'react'
import type { MapGeoJSONFeature } from 'maplibre-gl'
import { useEtat } from '../etat'
import { useRessources } from '../donnees/store'
import { fmt } from '../logique/echelles'
import { libelleDestination, tempsStation } from '../logique/trajet'
import { COUCHES_INTERACTIVES } from './couches'

type Survol = { f: MapGeoJSONFeature; x: number; y: number } | null

/** Au survol (souris) : infobulle courte et contour du quartier ; au clic / toucher : fiche du quartier. */
export function Infobulle({ survolActif }: { survolActif: boolean }) {
  const carte = useRessources((r) => r.carte)
  const donnees = useRessources((r) => r.donnees)
  const [survol, setSurvol] = useState<Survol>(null)
  const quartier = useRef<string | null>(null)

  useEffect(() => {
    if (!carte || !donnees) return
    const couches = () => COUCHES_INTERACTIVES.filter((l) => carte.getLayer(l))
    const ordre = (f: MapGeoJSONFeature) => COUCHES_INTERACTIVES.indexOf(f.layer.id)
    const marquer = (id: string | null) => {
      if (id === quartier.current) return
      if (quartier.current) carte.setFeatureState({ source: 'iris', id: quartier.current }, { survol: false })
      if (id) carte.setFeatureState({ source: 'iris', id }, { survol: true })
      quartier.current = id
    }
    let image = 0
    const bouge = (e: { point: { x: number; y: number } }) => {
      if (!survolActif) return
      cancelAnimationFrame(image)
      image = requestAnimationFrame(() => {
        const trouves = carte.queryRenderedFeatures([e.point.x, e.point.y], { layers: couches() })
        const f = [...trouves].sort((a, b) => ordre(a) - ordre(b))[0]
        carte.getCanvas().style.cursor = f ? 'pointer' : ''
        marquer((trouves.find((t) => t.layer.id === 'iris')?.properties.id as string) ?? null)
        setSurvol(f ? { f, x: e.point.x, y: e.point.y } : null)
      })
    }
    const sort = () => { cancelAnimationFrame(image); setSurvol(null); marquer(null) }
    const clic = (e: { point: { x: number; y: number } }) => {
      const iris = carte.queryRenderedFeatures([e.point.x, e.point.y], { layers: ['iris'] })[0]
      useEtat.getState().set({ irisChoisi: (iris?.properties.id as string) ?? null })
    }
    carte.on('mousemove', bouge)
    carte.on('mouseout', sort)
    carte.on('click', clic)
    return () => { carte.off('mousemove', bouge); carte.off('mouseout', sort); carte.off('click', clic); cancelAnimationFrame(image) }
  }, [carte, donnees, survolActif])

  if (!survol || !carte) return null
  const W = carte.getContainer().clientWidth
  return (
    <div className="infobulle" style={{ left: Math.min(survol.x + 14, W - 308), top: survol.y + 14 }}>
      <Contenu f={survol.f} />
    </div>
  )
}

function Contenu({ f }: { f: MapGeoJSONFeature }) {
  const { destination, horizon } = useEtat()
  const meta = useRessources((r) => r.meta)
  const matrice = useRessources((r) => r.matrices[horizon])
  const p = f.properties
  const dest = libelleDestination(destination, meta?.poles)
  switch (f.layer.id) {
    case 'stations':
    case 'futures': {
      const futur = f.layer.id === 'futures'
      const t = p.k != null && matrice && destination?.type === 'pole' ? tempsStation(matrice, p.k, destination.pole) : null
      return <><b>{p.n}</b><br />{p.l}
        {futur && <><br /><span className="tag">mise en service prévue : {p.ms ?? 'inconnue'}</span> <span className="tag">{p.st}</span></>}
        {destination?.type === 'pole' && (!futur || (horizon !== 'actuel' && t != null)) &&
          <><br />→ {dest} : <b>{t == null ? '—' : `${t} min`}</b></>}</>
    }
    case 'lignes':
      return <><span className="puce" style={{ background: p.c }} /><b>{p.l}</b></>
    case 'lignes-futures':
      return <><span className="puce" style={{ background: p.c }} /><b>{p.l}</b> (en projet)<br />{p.p}<br />
        <span className="tag">mise en service prévue : {p.ms ?? 'inconnue'}</span> <span className="tag">{p.st}</span></>
    case 'ventes':
      return <><b>{fmt(p.p)} €/m²</b> — {p.t === 'a' ? 'ancien' : 'neuf (VEFA)'}<br />{fmt(p.v)} € · {p.s} m² · {p.d}</>
    case 'qpv':
      return <><b>QPV {p.n}</b><br />{p.cm} — {p.c}</>
    case 'destination':
      return <><b>Destination</b><br />{dest}</>
    default:
      return <><b>{p.ni}</b> — {p.nc}<br />
        Ancien {fmt(p.pa)} €/m² · neuf {fmt(p.pv)} €/m²<br />
        Revenu médian {fmt(p.rv)} € · {p.tt == null ? 'trajet —' : `${p.tt} min → ${dest}`}<br />
        <small className="discret">Cliquer pour la fiche du quartier</small></>
  }
}
