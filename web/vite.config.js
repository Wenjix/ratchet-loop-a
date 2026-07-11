import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()],
  server: {
    // The Express backend owns /api (REST + SSE); http-proxy streams text/event-stream fine.
    proxy: {
      '/api': { target: 'http://localhost:3300' },
    },
  },
  build: {
    outDir: 'dist',
  },
});
