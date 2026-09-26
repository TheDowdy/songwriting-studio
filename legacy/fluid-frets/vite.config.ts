/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Relative asset paths, so the built app works from any URL path (e.g. behind a reverse proxy).
  base: './',
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    // The theory engine (formerly src/theory/) now lives in @sw/core/fret; run
    // `npx vitest run --coverage` from packages/core for its coverage.
  },
});
