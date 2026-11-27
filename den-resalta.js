// ══════════════════════════════════════════════════════════════════════
// RESALTAR LA DENOMINACIÓN QUE SE ESTÁ ANOTANDO
//
// En las grillas de «cantidad por billete/moneda» (desgloses, verificar,
// conteos), al poner el cursor en una cantidad se pinta su denominación
// ($20.000, $10.000…) y la fila: así, mientras se anota, se sabe a qué
// billete va el número.
//
// Es uno solo para todas las grillas, también las que se dibujan después:
// escucha el foco a nivel de documento y busca la etiqueta de la fila.
// Para no pintar otros campos, solo actúa si
//   · la etiqueta es una denominación real (billetes, monedas o fichas), y
//   · la fila está dentro de una grilla con varias cantidades.
// Los estilos se ponen en línea con !important (ganan a los temas) y al
// salir se devuelve el atributo style tal cual estaba.
// ══════════════════════════════════════════════════════════════════════
(function () {
    if (window.__denResalta) return;
    window.__denResalta = true;

    const DENOMS = new Set([1000000, 500000, 200000, 100000, 50000, 20000, 10000,
                            5000, 2000, 1000, 500, 100, 50, 10, 5, 1]);
    const RX = /^\$?\s?(\d{1,3}(?:\.\d{3})*)$/;
    let activos = null;            // [[elemento, styleOriginal], ...]

    function esDenom(el) {
        const m = String(el.textContent || '').trim().match(RX);
        return !!m && DENOMS.has(Number(m[1].replace(/\./g, '')));
    }

    function limpiar() {
        if (!activos) return;
        activos.forEach(([el, st]) => {
            if (st === null) el.removeAttribute('style'); else el.setAttribute('style', st);
            el.removeAttribute('data-den-activa');
        });
        activos = null;
    }

    function buscar(inp) {
        // Se sube desde el campo hasta la fila: un contenedor con pocas
        // cantidades (hasta 3: el arqueo tiene fórmula + cantidad) y una
        // etiqueta de denominación. Si se llega a un contenedor con más
        // cantidades, ya es la grilla entera y se para.
        let n = inp.parentElement;
        for (let i = 0; i < 4 && n && n !== document.body; i++, n = n.parentElement) {
            const nIn = n.querySelectorAll('input').length;
            if (nIn > 3) return null;
            const lbl = [...n.querySelectorAll('*')].find(e =>
                !e.contains(inp) && e.children.length === 0 && esDenom(e));
            if (!lbl) continue;
            // La fila tiene que estar dentro de una grilla (más cantidades).
            let g = n.parentElement, grilla = false;
            for (let j = 0; j < 4 && g && g !== document.body; j++, g = g.parentElement) {
                const gIn = g.querySelectorAll('input').length;
                if (gIn >= 3 && gIn > nIn) { grilla = true; break; }
            }
            return grilla ? { fila: n, lbl } : null;
        }
        return null;
    }

    document.addEventListener('focusin', (e) => {
        let t = e.target;
        // Los botones − / + de una fila cuentan como esa fila.
        if (t instanceof HTMLButtonElement && t.parentElement) {
            const ins = t.parentElement.querySelectorAll('input');
            if (ins.length === 1) t = ins[0];
        }
        limpiar();
        if (!(t instanceof HTMLInputElement)) return;
        if (!/^(number|tel|text)$/.test(t.type)) return;
        const r = buscar(t);
        if (!r) return;
        activos = [[r.lbl, r.lbl.getAttribute('style')], [r.fila, r.fila.getAttribute('style')],
                   [t, t.getAttribute('style')]];
        const s = (el, p, v) => el.style.setProperty(p, v, 'important');
        r.lbl.setAttribute('data-den-activa', 'denominacion'); r.fila.setAttribute('data-den-activa', 'fila');
        s(r.lbl, 'color', '#ffffff'); s(r.lbl, 'background', '#0284c7');
        s(r.lbl, 'border-radius', '7px'); s(r.lbl, 'padding', '1px 7px');
        s(r.lbl, 'font-weight', '800');
        s(r.lbl, 'justify-self', 'start');        // en grillas: la píldora del tamaño del texto
        s(r.fila, 'background', 'rgba(2,132,199,0.13)');
        s(t, 'border-color', '#0284c7'); s(t, 'box-shadow', '0 0 0 2px rgba(2,132,199,0.25)');
    });
    document.addEventListener('focusout', () => {
        // Si el foco pasa a otra cantidad, el focusin de esa ya limpió.
        setTimeout(() => {
            const a = document.activeElement;
            if (!(a instanceof HTMLInputElement) && !(a instanceof HTMLButtonElement)) limpiar();
        }, 0);
    });
})();
