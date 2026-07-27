const CACHE_NAME = 'boveda-personal-v117';

const urlsToCache = [
    'index.html',
    'app.css',
    'app.js',
    'supabase-api.js',
    'manifest.json',
    'img/icon-192x192.png',
    'img/icon-512x512.png'
];

// 1. Install — cachear archivos. NO activa de inmediato: espera a que el banner
//    (o el auto-update de 15s) mande SKIP_WAITING, para no reiniciar sin avisar.
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
    );
});

// Activar la nueva versión cuando la app lo pida (botón Actualizar o auto a los 15s)
self.addEventListener('message', event => {
    if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

// ── NOTIFICACIONES PUSH ──────────────────────────────────────────────
// Se muestran aunque la app esté cerrada / en segundo plano.
self.addEventListener('push', event => {
    let data = {};
    try { data = event.data ? event.data.json() : {}; }
    catch (e) { data = { title: 'Bóveda Personal', body: event.data ? event.data.text() : '' }; }
    const title = data.title || 'Bóveda Personal';
    const options = {
        body: data.body || '',
        icon: 'img/icon-192x192.png',
        badge: 'img/icon-192x192.png',
        vibrate: [80, 40, 80],
        data: { url: data.url || './' },
        tag: data.tag || 'propi-msg',
        renotify: true
    };
    event.waitUntil(self.registration.showNotification(title, options));
});

// Al tocar la notificación: enfocar la app si está abierta, o abrirla
self.addEventListener('notificationclick', event => {
    event.notification.close();
    const url = (event.notification.data && event.notification.data.url) || './';
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
            for (const c of list) { if ('focus' in c) return c.focus(); }
            if (clients.openWindow) return clients.openWindow(url);
        })
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

    // Archivos propios → network-first. Para los archivos "core" (html/js/css y
    // navegaciones) se pide SIN caché HTTP (cache:'no-store'), así siempre baja la
    // versión recién publicada aunque el navegador/CDN tenga una copia vieja.
    const esCore = event.request.mode === 'navigate' || /\.(html|js|css)(\?.*)?$/.test(url);
    const req = esCore ? new Request(event.request.url, { cache: 'no-store', credentials: 'same-origin' }) : event.request;
    event.respondWith(
        fetch(req).then(response => {
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
