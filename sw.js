const CACHE_NAME = "zen-timer-shell-v3";
const appUrl = (path = "") => new URL(path, self.registration.scope).toString();
const CORE_ASSETS = [
  appUrl(),
  appUrl("manifest.json"),
  appUrl("icon-192.png"),
  appUrl("icon-512.png"),
  appUrl("icon-512-maskable.png"),
  appUrl("apple-touch-icon.png")
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(CORE_ASSETS);

      try {
        const response = await fetch(appUrl());
        const html = await response.clone().text();
        await cache.put(appUrl(), response);
        const paths = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
          .map((match) => match[1])
          .filter((path) => !path.startsWith("http") && !path.startsWith("data:"))
          .map((path) => new URL(path, appUrl()).toString());
        await Promise.all(
          [...new Set(paths)].map(async (path) => {
            try {
              await cache.add(path);
            } catch {
              // A later runtime request will cache this asset.
            }
          })
        );
      } catch {
        // The core shell is enough for installation; runtime caching fills any gaps.
      }

      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          const cache = await caches.open(CACHE_NAME);
          await cache.put(appUrl(), response.clone());
          return response;
        } catch {
          return (await caches.match(request)) || (await caches.match(appUrl()));
        }
      })()
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, response.clone());
      }
      return response;
    })()
  );
});
