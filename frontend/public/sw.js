// Deliberately minimal — this is what makes the app installable
// ("Add to Home Screen") and fast on repeat visits, not an offline-first
// rewrite. Business data always goes to the network; only the static app
// shell is cached.
const CACHE_NAME = "zentinel-shell-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.add("/")));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Never cache API calls — always hit the network, always current data.
  if (url.pathname.startsWith("/api/")) return;
  if (event.request.method !== "GET") return;

  // Page navigations: network-first so a redeploy is seen immediately;
  // fall back to the cached shell only when genuinely offline.
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() => caches.match("/").then((r) => r || fetch(event.request)))
    );
    return;
  }

  // Hashed static assets (JS/CSS/fonts/icons): cache-first. Safe because
  // Vite's content-hashed filenames change when the content does — a stale
  // cache entry for an old hash is just dead weight, never served for new
  // content, since the new build requests a different URL entirely.
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        });
      })
    );
  }
});
