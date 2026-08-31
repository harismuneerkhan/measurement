import { defineConfig } from 'vite';

export default defineConfig({
  // GitHub Pages serves this project site from https://<user>.github.io/measurement/,
  // so asset URLs must be prefixed. Change to '/' if the site ever moves to a root
  // domain (Cloudflare Pages, Vercel, a custom domain, or a <user>.github.io repo).
  base: '/measurement/',
  server: {
    port: 3000,
    open: true,
  },
  build: {
    outDir: 'dist',
  },
});
