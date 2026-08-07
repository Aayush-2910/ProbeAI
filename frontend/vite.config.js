// FRONTEND-ARCHITECTURE.md §11 — the /api proxy keeps API_BASE='/api' identical
// in dev and prod, so no environment switching lives in the app code.

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Mock mode imports the real sample data from backend/data/ rather than
    // keeping a duplicate copy in the frontend, so the dev server needs read
    // access one level above the project root.
    fs: { allow: ['..'] },
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        // Without this, a backend that isn't running surfaces as a bare 500
        // and the UI can only say "something went wrong". Answer with 502 +
        // a JSON detail so the app can name the actual problem.
        configure(proxy) {
          proxy.on('error', (error, _req, res) => {
            console.warn(
              `\n[probeai] API proxy failed (${error.code ?? error.message}).` +
                '\n[probeai] Start the backend:  uvicorn main:app --reload --app-dir backend\n',
            )
            if (res && !res.headersSent && typeof res.writeHead === 'function') {
              res.writeHead(502, { 'Content-Type': 'application/json' })
              res.end(
                JSON.stringify({
                  detail:
                    'Backend not reachable on http://localhost:8000. Start it with: ' +
                    'uvicorn main:app --reload --app-dir backend',
                }),
              )
            }
          })
        },
      },
    },
  },
  build: {
    outDir: 'dist',
  },
})
