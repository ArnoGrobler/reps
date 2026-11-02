// Offline support: network first (so updates arrive right away), cache as fallback.
// GitHub Pages lets browsers reuse files for 10 minutes; every request here asks the
// server whether the file changed (cheap 304 when it hasn't), so updates are never stuck.
const CACHE = 'reps-v5';
const SHELL = [
  './', './index.html', './manifest.webmanifest', './css/app.css',
  './js/app.js', './js/icons.js', './js/ui.js', './js/store.js', './js/dates.js', './js/data.js',
  './js/generator.js', './js/audio.js', './js/player.js', './js/wizard.js', './js/sync.js', './js/data/exercises.js', './js/data/templates.js',
  './js/views/today.js', './js/views/calendar.js', './js/views/plan.js', './js/views/library.js',
  './js/views/day.js', './js/views/editor.js', './js/views/settings.js', './js/views/profiles.js', './js/views/sync.js', './js/views/proven.js',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' })
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('./index.html'))),
  );
});
