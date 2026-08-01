import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Pinned to a dedicated port so the dev origin always matches the
    // backend CORS allowlist. `strictPort` makes a port collision fail
    // loudly instead of silently falling back to another port, which
    // would otherwise surface as a confusing CORS error in the browser.
    port: 5180,
    strictPort: true,
  },
})
