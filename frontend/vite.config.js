import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
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
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("recharts") || id.includes("d3-")) return "charts";
            if (id.includes("jspdf") || id.includes("html2canvas")) return "pdf";
            if (id.includes("framer-motion")) return "motion";
            if (id.includes("react")) return "react-vendor";
            return "vendor";
          }
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
