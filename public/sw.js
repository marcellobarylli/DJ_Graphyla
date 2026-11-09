/* DJ Graphyla service worker: makes the app work offline after the first visit.
 * - Page navigations: network first, always revalidated with the server
 *   (cache: 'no-cache'), so an installed app loads the newest deploy whenever
 *   it is online. The cached copy is only used offline.
 * - The record shop (record-shop/…): network first, cached copy offline.
 * - Other same-origin GET requests (content-hashed JS/CSS, icons): cache first.
 * The cache name stays the same across deploys on purpose: renaming it would
 * drop the cached assets, and the app could fail to open offline right after
 * an update. */
const CACHE = 'dj-graphyla-v1';
const SHELL = ['./', './index.html', './manifest.webmanifest', './graphyla-icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  // The deployed version must always come from the network (the app compares it with its own).
  if (new URL(req.url).pathname.endsWith('/version.json')) return;
  // The record shop changes with every upload: network first, the cached copy only offline.
  if (new URL(req.url).pathname.includes('/record-shop/')) {
    event.respondWith(
      fetch(req, { cache: 'no-cache' })
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || new Response('', { status: 504, statusText: 'Offline' }))),
    );
    return;
  }

  if (req.mode === 'navigate') {
    event.respondWith(
      // 'no-cache' = use the network copy, but let the server answer 304 if unchanged.
      fetch(req, { cache: 'no-cache' })
        .then((res) => {
          // Only a real page may replace the offline copy (not an error or redirect).
          if (res.ok && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put('./index.html', copy));
          }
          return res;
        })
        .catch(() => caches.match('./index.html').then((r) => r || caches.match('./'))),
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(
      (cached) =>
        cached ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }),
    ),
  );
});
