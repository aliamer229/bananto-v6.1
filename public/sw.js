/* Banana Store service worker — Cloudflare-only asset + data caching. */
const VERSION = "banana-v9";
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

/*
  How long a cached catalogue may still be served after the network fails.

  The catalogue is the one response that must never outlive the truth: a stale
  copy shows products that were deleted and prices that changed. Network-first
  already means an online visitor cannot see a stale catalogue at all, and this
  bounds the offline case — past it, failing is more honest than serving a
  catalogue from last week.
*/
const DATA_MAX_OFFLINE_AGE_MS = 6 * 60 * 60 * 1000;

/** Network first for data queries. Never serves stale data to an online visitor. */
async function networkFirst(cacheName, request) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);

    /*
      A conditional request answered 304 has no body. Returning it to the page
      would look like an empty catalogue, so the cached copy the validator
      refers to is served instead — which is what 304 means.
    */
    if (response && response.status === 304) {
      const cached = await cache.match(request);
      if (cached) return cached;
      // No cached body to pair with the validator: ask again unconditionally.
      return fetch(new Request(request.url, { cache: "reload", credentials: request.credentials }));
    }

    if (response && response.status === 200) {
      // The stored copy is stamped so its age can be judged on the way out.
      const body = await response.clone().blob();
      const headers = new Headers(response.headers);
      headers.set("x-sw-cached-at", String(Date.now()));
      cache.put(request, new Response(body, { status: 200, headers }));
    }
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) {
      const cachedAt = Number(cached.headers.get("x-sw-cached-at") || 0);
      if (!cachedAt || Date.now() - cachedAt <= DATA_MAX_OFFLINE_AGE_MS) return cached;
      await cache.delete(request);
    }
    throw error;
  }
}

/*
  Targeted invalidation. After a product is created, edited, hidden or deleted,
  the admin page tells the worker to drop just the catalogue cache — rather than
  bumping VERSION, which would throw away every cached image as well.
*/
self.addEventListener("message", (event) => {
  const type = event?.data?.type;
  if (type === "catalog-changed") {
    event.waitUntil(caches.delete(DATA_CACHE));
  }
});

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
