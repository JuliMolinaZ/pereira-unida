// Service worker vanilla de Pereira Unida (sin next-pwa).
// En crisis deja consultables teléfonos de emergencia. El JS de la app
// nunca se sirve de caché: si no, la PWA instalada revivía el dock viejo
// (Familia) después de una actualización.

const CACHE_VERSION = "pereiraunida-v5";
const OFFLINE_URL = "/offline.html";
const OFFLINE_KIT = "/api/offline-kit";
const PRECACHE_URLS = [OFFLINE_URL, "/icon.svg", "/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key)))
    )
  );
  // Sin clients.claim(): en iOS la toma de control recarga el start_url
  // cacheado y volvía a pintar Familia.
});

function networkFirst(request) {
  return fetch(request, { cache: "no-store" })
    .then((response) => {
      if (response && response.ok) {
        const clone = response.clone();
        caches.open(CACHE_VERSION).then((cache) => cache.put(request, clone));
      }
      return response;
    })
    .catch(() => caches.match(request).then((cached) => cached || caches.match(OFFLINE_URL)));
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname === OFFLINE_KIT) {
    event.respondWith(networkFirst(request));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(fetch(request, { cache: "no-store" }).catch(() => caches.match(OFFLINE_URL)));
    return;
  }

  // JS/CSS de Next: la red, nunca el SW. Así no se sirve el chunk de Familia.
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: "Pereira Unida", body: event.data ? event.data.text() : "" };
  }

  event.waitUntil(
    self.registration.showNotification(payload.title || "Pereira Unida", {
      body: payload.body || "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: payload.tag || "pereiraunida",
      renotify: true,
      vibrate: [80, 40, 80],
      data: { url: payload.url || "/" },
      actions: [{ action: "view", title: "Ver en el mapa" }],
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data && event.notification.data.url ? event.notification.data.url : "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientsArr) => {
      for (const client of clientsArr) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
