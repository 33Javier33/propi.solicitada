// Nombre base de la caché de ESTA app y número de respaldo (el del código).
// Solo se usan si el Service Worker no puede decir su propia versión.
const CACHE_BASE = 'boveda-personal-';
const VERSION_FALLBACK = 176;

// ══════════════════════════════════════════════════════════════════════
// VERSIÓN QUE SE ESTÁ VIENDO
//
// Se le PREGUNTA al Service Worker que está controlando la página, y no se
// miran las cachés desde acá. La diferencia importa: en socios-comicion y
// en propi.solicitada la versión nueva se instala pero queda EN ESPERA
// hasta que se aprieta "Actualizar", así que hay dos cachés a la vez y
// desde la página no hay cómo saber cuál manda. Preguntándole al que
// controla, el número es siempre el que de verdad se está usando.
//
// Se pinta en todo elemento con la clase `app-version`.
// ══════════════════════════════════════════════════════════════════════
(function () {
    function pintar(txt) {
        document.querySelectorAll('.app-version').forEach(function (el) { el.textContent = txt; });
    }

    // Pregunta al Service Worker que controla la página. Devuelve el número, o
    // null si no hay ninguno controlando todavía (primera visita, incógnito).
    function preguntarAlSW() {
        return new Promise(function (resolve) {
            var sw = navigator.serviceWorker && navigator.serviceWorker.controller;
            if (!sw) return resolve(null);
            var canal = new MessageChannel();
            var listo = false;
            canal.port1.onmessage = function (e) {
                listo = true;
                var m = /v(\d+)$/.exec(String(e.data || ''));
                resolve(m ? +m[1] : null);
            };
            try { sw.postMessage({ type: 'VERSION' }, [canal.port2]); }
            catch (e) { return resolve(null); }
            // Si el Service Worker es de una versión vieja no sabe responder:
            // no se puede esperar para siempre.
            setTimeout(function () { if (!listo) resolve(null); }, 1200);
        });
    }

    // Respaldo para cuando el Service Worker que controla es ANTERIOR a este
    // cambio y por lo tanto no sabe responder. En ese caso la caché que manda
    // es la más VIEJA de las presentes: si hubiera una más nueva sería una que
    // se instaló y quedó en espera, justo la que todavía NO se está usando.
    // Mostrar el número del código acá sería mentir, que es el error que esto
    // viene a evitar.
    async function menorCachePresente() {
        try {
            if (!('caches' in window)) return null;
            var menor = null;
            (await caches.keys()).forEach(function (n) {
                var m = /v(\d+)$/.exec(n);
                if (!m) return;
                // Solo cachés con el mismo nombre base que la de esta app
                if (n.replace(/v\d+$/, '') !== CACHE_BASE) return;
                if (menor === null || +m[1] < menor) menor = +m[1];
            });
            return menor;
        } catch (e) { return null; }
    }

    async function actualizar() {
        var v = null;
        try { v = await preguntarAlSW(); } catch (e) {}
        if (v === null) { try { v = await menorCachePresente(); } catch (e) {} }
        pintar('v' + (v === null ? VERSION_FALLBACK : v));
    }

    actualizar();
    // Se repite al terminar de cargar el HTML: si este script quedó ANTES de
    // algún elemento con la clase, ese elemento no existía en la primera pasada.
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', actualizar);
    }
    // Cuando el Service Worker toma el control —al entrar por primera vez, o
    // justo después de apretar "Actualizar"— el número se corrige solo.
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.addEventListener('controllerchange', function () {
            setTimeout(actualizar, 300);
        });
        navigator.serviceWorker.ready.then(function () { setTimeout(actualizar, 300); }).catch(function () {});
    }
})();
