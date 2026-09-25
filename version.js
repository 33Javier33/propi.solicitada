// Prefijo de la caché de ESTA app (la del Service Worker) y número de
// respaldo por si todavía no hay Service Worker activo.
const VERSION_PREFIJO = 'boveda-personal-v';
const VERSION_FALLBACK = 175;

// ══════════════════════════════════════════════════════════════════════
// VERSIÓN QUE SE ESTÁ VIENDO
//
// El número NO se escribe a mano: se lee del nombre de la caché que el
// Service Worker tiene activa en este dispositivo. Así lo que aparece en
// pantalla es la versión que de verdad se está usando, no la que dice el
// código — que es justo la diferencia que importa cuando uno se pregunta
// "¿ya me llegó el cambio?".
//
// Se pinta en todo elemento con la clase `app-version`, que va al lado de
// la marca. Si hubiera varias cachés (la vieja todavía sin borrar y la
// nueva recién instalada) se muestra la MÁS ALTA, que es la que va a
// quedar en cuanto el Service Worker termine de activarse.
// ══════════════════════════════════════════════════════════════════════
(function () {
    function pintar(txt) {
        document.querySelectorAll('.app-version').forEach(function (el) { el.textContent = txt; });
    }

    async function leerVersion() {
        try {
            if (!('caches' in window)) return null;
            var nombres = await caches.keys();
            var mayor = null;
            nombres.forEach(function (n) {
                if (n.indexOf(VERSION_PREFIJO) !== 0) return;   // otra app del mismo dominio
                var m = /v(\d+)$/.exec(n);
                if (m && (mayor === null || +m[1] > mayor)) mayor = +m[1];
            });
            return mayor;
        } catch (e) { return null; }
    }

    async function actualizar() {
        var v = await leerVersion();
        // Sin Service Worker todavía (primera visita, o modo incógnito) se usa
        // el número del código, para no dejar el hueco vacío.
        pintar('v' + (v === null ? VERSION_FALLBACK : v));
    }

    actualizar();
    // Se repite al terminar de cargar el HTML: si este script quedó ANTES de
    // algún elemento con la clase —en diario.propi la chapita fija va al final
    // del body—, ese elemento todavía no existía en la primera pasada y se
    // habría quedado con el guion.
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', actualizar);
    }
    // El Service Worker puede activarse unos segundos después de cargar la
    // página: al hacerlo, el número se corrige solo sin recargar.
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready.then(function () { setTimeout(actualizar, 400); }).catch(function () {});
        navigator.serviceWorker.addEventListener('controllerchange', function () { setTimeout(actualizar, 400); });
    }
})();
