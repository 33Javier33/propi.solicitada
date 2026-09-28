// ============================================================
// ENTRADA POR QR
//
// El QR que genera la administración trae un código opaco, no los datos del
// socio: `?qr=<32 hex>`. Acá se canjea ese código contra Supabase y con lo que
// vuelve se rellena la pantalla de vinculación.
//
// Tres cosas que este archivo se encarga de hacer bien:
//
//  1. El código sale de la barra de direcciones en cuanto se lee
//     (history.replaceState). Si quedara ahí, se iría al historial del
//     navegador y a cualquier captura de pantalla.
//
//  2. Los datos que ya están en la ficha llegan puestos y de solo lectura;
//     los que faltan se piden. De 67 socios, 46 no tienen RUT y 50 no tienen
//     correo, así que pedirlos es el caso normal, no la excepción.
//
//  3. Lo que el socio complete se guarda de vuelta en su ficha, pero la
//     función de Supabase solo rellena campos vacíos: nunca pisa un dato que
//     la administración ya cargó.
//
// El mismo QR sirve para esta app y para diario.propi, una vez en cada una.
// ============================================================

const QR_URL_DIARIO = 'https://diario-propi.vercel.app/';

let _qrEntrada = null;   // { token, socio, falta: ['rut','correo'] }

// El código se guarda en sessionStorage en cuanto se lee, y solo entonces sale
// de la URL.
//
// No es un adorno: en la PRIMERA visita —justo la del socio que estrena la
// app, que es cuando el QR importa— el Service Worker se instala, toma el
// control y la página se recarga sola (index.html, 'controllerchange'). Sin
// guardarlo, esa recarga se lleva el código y el QR no sirve para nada.
//
// sessionStorage es el lugar correcto: sobrevive la recarga y muere al cerrar
// la pestaña, así que el código no queda dando vueltas en el dispositivo.
const QR_GUARDADO = 'qr_token_pendiente';

function _qrTomarToken() {
    let t = '';
    try { t = new URLSearchParams(location.search).get('qr') || ''; } catch (e) { t = ''; }
    if (t) {
        try { sessionStorage.setItem(QR_GUARDADO, t); } catch (e) {}
        try {
            const limpia = location.pathname + location.hash;
            history.replaceState(null, '', limpia || '/');
        } catch (e) {}
    } else {
        try { t = sessionStorage.getItem(QR_GUARDADO) || ''; } catch (e) { t = ''; }
    }
    return /^[a-f0-9]{16,64}$/i.test(t) ? t : '';
}

// Se olvida en cuanto se canjeó (bien o mal): un código ya usado no debe
// volver a intentarse en la próxima recarga.
function _qrOlvidarToken() {
    try { sessionStorage.removeItem(QR_GUARDADO); } catch (e) {}
}

// ── ¿A qué app quiere entrar? ───────────────────────────────────────────────
function _qrPreguntarApp(token) {
    return new Promise(resolve => {
        const d = document.createElement('div');
        d.id = 'qr-elegir-app';
        d.style.cssText = 'position:fixed;inset:0;z-index:999;background:rgba(0,23,35,0.92);'
            + 'display:flex;align-items:center;justify-content:center;padding:20px;';
        d.innerHTML = '<div style="background:#fff;border-radius:22px;padding:24px 20px;max-width:340px;width:100%;text-align:center;box-shadow:0 20px 50px rgba(0,0,0,0.35);">'
            + '<div style="font-size:34px;line-height:1;margin-bottom:10px;">⬛</div>'
            + '<h2 style="font-size:19px;font-weight:800;color:#001723;margin:0 0 6px;">¿A dónde quieres entrar?</h2>'
            + '<p style="font-size:13px;color:#6b7280;margin:0 0 18px;">Tu código sirve para las dos.</p>'
            + '<button id="qr-ir-solicitada" style="width:100%;border:none;border-radius:16px;padding:15px;font-size:15px;font-weight:700;'
            + 'background:#6366f1;color:#fff;cursor:pointer;margin-bottom:9px;">💰 Propina Solicitada</button>'
            + '<button id="qr-ir-diario" style="width:100%;border:none;border-radius:16px;padding:15px;font-size:15px;font-weight:700;'
            + 'background:#0e7490;color:#fff;cursor:pointer;">📔 Diario de Recaudación</button>'
            + '</div>';
        document.body.appendChild(d);
        d.querySelector('#qr-ir-solicitada').onclick = () => { d.remove(); resolve('solicitada'); };
        d.querySelector('#qr-ir-diario').onclick = () => {
            // El código viaja a la otra app, que lo canjea por su cuenta.
            location.replace(QR_URL_DIARIO + '?qr=' + encodeURIComponent(token));
        };
    });
}

function _qrAviso(texto, color) {
    const box = document.getElementById('qr-aviso');
    if (!box) return;
    box.textContent = texto;
    box.style.display = texto ? 'block' : 'none';
    box.style.color = color || '#b45309';
}

