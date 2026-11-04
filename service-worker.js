/* ZEREOS app shell cache. Large model/WASM assets are intentionally not precached. */
'use strict';

const CACHE_NAME = 'zereos-shell-v15';
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
  new URL('video-studio.html', BASE_URL).href,
  new URL('video-studio.js', BASE_URL).href,
  new URL('video-studio.css', BASE_URL).href,
  new URL('music-studio.html', BASE_URL).href,
  new URL('music-studio.js', BASE_URL).href,
  new URL('music-studio.css', BASE_URL).href,
  new URL('quran-studio.html', BASE_URL).href,
  new URL('quran-studio.js', BASE_URL).href,
  new URL('quran-studio.css', BASE_URL).href,
  new URL('manifest.webmanifest', BASE_URL).href,
  new URL('assets/zereos-icon.svg', BASE_URL).href,
  new URL('assets/template-zereos-ivory.svg', BASE_URL).href,
  new URL('assets/template-zereos-noir.svg', BASE_URL).href,
  new URL('assets/template-zereos-royal.svg', BASE_URL).href,
  new URL('assets/template-zereos-nebula.svg', BASE_URL).href,
  new URL('assets/template-zereos-cyber.svg', BASE_URL).href,
  new URL('assets/template-zereos-ember.svg', BASE_URL).href,
  new URL('assets/template-zereos-ocean.svg', BASE_URL).href,
  new URL('assets/template-zereos-emerald.svg', BASE_URL).href,
  new URL('assets/template-zereos-manuscript.svg', BASE_URL).href,
  new URL('assets/template-zereos-minimal.svg', BASE_URL).href,
  new URL('assets/template-zereos-aurora.svg', BASE_URL).href,
  new URL('assets/template-zereos-crystal.svg', BASE_URL).href
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

// Stream MediaRecorder chunks straight to the browser download response.
// This avoids retaining the entire exported movie in the Android tab's RAM.
const zereosStreams = new Map();
self.addEventListener('message', event => {
  const data = event.data || {};
  if (data.type !== 'ZEREOS_STREAM_START' || !event.ports[0]) return;
  const port = event.ports[0];
  let controller, keepAliveResolve;
  const keepAlive = new Promise(resolve => { keepAliveResolve = resolve; });
  event.waitUntil(keepAlive);
  const stream = new ReadableStream({ start(c) { controller = c; } });
  const expiry = setTimeout(() => {
    const stale = zereosStreams.get(data.token);
    if (stale) { zereosStreams.delete(data.token); stale.keepAliveResolve?.(); }
  }, 120000);
  zereosStreams.set(data.token, { stream, controller, filename: data.filename, mime: data.mime, port, keepAliveResolve, expiry });
  port.onmessage = message => {
    const item = message.data || {};
    try {
      if (item.type === 'chunk' && controller) controller.enqueue(new Uint8Array(item.bytes));
      else if ((item.type === 'close' || item.type === 'finish') && controller) { controller.close(); controller = null; /* Keep the completed stream addressable until the browser's download request arrives. */ }
      else if (item.type === 'abort' && controller) { controller.error(new Error('Export cancelled')); controller = null; zereosStreams.delete(data.token); keepAliveResolve?.(); }
    } catch (_) { zereosStreams.delete(data.token); }
  };
  port.postMessage({ type: 'ready' });
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  const url = new URL(request.url);
  const streamMatch = url.pathname.match(/\/__zereos_stream__\/([^/]+)$/);
  if (streamMatch) {
    const entry = zereosStreams.get(streamMatch[1]);
    if (!entry) { event.respondWith(new Response('Export stream not found', { status: 404 })); return; }
    zereosStreams.delete(streamMatch[1]);
    clearTimeout(entry.expiry);
    entry.keepAliveResolve?.();
    event.respondWith(new Response(entry.stream, { headers: {
      'Content-Type': entry.mime || 'application/octet-stream',
      'Content-Disposition': 'attachment; filename="' + String(entry.filename).replace(/["\\\\\\r\\n]/g, '') + '"',
      'Cache-Control': 'no-store'
    }}));
    return;
  }
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
