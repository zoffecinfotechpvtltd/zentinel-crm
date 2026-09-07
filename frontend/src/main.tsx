import { StrictMode } from 'react'
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import * as ReactDOM from 'react-dom'
// Self-hosted (bundled by Vite, same-origin — no CDN, no CSP exception
// needed) so it actually loads in production. Bricolage stays on
// headings/numbers; IBM Plex Sans takes over body/table/form text (drawn
// for dense technical UI at small sizes, which a display grotesque isn't);
// IBM Plex Mono is for tabular/identifier text (invoice numbers, API keys,
// audit-log entity IDs).
import '@fontsource-variable/bricolage-grotesque'
import '@fontsource/ibm-plex-sans/400.css'
import '@fontsource/ibm-plex-sans/500.css'
import '@fontsource/ibm-plex-sans/600.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import './index.css'
import './tailwind.css'
import './theme.css'
import App from './App.tsx'

// Dev-only: live accessibility warnings in the console as the app renders
// (the same engine behind Chrome DevTools' own Accessibility panel), so a
// regression like a missing label or a failing-contrast color surfaces
// immediately instead of waiting for the next manual audit. Never runs in
// production - dynamically imported so it's not in the prod bundle at all.
if (import.meta.env.DEV) {
  import('@axe-core/react').then(({ default: axe }) => {
    axe(React, ReactDOM, 1000)
  })
}

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
