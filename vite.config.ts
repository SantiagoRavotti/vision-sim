import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { VitePWA } from 'vite-plugin-pwa'

/**
 * GitHub Pages serves a project repo from https://<user>.github.io/<repo>/,
 * so every asset URL, the service-worker scope and the manifest start_url
 * must be prefixed with this. Change it in exactly one place.
 */
const BASE = '/vision-sim/'

/**
 * HTTPS is only needed for LAN/phone testing: getUserMedia() requires a secure
 * context, and http://192.168.x.x is not one - but http://localhost IS. So the
 * self-signed cert (and its browser warning) is opt-in via `npm run dev:phone`
 * rather than imposed on every desktop dev session.
 */
const USE_HTTPS = process.env.VITE_HTTPS === '1'

export default defineConfig({
  base: BASE,
  plugins: [
    react(),
    ...(USE_HTTPS ? [basicSsl()] : []),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'Vision Sim',
        short_name: 'Vision Sim',
        description: 'Approximate what the world looks like through someone else’s eyes.',
        // Both must carry the base path or the installed PWA 404s on launch.
        start_url: BASE,
        scope: BASE,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#000000',
        theme_color: '#000000',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: `${BASE}index.html`,
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
      },
    }),
  ],
  server: {
    host: true, // expose on LAN so the phone can reach it
    port: 5173,
  },
})
