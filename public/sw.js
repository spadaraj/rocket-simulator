// Offline support so the installed app works without Wi-Fi.
// The page itself is fetched fresh when online (so updates arrive), and falls back to
// the cached copy offline. Everything else (hashed scripts, styles, icons) is cached
// the first time it loads and served from the cache after that.

const CACHE = 'rockets-v2';

// The painted Space Q art, cached up front so every character and scene works offline.
const ART = [
  './art/backgrounds/base-day.webp',
  './art/backgrounds/base-night.webp',
  './art/backgrounds/hangar.webp',
  './art/characters/did-blink.webp',
  './art/characters/did-neutral.webp',
  './art/characters/did-point.webp',
  './art/characters/did-portrait.webp',
  './art/characters/engineer-blink.webp',
  './art/characters/engineer-neutral.webp',
  './art/characters/engineer-oops.webp',
  './art/characters/roscoe-blink.webp',
  './art/characters/roscoe-neutral.webp',
  './art/characters/roscoe-oops.webp',
  './art/characters/roscoe-portrait.webp',
  './art/characters/roscoe-wow.webp',
  './art/characters/scientist-blink.webp',
  './art/characters/scientist-chart.webp',
  './art/characters/scientist-neutral.webp',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', './manifest.webmanifest', './icons/icon-192.png', ...ART])));
  self.skipWaiting();
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

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('./', copy));
          return res;
        })
        .catch(() => caches.match('./')),
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
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
