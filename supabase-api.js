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

// URLs originales de GAS — se mantienen en app.js tal cual
const _GAS_SOCIOS = 'https://script.google.com/macros/s/AKfycbyr447pMQtsKoBfp8qTcB1uyE3rORhgPPmZM6Fgia3BgmIvtlZ_h04uGZrmx_HwubHQ/exec';
const _GAS_REC    = 'https://script.google.com/macros/s/AKfycbz_kCb4aEe437zHGbRqnjCibw1NtAqfCbTNmsVPn9jaZOPBFaZ6-FwmiTLqVxq39X1P/exec';

// ── Helpers ────────────────────────────────────────────────────────────────────
function _mockRes(data) {
    return { ok: true, status: 200, json: async () => data, text: async () => JSON.stringify(data) };
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

        // Lista de socios activos (PascalCase para compatibilidad con app.js)
        case 'getSocios': {
            const { data } = await dbSV.from('socios').select('*').eq('activo', true).order('apellido');
            const mapped = (data || []).map(s => ({
                ID: s.id, Nombre: s.nombre, Apellido: s.apellido,
                Area: s.area, TipoContrato: s.contrato,
                FechaIngreso: s.fecha_ingreso,
                FechaInicioLiquidacion: s.fecha_inicio_puntos,
                Puntos: s.puntos, PuntosActivos: s.puntos_activos, Activo: s.activo,
                Rut: s.rut || '', FotoUrl: s.foto_url || ''
            }));
            return _mockRes({ data: mapped });
        }

        // Anticipos + extras desde Supabase (GAS escribe en Supabase en cada registro)
        case 'getAllDataDesdeSheets': {
            const [antRes, extRes] = await Promise.all([
                dbSV.from('anticipos').select('socio_id, fecha, monto, responsable'),
                dbSV.from('extras').select('socio_id, fecha, tipo, monto, detalle')
            ]);
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
            // Supabase vacío → GAS + migración automática en segundo plano
            if (Object.keys(anticipos).length === 0 && Object.keys(extras).length === 0) {
                let gasJson = null;
                try {
                    const gasResp = await _origFetch(url, options);
                    gasJson = await gasResp.json();
                } catch(e) { console.warn('[SB-V] GAS error:', e.message); }
                if (gasJson && gasJson.status === 'success') {
                    _migrarASupabase(gasJson); // no-await: segundo plano
                }
                return _mockRes(gasJson || { status: 'error', anticipos: {}, extras: {} });
            }
            return _mockRes({ data: { anticipos, extras } });
        }

        // Saldos anteriores — Supabase primero (fast), GAS como fallback
        case 'getSaldosAnteriores': {
            const { data: sbSaldos, error: sbErr } = await dbSV.from('saldos_socio').select('id, monto');
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
            const res = await _origFetch(url, options);
            const d = await res.json();
            try { localStorage.setItem(CK, JSON.stringify({ ts: Date.now(), d })); } catch(e) {}
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
            const { data: sbData } = await dbSV.from('dias_pt').select('socio_id, dias');
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
            return _mockRes({ data: r });
        }

        // Mensajes del chat social (socios entre sí)
        case 'getNotes': {
            const { data } = await dbSV.from('chat_mensajes')
                .select('*').neq('estado', 'DELETED').order('created_at', { ascending: true });
            const mapped = (data || []).map(m => ({
                uuid: m.id, fecha: m.created_at,
                autor: m.autor, socId: m.socio_id,
                mensaje: m.mensaje, nota: m.mensaje,
                destinatario: m.destinatario, editado: m.editado || false
            }));
            return _mockRes({ data: mapped });
        }

        case 'addNote': {
            await dbSV.from('chat_mensajes').insert({
                id: crypto.randomUUID(), autor: b.autor || 'Socio',
                socio_id: b.socId || null, mensaje: b.mensaje || '',
                destinatario: b.destinatario || 'TODOS', estado: 'ACTIVE'
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

            const [historico, actRes] = await Promise.all([
                gasPromise,
                dbSV.from('anticipos').select('fecha, monto, responsable, periodo')
                    .eq('socio_id', String(idSocio)).order('fecha')
            ]);

            const byPeriod = {};

            // Histórico archivado: solo desde GAS (fuente única, naming consistente)
            for (const p of (Array.isArray(historico) ? historico : [])) {
                byPeriod[p.periodo] = { periodo: p.periodo, registros: [...(p.registros || [])] };
            }

            // Anticipos activos del período actual: solo desde Supabase (instantáneo)
            for (const a of (actRes.data || [])) {
                const p = a.periodo || 'Activo';
                if (!byPeriod[p]) byPeriod[p] = { periodo: p, registros: [] };
                byPeriod[p].registros.push({ fecha: a.fecha, monto: Number(a.monto), responsable: a.responsable || '' });
            }

            const data = Object.values(byPeriod)
                .sort((a, b) => String(b.periodo).localeCompare(String(a.periodo)));
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
            const [recRes, divRes] = await Promise.all([
                dbRV.from('recaudaciones').select('*').order('fecha', { ascending: true }),
                dbRV.from('divisores').select('fecha, valor')
            ]);
            const divMap = {};
            for (const d of (divRes.data || [])) divMap[d.fecha] = Number(d.valor);
            const mapped = (recRes.data || []).map(r => ({
                ...r,
                divisor: divMap[r.fecha] || null
            }));
            return _mockRes({ data: mapped });
        }

        // Notas del tablero ADMIN (notas_recaudacion)
        case 'getNotes': {
            const { data } = await dbRV.from('notas_recaudacion')
                .select('*').order('created_at', { ascending: true });
            const mapped = (data || []).map(m => ({
                uuid: m.id, fecha: m.created_at,
                autor: m.autor, socId: null,
                mensaje: m.mensaje, nota: m.mensaje,
                destinatario: 'ADMIN', editado: false,
                pinned: m.pinned || false, reactions: m.reactions || {}
            }));
            mapped.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
            return _mockRes({ data: mapped });
        }

        case 'addNote': {
            await dbRV.from('notas_recaudacion').insert({
                id: crypto.randomUUID(), autor: b.autor || 'Socio', mensaje: b.mensaje || ''
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
