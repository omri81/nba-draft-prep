import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages project sites are served from /<repo>/, so the bundle needs a
// matching base path. Vercel (or a user/org Pages site) serves from the root —
// build those with `BASE_PATH=/ npm run build`.
const base = process.env.BASE_PATH ?? '/nba-draft-prep/'

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'NBA Draft Prep',
        short_name: 'Draft Prep',
        description: 'Personal fantasy basketball draft board',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0b0d10',
        theme_color: '#0b0d10',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // playerIds.json is bundled into JS, so the only network asset at
        // runtime is the headshot CDN. Cache those aggressively so the board
        // still shows faces on draft night with no signal.
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/cdn\.nba\.com\/headshots\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'nba-headshots',
              expiration: { maxEntries: 800, maxAgeSeconds: 60 * 60 * 24 * 120 },
              // Cross-origin image responses are opaque (status 0).
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
})
