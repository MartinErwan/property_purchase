import { useMemo } from 'react'
import { useEtat } from '../etat'
import { useRessources } from '../donnees/store'
import { fmt } from '../logique/echelles'
import { budgetsParZone, normaliserProfil, NOM_ZONE, ZONES_FIN, type Profil, type ResultatPtz } from '../logique/financement'

const CHAMPS: { cle: keyof Profil; libelle: string; min: number; max?: number; pas: number }[] = [
  { cle: 'pers', libelle: 'Personnes dans le foyer', min: 1, max: 8, pas: 1 },
  { cle: 'rfr', libelle: 'Revenu fiscal de référence N-2 du foyer (€)', min: 0, pas: 1000 },
  { cle: 'rev', libelle: 'Revenus nets mensuels du foyer (€)', min: 0, pas: 100 },
  { cle: 'cred', libelle: 'Crédits en cours (€/mois)', min: 0, pas: 50 },
  { cle: 'apport', libelle: 'Apport personnel (€)', min: 0, pas: 1000 },
  { cle: 'taux', libelle: 'Taux du crédit bancaire (%/an)', min: 0, max: 15, pas: 0.05 },
  { cle: 'ass', libelle: 'Assurance emprunteur (% du capital/an)', min: 0, max: 2, pas: 0.01 },
  { cle: 'duree', libelle: 'Durée du crédit bancaire (ans)', min: 5, max: 25, pas: 1 },
]

const remboursement = (p: ResultatPtz) => p.differeMois
  ? `${p.differeMois / 12} ans sans rembourser puis ${(p.dureeMois! - p.differeMois) / 12} ans`
  : `remboursé sur ${p.dureeMois! / 12} ans sans différé`

export function PanneauFinancement() {
  const { profil, majProfil } = useEtat()
  const donnees = useRessources((r) => r.donnees)
  const p = useMemo(() => normaliserProfil(profil), [profil])
  const res = useMemo(() => budgetsParZone(p), [p])
  const zones = useMemo(() => ZONES_FIN.filter((z) => donnees?.iris.features.some((f) => f.properties.z === z) ?? true), [donnees])
  const ref = res.neuf.A, ptzA = ref.ptz, alA = ref.al

  return (
    <>
      <label className="case interrupteur">
        <input type="checkbox" checked={profil.actif} onChange={(e) => majProfil({ actif: e.target.checked })} />
        <span><b>Utiliser mon profil pour le filtre de budget</b> (budget calculé selon la zone A bis / A / B1 / B2
          de chaque quartier)</span>
      </label>

      <div className="tableau-defilant">
        <table className="resultat">
          <thead><tr><th>Prix max (€)</th><th>Ancien</th><th>Neuf</th><th>dont PTZ</th></tr></thead>
          <tbody>
            {zones.map((z) => (
              <tr key={z}><td>Zone {NOM_ZONE[z]}</td><td>{fmt(res.ancien[z].prix)}</td><td>{fmt(res.neuf[z].prix)}</td>
                <td>{res.neuf[z].ptz.montant ? fmt(res.neuf[z].ptz.montant) : '—'}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="etat"><b>PTZ</b> (en zone A) : {ptzA.montant
        ? `éligible dans le neuf, tranche ${ptzA.tranche} (${Math.round(ptzA.quotite! * 100)} % du prix, plafonné ; ${remboursement(ptzA)})`
        : `non éligible (${ptzA.raison})`}.</p>
      <p className="etat"><b>Action Logement</b> : {alA.montant ? `${fmt(alA.montant)} € à 1 % sur 25 ans` : `non (${alA.raison})`}.</p>
      <p className="etat"><b>Crédit bancaire</b> (neuf, zone A) : {fmt(ref.banque)} € sur {p.duree} ans ; mensualité totale{' '}
        {fmt(ref.mensualite)} €/mois, taux d'effort {Number.isFinite(ref.effort) ? Math.round(ref.effort * 100) : '—'} %.</p>
      <p className="etat discret">Prix hors frais de notaire ; l'apport couvre d'abord les frais.</p>

      <h3>Mon profil</h3>
      <div className="formulaire">
        {CHAMPS.map((c) => (
          <label key={c.cle}>
            <span>{c.libelle}</span>
            <input type="number" inputMode="decimal" min={c.min} max={c.max} step={c.pas} value={profil[c.cle] as number}
              onChange={(e) => majProfil({ [c.cle]: e.target.value === '' ? 0 : Number(e.target.value) })} />
          </label>
        ))}
        <label className="case"><input type="checkbox" checked={profil.primo} onChange={(e) => majProfil({ primo: e.target.checked })} />
          <span>Primo-accédant (pas propriétaire de ma résidence principale depuis 2 ans)</span></label>
        <label className="case"><input type="checkbox" checked={profil.al} onChange={(e) => majProfil({ al: e.target.checked })} />
          <span>Salarié d'une entreprise privée de 10 salariés ou plus (prêt Action Logement)</span></label>
      </div>
      <p className="note">Profil enregistré sur cet appareil uniquement (synchronisation avec un compte : bientôt).</p>
      <p className="note">Règles 2026 appliquées (sources secondaires, <b>non vérifiées au texte officiel</b>) : PTZ jusqu'au
        31/12/2027, neuf partout, ancien avec ≥ 25 % de travaux en zone B2 seulement (non compté ici) ; prêt Action
        Logement 30 000 € à 1 % sur 25 ans ; taux d'effort ≤ 35 % assurance comprise (règle HCSF). Frais de notaire
        estimés : 7,5 % dans l'ancien, 2,5 % dans le neuf. Estimation indicative : seule une banque peut confirmer une
        capacité d'emprunt.</p>
    </>
  )
}
