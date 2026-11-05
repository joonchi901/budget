import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// The app on :5173; /api goes to the local Worker (wrangler dev) on :8787. Storybook has its own config.
export default defineConfig({
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: { '/api': { target: 'http://127.0.0.1:8787', changeOrigin: false } },
  },
  build: { outDir: 'dist' },
  plugins: [
    // The service worker (docs/sync-plan.md §4.4): the built app and the brand pictures it draws
    // are cached ahead; /api/* never is (no runtime caching at all). A new version comes quietly
    // and serves the next page load. Off in the dev server.
    VitePWA({
      registerType: 'autoUpdate',
      // registerSW.js, a file: CSP script-src 'self' (§8.12) refuses an inline script.
      injectRegister: 'script',
      // public/manifest.webmanifest, linked from index.html.
      manifest: false,
      workbox: {
        // autoUpdate turns these on only with injectRegister 'auto'; without them a new version
        // waits until every window closes. Safe here: the app is one bundle, no chunk loads late.
        skipWaiting: true,
        clientsClaim: true,
        globPatterns: [
          'index.html',
          'manifest.webmanifest',
          'assets/**',
          'brand/*.svg',
          'brand/reactions/manifest.json',
          'brand/reactions/stickers-96/*.png',
          'brand/reactions/decorations/*.png',
        ],
        // Rooms and tabs live in the address (/ledgers/:id), so a page load is index.html.
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
});
