// FRONTEND-ARCHITECTURE.md §11 — the /api proxy keeps API_BASE='/api' identical
// in dev and prod, so no environment switching lives in the app code.

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
  build: {
    outDir: 'dist',
  },
})
