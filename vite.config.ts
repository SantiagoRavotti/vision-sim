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
      // Push-to-deploy means a user can be holding a stale version. autoUpdate
      // activates the new service worker immediately rather than waiting for
      // every tab to close. Trade-off: a deploy can reload an in-progress
      // session, which is acceptable while we are iterating daily.
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        // `id` pins the app's identity independently of start_url, so a future
        // path change does not read as a different app to an installed client.
        id: BASE,
        name: 'Vision Sim',
        short_name: 'Vision Sim',
        description: 'See how the world looks to someone who needs glasses.',
        // Both must carry the base path or the installed PWA 404s on launch.
        start_url: BASE,
        scope: BASE,
        display: 'standalone',
        display_override: ['standalone', 'minimal-ui'],
        orientation: 'portrait',
        background_color: '#000000',
        theme_color: '#000000',
        categories: ['health', 'education', 'utilities'],
        icons: [
          // purpose "any": rendered exactly as designed.
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          // purpose "maskable": full-bleed, artwork inside the central 80% so a
          // launcher can crop to a circle or squircle without clipping it.
          {
            src: 'icons/icon-maskable-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: 'icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Conservative on purpose: precache the shell and nothing else. There
        // are no runtime caching rules, no API caching, no offline-first
        // machinery. Vision Sim needs no network once loaded - the camera is
        // local - so precaching the shell happens to make it work offline for
        // free, and it also satisfies Chrome's installability requirement for
        // a service worker with a fetch handler.
        navigateFallback: `${BASE}index.html`,
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2,webmanifest}'],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
      },
    }),
  ],
  server: {
    host: true, // expose on LAN so the phone can reach it
    port: 5173,
  },
})
