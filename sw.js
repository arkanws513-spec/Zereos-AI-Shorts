/* ZEREOS offline shell: cache only small first-party shell files, never large model/media assets. */
const CACHE_NAME = 'zereos-shell-v1';
const SHELL_FILES = [
  './',
  './index.html',
  './storage.js',
  './manifest.webmanifest',
  './assets/zereos-icon.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(SHELL_FILES);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith('zereos-shell-') && key !== CACHE_NAME).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  const url = new URL(request.url);
  const isShellFile = SHELL_FILES.some((path) => new URL(path, self.registration.scope).pathname === url.pathname);
  if (!isShellFile) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      const response = await fetch(request);
      if (response && response.ok) await cache.put(request, response.clone());
      return response;
    } catch (error) {
      const cached = await cache.match(request) || await cache.match('./') || await cache.match('./index.html');
      if (cached) return cached;
      throw error;
    }
  })());
});
