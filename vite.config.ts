/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Served from GitHub Pages at https://profmoriartey.github.io/hideout/
export default defineConfig({
  base: '/hideout/',
  plugins: [react()],
  build: {
    target: 'es2020',
    // three + R3F live in their own lazy chunk; the entry stays tiny.
    chunkSizeWarningLimit: 1000,
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
