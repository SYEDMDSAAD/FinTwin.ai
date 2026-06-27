import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    cssMinify: false,
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
