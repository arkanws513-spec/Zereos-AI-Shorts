/* ZEREOS app shell cache. Large model/WASM assets are intentionally not precached. */
'use strict';

const CACHE_NAME = 'zereos-shell-v1';
const BASE_URL = new URL('./', self.location.href);
const SHELL_URLS = [
  BASE_URL.href,
  new URL('index.html', BASE_URL).href,
  new URL('storage.js', BASE_URL).href,
  new URL('manifest.webmanifest', BASE_URL).href,
  new URL('assets/zereos-icon.svg', BASE_URL).href
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(SHELL_URLS);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('zereos-shell-') && key !== CACHE_NAME).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  const url = new URL(request.url);
  const isNavigation = request.mode === 'navigate';
  const isShellAsset = SHELL_URLS.includes(url.href);
  if (!isNavigation && !isShellAsset) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    if (isNavigation) {
      try {
        const fresh = await fetch(request);
        if (fresh.ok) cache.put(BASE_URL.href, fresh.clone()).catch(() => {});
        return fresh;
      } catch (_) {
        return (await cache.match(request)) || (await cache.match(BASE_URL.href)) || (await cache.match(new URL('index.html', BASE_URL).href));
      }
    }

    const cached = await cache.match(request);
    if (cached) return cached;
    const fresh = await fetch(request);
    if (fresh.ok) cache.put(request, fresh.clone()).catch(() => {});
    return fresh;
  })());
});
