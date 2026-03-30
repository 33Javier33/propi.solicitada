// sw.js — Bóveda Personal PWA Service Worker
// CarlosPN Interactive® — Casino de Puerto Varas

const CACHE_NAME = 'boveda-v1';

// Recursos a cachear al instalar
const PRECACHE = [
  './',
  './index.html',
];

// ── INSTALL ──
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE))
  );
  self.skipWaiting();
});

// ── ACTIVATE ──
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── FETCH: Network-first con fallback a caché ──
self.addEventListener('fetch', event => {
  // Solo interceptar GET
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Recursos externos (fonts, CDN) → solo caché si ya existe, sin bloquear
  const isExternal = url.origin !== self.location.origin;

  if (isExternal) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
          }
          return response;
        }).catch(() => cached || new Response('', { status: 503 }));
      })
    );
    return;
  }

  // Recursos locales → Network-first
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
