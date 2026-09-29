// Schéma des fichiers produits par scripts/11_export_app.py (version_schema 1).
// Les clés courtes reprennent celles de carte.html (scripts/10_carte_html.py) pour alléger les fichiers.
import type { Feature, FeatureCollection, Geometry, LineString, MultiLineString, Point } from 'geojson'

export const VERSION_SCHEMA = 1

export interface FichierManifeste {
  fichier: string
  octets: number
  octets_gzip: number
  sha256: string
  entites?: number
  prive?: boolean
  /** Matrices binaires : [lignes (stations), colonnes (pôles)] */
  forme?: [number, number]
}

export interface Manifeste {
  version_schema: number
  genere_le: string
  /** « AAAA-MM-JJ / AAAA-MM-JJ » */
  periode_24m: string
  departements: Record<string, string>
  defauts: {
    budget_ancien: number
    budget_vefa: number
    surface: number
    dist_max: number
    revenu_min: number
    trajet_max: number
  }
  fichiers: Record<string, FichierManifeste>
}

/** Zones du zonage A/B/C présentes en Île-de-France. */
export type Zone = 'Abis' | 'A' | 'B1' | 'B2' | 'C'

/** Propriétés d'un IRIS (quartier). null = donnée absente (moins de 5 ventes, secret statistique…). */
export interface IrisProps {
  id: string          // code IRIS
  ni: string          // nom de l'IRIS
  nc: string          // nom de la commune
  dep: string         // code département
  ty: string          // type d'IRIS (H habitat, A activité, D divers, Z commune non irisée)
  pa: number | null   // prix/m² médian ancien, 24 mois
  na: number          // nombre de ventes ancien, 24 mois
  pv: number | null   // prix/m² médian neuf (VEFA), 24 mois
  nv: number          // nombre de ventes VEFA, 24 mois
  pac: number | null  // prix/m² médian ancien de la commune (repère)
  ea: number | null   // évolution du prix/m² ancien vs les 24 mois précédents (0.05 = +5 %)
  rv: number | null   // revenu disponible médian (€/an/unité de consommation)
  rs: string | null   // source du revenu : « iris » ou « commune »
  da: number | null   // distance à la station actuelle la plus proche (m, vol d'oiseau)
  sa: string | null   // nom de cette station
  df: number | null   // distance à la future gare la plus proche (m)
  sf: string | null   // nom de cette gare
  q: number | null    // part de la surface en QPV (0–1)
  tq: number | null   // part de la surface dans le tampon de 300 m autour d'un QPV (0–1)
  ts: number[]        // stations accessibles à pied (lignes des matrices de trajet)
  tm: number[]        // temps de marche vers chacune (minutes)
  z: Zone | null      // zone A/B/C
}

export interface CommuneProps { n: string; c: string }

export interface StationProps {
  n: string            // nom
  l: string            // lignes desservies
  c: string            // couleur officielle (#rrggbb)
  st: string | null    // statut du projet
  e: boolean           // en service
  x: boolean           // correspondance (plusieurs lignes)
  ms: string | null    // mise en service prévue
  k: number | null     // ligne dans les matrices de trajet
}

export interface LigneProps {
  l: string            // nom de la ligne
  m: string            // mode : metro, rer, tram, transilien, cable, *_futur
  c: string            // couleur officielle
  e: boolean           // en service
  st: string | null
  p: string | null     // nom du projet
  ms: string | null
}

export interface QpvProps { c: string; n: string; cm: string }

export interface Pole {
  n: string            // nom affiché
  s: string            // stations du pôle, séparées par « / »
  d: boolean           // desservi par le réseau actuel
  c: [number, number]  // [lng, lat]
}

export interface MetaTrajet {
  poles: Pole[]
  stations: string[]   // nom de chaque ligne de matrice
  pole_defaut: number
  horizons: { annee: number; lignes: string }[]
}

export type Couche<P, G extends Geometry = Geometry> = FeatureCollection<G, P>

export interface Donnees {
  manifeste: Manifeste
  iris: Couche<IrisProps>
  communes: Couche<CommuneProps, LineString | MultiLineString>
  stations: Couche<StationProps, Point>
  lignes: Couche<LigneProps, LineString | MultiLineString>
  qpv: Couche<QpvProps> | null
  tampon: FeatureCollection | null
}

export type EntiteIris = Feature<Geometry, IrisProps>
