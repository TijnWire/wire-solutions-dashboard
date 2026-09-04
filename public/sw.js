// Service worker — maakt de app installeerbaar en offline bruikbaar.
// Strategie: navigaties altijd via netwerk (verse app), gehashte assets cache-first.
// Let op: verhoog het versienummer bij elke release, dan wist de nieuwe worker de oude cache
// en laadt iedereen automatisch de nieuwste versie.
const CACHE = "wire-cache-v236";
const CORE = ["/", "/index.html", "/manifest.webmanifest", "/logo.svg", "/stedin-header.png"];

self.addEventListener("install", (event) => {
  // Let op de "reload": zonder dat haalt addAll de bestanden op via de gewone browsercache, en dan
  // legt een verse worker doodleuk de OUDE app-shell in zijn nieuwe cache. Op iOS blijf je dan hangen
  // op de vorige versie tot je de app van je beginscherm gooit — precies het probleem dat we hadden.
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(CORE.map((u) => new Request(u, { cache: "reload" }))))
      .catch(() => {}),
  );
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
      // "no-store": ook de netwerklaag van de telefoon mag hier geen oude kopie teruggeven.
      fetch(new Request(request, { cache: "no-store" }))
        .catch(() => fetch(request))
        .catch(() => caches.match("/index.html").then((r) => r || caches.match("/")))
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
