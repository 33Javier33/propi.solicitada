// ============================================================
// SUPABASE API — propi.solicitada
// Intercepta las llamadas fetch a GAS y las redirige a Supabase
// NO modifica app.js — solo se carga antes que él
// ============================================================

const SUPABASE_URL_SOCIOS_V = 'https://teemahksasdougehrcly.supabase.co';
const SUPABASE_KEY_SOCIOS_V = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRlZW1haGtzYXNkb3VnZWhyY2x5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyOTkwNjIsImV4cCI6MjA5Njg3NTA2Mn0.EIQ7gRcwf3zYgvGESKw3s5lnZMABN_EuNWsrJK3L1zk';
const SUPABASE_URL_REC_V    = 'https://lpulmjzboogixbdxxayo.supabase.co';
const SUPABASE_KEY_REC_V    = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxwdWxtanpib29naXhiZHh4YXlvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2NjY0NzMsImV4cCI6MjA5MTI0MjQ3M30.vjebyQb4Bb62ZQlNaJZveuxdBYDOmtC4bM7uwAilDzY';

const dbSV = supabase.createClient(SUPABASE_URL_SOCIOS_V, SUPABASE_KEY_SOCIOS_V);
const dbRV = supabase.createClient(SUPABASE_URL_REC_V, SUPABASE_KEY_REC_V);

// ============================================================
// PRESENCIA EN RECAUDACIÓN (tiempo real ENTRE apps)
// Canal compartido 'rec-presencia' en el proyecto REC. Muestra quién está
// en el módulo de recaudación (y qué tipo ingresa) y avisa cuando alguien
// agrega un dato. Lo usan propi.solicitada, diario.propi y socios-comicion.
// ============================================================
(function () {
    const DB = dbRV;                 // cliente del proyecto de recaudaciones
    const APP = 'Propi';             // etiqueta de esta app
    const TIPO_LABEL = { TarjetaMDA: 'Tarjeta MDA', EfectivoMDA: 'Efectivo MDA', SalaDeJuegos: 'Sala de Juegos', Boveda: 'Bóveda' };
    const KEY = 'rp_' + Math.random().toString(36).slice(2) + Date.now();
    let ch = null, mio = null, toastT = null;
    const _esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));

    function _banner(otros) {
        let el = document.getElementById('recPresenciaBanner');
        if (!el) {
            el = document.createElement('div');
            el.id = 'recPresenciaBanner';
            el.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:calc(78px + env(safe-area-inset-bottom));z-index:9000;max-width:92%;background:#0f766e;color:#fff;border-radius:14px;padding:9px 14px;font-size:12px;font-weight:600;box-shadow:0 6px 20px rgba(0,0,0,0.28);display:none;text-align:center;line-height:1.35;';
            document.body.appendChild(el);
        }
        if (!otros.length) { el.style.display = 'none'; return; }
        el.innerHTML = otros.map(o => {
            const t = o.tipo ? (' · ' + (TIPO_LABEL[o.tipo] || o.tipo)) : '';
            return '🟢 <b>' + _esc(o.nombre || 'Alguien') + '</b> está en recaudaciones' + t + ' <span style="opacity:.7">(' + _esc(o.app || '') + ')</span>';
        }).join('<br>');
        el.style.display = 'block';
    }
    function _toast(msg) {
        let el = document.getElementById('recPresenciaToast');
        if (!el) {
            el = document.createElement('div');
            el.id = 'recPresenciaToast';
            el.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);top:calc(12px + env(safe-area-inset-top));z-index:9001;max-width:92%;background:#1e3a5f;color:#fff;border-radius:14px;padding:11px 16px;font-size:13px;font-weight:700;box-shadow:0 6px 22px rgba(0,0,0,0.32);display:none;text-align:center;';
            document.body.appendChild(el);
        }
        el.innerHTML = '📊 ' + _esc(msg);
        el.style.display = 'block';
        clearTimeout(toastT);
        toastT = setTimeout(() => { el.style.display = 'none'; }, 5000);
    }
    function _render() {
        if (!ch) return;
        const st = ch.presenceState();
        const otros = [];
        Object.keys(st).forEach(k => (st[k] || []).forEach(m => { if (m && m.key !== KEY && m.enModal) otros.push(m); }));
        _banner(otros);
    }
    function iniciar() {
        if (ch || typeof DB === 'undefined' || !DB) return;
        ch = DB.channel('rec-presencia', { config: { presence: { key: KEY } } });
        ch.on('presence', { event: 'sync' }, _render)
          .on('broadcast', { event: 'rec-agregado' }, ({ payload }) => {
              if (payload && payload.key !== KEY) {
                  const t = payload.tipo ? (' (' + (TIPO_LABEL[payload.tipo] || payload.tipo) + ')') : '';
                  _toast((payload.nombre || 'Alguien') + ' agregó a recaudaciones' + t);
              }
          })
          .subscribe();
    }
    window.recPresIniciar = iniciar;
    window.recPresEntrar = function (nombre, tipo) {
        iniciar();
        mio = { key: KEY, nombre: nombre || 'Alguien', app: APP, tipo: tipo || '', enModal: true };
        if (ch) { try { ch.track(mio); } catch (e) {} }
    };
    window.recPresTipo = function (tipo) {
        if (mio && ch) { mio.tipo = tipo || ''; try { ch.track(mio); } catch (e) {} }
    };
    window.recPresSalir = function () {
        mio = null;
        if (ch) { try { ch.untrack(); } catch (e) {} }
    };
    window.recPresAgrego = function (nombre, tipo) {
        iniciar();
        if (ch) { try { ch.send({ type: 'broadcast', event: 'rec-agregado', payload: { key: KEY, nombre: nombre || 'Alguien', tipo: tipo || '', app: APP } }); } catch (e) {} }
    };
})();

