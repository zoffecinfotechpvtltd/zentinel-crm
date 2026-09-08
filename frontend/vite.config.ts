import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      // Trailing slash matters: a bare '/api' prefix also matches
      // '/api-keys' (a real SPA route, not a backend one) since Vite/
      // http-proxy-middleware do a plain string-prefix match on this key -
      // that silently proxied /api-keys to the backend (which 404s, since
      // no such backend route exists) instead of letting Vite serve
      // index.html for React Router to handle. Every real backend call
      // goes through api.ts as `/api/<path>`, always with the slash, so
      // '/api/' still matches every one of them.
      '/api/': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
})
