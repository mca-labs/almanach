import { defineConfig } from 'astro/config';

// Site Astro SSG : rebuild post-publish via SITE_DEPLOY_HOOK_URL (cf. README).
// L'édition est figée chaque nuit — pas de SSR, pas d'API runtime.
export default defineConfig({
  output: 'static',
  trailingSlash: 'ignore',
  build: {
    format: 'directory',
  },
  server: {
    port: 4321,
    host: true,
  },
});
