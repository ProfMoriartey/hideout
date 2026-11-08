/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

/**
 * Adds `<link rel="modulepreload">` for the lazy scene chunk (and any chunks
 * it imports) to the built index.html, so three/R3F download in parallel with
 * the entry instead of after it has run.
 */
function preloadSceneChunk(chunkName: string): Plugin {
  let base = '/';
  return {
    name: 'hideout:preload-scene-chunk',
    apply: 'build',
    configResolved(config) {
      base = config.base;
    },
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        const bundle = ctx.bundle;
        if (!bundle) return html;
        const chunks = Object.values(bundle).filter((c) => c.type === 'chunk');
        const scene = chunks.find((c) => c.isDynamicEntry && c.name === chunkName);
        if (!scene) throw new Error(`preload: no lazy chunk named "${chunkName}"`);
        const entries = new Set(chunks.filter((c) => c.isEntry).map((c) => c.fileName));
        const files = [scene.fileName, ...scene.imports].filter((f) => !entries.has(f));
        return files.map((file) => ({
          tag: 'link',
          attrs: { rel: 'modulepreload', crossorigin: true, href: `${base}${file}` },
          injectTo: 'head' as const,
        }));
      },
    },
  };
}

// Served from GitHub Pages at https://profmoriartey.github.io/hideout/
export default defineConfig({
  base: '/hideout/',
  plugins: [react(), preloadSceneChunk('App')],
  build: {
    target: 'es2020',
    // three + R3F live in their own lazy chunk; `npm run size` is the real gate.
    chunkSizeWarningLimit: 900,
  },
  preview: {
    port: 4173,
    strictPort: true,
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
