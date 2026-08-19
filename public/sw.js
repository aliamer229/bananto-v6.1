/* Banana Store service worker — Cloudflare-only asset + data caching. */
const VERSION = "banana-v7";
const IMAGE_CACHE = `${VERSION}-images`;
const DATA_CACHE = `${VERSION}-data`;

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => !key.startsWith(VERSION)).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

const isImage = (request, url) =>
  !url.pathname.startsWith("/api/files") &&
  (request.destination === "image" ||
    url.pathname.startsWith("/api/img") ||
    /\.(png|jpe?g|webp|gif|avif|svg)$/i.test(url.pathname));

/** Cache first, refresh in the background. */
async function staleWhileRevalidate(cacheName, request) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response && response.status === 200) cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached);
  return cached || network;
}

/** Network first for data queries. */
async function networkFirst(cacheName, request) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response && response.status === 200) cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw error;
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // NEVER cache navigations/HTML to prevent white screen cycles or stale chunk script tags
  if (request.mode === "navigate") return;

  // NEVER cache scripts, styles, or module chunks - let the browser manage module chunks natively
  if (
    request.destination === "script" ||
    request.destination === "style" ||
    request.destination === "font" ||
    url.pathname.endsWith(".js") ||
    url.pathname.endsWith(".mjs") ||
    url.pathname.endsWith(".ts") ||
    url.pathname.endsWith(".tsx") ||
    url.pathname.includes("/_build/") ||
    url.pathname.includes("/assets/") ||
    url.pathname.startsWith("/@") ||
    url.pathname.startsWith("/src/") ||
    url.pathname.includes("/node_modules/")
  ) {
    return;
  }

  // Never cache authenticated endpoints, session responses, or private files.
  if (
    url.pathname.startsWith("/api/auth") ||
    url.pathname.startsWith("/api/chat") ||
    url.pathname.startsWith("/api/orders") ||
    url.pathname.startsWith("/api/profile") ||
    url.pathname.startsWith("/api/otp") ||
    url.pathname.startsWith("/api/wallet") ||
    url.pathname.startsWith("/api/telegram") ||
    url.pathname.startsWith("/api/upload") ||
    url.pathname.startsWith("/api/files") ||
    url.pathname.startsWith("/api/admin") ||
    url.pathname.startsWith("/_serverFn")
  ) {
    return;
  }

  if (isImage(request, url)) {
    event.respondWith(staleWhileRevalidate(IMAGE_CACHE, request));
  } else if (url.pathname.startsWith("/api/data")) {
    event.respondWith(networkFirst(DATA_CACHE, request));
  }
});
