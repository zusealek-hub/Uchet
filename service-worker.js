'use strict';

const CACHE_NAME = 'uchet-cache-v6';

const APP_SHELL = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/manifest.json',
  '/icons/icon-192.svg',
  '/icons/icon-512.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
          return Promise.resolve();
        })
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Только свой origin
  if (url.origin !== self.location.origin) return;

  // Навигация: всегда пытаться отдать app shell
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          const cache = await caches.open(CACHE_NAME);
          cache.put('/index.html', fresh.clone());
          return fresh;
        } catch {
          const cached = await caches.match('/index.html');
          if (cached) return cached;
          return new Response('Offline', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
          });
        }
      })()
    );
    return;
  }

  // Для остальных файлов: cache first
  event.respondWith(
    (async () => {
      const cached = await caches.match(req, { ignoreSearch: true });
      if (cached) return cached;

      try {
        const fresh = await fetch(req);
        if (fresh && fresh.ok) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(req, fresh.clone());
        }
        return fresh;
      } catch {
        const fallback = await caches.match(req, { ignoreSearch: true });
        if (fallback) return fallback;
        return new Response('', { status: 404 });
      }
    })()
  );
});