// ── Punto de entrada: lo llama window.onload antes de checkSecurity() ───────
// Devuelve true si tomó el control de la pantalla de ingreso.
async function qrIntentarEntrada() {
    const token = _qrTomarToken();
    if (!token) return false;

    const cual = await _qrPreguntarApp(token);
    if (cual !== 'solicitada') return true;   // se fue a diario.propi

    let res = null;
    try {
        const { data, error } = await dbSV.rpc('rpc_canjear_vinculo_qr',
            { p_token: token, p_app: 'solicitada' });
        if (error) throw new Error(error.message);
        res = data;
    } catch (e) {
        // Falla de red: el código NO se olvida, para poder reintentar al recargar.
        alert('No se pudo leer tu código: ' + e.message
            + '\n\nPuedes vincular tu cuenta a mano con tu ID y tu RUT.');
        return false;
    }
    _qrOlvidarToken();   // ya se canjeó: no se reintenta en la próxima recarga

    if (!res || res.ok !== true) {
        const motivos = {
            no_existe:      'Ese código no existe. Pide uno nuevo en la administración.',
            revocado:       'Ese código fue reemplazado por uno más nuevo. Pide el último.',
            vencido:        'Ese código ya venció. Pide uno nuevo en la administración.',
            ya_usado:       'Ese código ya se usó en esta app. Pide uno nuevo si necesitas volver a vincular.',
            socio_inactivo: 'Tu cuenta está marcada como inactiva. Habla con la administración.'
        };
        alert(motivos[res && res.motivo] || 'Tu código no es válido.');
        return false;   // que siga el ingreso normal
    }

    _qrEntrada = { token, socio: res.socio, falta: res.falta || [] };
    _qrPrepararPantalla();
    return true;
}

function _qrPrepararPantalla() {
    const s = _qrEntrada.socio;
    const falta = _qrEntrada.falta;

    document.getElementById('loginOverlay').classList.remove('hidden');
    document.getElementById('fastAccessBox').classList.add('hidden');
    document.getElementById('setupBox').classList.remove('hidden');
    if (typeof _toggleLoginCTA === 'function') _toggleLoginCTA();

    // Saludo con su nombre: confirma que el QR era el suyo antes de tipear nada
    const tit = document.getElementById('setupTitulo');
    const sub = document.getElementById('setupSubtitulo');
    if (tit) tit.textContent = 'Hola, ' + String(s.nombre || '').split(' ')[0];
    if (sub) sub.textContent = falta.length
        ? 'Completa lo que falta y crea tu PIN'
        : 'Solo crea tu PIN para activar este dispositivo';

    // El ID siempre viene del código y no se toca
    const elId = document.getElementById('setupID');
    elId.value = s.id;
    elId.readOnly = true;
    elId.style.background = '#f1f5f9';
    elId.style.color = '#64748b';

    // El RUT viene puesto si la ficha lo tiene; si no, se pide
    const elRut = document.getElementById('setupRUT');
    if (s.rut) {
        elRut.value = s.rut;
        elRut.readOnly = true;
        elRut.style.background = '#f1f5f9';
        elRut.style.color = '#64748b';
    } else {
        elRut.value = '';
        elRut.readOnly = false;
        elRut.placeholder = 'Escribe tu RUT';
    }

    // El correo solo aparece cuando falta: si ya está, no hay nada que pedir
    const bloqueCorreo = document.getElementById('setupCorreoBloque');
    if (bloqueCorreo) bloqueCorreo.style.display = falta.includes('correo') ? '' : 'none';

    _qrAviso(falta.length
        ? 'Estos datos quedan guardados en tu ficha, así no te los volvemos a pedir.'
        : '', '#0e7490');

    setTimeout(() => {
        const primero = s.rut ? document.getElementById('setupPIN') : elRut;
        if (primero) primero.focus();
    }, 150);
}

// ── Guardar lo que el socio completó ───────────────────────────────────────
// Lo llama handleSetup() después de vincular. Si esto falla no se deshace la
// vinculación: el socio ya entró, y el dato que falta se puede pedir de nuevo.
async function qrGuardarDatosCompletados(rut, correo) {
    if (!_qrEntrada) return;
    const falta = _qrEntrada.falta;
    const aEnviar = {
        p_token: _qrEntrada.token,
        p_rut: falta.includes('rut') ? (rut || null) : null,
        p_correo: falta.includes('correo') ? (correo || null) : null
    };
    if (!aEnviar.p_rut && !aEnviar.p_correo) return;
    try {
        const { data, error } = await dbSV.rpc('rpc_completar_datos_socio', aEnviar);
        if (error) throw new Error(error.message);
        if (data && data.ok && (data.guardados || []).length) {
            console.log('[QR] Datos completados en la ficha:', data.guardados.join(', '));
        }
    } catch (e) {
        console.warn('[QR] No se pudieron guardar los datos completados:', e.message);
    }
}

function qrCorreoEscrito() {
    const el = document.getElementById('setupCorreo');
    return el ? String(el.value || '').trim() : '';
}

function qrEnCurso() { return _qrEntrada !== null; }
