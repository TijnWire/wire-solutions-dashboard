// Service worker — maakt de app installeerbaar en offline bruikbaar.
// Strategie: navigaties altijd via netwerk (verse app), gehashte assets cache-first.
// Let op: verhoog het versienummer bij elke release, dan wist de nieuwe worker de oude cache
// en laadt iedereen automatisch de nieuwste versie.
const CACHE = "wire-cache-v29";
const CORE = ["/", "/index.html", "/manifest.webmanifest", "/logo.svg", "/stedin-header.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(CORE)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  // Navigaties (pagina openen): altijd netwerk eerst → verse app; offline terugval op de app-shell.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match("/index.html").then((r) => r || caches.match("/")))
    );
    return;
  }

  // Overige bestanden (gehashte assets): eerst cache, anders netwerk (en daarna in cache zetten).
  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((resp) => {
          if (resp && resp.status === 200 && resp.type === "basic") {
            const copy = resp.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return resp;
        })
    )
  );
});
