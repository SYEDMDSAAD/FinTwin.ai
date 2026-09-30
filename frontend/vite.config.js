/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Use the automatic JSX runtime for esbuild's transform too, so Vitest can
  // compile the app's React-import-free .jsx files (matches plugin-react).
  esbuild: { jsx: 'automatic' },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js',
    css: false,
  },
  build: {
    // CSS minification stays OFF intentionally. This is rolldown-vite, whose only
    // bundled CSS minifier is lightningcss, and lightningcss can't parse the
    // escaped Tailwind arbitrary-value selectors (e.g. .bg-\[#080A0F\]) hand-written
    // in index.css ("Unexpected token Hash"). `cssMinify: 'esbuild'` isn't an option
    // here either (esbuild isn't a dependency under rolldown). gzip still compresses
    // the CSS ~6x on the wire. To enable minification later: migrate those escaped
    // selectors to CSS variables/data-attributes, or add esbuild as a dev dependency.
    cssMinify: false,
    // Split heavy third-party libs into their own chunks so they're cached
    // independently and only fetched when a route that needs them loads.
    //
    // Explicit groups with priorities, not manualChunks: with manualChunks,
    // Rolldown placed React's CommonJS module inside `charts` (and part of it in
    // `motion`), so every page — the landing page too — downloaded the whole
    // charting library (~116 KB gzipped) before it could render anything.
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: "react-vendor", priority: 4,
              test: /node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler|use-sync-external-store)[\\/]/ },
            { name: "charts", priority: 3,
              test: /node_modules[\\/](recharts|d3-[^\\/]+|victory-vendor|react-smooth|recharts-scale|decimal\.js-light|es-toolkit|immer|reselect|@reduxjs|react-redux|redux|redux-thunk|eventemitter3|react-is)[\\/]/ },
            { name: "pdf", priority: 3, test: /node_modules[\\/](jspdf|html2canvas)/ },
            { name: "motion", priority: 3, test: /node_modules[\\/](framer-motion|motion-dom|motion-utils)[\\/]/ },
            // No catch-all vendor group: it pulled the markdown renderer (only the
            // copilot uses it, ~450 KB of source) into what the landing page loads.
            // Anything not grouped above is split by default, next to the pages
            // that import it.
          ],
        },
      },
    },
  },
  server: {
    host: true,
    allowedHosts: true,
    proxy: {
      // Main backend (Spring Boot) — must be listed BEFORE /api so it matches first
      '/api/v1': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      // Identity service (auth, tokens, 2FA)
      '/api': {
        target: 'http://localhost:8090',
        changeOrigin: true,
      },
    },
  },
})
