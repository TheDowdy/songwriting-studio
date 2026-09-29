/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  // Relative asset paths, so the built app works from any URL path, a NAS, or file://-style
  // static hosting (§2).
  base: './',
  plugins: [react(), tailwindcss()],
  server: {
    // Lets the dev server (run with --host) answer to this machine's Tailscale hostname, so it's
    // reachable from other devices on the tailnet — Vite otherwise refuses any Host header but
    // localhost/its LAN IPs.
    allowedHosts: ['dowdymac.tailc4f71e.ts.net'],
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'src/**/*.test.{ts,tsx}'],
  },
});
