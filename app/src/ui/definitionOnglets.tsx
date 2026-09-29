import type { ReactElement } from 'react'

export type Onglet = 'carte' | 'filtres' | 'financement' | 'trajet' | 'compte'

const trait = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

export const ONGLETS: { id: Onglet; libelle: string; icone: ReactElement }[] = [
  { id: 'carte', libelle: 'Carte', icone: (
    <svg viewBox="0 0 24 24" {...trait}><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z" /><path d="M9 4v14M15 6v14" /></svg>) },
  { id: 'filtres', libelle: 'Filtres', icone: (
    <svg viewBox="0 0 24 24" {...trait}><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" />
      <circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="18" cy="18" r="2" /></svg>) },
  { id: 'financement', libelle: 'Financement', icone: (
    <svg viewBox="0 0 24 24" {...trait}><path d="M3 11 12 4l9 7" /><path d="M5 10v10h14V10" />
      <path d="M14.5 12.5a3 3 0 1 0 0 4M9.5 14h4M9.5 15.5h4" /></svg>) },
  { id: 'trajet', libelle: 'Trajet', icone: (
    <svg viewBox="0 0 24 24" {...trait}><rect x="6" y="3" width="12" height="14" rx="3" /><path d="M6 11h12M9 20l-2 2M15 20l2 2" />
      <circle cx="9" cy="14" r=".6" /><circle cx="15" cy="14" r=".6" /></svg>) },
  { id: 'compte', libelle: 'Compte', icone: (
    <svg viewBox="0 0 24 24" {...trait}><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></svg>) },
]

