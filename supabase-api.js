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
                Puntos: s.puntos, PuntosActivos: s.puntos_activos, Activo: s.activo
            }));
            return _mockRes({ data: mapped });
        }

        // Anticipos + extras agrupados por socioId
        case 'getAllDataDesdeSheets': {
            const [antRes, extRes] = await Promise.all([
                dbSV.from('anticipos').select('*'),
                dbSV.from('extras').select('*')
            ]);
            const anticipos = {}, extras = {};
            for (const a of (antRes.data || [])) {
                if (!anticipos[a.socio_id]) anticipos[a.socio_id] = [];
                anticipos[a.socio_id].push({ ...a, cantidad: a.monto });
            }
            for (const e of (extRes.data || [])) {
                if (!extras[e.socio_id]) extras[e.socio_id] = [];
                extras[e.socio_id].push(e);
            }
            return _mockRes({ data: { anticipos, extras } });
        }

        // Saldos anteriores { socioId: monto }
        case 'getSaldosAnteriores': {
            const { data } = await dbSV.from('saldos_socio').select('id, monto');
            const r = {};
            for (const s of (data || [])) r[s.id] = Number(s.monto || 0);
            return _mockRes({ data: r });
        }

        // Saldo de cierre — no implementado aún, retorna vacío
        case 'getSaldosCierre':
            return _mockRes({ data: {} });

        // Días trabajados Part-Time: { socioId: [fecha1, fecha2, ...] }
        case 'getDiasPartTime': {
            const { data } = await dbSV.from('dias_pt').select('socio_id, dias');
            const r = {};
            for (const d of (data || [])) {
                if (!r[d.socio_id]) r[d.socio_id] = [];
                if (Array.isArray(d.dias)) r[d.socio_id].push(...d.dias);
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

        // Conexión activa del socio (fire-and-forget)
        case 'pingConexion': {
            dbSV.from('historial_conexiones').insert({
                id: crypto.randomUUID(),
                usuario: String(b.socioId || ''),
                area: 'app', ip: null, device_id: null
            }).then(() => {}).catch(() => {});
            return _mockRes({ success: true });
        }

        // Logout (también manejado por sendBeacon)
        case 'logoutConexion':
            return _mockRes({ success: true });

        // Historial completo de anticipos de un socio — agrupado por período
        case 'getHistorialCompletoSocio': {
            const idSocio = b.idSocio;
            const _MESES = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO',
                            'JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
            const _periodoFromFecha = fecha => {
                const d = new Date(String(fecha).replace(' ','T'));
                if (isNaN(d)) return 'SIN PERÍODO';
                return `${_MESES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
            };
            const _sortKey = p => {
                const yr = String(p).match(/\b(20\d{2})\b/)?.[1] || '0000';
                const mi = _MESES.findIndex(m => String(p).toUpperCase().includes(m));
                return `${yr}-${String(mi + 1).padStart(2,'0')}`;
            };

            const [actRes, histRes] = await Promise.all([
                dbSV.from('anticipos').select('*').eq('socio_id', idSocio),
                dbSV.from('anticipos_historial').select('*').eq('socio_id', idSocio)
            ]);

            const grouped = {};
            const add = (periodo, row) => {
                if (!grouped[periodo]) grouped[periodo] = [];
                grouped[periodo].push({ fecha: row.fecha, monto: Number(row.monto || 0), responsable: row.responsable || '' });
            };

            for (const a of (actRes.data || []))  add(_periodoFromFecha(a.fecha), a);
            for (const a of (histRes.data || [])) add(a.periodo || _periodoFromFecha(a.fecha), a);

            const data = Object.entries(grouped)
                .map(([periodo, registros]) => ({
                    periodo,
                    registros: registros.sort((a,b) => String(b.fecha).localeCompare(String(a.fecha)))
                }))
                .sort((a, b) => _sortKey(b.periodo).localeCompare(_sortKey(a.periodo)));

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
                destinatario: 'ADMIN', editado: false
            }));
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
        return true;
    }
    return _origBeacon(url, data);
};
