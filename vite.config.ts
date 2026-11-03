import { defineConfig } from 'vite';

// The app on :5173; /api goes to the local Worker (wrangler dev) on :8787. Storybook has its own config.
export default defineConfig({
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: { '/api': { target: 'http://127.0.0.1:8787', changeOrigin: false } },
  },
  build: { outDir: 'dist' },
});
