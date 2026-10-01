import { useRessources } from './donnees/store'
import { useEtat } from './etat'
import { decoder, encoder, type EtatUrl } from './logique/url'

/** Vue courante encodée comme dans l'URL (null tant que les données ne sont pas chargées). */
export function useVueEncodee(): string | null {
  const donnees = useRessources((r) => r.donnees)
  const meta = useRessources((r) => r.meta)
  const { ind, filtres, destination, horizon, irisChoisi } = useEtat()
  if (!donnees || !meta) return null
  const d = donnees.manifeste.defauts
  return encoder({ ind, filtres, destination, horizon, irisChoisi }, {
    filtres: { ba: d.budget_ancien, bv: d.budget_vefa, su: d.surface, di: d.dist_max, rv: d.revenu_min,
               horsqpv: false, tt: d.trajet_max },
    destinationDefaut: meta.pole_defaut,
  })
}

/** Applique une vue décodée (URL ou compte) à l'état, en ignorant une destination inconnue. */
export function appliquerVue(url: EtatUrl): void {
  const e = useEtat.getState()
  const meta = useRessources.getState().meta
  if (url.filtres) e.majFiltres(url.filtres)
  const dest = url.destination?.type === 'pole' && meta && !meta.poles[url.destination.pole] ? undefined : url.destination
  e.set({ ind: url.ind ?? e.ind, horizon: url.horizon ?? e.horizon, irisChoisi: url.iris ?? e.irisChoisi,
          destination: dest ?? e.destination })
}

export { decoder }
