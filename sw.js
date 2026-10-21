// Offline support. The app shell is served from the cache for instant start-up
// and refreshed in the background, so a deploy shows up on the next launch.
// Bump VERSION when you change any file to fetch everything again right away.

const VERSION = '1.0.0';
const CACHE = `repit-${VERSION}`;
const INDEX = new URL('./index.html', self.location).href;
const ROOT = new URL('./', self.location).href;
const ASSETS = [
  './index.html',
  './styles.css',
  './js/app.js',
  './js/chart.js',
  './js/dates.js',
  './js/store.js',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(ASSETS.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('repit-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  let key = url.href.split('#')[0];
  if (request.mode === 'navigate') {
    const path = url.origin + url.pathname;
    if (path !== ROOT && path !== INDEX) return; // not the app page: let the browser handle it
    key = INDEX;
  }
  event.respondWith(cachedThenRefresh(key, event));
});

async function cachedThenRefresh(key, event) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(key);
  const fresh = fetch(key, { cache: 'no-cache' }).then((res) => {
    if (res.ok) cache.put(key, res.clone());
    return res;
  });
  if (!cached) return fresh;
  event.waitUntil(fresh.catch(() => {}));
  return cached;
}
