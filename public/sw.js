/* Device-local offline shell. Provider data and cross-origin requests are never cached. */
const CACHE = 'resonance-shell-v3';
const asset = (url) =>
  url.origin === self.location.origin &&
  /\.(?:js|css|woff2?|svg|png)$/.test(url.pathname) &&
  !url.pathname.startsWith('/api/');
async function store(request) {
  const response = await fetch(request);
  if (
    response.ok &&
    !response.redirected &&
    new URL(response.url).origin === self.location.origin
  ) {
    try {
      const cache = await caches.open(CACHE);
      await cache.put(request, response.clone());
    } catch {
      /* A full cache must never turn a working network request into a failure. */
    }
  }
  return response;
}
self.addEventListener('install', (event) =>
  event.waitUntil(
    store('/')
      .catch(() => {})
      .then(() => self.skipWaiting()),
  ),
);
self.addEventListener('activate', (event) =>
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith('resonance-shell-') && k !== CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .catch(() => {})
      .then(() => self.clients.claim()),
  ),
);
self.addEventListener('message', (event) => {
  if (event.data?.type !== 'CACHE_SHELL' || !Array.isArray(event.data.assets))
    return;
  const assets = event.data.assets
    .filter((value) => {
      try {
        return typeof value === 'string' && asset(new URL(value));
      } catch {
        return false;
      }
    })
    .slice(0, 150);
  event.waitUntil(
    Promise.allSettled(['/', ...assets].map(store)).then(() =>
      event.source?.postMessage({ type: 'SHELL_CACHE_ATTEMPTED' }),
    ),
  );
});
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (
    request.method !== 'GET' ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/cdn-cgi/') ||
    url.pathname.includes('auth')
  )
    return;
  if (request.mode === 'navigate') {
    event.respondWith(
      store(request)
        .then(async (response) => {
          if (response.ok && !response.redirected) {
            try {
              const cache = await caches.open(CACHE);
              await cache.put('/', response.clone());
            } catch {
              /* Online navigation remains usable when caching is unavailable. */
            }
          }
          return response;
        })
        .catch(() =>
          caches
            .match('/')
            .catch(() => undefined)
            .then((r) => r || Response.error()),
        ),
    );
    return;
  }
  if (asset(url)) {
    event.respondWith(
      caches
        .match(request)
        .catch(() => undefined)
        .then((cached) => cached || store(request)),
    );
  }
});
