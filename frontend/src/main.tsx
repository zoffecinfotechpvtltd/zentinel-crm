import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Self-hosted (bundled by Vite, same-origin — no CDN, no CSP exception
// needed) so it actually loads in production.
import '@fontsource-variable/bricolage-grotesque'
import './index.css'
import './theme.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Registered after mount so it never delays first paint. Only register for
// a real HTTPS deployment — service workers on a plain http:// origin (e.g.
// local dev) add no value.
if ('serviceWorker' in navigator && window.location.protocol === 'https:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}
