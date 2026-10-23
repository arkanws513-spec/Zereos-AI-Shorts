/* ZEREOS app shell cache. Large model/WASM assets are intentionally not precached. */
'use strict';

const CACHE_NAME = 'zereos-shell-v6';
const BASE_URL = new URL('./', self.location.href);
const SHELL_URLS = [
  BASE_URL.href,
  new URL('index.html', BASE_URL).href,
  new URL('storage.js', BASE_URL).href,
  new URL('scene-renderer.js', BASE_URL).href,
  new URL('app.js', BASE_URL).href,
  new URL('audio-workflows.js', BASE_URL).href,
  new URL('project-library.js', BASE_URL).href,
  new URL('app.css', BASE_URL).href,
  new URL('studio-pro.js', BASE_URL).href,
  new URL('studio-pro.css', BASE_URL).href,
  new URL('tts-engine.js', BASE_URL).href,
  new URL('avatar-studio.js', BASE_URL).href,
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

    // Network-first keeps the installed app shell from getting stuck on an old
    // HTML/JS build when the cache name did not change between deployments.
    try {
      const fresh = await fetch(request, { cache: 'no-cache' });
      if (fresh.ok) {
        cache.put(request, fresh.clone()).catch(() => {});
        return fresh;
      }
      const cached = await cache.match(request);
      return cached || fresh;
    } catch (_) {
      const cached = await cache.match(request);
      if (cached) return cached;
      throw new Error('The app shell is not cached and the network is unavailable.');
    }
  })());
});
