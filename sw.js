const CACHE_NAME = 'boveda-personal-v4';

const urlsToCache = [
    'index.html',
    'manifest.json',
    'img/icon-192x192.png',
    'img/icon-512x512.png'
];

// 1. Install — cachear archivos estáticos y esperar confirmación del usuario
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(urlsToCache))
        // SIN skipWaiting aquí — el SW nuevo espera hasta que el usuario toque "Actualizar"
    );
});

// 2. Activate — limpiar cachés viejos y tomar control inmediato
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        )
    );
    self.clients.claim();
});

// 3. Escuchar mensaje del HTML para activarse cuando el usuario toca "Actualizar"
self.addEventListener('message', event => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

// 4. Fetch — estrategia según el tipo de request
self.addEventListener('fetch', event => {
    const url = event.request.url;

    // Llamadas al GAS → siempre red, nunca caché
    if (url.includes('script.google.com')) {
        event.respondWith(
            fetch(event.request).catch(() =>
                new Response(JSON.stringify({ status: 'error', message: 'Sin conexión' }),
                    { headers: { 'Content-Type': 'application/json' } })
            )
        );
        return;
    }

    // Peticiones externas (CDNs, fonts, APIs) → no interceptar
    if (!url.startsWith(self.location.origin)) {
        return;
    }

    // Archivos estáticos propios → cache-first
    event.respondWith(
        caches.match(event.request).then(cached => {
            return cached || fetch(event.request).then(response => {
                // Guardar en caché solo respuestas válidas
                if (response && response.status === 200) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                }
                return response;
            });
        })
    );
});
