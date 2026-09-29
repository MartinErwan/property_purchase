/// <reference types="vitest/config" />
import { cpSync, existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// Données produites par le pipeline (scripts/11_export_app.py), servies sous /donnees/.
const DONNEES = resolve(import.meta.dirname, '../data/app')
const URL_DONNEES = '/donnees/'

/** Fichiers marqués « privé » dans le manifeste : jamais servis publiquement (ventes individuelles). */
function fichiersPrives(): Set<string> {
  const manifeste = join(DONNEES, 'manifest.json')
  if (!existsSync(manifeste)) return new Set()
  const m = JSON.parse(readFileSync(manifeste, 'utf8')) as { fichiers: Record<string, { fichier: string; prive?: boolean }> }
  return new Set(Object.values(m.fichiers).filter((f) => f.prive).map((f) => f.fichier))
}

/** En développement : sert data/app/ ; au build : le copie dans dist/donnees/ (sans les fichiers privés). */
function donneesPipeline(): Plugin {
  return {
    name: 'donnees-pipeline',
    configureServer(serveur) {
      serveur.middlewares.use(URL_DONNEES, (req, res, suite) => {
        const nom = decodeURIComponent((req.url ?? '/').split('?')[0]).replace(/^\/+/, '')
        const chemin = join(DONNEES, nom)
        if (!nom || nom.includes('..') || !existsSync(chemin) || !statSync(chemin).isFile() || fichiersPrives().has(nom)) {
          return suite()
        }
        const type = nom.endsWith('.bin') ? 'application/octet-stream'
          : nom.endsWith('.geojson') ? 'application/geo+json' : 'application/json'
        res.setHeader('Content-Type', type)
        res.end(readFileSync(chemin))
      })
    },
    writeBundle(options) {
      const sortie = join(options.dir ?? 'dist', 'donnees')
      if (!existsSync(DONNEES)) {
        this.warn(`${DONNEES} absent : lancer scripts/11_export_app.py (le site sera publié sans données)`)
        return
      }
      const prives = fichiersPrives()
      for (const nom of readdirSync(DONNEES)) {
        if (!prives.has(nom)) cpSync(join(DONNEES, nom), join(sortie, nom))
      }
    },
  }
}

export default defineConfig({
  plugins: [
    react(),
    donneesPipeline(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icone.svg', 'robots.txt'],
      manifest: {
        name: 'Où acheter en Île-de-France',
        short_name: 'Où acheter',
        description: 'Carte des quartiers d\'Île-de-France : prix réels, transports, revenus, financement.',
        lang: 'fr',
        start_url: '/',
        display: 'standalone',
        background_color: '#f4f3ef',
        theme_color: '#1f5fae',
        icons: [
          { src: 'icone-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icone-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icone.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
      workbox: {
        // Pas de mode hors ligne : seule l'application (HTML/JS/CSS) est mise en cache pour démarrer vite.
        // Les données (/donnees/) passent par le cache HTTP du navigateur (noms par empreinte).
        globPatterns: ['**/*.{js,css,html,svg,png}'],
        globIgnores: ['donnees/**'],
        navigateFallbackDenylist: [/^\/donnees\//],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
    }),
  ],
  worker: { format: 'es' },
  build: {
    // MapLibre pèse ~800 Ko à lui seul : le découper ne réduirait pas ce que charge la carte au démarrage.
    chunkSizeWarningLimit: 1500,
  },
  test: {
    environment: 'node',
  },
})
