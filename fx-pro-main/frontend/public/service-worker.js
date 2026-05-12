/* FX Pro 2026 — PWA Service Worker
 * Strategie: network-first pour HTML, cache-first pour assets statiques,
 * routage deep-link sur clic de notification, gestion push (FCM Web compatible).
 */
const CACHE_NAME = "fx-pro-2026-v3";
const APP_SHELL = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/icons/app-icon-192.png",
  "/icons/app-icon-512.png",
  "/icons/apple-touch-icon.png",
  "/icons/notification-icon-96.png",
];

const APP_NAME = "FX Pro 2026";
const DEFAULT_ICON = "/icons/app-icon-192.png";
const DEFAULT_BADGE = "/icons/notification-icon-96.png";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL).catch(() => undefined))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isHtmlRequest(request) {
  if (request.mode === "navigate") return true;
  const accept = request.headers.get("accept") || "";
  return accept.includes("text/html");
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (isHtmlRequest(request)) {
    // Network-first pour pages -> fallback cache, puis shell index.html
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((c) => c.put(request, copy)).catch(() => undefined);
          return response;
        })
        .catch(() =>
          caches.match(request).then((cached) => cached || caches.match("/index.html") || caches.match("/"))
        )
    );
    return;
  }

  // Cache-first pour assets statiques
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response && response.status === 200 && response.type === "basic") {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((c) => c.put(request, copy)).catch(() => undefined);
        }
        return response;
      }).catch(() => caches.match("/index.html") || caches.match("/"));
    })
  );
});

function buildNotificationOptions(payload) {
  const notification = (payload && (payload.notification || payload)) || {};
  const data = (payload && payload.data) || notification.data || {};

  return {
    title: notification.title || data.title || APP_NAME,
    options: {
      body: notification.body || data.body || "",
      icon: notification.icon || DEFAULT_ICON,
      badge: notification.badge || DEFAULT_BADGE,
      image: notification.image || data.image,
      tag: data.notif_id || data.txn_id || notification.tag || APP_NAME,
      renotify: true,
      requireInteraction: false,
      data: {
        url: data.url || data.click_action || notification.click_action || "/",
        ...data,
      },
    },
  };
}

self.addEventListener("push", (event) => {
  let payload = {};
  if (event.data) {
    try {
      payload = event.data.json();
    } catch {
      payload = { notification: { body: event.data.text() } };
    }
  }
  const { title, options } = buildNotificationOptions(payload);
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const targetUrl = data.url || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientsList) => {
      for (const client of clientsList) {
        const u = new URL(client.url);
        if (u.origin === self.location.origin) {
          client.focus();
          if ("navigate" in client && targetUrl && targetUrl !== "/") {
            return client.navigate(targetUrl).catch(() => client);
          }
          return client;
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
      return undefined;
    })
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});
