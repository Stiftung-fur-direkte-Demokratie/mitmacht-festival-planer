/* Mitmacht 2026 Programmplaner – Service Worker
   Precache der App-Shell, Navigation network-first, Assets cache-first. */
const VERSION = "mitmacht-2026-v1";
const SHELL = VERSION + "-shell";
const ASSETS = VERSION + "-assets";
const SHELL_URL = "/";
const PRECACHE = [
  SHELL_URL,
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/maskable-192.png",
  "/icons/maskable-512.png",
  "/icons/apple-touch-icon-180.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL);
      await Promise.allSettled(
        PRECACHE.map((u) => cache.add(new Request(u, { cache: "reload" }))),
      );
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.allSettled(
        keys.filter((k) => k !== SHELL && k !== ASSETS).map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

function isAsset(url) {
  return (
    /\.(js|mjs|css|woff2?|ttf|png|jpg|jpeg|svg|webp|ico|json|txt)$/i.test(url.pathname) ||
    url.pathname.startsWith("/_build/") ||
    url.pathname.startsWith("/assets/")
  );
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.searchParams.has("nosw")) return;

  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          const cache = await caches.open(SHELL);
          cache.put(SHELL_URL, fresh.clone());
          return fresh;
        } catch {
          const cache = await caches.open(SHELL);
          return (
            (await cache.match(SHELL_URL)) ||
            new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } })
          );
        }
      })(),
    );
    return;
  }

  if (!isAsset(url)) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(ASSETS);
      const hit = await cache.match(req);
      if (hit) {
        event.waitUntil(
          fetch(req)
            .then((res) => (res && res.ok ? cache.put(req, res.clone()) : null))
            .catch(() => null),
        );
        return hit;
      }
      try {
        const res = await fetch(req);
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      } catch {
        const shell = await caches.open(SHELL);
        const s = await shell.match(req);
        if (s) return s;
        throw new Error("offline");
      }
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  const id = (event.notification && event.notification.tag) || "";
  event.notification.close();
  const target = "/" + (id ? "?s=" + encodeURIComponent(id) : "") + "#mein";
  event.waitUntil(
    (async () => {
      const list = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of list) {
        if (new URL(client.url).origin === self.location.origin) {
          await client.focus();
          client.postMessage({ type: "open-session", id });
          return;
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});
