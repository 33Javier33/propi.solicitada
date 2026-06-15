const CACHE_NAME = 'boveda-personal-v14';

const urlsToCache = [
    'index.html',
    'app.css',
    'app.js',
    'supabase-api.js',
    'manifest.json',
    'img/icon-192x192.png',
    'img/icon-512x512.png'
];

// 1. Install — cachear archivos y activar inmediatamente
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(urlsToCache))
            .then(() => self.skipWaiting()) // activa de inmediato sin esperar
    );
});

// 2. Activate — limpiar cachés viejos y tomar control de todas las pestañas
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        ).then(() => self.clients.claim()) // toma control inmediato
    );
});

// 3. Fetch — estrategia según tipo de request
self.addEventListener('fetch', event => {
    const url = event.request.url;

    // GAS → siempre red, nunca caché
    if (url.includes('script.google.com')) {
        event.respondWith(
            fetch(event.request).catch(() =>
                new Response(JSON.stringify({ status: 'error', message: 'Sin conexión' }),
                    { headers: { 'Content-Type': 'application/json' } })
            )
        );
        return;
    }

    // Externas (CDNs, fonts) → no interceptar
    if (!url.startsWith(self.location.origin)) {
        return;
    }

    // Archivos propios → network-first para garantizar versión nueva
    event.respondWith(
        fetch(event.request).then(response => {
            if (response && response.status === 200) {
                const clone = response.clone();
                caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
            }
            return response;
        }).catch(() =>
            caches.match(event.request)
        )
    );
});