// Últimos mensajes leídos con éxito. Se usan como respaldo si una consulta a
// Supabase falla de forma transitoria, para NO dejar el chat en blanco.
let _lastNotasRec = null;   // chat Soporte (notas_recaudacion)
let _lastChatSocial = null; // chat Equipo (chat_mensajes)
let _lastAdminMsgs = null;  // mensajes privados del administrador (mensajes_admin)

// URLs originales de GAS — se mantienen en app.js tal cual
const _GAS_SOCIOS = 'https://script.google.com/macros/s/AKfycbyr447pMQtsKoBfp8qTcB1uyE3rORhgPPmZM6Fgia3BgmIvtlZ_h04uGZrmx_HwubHQ/exec';
const _GAS_REC    = 'https://script.google.com/macros/s/AKfycbz_kCb4aEe437zHGbRqnjCibw1NtAqfCbTNmsVPn9jaZOPBFaZ6-FwmiTLqVxq39X1P/exec';

// ── Helpers ────────────────────────────────────────────────────────────────────
function _mockRes(data) {
    return { ok: true, status: 200, json: async () => data, text: async () => JSON.stringify(data) };
}

// Corre una promesa con límite de tiempo. Si expira (o falla), resuelve con `fallback`.
// Se usa para que el arranque en frío del GAS (~30s) NUNCA congele la app: si el GAS
// no responde en pocos segundos, seguimos con lo que hay y él se actualiza en background.
function _conTimeout(promesa, ms, fallback) {
    return Promise.race([
        Promise.resolve(promesa).catch(() => fallback),
        new Promise(resolve => setTimeout(() => resolve(fallback), ms))
    ]);
}

async function _body(options) {
    if (!options || !options.body) return {};
    try { return typeof options.body === 'string' ? JSON.parse(options.body) : options.body; } catch(e) { return {}; }
}

function _action(url, body) {
    try {
        const p = new URLSearchParams(url.split('?')[1] || '');
        return body.action || p.get('action') || '';
    } catch(e) { return body.action || ''; }
}

// ── Migración automática Sheets → Supabase (se ejecuta una vez cuando Supabase está vacío) ──
let _migrEnProceso = false;
async function _migrarASupabase(gasJson) {
    if (_migrEnProceso) return;
    _migrEnProceso = true;
    try {
        const rawAnts = gasJson.anticipos || {};
        const rawExt  = gasJson.extras   || {};
        const antRows = [];
        Object.entries(rawAnts).forEach(([socioId, lista]) => {
            (Array.isArray(lista) ? lista : []).forEach(a => {
                const monto = Number(a.cantidad || a.monto || 0);
                const fecha = String(a.fecha || '').substring(0, 10);
                if (!fecha || monto <= 0) return;
                antRows.push({ socio_id: String(socioId), fecha, monto, responsable: a.responsable || '' });
            });
        });
        const extRows = [];
        Object.entries(rawExt).forEach(([socioId, lista]) => {
            (Array.isArray(lista) ? lista : []).forEach(e => {
                const fecha = String(e.fecha || '').substring(0, 10);
                if (!fecha || !e.tipo) return;
                extRows.push({ socio_id: String(socioId), fecha, tipo: e.tipo, monto: Number(e.monto || 0), detalle: e.detalle || '' });
            });
        });
        if (antRows.length === 0 && extRows.length === 0) return;
        console.log('[SB-V-MIGR] Migrando', antRows.length, 'anticipos,', extRows.length, 'extras a Supabase...');
        for (let i = 0; i < antRows.length; i += 500) {
            const { error } = await dbSV.from('anticipos').insert(antRows.slice(i, i + 500));
            if (error) { console.warn('[SB-V-MIGR] Error anticipos:', error.message); return; }
        }
        for (let i = 0; i < extRows.length; i += 500) {
            const { error } = await dbSV.from('extras').insert(extRows.slice(i, i + 500));
            if (error) { console.warn('[SB-V-MIGR] Error extras:', error.message); }
        }
        console.log('[SB-V-MIGR] ✅ Migración completa:', antRows.length, 'anticipos,', extRows.length, 'extras');
    } catch(e) {
        console.warn('[SB-V-MIGR]', e.message);
    } finally {
        _migrEnProceso = false;
    }
}

// Cache de sesión para días PT desde GAS (evita re-fetch en cada refresh)
let _diasPtGasCache = null;

