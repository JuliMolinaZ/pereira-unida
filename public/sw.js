// Service worker vanilla de Pereira Unida (sin next-pwa).
// En crisis deja consultables teléfonos de emergencia y direcciones de
// acopio aunque no haya datos. Reportes en vivo nunca se sirven de caché.

const CACHE_VERSION = "pereiraunida-v4";
const OFFLINE_URL = "/offline.html";
const OFFLINE_KIT = "/api/offline-kit";
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

function networkFirst(request) {
  return fetch(request)
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

  // Navegación: red primero. Si no hay red, cae a offline.html con las
  // líneas de emergencia y, si hay caché, los acopios.
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
});

// Notificaciones push (nueva solicitud/oferta/arriendo cerca). Con la app
// cerrada, el navegador despierta el service worker solo para esto.
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
      // Patrón corto (vibra-pausa-vibra): se siente como un aviso real del
      // celular, no un ping perdido entre notificaciones de otras apps.
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
