// Service worker vanilla de Pereira Unida (sin next-pwa).
// Objetivo mínimo para una app de emergencia: dejar algo usable sin
// conexión (líneas de emergencia) sin cachear jamás datos en vivo
// (reportes, red familiar, puntos de acopio pasan siempre por la red).

const CACHE_VERSION = "pereiraunida-v1";
const OFFLINE_URL = "/offline.html";
const PRECACHE_URLS = [OFFLINE_URL, "/manifest.webmanifest", "/icon.svg", "/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key)))
      )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navegación: red primero. Si no hay red, cae a offline.html con las
  // líneas de emergencia.
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
    return;
  }

  // Assets estáticos versionados de Next (nombre con hash de contenido,
  // por lo tanto inmutables): cache-first.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          const clone = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(request, clone));
          return response;
        });
      })
    );
    return;
  }

  // Todo lo demás (Server Actions, RSC payloads, Supabase, API) se deja
  // pasar directo a la red sin interceptar: es información en vivo de una
  // emergencia y nunca debe servirse desde caché.
});