// ── HANDLER: SOCIOS ────────────────────────────────────────────────────────────
async function _sociosHandler(url, options) {
    const b = await _body(options);
    const action = _action(url, b);

    switch (action) {

        // Solicitud de egreso (anticipo) hecha por el socio desde la app.
        // Crea un registro PENDIENTE que la administración ve en socios-comicion.
        case 'solicitarEgreso': {
            const id = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : ('EGR-' + Date.now());
            const { error } = await dbSV.from('solicitudes_egreso').insert({
                id,
                socio_id: String(b.socioId || ''),
                socio_nombre: b.socioNombre || '',
                monto: Number(b.monto) || 0,
                nota: b.nota || '',
                estado: 'PENDIENTE'
            });
            // Avisar en tiempo real a socios-comicion (si está escuchando)
            if (!error) dbSV.channel('sv-egresos').send({ type: 'broadcast', event: 'nueva', payload: {} }).catch(() => {});
            return _mockRes({ success: !error, error: error && error.message, id });
        }

        // El socio cancela su(s) solicitud(es) de egreso PENDIENTE(s) (por error o
        // arrepentimiento). Solo borra las PENDIENTES — nunca las ya procesadas.
        case 'cancelarEgreso': {
            const sid = String(b.socioId || '');
            if (!sid) return _mockRes({ success: false, error: 'socioId requerido' });
            const { error } = await dbSV.from('solicitudes_egreso')
                .delete().eq('socio_id', sid).eq('estado', 'PENDIENTE');
            if (!error) dbSV.channel('sv-egresos').send({ type: 'broadcast', event: 'cancelada', payload: {} }).catch(() => {});
            return _mockRes({ success: !error, error: error && error.message });
        }

        // Última solicitud de egreso PENDIENTE del socio (para mostrar el estado en la app)
        case 'miSolicitudEgreso': {
            const { data } = await dbSV.from('solicitudes_egreso')
                .select('*').eq('socio_id', String(b.socioId || ''))
                .eq('estado', 'PENDIENTE')
                .order('created_at', { ascending: false }).limit(1);
            return _mockRes({ data: (data || [])[0] || null });
        }

        // ── DÍAS PART-TIME AUTOGESTIÓN ────────────────────────────────────────
        // El socio Part-Time marca un día trabajado desde su calendario. Crea una
        // solicitud PENDIENTE que la administración confirma en socios-comicion.
        // Al confirmarse, el día pasa a la planilla real (tabla dias_pt).
        case 'marcarDiaPT': {
            const sid = String(b.socioId || '');
            const fecha = String(b.fecha || '').substring(0, 10);
            if (!sid || !fecha) return _mockRes({ success: false, error: 'Faltan datos' });
            const id = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : ('DPT-' + Date.now());
            // upsert por (socio_id, fecha): si estaba RECHAZADO vuelve a PENDIENTE
            const { error } = await dbSV.from('dias_pt_solicitados').upsert({
                id,
                socio_id: sid,
                socio_nombre: b.socioNombre || '',
                area: b.area || '',
                fecha,
                periodo: b.periodo || '',
                estado: 'PENDIENTE',
                valor_estimado: Number(b.valorEstimado) || 0,
                created_at: new Date().toISOString(),
                confirmado_por: null,
                confirmado_at: null
            }, { onConflict: 'socio_id,fecha' });
            if (!error) dbSV.channel('sv-dias-pt').send({ type: 'broadcast', event: 'nuevo', payload: {} }).catch(() => {});
            return _mockRes({ success: !error, error: error && error.message });
        }

        // El socio quita un día que había marcado (solo si aún está PENDIENTE).
        case 'desmarcarDiaPT': {
            const sid = String(b.socioId || '');
            const fecha = String(b.fecha || '').substring(0, 10);
            if (!sid || !fecha) return _mockRes({ success: false, error: 'Faltan datos' });
            const { error } = await dbSV.from('dias_pt_solicitados')
                .delete().eq('socio_id', sid).eq('fecha', fecha).eq('estado', 'PENDIENTE');
            if (!error) dbSV.channel('sv-dias-pt').send({ type: 'broadcast', event: 'quitado', payload: {} }).catch(() => {});
            return _mockRes({ success: !error, error: error && error.message });
        }

        // Días marcados por el socio (PENDIENTE / RECHAZADO) para pintarlos en su calendario.
        case 'misDiasPTSolicitados': {
            const { data } = await dbSV.from('dias_pt_solicitados')
                .select('fecha, estado, valor_estimado, motivo_rechazo')
                .eq('socio_id', String(b.socioId || ''))
                .in('estado', ['PENDIENTE', 'RECHAZADO'])
                .order('fecha', { ascending: true });
            return _mockRes({ data: data || [] });
        }

        // Mensajes privados administrador ⇄ socio (tabla mensajes_admin)
        case 'getAdminMsgs': {
            let { data, error } = await dbSV.from('mensajes_admin')
                .select('*').eq('socio_id', String(b.socioId || ''))
                .neq('estado', 'DELETED').order('created_at', { ascending: true });
            if (error) { // reintento único ante fallo transitorio
                await new Promise(r => setTimeout(r, 400));
                ({ data, error } = await dbSV.from('mensajes_admin')
                    .select('*').eq('socio_id', String(b.socioId || ''))
                    .neq('estado', 'DELETED').order('created_at', { ascending: true }));
            }
            if (error || !data) return _mockRes({ data: _lastAdminMsgs || [] });
            const mapped = data.map(m => ({
                uuid: m.id, fecha: m.created_at, autor: m.autor,
                remitente: m.remitente, mensaje: m.mensaje, nota: m.mensaje,
                foto: m.foto_url || ''
            }));
            _lastAdminMsgs = mapped;
            return _mockRes({ data: mapped });
        }
        case 'sendAdminMsg': {
            const id = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : ('MA-' + Date.now());
            const { error } = await dbSV.from('mensajes_admin').insert({
                id, socio_id: String(b.socioId || ''),
                remitente: b.remitente || 'SOCIO',
                autor: b.autor || '', mensaje: b.mensaje || '',
                foto_url: b.foto_url || null
            });
            return _mockRes({ success: !error, error: error && error.message, id });
        }

        // Suscripción a notificaciones push (Web Push) del socio
        case 'savePushSub': {
            const sub = b.sub || {};
            if (!sub.endpoint) return _mockRes({ success: false, error: 'sin endpoint' });
            const id = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : ('PS-' + Date.now());
            const { error } = await dbSV.from('push_subscriptions').upsert({
                id, socio_id: String(b.socioId || ''),
                endpoint: sub.endpoint,
                p256dh: (sub.keys && sub.keys.p256dh) || '',
                auth: (sub.keys && sub.keys.auth) || '',
                user_agent: b.ua || ''
            }, { onConflict: 'endpoint' });
            return _mockRes({ success: !error, error: error && error.message });
        }
        case 'deletePushSub': {
            if (b.endpoint) await dbSV.from('push_subscriptions').delete().eq('endpoint', b.endpoint);
            return _mockRes({ success: true });
        }

        // Lista de socios activos (PascalCase para compatibilidad con app.js)
        case 'getSocios': {
            // Con timeout: al volver a la app en móvil la conexión puede quedar
            // "dormida"; si no responde en 8s devolvemos vacío y el llamador
            // conserva la caché (fetchSociosFromNetwork solo sobreescribe si hay datos).
            const { data } = await _conTimeout(
                dbSV.from('socios').select('*').eq('activo', true).order('apellido'),
                8000, { data: null }
            );
            const mapped = (data || []).map(s => ({
                ID: s.id, Nombre: s.nombre, Apellido: s.apellido,
                Area: s.area, TipoContrato: s.contrato,
                FechaIngreso: s.fecha_ingreso,
                FechaInicioLiquidacion: s.fecha_inicio_puntos,
                Puntos: s.puntos, PuntosActivos: s.puntos_activos, Activo: s.activo,
                Rut: s.rut || '', FotoUrl: s.foto_url || '', Correo: s.correo || ''
            }));
            return _mockRes({ data: mapped });
        }

        // Anticipos + extras desde Supabase (GAS escribe en Supabase en cada registro)
        case 'getAllDataDesdeSheets': {
            // Con timeout: si la conexión Supabase quedó "dormida" al volver a la app,
            // no colgar; se resuelve rápido y sigue el flujo (evita el freeze al reanudar).
            const _FB_ADS = [{ data: null, _to: true }, { data: null }];
            const [antRes, extRes] = await _conTimeout(Promise.all([
                dbSV.from('anticipos').select('socio_id, fecha, monto, responsable'),
                dbSV.from('extras').select('socio_id, fecha, tipo, monto, detalle')
            ]), 8000, _FB_ADS);
            const _adsStale = !!(antRes && antRes._to);
            // Si fue timeout (conexión dormida), avisar al front para que conserve
            // los últimos datos buenos en vez de pintar la pantalla en blanco.
            if (_adsStale) return _mockRes({ data: { anticipos: {}, extras: {} }, _stale: true });
            const anticipos = {};
            for (const a of (antRes.data || [])) {
                if (!anticipos[a.socio_id]) anticipos[a.socio_id] = [];
                anticipos[a.socio_id].push({
                    cantidad: Number(a.monto), monto: Number(a.monto),
                    fecha: a.fecha, desc: 'Anticipo', responsable: a.responsable || ''
                });
            }
            const extras = {};
            for (const e of (extRes.data || [])) {
                if (!extras[e.socio_id]) extras[e.socio_id] = [];
                extras[e.socio_id].push({
                    tipo: e.tipo, monto: Number(e.monto), fecha: e.fecha, detalle: e.detalle || ''
                });
            }
            // Supabase vacío → GAS + migración automática en segundo plano.
            // Con timeout: si el GAS arranca en frío, no bloquea el balance más de 6s.
            if (Object.keys(anticipos).length === 0 && Object.keys(extras).length === 0) {
                const gasJson = await _conTimeout(_origFetch(url, options).then(r => r.json()), 6000, null);
                if (gasJson && gasJson.status === 'success') _migrarASupabase(gasJson); // no-await
                return _mockRes(gasJson || { status: 'error', anticipos: {}, extras: {} });
            }
            return _mockRes({ data: { anticipos, extras } });
        }

        // Saldos anteriores — Supabase primero (fast), GAS como fallback
        case 'getSaldosAnteriores': {
            const _saRes = await _conTimeout(dbSV.from('saldos_socio').select('id, monto'), 8000, { data: null, error: true });
            const sbSaldos = _saRes.data, sbErr = _saRes.error;
            if (!sbErr && sbSaldos && sbSaldos.length > 0) {
                const dataMap = {};
                for (const s of sbSaldos) dataMap[s.id] = Number(s.monto);
                return _mockRes({ status: 'success', data: dataMap });
            }
            // Fallback: GAS con caché local
            const CK = 'propi_cache_saldos_ant', TTL = 24 * 60 * 60 * 1000;
            let cached = null;
            try { const c = JSON.parse(localStorage.getItem(CK) || 'null'); if (c && Date.now() - c.ts < TTL) cached = c.d; } catch(e) {}
            _origFetch(url, options).then(r => r.json()).then(d => {
                try { localStorage.setItem(CK, JSON.stringify({ ts: Date.now(), d })); } catch(e) {}
            }).catch(() => {});
            if (cached) return _mockRes(cached);
            // GAS con timeout: nunca colgar el balance por el arranque en frío del GAS.
            const d = await _conTimeout(_origFetch(url, options).then(r => r.json()), 6000, { status: 'success', data: {} });
            try { if (d && d.data) localStorage.setItem(CK, JSON.stringify({ ts: Date.now(), d })); } catch(e) {}
            return _mockRes(d);
        }

        // Saldo de cierre — caché 24h + no-await para no bloquear el Promise.all del balance
        case 'getSaldosCierre': {
            const CK = 'propi_cache_saldos_cierre', TTL = 24 * 60 * 60 * 1000;
            let cached = null;
            try { const c = JSON.parse(localStorage.getItem(CK) || 'null'); if (c && Date.now() - c.ts < TTL) cached = c.d; } catch(e) {}
            // Una sola llamada al GAS, siempre en background
            _origFetch(url, options).then(r => r.json()).then(d => {
                try { localStorage.setItem(CK, JSON.stringify({ ts: Date.now(), d })); } catch(e) {}
                // Si no había caché, re-calcular balance cuando lleguen los datos de cierre
                if (!cached) setTimeout(() => { if (typeof refresh === 'function') refresh(); }, 100);
            }).catch(() => {});
            // Retornar inmediatamente — caché si existe, vacío si no
            return _mockRes(cached || { status: 'success', data: {} });
        }

        // Días trabajados Part-Time — Supabase responde inmediatamente (no bloquea balance)
        // GAS va en background: si encuentra socios faltantes los cachea y dispara un refresh.
        case 'getDiasPartTime': {
            // Con timeout: evita que una conexión dormida (al volver a la app) cuelgue
            // el Promise.all del balance ~30s. Si expira, marca _stale.
            const _dptRes = await _conTimeout(
                dbSV.from('dias_pt').select('socio_id, dias'), 8000, { data: null, _to: true }
            );
            const sbData = _dptRes.data;
            const _dptStale = !!_dptRes._to;
            const r = {};
            const sbIds = new Set();
            for (const d of (sbData || [])) {
                if (Array.isArray(d.dias)) { r[d.socio_id] = [...new Set(d.dias)].sort(); sbIds.add(d.socio_id); }
            }
            // Completar con cache de sesión GAS (socios que aún no están en Supabase)
            if (_diasPtGasCache) {
                Object.entries(_diasPtGasCache).forEach(([sid, dias]) => {
                    if (!sbIds.has(sid) && Array.isArray(dias) && dias.length > 0) r[sid] = dias;
                });
            } else {
                // Primera carga: pedir GAS en background y refrescar solo si hay socios faltantes
                _origFetch(url, options).then(r2 => r2.json()).then(gasData => {
                    if (!gasData || gasData.status !== 'success' || !gasData.data) return;
                    _diasPtGasCache = gasData.data;
                    const falta = Object.entries(gasData.data).some(([sid, dias]) =>
                        !sbIds.has(String(sid)) && Array.isArray(dias) && dias.length > 0
                    );
                    if (falta) setTimeout(() => { if (typeof refresh === 'function') refresh(); }, 200);
                }).catch(() => {});
            }
            return _mockRes({ data: r, _stale: _dptStale });
        }

        // Mensajes del chat social (socios entre sí)
        case 'getNotes': {
            let { data, error } = await dbSV.from('chat_mensajes')
                .select('*').neq('estado', 'DELETED').order('created_at', { ascending: true });
            if (error) { // reintento único ante fallo transitorio
                await new Promise(r => setTimeout(r, 400));
                ({ data, error } = await dbSV.from('chat_mensajes')
                    .select('*').neq('estado', 'DELETED').order('created_at', { ascending: true }));
            }
            if (error || !data) {
                console.error('[supabase-api] getNotes SOCIAL falló, se conservan los últimos mensajes:', error && error.message);
                return _mockRes({ data: _lastChatSocial || [] });
            }
            const mapped = data.map(m => ({
                uuid: m.id, fecha: m.created_at,
                autor: m.autor, socId: m.socio_id,
                mensaje: m.mensaje, nota: m.mensaje,
                destinatario: m.destinatario, editado: m.editado || false,
                foto: m.foto_url || ''
            }));
            _lastChatSocial = mapped;
            return _mockRes({ data: mapped });
        }

        case 'addNote': {
            await dbSV.from('chat_mensajes').insert({
                id: crypto.randomUUID(), autor: b.autor || 'Socio',
                socio_id: b.socId || null, mensaje: b.mensaje || '',
                destinatario: b.destinatario || 'TODOS', estado: 'ACTIVE',
                foto_url: b.foto_url || null
            });
            return _mockRes({ success: true });
        }

        case 'editNote': {
            await dbSV.from('chat_mensajes')
                .update({ mensaje: b.mensaje, editado: true })
                .eq('id', b.noteId);
            return _mockRes({ success: true });
        }

        case 'deleteNote': {
            await dbSV.from('chat_mensajes')
                .update({ estado: 'DELETED' })
                .eq('id', b.noteId);
            return _mockRes({ success: true });
        }

        // Conexión activa del socio — escribe en Supabase Y notifica GAS (Telegram)
        case 'pingConexion': {
            dbSV.from('historial_conexiones').insert({
                id: crypto.randomUUID(),
                usuario: String(b.socioId || ''),
                area: 'app', ip: null, device_id: null
            }).then(() => {}).catch(() => {});
            // Pasar al GAS para que envíe la notificación Telegram
            _origFetch(url, options).catch(() => {});
            return _mockRes({ success: true });
        }

        // Logout (también manejado por sendBeacon)
        case 'logoutConexion':
            // Pasar al GAS para notificación Telegram de desconexión
            _origFetch(url, options).catch(() => {});
            return _mockRes({ success: true });

        // Guardar el RUT del socio (para certificados/informes). Se refleja en socios-comicion.
        case 'guardarRutSocio': {
            try {
                const _sid = String(b.socioId || b.id || '');
                const _rut = String(b.rut || '').trim();
                if (!_sid || !_rut) return _mockRes({ success: false, error: 'Faltan datos' });
                const { error } = await dbSV.from('socios').update({ rut: _rut }).eq('id', _sid);
                if (error) return _mockRes({ success: false, error: error.message });
                // Auditar en socios-comicion
                dbSV.from('auditoria').insert({
                    usuario: (b.nombre || 'Socio') + ' (app)',
                    accion: 'Registrar RUT',
                    folio: null,
                    datos_extra: { detalle: 'RUT registrado desde propi.solicitada: ' + _rut, id_afectado: _sid, rut: _rut, origen: 'propi.solicitada' }
                }).then(() => {}).catch(() => {});
                return _mockRes({ success: true });
            } catch (e) { return _mockRes({ success: false, error: e.message }); }
        }

        // Guardar el correo electrónico del socio
        case 'guardarCorreoSocio': {
            try {
                const _sid = String(b.socioId || b.id || '');
                const _correo = String(b.correo || '').trim().toLowerCase();
                if (!_sid || !_correo) return _mockRes({ success: false, error: 'Faltan datos' });
                const { error } = await dbSV.from('socios').update({ correo: _correo }).eq('id', _sid);
                if (error) return _mockRes({ success: false, error: error.message });
                dbSV.from('auditoria').insert({
                    usuario: (b.nombre || 'Socio') + ' (app)',
                    accion: 'Registrar Correo',
                    folio: null,
                    datos_extra: { detalle: 'Correo registrado desde propi.solicitada: ' + _correo, id_afectado: _sid, correo: _correo, origen: 'propi.solicitada' }
                }).then(() => {}).catch(() => {});
                return _mockRes({ success: true });
            } catch (e) { return _mockRes({ success: false, error: e.message }); }
        }

        // Guardar la URL de la foto de perfil del socio
        case 'guardarFotoSocio': {
            try {
                const _sid = String(b.socioId || b.id || '');
                if (!_sid) return _mockRes({ success: false, error: 'Faltan datos' });
                const { error } = await dbSV.from('socios').update({ foto_url: b.fotoUrl || null }).eq('id', _sid);
                if (error) return _mockRes({ success: false, error: error.message });
                return _mockRes({ success: true });
            } catch (e) { return _mockRes({ success: false, error: e.message }); }
        }

        // Historial anticipos: GAS (caché 1h) para archivados + Supabase para activos
        // GAS es la única fuente de histórico para evitar duplicados por naming (guión vs espacio)
        case 'getHistorialCompletoSocio': {
            const idSocio = b.idSocio || b.socioId;
            const CK = `propi_cache_hist_anticipos_${idSocio}`, TTL = 60 * 60 * 1000;

            let gasData = null;
            try { const c = JSON.parse(localStorage.getItem(CK) || 'null'); if (c && Date.now() - c.ts < TTL) gasData = c.d; } catch(e) {}

            const gasPromise = gasData !== null
                ? Promise.resolve(gasData)
                : _origFetch(url, options).then(r => r.json()).then(d => {
                    const hd = Array.isArray(d.data) ? d.data : [];
                    try { localStorage.setItem(CK, JSON.stringify({ ts: Date.now(), d: hd })); } catch(e) {}
                    return hd;
                }).catch(() => []);

            if (gasData !== null) {
                _origFetch(url, options).then(r => r.json()).then(d => {
                    if (Array.isArray(d.data)) {
                        try { localStorage.setItem(CK, JSON.stringify({ ts: Date.now(), d: d.data })); } catch(e) {}
                    }
                }).catch(() => {});
            }

            const [historico, actRes, histRes] = await Promise.all([
                gasPromise,
                dbSV.from('anticipos').select('fecha, monto, responsable, periodo')
                    .eq('socio_id', String(idSocio)).order('fecha'),
                // Histórico archivado en Supabase: el archivado actual (al marcar
                // Cobrado o al cerrar el mes en socios-comicion) guarda aquí, no en GAS.
                dbSV.from('anticipos_historial').select('fecha, monto, responsable, periodo')
                    .eq('socio_id', String(idSocio)).order('fecha')
            ]);

            const _MESES_L = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
            const _MESES_C = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
            // Período (año-mes) derivado de la fecha con la regla 15→14:
            // el período se nombra por el mes donde cae el día 14.
            const _canonFromFecha = (fecha) => {
                const d = new Date(String(fecha || '').slice(0, 10) + 'T12:00:00');
                if (isNaN(d.getTime())) return null;
                let yy = d.getFullYear(), mm = d.getMonth() + 1;
                if (d.getDate() >= 15) { mm += 1; if (mm > 12) { mm = 1; yy += 1; } }
                return yy + '-' + String(mm).padStart(2, '0');
            };
            // Clave canónica del período (año-mes) para agrupar un mismo mes aunque
            // venga con nombres distintos ("Julio 2026", "CIERRE_JULIO_DE 2026", "2026-06-15").
            const _canon = (p, fecha) => {
                const s = String(p || '').toLowerCase();
                const y = (s.match(/\b(20\d{2})\b/) || [])[1];
                let mo = null;
                const num = s.match(/20\d{2}[-\/](\d{1,2})/);
                if (num) mo = parseInt(num[1], 10);
                else for (let i = 0; i < 12; i++) if (s.includes(_MESES_L[i])) { mo = i + 1; break; }
                if (y && mo >= 1 && mo <= 12) return y + '-' + String(mo).padStart(2, '0');
                return _canonFromFecha(fecha) || ('raw:' + (s.trim() || 'sin-periodo'));
            };
            const _label = (canon, raw) => {
                const m = /^(\d{4})-(\d{2})$/.exec(canon);
                if (m) return _MESES_C[parseInt(m[2], 10) - 1] + ' ' + m[1];
                return raw || 'Período';
            };
            // ── FUENTE ÚNICA: SUPABASE. Sheets/GAS solo es RESPALDO ──────────────
            // La app ya NO mezcla Supabase + Sheets (eso duplicaba fechas/montos).
            // Se muestra únicamente lo que hay en Supabase:
            //   • anticipos_historial → anticipos archivados (períodos cerrados)
            //   • anticipos           → anticipos activos del período actual
            // GAS/Sheets queda como respaldo: solo se usa si Supabase no tiene NADA
            // para este socio (p. ej. datos que aún no se han migrado).
            const sbRecords  = (histRes.data || []).map(a => ({ fecha: a.fecha, monto: Number(a.monto), responsable: a.responsable || '', periodo: a.periodo }));
            const actRecords = (actRes.data  || []).map(a => ({ fecha: a.fecha, monto: Number(a.monto), responsable: a.responsable || '', periodo: a.periodo || null }));

            let fuente = [...sbRecords, ...actRecords];

            // Respaldo (Sheets): SOLO si Supabase está totalmente vacío para el socio.
            if (fuente.length === 0) {
                const gasRecords = [];
                for (const p of (Array.isArray(historico) ? historico : []))
                    for (const r of (p.registros || []))
                        gasRecords.push({ fecha: r.fecha, monto: Number(r.monto), responsable: r.responsable || '', periodo: p.periodo });
                fuente = gasRecords;
            }

            // Dedup por fecha+monto: un mismo anticipo puede quedar en `anticipos`
            // (activo) y en `anticipos_historial` (archivado) a la vez. Se colapsa a
            // una sola entrada; si una fuente trae responsable y la otra no, se completa.
            const _dedup = new Map();
            for (const r of fuente) {
                const k = String(r.fecha || '').slice(0, 10) + '|' + Number(r.monto);
                const prev = _dedup.get(k);
                if (!prev) _dedup.set(k, r);
                else if (!prev.responsable && r.responsable) _dedup.set(k, { ...prev, responsable: r.responsable });
            }

            // Agrupar todo por mes canónico.
            const groups = {};
            for (const r of _dedup.values()) {
                const c = _canon(r.periodo, r.fecha);
                if (!groups[c]) groups[c] = { rawLabel: r.periodo || '', registros: [] };
                if (!groups[c].rawLabel && r.periodo) groups[c].rawLabel = r.periodo;
                groups[c].registros.push({ fecha: r.fecha, monto: r.monto, responsable: r.responsable });
            }

            const data = Object.keys(groups)
                .sort((x, y) => String(y).localeCompare(String(x)))
                .map(c => ({
                    periodo: _label(c, groups[c].rawLabel),
                    registros: groups[c].registros.sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)))
                }));
            return _mockRes({ data });
        }

        case 'ping':
            return _mockRes({ ok: true });

        default:
            console.warn('[supabase-api] SOCIOS acción desconocida:', action);
            return _mockRes({ data: [] });
    }
}

