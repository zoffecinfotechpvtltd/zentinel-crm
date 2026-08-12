import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Self-hosted (bundled by Vite, same-origin — no CDN, no CSP exception
// needed) so it actually loads in production. "Satoshi" was referenced by
// name throughout theme.css but never shipped as a real font file or
// @font-face, so the whole app has always silently rendered in the
// browser's plain system-default sans-serif instead of an intentional
// typeface.
import '@fontsource-variable/plus-jakarta-sans'
import './index.css'
import './theme.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Registered after mount so it never delays first paint. Desktop/Electron
// builds serve over file:// or a loopback origin where service workers add
// no value and complicate the embedded-Postgres bootstrap — only register
// for the real web deployment.
if ('serviceWorker' in navigator && window.location.protocol === 'https:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}
