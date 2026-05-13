const CACHE_NAME = "fxpro-pwa-v2";
const CORE_ASSETS = [
  "/",
  "/manifest.json",
  "/offline.html",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/maskable-192.png",
  "/icons/maskable-512.png"
];

const firebaseConfig = {
  apiKey: "AIzaSyBSs0TJf7UHuC-bNSQqQmHkufOqAPX90Ig",
  authDomain: "mon-site-58f25.firebaseapp.com",
  projectId: "mon-site-58f25",
  storageBucket: "mon-site-58f25.firebasestorage.app",
  messagingSenderId: "664586032837",
  appId: "1:664586032837:web:ac6ad66a7c0b24507a42ac"
};

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .catch(() => undefined)
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.map((key) => (key === CACHE_NAME ? null : caches.delete(key)))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put("/", copy)).catch(() => undefined);
          return response;
        })
        .catch(() => caches.match("/").then((cached) => cached || caches.match("/offline.html")))
    );
    return;
  }

  if (url.pathname.startsWith("/icons/") || /\.(?:js|css|png|jpg|jpeg|webp|svg|woff2?)$/i.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => undefined);
          }
          return response;
        });
      })
    );
  }
});

try {
  importScripts("https://www.gstatic.com/firebasejs/12.13.0/firebase-app-compat.js");
  importScripts("https://www.gstatic.com/firebasejs/12.13.0/firebase-messaging-compat.js");

  firebase.initializeApp(firebaseConfig);
  const messaging = firebase.messaging();

  messaging.onBackgroundMessage((payload) => {
    const data = payload.data || {};
    const notification = payload.notification || {};
    const title = notification.title || data.title || "FX Pro";
    const options = {
      body: notification.body || data.body || "Nouvelle notification",
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-96.png",
      tag: data.notif_id || data.tag || undefined,
      data: {
        url: data.url || "/notifications",
        ...data
      }
    };

    self.registration.showNotification(title, options);
  });
} catch (error) {
  console.warn("Firebase Messaging is not available in this service worker.", error);
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/notifications";
  const url = new URL(targetUrl, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client && client.url.startsWith(self.location.origin)) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
