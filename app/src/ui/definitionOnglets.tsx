import type { ReactElement } from 'react'
import type { Page } from '../navigation'

const trait = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

export const ONGLETS: { id: Page; libelle: string; icone: ReactElement }[] = [
  { id: 'carte', libelle: 'Carte', icone: (
    <svg viewBox="0 0 24 24" {...trait}><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z" /><path d="M9 4v14M15 6v14" /></svg>) },
  { id: 'quartiers', libelle: 'Mes quartiers', icone: (
    <svg viewBox="0 0 24 24" {...trait}><path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.5 9.7l5.9-.9L12 3.5z" /></svg>) },
  { id: 'financement', libelle: 'Financement', icone: (
    <svg viewBox="0 0 24 24" {...trait}><path d="M3 11 12 4l9 7" /><path d="M5 10v10h14V10" />
      <path d="M14.5 12.5a3 3 0 1 0 0 4M9.5 14h4M9.5 15.5h4" /></svg>) },
  { id: 'compte', libelle: 'Compte', icone: (
    <svg viewBox="0 0 24 24" {...trait}><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></svg>) },
]