// ── HANDLER: RECAUDACIONES ─────────────────────────────────────────────────────
async function _recHandler(url, options) {
    const b = await _body(options);
    const action = _action(url, b);

    switch (action) {

        // Recaudaciones con divisores incorporados
        case 'get': {
            const _FB_GET = [{ data: null, _to: true }, { data: null }];
            const [recRes, divRes] = await _conTimeout(Promise.all([
                dbRV.from('recaudaciones').select('*').order('fecha', { ascending: true }),
                dbRV.from('divisores').select('fecha, valor')
            ]), 8000, _FB_GET);
            const _getStale = !!(recRes && recRes._to);
            const divMap = {};
            for (const d of (divRes.data || [])) divMap[d.fecha] = Number(d.valor);
            const mapped = (recRes.data || []).map(r => ({
                ...r,
                divisor: divMap[r.fecha] || null
            }));
            // Timeout → marca _stale para que el front conserve lo último bueno.
            return _mockRes({ data: mapped, _stale: _getStale });
        }

        // Notas del tablero ADMIN (notas_recaudacion)
        case 'getNotes': {
            let { data, error } = await dbRV.from('notas_recaudacion')
                .select('*').order('created_at', { ascending: true });
            if (error) { // reintento único ante fallo transitorio (p.ej. proyecto reanudando)
                await new Promise(r => setTimeout(r, 400));
                ({ data, error } = await dbRV.from('notas_recaudacion')
                    .select('*').order('created_at', { ascending: true }));
            }
            if (error || !data) {
                console.error('[supabase-api] getNotes REC falló, se conservan los últimos mensajes:', error && error.message);
                return _mockRes({ data: _lastNotasRec || [] });
            }
            const mapped = data.map(m => ({
                uuid: m.id, fecha: m.created_at,
                autor: m.autor, socId: null,
                mensaje: m.mensaje, nota: m.mensaje,
                destinatario: 'ADMIN', editado: false,
                pinned: m.pinned || false, reactions: m.reactions || {},
                foto: m.foto_url || '', destacados: m.destacados || ''
            }));
            _lastNotasRec = mapped;
            mapped.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
            return _mockRes({ data: mapped });
        }

        case 'addNote': {
            await dbRV.from('notas_recaudacion').insert({
                id: crypto.randomUUID(), autor: b.autor || 'Socio', mensaje: b.mensaje || '',
                foto_url: b.foto_url || null
            });
            return _mockRes({ success: true });
        }

        case 'editNote': {
            await dbRV.from('notas_recaudacion')
                .update({ mensaje: b.mensaje })
                .eq('id', b.noteId);
            return _mockRes({ success: true });
        }

        case 'deleteNote': {
            await dbRV.from('notas_recaudacion').delete().eq('id', b.noteId);
            return _mockRes({ success: true });
        }

        case 'togglePin': {
            const { error } = await dbRV.from('notas_recaudacion').update({ pinned: b.pinned }).eq('id', b.id);
            if (error) console.error(error);
            return _mockRes({ success: true });
        }

        case 'toggleReaction': {
            const { data: rd } = await dbRV.from('notas_recaudacion').select('reactions').eq('id', b.id).maybeSingle();
            const r = rd?.reactions || {};
            const arr = Array.isArray(r[b.emoji]) ? [...r[b.emoji]] : [];
            const user = b.user || 'Admin';
            const pos = arr.indexOf(user);
            if (b.add && pos === -1) arr.push(user);
            else if (!b.add && pos !== -1) arr.splice(pos, 1);
            if (arr.length === 0) delete r[b.emoji]; else r[b.emoji] = arr;
            await dbRV.from('notas_recaudacion').update({ reactions: r }).eq('id', b.id);
            return _mockRes({ success: true });
        }

        case 'addRecaudacion': {
            const base = { id: crypto.randomUUID(), fecha: b.fecha, tipo: b.tipo || 'Sin Tipo', monto: Number(b.monto) || 0 };
            let res = await dbRV.from('recaudaciones').insert({ ...base, registrado_por_id: b.registrado_por_id || null, registrado_por_nombre: b.registrado_por_nombre || null });
            // Si las columnas aún no existen en Supabase, reintentar sin ellas
            if (res.error && res.error.message && res.error.message.includes('registrado_por')) {
                res = await dbRV.from('recaudaciones').insert(base);
            }
            // Guardar el divisor del día en la tabla `divisores` (una fila por fecha, upsert).
            // Sin esto el divisor nunca llegaba a Supabase y no aparecía en las otras apps
            // (diario.propi, socios-comicion) que leen de la misma tabla.
            const divVal = Number(b.divisor) || 0;
            if (divVal > 0 && b.fecha) {
                const { error: divErr } = await dbRV.from('divisores')
                    .upsert({ fecha: b.fecha, valor: divVal, updated_at: new Date().toISOString() }, { onConflict: 'fecha' });
                if (divErr) console.warn('[supabase-api] divisor upsert error:', divErr.message);
            }
            dbRV.channel('rec-data-sync').send({ type: 'broadcast', event: 'changed', payload: {} }).catch(() => {});

            // Registrar en la auditoría de socios-comicion quién ingresó la recaudación.
            // La tabla `auditoria` vive en la base de socios (dbSV) — la misma que lee
            // socios-comicion, así que el evento aparece en su historial de auditoría.
            if (!res.error) {
                const _quien = b.registrado_por_nombre || 'Socio (app)';
                const _fmtM  = '$' + (Number(b.monto) || 0).toLocaleString('es-CL');
                const _det   = 'Fecha: ' + (b.fecha || '') + ' | Tipo: ' + (b.tipo || 'Sin Tipo')
                             + ' | Monto: ' + _fmtM
                             + (divVal > 0 ? ' | Divisor: ' + divVal : '');
                dbSV.from('auditoria').insert({
                    usuario: _quien,
                    accion: 'Registrar Recaudación',
                    folio: null,
                    datos_extra: {
                        detalle: _det,
                        id_afectado: '',
                        registrado_por_id: b.registrado_por_id || '',
                        registrado_por_nombre: b.registrado_por_nombre || '',
                        tipo: b.tipo || 'Sin Tipo',
                        fecha: b.fecha || '',
                        monto: Number(b.monto) || 0,
                        divisor: divVal || null,
                        origen: 'propi.solicitada'
                    }
                }).then(({ error }) => { if (error) console.warn('[supabase-api] auditoria recaudacion error:', error.message); })
                  .catch(() => {});
            }

            return _mockRes({ success: !res.error, error: res.error?.message });
        }

        case 'ping':
            return _mockRes({ ok: true });

        default:
            console.warn('[supabase-api] REC acción desconocida:', action);
            return _mockRes({ data: [] });
    }
}

