/* Cache immutable application assets only. Accounts, navigation, auth and media stay on the network. */
const CACHE = 'resonance-assets-v4';
const asset = (url) =>
  url.origin === self.location.origin &&
  url.pathname.startsWith('/assets/') &&
  /\.(?:js|css|woff2?|svg|png)$/.test(url.pathname);
async function store(request) {
  const response = await fetch(request);
  if (
    response.ok &&
    !response.redirected &&
    !/no-store|private/i.test(response.headers.get('cache-control') || '') &&
    new URL(response.url).origin === self.location.origin
  ) {
    try {
      const cache = await caches.open(CACHE);
      await cache.put(request, response.clone());
    } catch {}
  }
  return response;
}
self.addEventListener('install', (event) =>
  event.waitUntil(self.skipWaiting()),
);
self.addEventListener('activate', (event) =>
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith('resonance-') && k !== CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  ),
);
self.addEventListener('message', (event) => {
  if (event.data?.type !== 'CACHE_SHELL' || !Array.isArray(event.data.assets))
    return;
  const assets = event.data.assets
    .filter((v) => {
      try {
        return typeof v === 'string' && asset(new URL(v));
      } catch {
        return false;
      }
    })
    .slice(0, 150);
  event.waitUntil(Promise.allSettled(assets.map(store)));
});
self.addEventListener('fetch', (event) => {
  if (
    event.request.method !== 'GET' ||
    event.request.mode === 'navigate' ||
    !asset(new URL(event.request.url))
  )
    return;
  event.respondWith(
    caches
      .match(event.request)
      .catch(() => undefined)
      .then((cached) => cached || store(event.request)),
  );
});