// ── Interceptor de fetch ───────────────────────────────────────────────────────
const _origFetch = window.fetch.bind(window);
window.fetch = async function(url, options = {}) {
    const s = String(url);
    if (s.startsWith(_GAS_SOCIOS)) return _sociosHandler(s, options);
    if (s.startsWith(_GAS_REC))    return _recHandler(s, options);
    return _origFetch(url, options);
};

// ── Realtime broadcast: actualizar al instante cuando otra app cambia datos ────
window.addEventListener('load', () => {
    let _rtRec = null, _rtChat = null;

    // Recaudaciones y notas (broadcast desde diario.propi / socios-comicion)
    dbRV.channel('rec-data-sync')
        .on('broadcast', { event: 'changed' }, () => {
            clearTimeout(_rtRec);
            _rtRec = setTimeout(() => { if (typeof refresh === 'function') refresh(); }, 500);
        })
        .subscribe();

    let _rtAnts = null;
    // Chat socios + anticipos — postgres_changes (ambas tablas en un solo canal)
    dbSV.channel('propi-sv-rt')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_mensajes' }, () => {
            clearTimeout(_rtChat);
            _rtChat = setTimeout(() => { if (typeof refreshChat === 'function') refreshChat(false); }, 400);
        })
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'anticipos' }, () => {
            clearTimeout(_rtAnts);
            _rtAnts = setTimeout(() => { if (typeof refresh === 'function') refresh(); }, 600);
        })
        // Días PT: la comisión confirmó/rechazó un día marcado → refrescar para
        // que el día pase a verde (confirmado) o cambie de estado en el calendario.
        .on('postgres_changes', { event: '*', schema: 'public', table: 'dias_pt_solicitados' }, () => {
            if (typeof cargarDiasPTSolicitados === 'function') setTimeout(() => cargarDiasPTSolicitados(), 300);
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'dias_pt' }, () => {
            clearTimeout(_rtAnts);
            _rtAnts = setTimeout(() => { if (typeof refresh === 'function') refresh(); }, 600);
        })
        .subscribe();
});

// ── Interceptor de sendBeacon (logoutConexion al cerrar tab) ───────────────────
const _origBeacon = navigator.sendBeacon.bind(navigator);
navigator.sendBeacon = function(url, data) {
    const s = String(url);
    if (s.startsWith(_GAS_SOCIOS) || s.startsWith(_GAS_REC)) {
        try {
            const b = data instanceof Blob ? {} : (typeof data === 'string' ? JSON.parse(data) : data);
            if (b.action === 'logoutConexion' && b.socioId) {
                dbSV.from('historial_conexiones').insert({
                    id: crypto.randomUUID(), usuario: String(b.socioId),
                    area: 'app_logout', ip: null, device_id: null
                }).then(() => {}).catch(() => {});
            }
        } catch(e) {}
        // También dejar pasar al GAS para la notificación Telegram
        _origBeacon(url, data);
        return true;
    }
    return _origBeacon(url, data);
};
