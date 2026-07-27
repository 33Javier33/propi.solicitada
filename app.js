    const SCRIPT_URL_SOCIOS = 'https://script.google.com/macros/s/AKfycbyr447pMQtsKoBfp8qTcB1uyE3rORhgPPmZM6Fgia3BgmIvtlZ_h04uGZrmx_HwubHQ/exec';
    const SCRIPT_URL_RECAUDACIONES = 'https://script.google.com/macros/s/AKfycbz_kCb4aEe437zHGbRqnjCibw1NtAqfCbTNmsVPn9jaZOPBFaZ6-FwmiTLqVxq39X1P/exec';

    let allSocios=[], currentUser=null, messages={admin:[],social:[]},
        currentChatMode='ADMIN', currentSocialTarget={id:'TODOS',name:'Chat General'},
        lastMsgCount=parseInt(localStorage.getItem('lastMsgCountV19')||0),
        globalDiasCalendar=[], userTypeGlobal='', editingMessageId=null,
        adminPrivMsgs=[];

    // Anti-freeze al volver a la app: evita que refrescos solapados (resume +
    // intervalos + realtime) se acumulen, y conserva los últimos datos buenos
    // para no pintar la pantalla en blanco si una fuente responde "stale".
    let _refreshing=false, _refreshPending=false, _lastGood=null;

    // Autogestión de días Part-Time: valor por punto por fecha, puntos del socio y
    // días marcados por el socio (PENDIENTE/RECHAZADO) para pintarlos en el calendario.
    let ptMapVP={}, ptPuntos=0, ptDiasSolicitados=[], ptCargandoDia=false;

    // Datos de balance guardados globalmente para el comprobante
    let _lastBalance = {
        liquido:0, remanente:0, propinaBruta:0, sAnt:0,
        tAnt:0, pts:0, anos:0, puntoGlobalTotal:0,
        userAnticipos:[], vpPromedio:0
    };

    // ── SECURITY HELPERS ──────────────────────────────────────────────────────
    function escHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
            .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
    }
    async function hashPin(pin, salt) {
        const enc = new TextEncoder();
        const buf = await crypto.subtle.digest('SHA-256', enc.encode(pin + String(salt)));
        return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
    }

    // ── INIT ──────────────────────────────────────────────────
    // ── CACHÉ DE SOCIOS (TTL 10 min) ─────────────────────────
    const SOCIOS_CACHE_KEY = 'sociosCache_v1';
    const SOCIOS_CACHE_TTL = 10 * 60 * 1000; // 10 minutos

    function getSociosFromCache() {
        try {
            const c = JSON.parse(localStorage.getItem(SOCIOS_CACHE_KEY) || 'null');
            if (c && c.ts && (Date.now() - c.ts) < SOCIOS_CACHE_TTL && Array.isArray(c.data) && c.data.length > 0) {
                return c.data;
            }
        } catch(e) {}
        return null;
    }

    function saveSociosToCache(data) {
        try { localStorage.setItem(SOCIOS_CACHE_KEY, JSON.stringify({ ts: Date.now(), data })); } catch(e) {}
    }

    async function fetchSociosFromNetwork(silent = false) {
        try {
            const res = await fetch(`${SCRIPT_URL_SOCIOS}?action=getSocios`);
            const data = (await res.json()).data || [];
            if (data.length > 0) {
                allSocios = data;
                saveSociosToCache(data);
            }
        } catch(e) {
            if (!silent) console.error('Error cargando socios:', e);
        }
    }

    window.onload = async () => {
        const rutField = document.getElementById('setupRUT');
        if (rutField) {
            rutField.addEventListener('input', function() {
                let val = this.value.replace(/[^0-9kK]/g,'').toUpperCase();
                if (val.length > 1) {
                    const dv = val.slice(-1);
                    let body = val.slice(0,-1).replace(/\B(?=(\d{3})+(?!\d))/g,'.');
                    this.value = `${body}-${dv}`;
                } else { this.value = val; }
            });
        }

        checkSecurity();

        // ── 1. Intentar desde caché primero (instantáneo) ────────
        const cached = getSociosFromCache();
        if (cached) {
            allSocios = cached;
            // Actualizar en background sin bloquear
            fetchSociosFromNetwork(true);
        } else {
            // Sin caché: mostrar spinner y cargar
            document.getElementById('loadingState').classList.remove('hidden');
            await fetchSociosFromNetwork(false);
            document.getElementById('loadingState').classList.add('hidden');
        }

        // ── 2. Warm-up: despertar el script de recaudaciones ─────
        // Ping silencioso para que el cold start ocurra mientras el
        // usuario escribe su PIN, no cuando aprieta Ingresar.
        fetch(`${SCRIPT_URL_RECAUDACIONES}?action=ping`).catch(()=>{});

        // ── 3. Guía de instalación: si es la 1ª vez y NO está instalada,
        //     mostrarla antes de ingresar (para asegurar que la instalen).
        _maybeMostrarGuiaInstalar();
    };

    // ── GUÍA DE INSTALACIÓN (PWA) ─────────────────────────────
    let _deferredInstallPrompt = null;
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        _deferredInstallPrompt = e; // Android/Chrome: permite instalar con un botón
        const b = document.getElementById('btnInstalarNativo');
        if (b && document.getElementById('installGuideModal')?.style.display === 'flex') b.style.display = 'block';
    });
    function _appEstaInstalada() {
        try {
            return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
        } catch (e) { return false; }
    }
    window.abrirGuiaInstalar = function () {
        const m = document.getElementById('installGuideModal'); if (!m) return;
        m.style.display = 'flex';
        const b = document.getElementById('btnInstalarNativo');
        if (b) b.style.display = _deferredInstallPrompt ? 'block' : 'none';
    };
    window.cerrarGuiaInstalar = function () {
        const m = document.getElementById('installGuideModal'); if (m) m.style.display = 'none';
        try { localStorage.setItem('propi_install_seen', '1'); } catch (e) {}
    };
    window._instalarPWA = async function () {
        if (!_deferredInstallPrompt) return;
        try { _deferredInstallPrompt.prompt(); await _deferredInstallPrompt.userChoice; } catch (e) {}
        _deferredInstallPrompt = null;
        const b = document.getElementById('btnInstalarNativo'); if (b) b.style.display = 'none';
        cerrarGuiaInstalar();
    };
    function _maybeMostrarGuiaInstalar() {
        try {
            if (_appEstaInstalada()) return;                       // ya instalada / abierta como app
            if (localStorage.getItem('propi_install_seen') === '1') return; // ya la vio
            // Solo si el login está visible (no auto-entró con sesión)
            setTimeout(() => {
                const login = document.getElementById('loginOverlay');
                if (login && !login.classList.contains('hidden')) abrirGuiaInstalar();
            }, 700);
        } catch (e) {}
    }

    // Muestra el botón "Contactar a La Comisión Propina" SOLO cuando no hay
    // una cuenta activa vinculada en el dispositivo (usuario nuevo sin acceso).
    function _toggleLoginCTA() {
        const cta = document.getElementById('loginCTA');
        if (!cta) return;
        let auth = {};
        try { auth = JSON.parse(localStorage.getItem('visor_secure_auth') || '{}'); } catch (e) {}
        cta.style.display = auth.id ? 'none' : 'flex';
    }

    // ── SECURITY / LOGIN ──────────────────────────────────────
    function checkSecurity() {
        const auth = JSON.parse(localStorage.getItem('visor_secure_auth') || '{}');
        // Auto-entrar sin pedir el PIN si la sesión sigue activa (ej: tras recargar por
        // una actualización). El PIN de sesión vive en sessionStorage y sobrevive el reload.
        // NO auto-entra si la sesión expiró por inactividad (≥15 min) → ahí sí pide PIN.
        const sessPin = sessionStorage.getItem('visor_secure_auth_sess');
        const _lastAct = Number(localStorage.getItem('propi_last_active') || 0);
        const _expiroInact = _lastAct && (Date.now() - _lastAct) >= (15 * 60 * 1000);
        if (auth.id && auth.rut && sessPin && !_expiroInact) {
            const fp = document.getElementById('fastPIN');
            if (fp) fp.value = sessPin;
            handleFastLogin();
            return;
        }
        document.getElementById('loginOverlay').classList.remove('hidden');
        _toggleLoginCTA();
        if (auth.id && auth.rut) {
            document.getElementById('fastAccessBox').classList.remove('hidden');
            document.getElementById('setupBox').classList.add('hidden');
            const initial = (auth.name || '?').charAt(0).toUpperCase();
            document.getElementById('fastAvatarIcon').textContent = initial;
            // Mostrar la foto guardada en el login (si existe)
            const _fbox = document.getElementById('fastAvatarBox');
            const _fico = document.getElementById('fastAvatarIcon');
            if (auth.foto) { if (_fbox) _fbox.style.backgroundImage = 'url("' + auth.foto + '")'; if (_fico) _fico.style.display = 'none'; }
            else { if (_fbox) _fbox.style.backgroundImage = ''; if (_fico) _fico.style.display = ''; }
            _aplicarLoginShape(_loginShapeGuardada());
            document.getElementById('fastName').textContent = (auth.name || '').split(' ')[0];
            document.getElementById('fastIDLabel').textContent = `ID: ${auth.id}`;
            setTimeout(() => document.getElementById('fastPIN').focus(), 100);
        } else { switchToSetup(); }
    }

    function switchToSetup() {
        document.getElementById('fastAccessBox').classList.add('hidden');
        document.getElementById('setupBox').classList.remove('hidden');
        _toggleLoginCTA();
    }

    function cambiarUsuario() {
        if (!confirm('¿Desea cambiar de usuario? Se eliminará la cuenta vinculada en este dispositivo.')) return;
        localStorage.removeItem('visor_secure_auth');
        sessionStorage.removeItem('visor_secure_auth_sess');
        location.reload();
    }

    function cancelRecovery() {
        const auth = JSON.parse(localStorage.getItem('visor_secure_auth') || '{}');
        if (auth.id) {
            document.getElementById('setupBox').classList.add('hidden');
            document.getElementById('fastAccessBox').classList.remove('hidden');
        } else { alert("Debe vincular una cuenta primero."); }
        _toggleLoginCTA();
    }

    // ── RUT HELPERS ───────────────────────────────────────────
    function cleanRUT(rut) { return String(rut).replace(/\./g,'').replace(/\s/g,'').toUpperCase(); }
    function formatRUT(rut) {
        let clean = cleanRUT(rut).replace(/-/g,'');
        if (clean.length < 2) return clean;
        const dv = clean.slice(-1);
        let body = clean.slice(0,-1).replace(/\B(?=(\d{3})+(?!\d))/g,'.');
        return `${body}-${dv}`;
    }
    function validateRUT(rut) {
        let clean = cleanRUT(rut).replace(/-/g,'');
        if (clean.length < 7) return false;
        const dv = clean.slice(-1);
        const body = clean.slice(0,-1);
        if (!/^\d+$/.test(body)) return false;
        if (!/^[\dK]$/.test(dv)) return false;
        return true;
    }

    // ── HANDLE SETUP ──────────────────────────────────────────
    async function handleSetup() {
        const id = document.getElementById('setupID').value.trim().toUpperCase();
        const rutRaw = document.getElementById('setupRUT').value.trim();
        const pin = document.getElementById('setupPIN').value.trim();
        if (!validateRUT(rutRaw)) {
            alert("RUT no válido.\nEjemplo: 12.345.678-9");
            document.getElementById('setupRUT').focus();
            return;
        }
        const rutNormalizado = formatRUT(rutRaw);
        const u = allSocios.find(s => String(s.ID).toUpperCase() === id);
        if (u && pin.length === 4) {
            const pinHash = await hashPin(pin, u.ID);
            // PIN nunca en localStorage — solo hash para verificación en nueva sesión
            localStorage.setItem('visor_secure_auth', JSON.stringify({id:u.ID, rut:rutNormalizado, name:u.Nombre, pinHash}));
            // PIN plano en sessionStorage (se borra al cerrar el navegador)
            sessionStorage.setItem('visor_secure_auth_sess', pin);
            location.reload();
        } else { alert("Datos incorrectos. Verifique su ID y PIN."); }
    }

    async function handleFastLogin() {
        const pin = document.getElementById('fastPIN').value;
        const auth = JSON.parse(localStorage.getItem('visor_secure_auth') || '{}');
        const sessPin = sessionStorage.getItem('visor_secure_auth_sess');

        let pinOk = false;
        if (sessPin) {
            // Misma sesión: comparación directa
            pinOk = (pin === sessPin);
        } else if (auth.pinHash) {
            // Nueva sesión con hash: verificar y restaurar sesión
            const entered = await hashPin(pin, auth.id);
            pinOk = (entered === auth.pinHash);
            if (pinOk) sessionStorage.setItem('visor_secure_auth_sess', pin);
        } else if (auth.pin) {
            // Formato anterior (PIN en plano): comparar y migrar automáticamente al nuevo formato
            pinOk = (pin === auth.pin);
            if (pinOk) {
                const pinHash = await hashPin(pin, auth.id);
                const { pin: _removed, ...rest } = auth;
                localStorage.setItem('visor_secure_auth', JSON.stringify({ ...rest, pinHash }));
                sessionStorage.setItem('visor_secure_auth_sess', pin);
            }
        } else {
            // Sin credenciales → login completo
            switchToSetup();
            document.getElementById('fastPIN').value = '';
            return;
        }
        if (!pinOk) {
            alert("PIN incorrecto");
            document.getElementById('fastPIN').value = '';
            return;
        }

        // ── Si ya tenemos socios en memoria o caché → entrar ya ──
        if (allSocios.length === 0) {
            const cached = getSociosFromCache();
            if (cached) {
                allSocios = cached;
                // Refrescar en background
                fetchSociosFromNetwork(true);
            } else {
                // Sin caché: hay que esperar (primera vez)
                const spinner = document.getElementById('loadingState');
                spinner.classList.remove('hidden');
                await fetchSociosFromNetwork(false);
                spinner.classList.add('hidden');
                if (allSocios.length === 0) {
                    alert("Error de conexión. Verifique su red e intente nuevamente.");
                    return;
                }
            }
        }

        currentUser = allSocios.find(s => String(s.ID) === String(auth.id));
        if (!currentUser) {
            // Caché podría estar desactualizada — intentar red una vez
            await fetchSociosFromNetwork(false);
            currentUser = allSocios.find(s => String(s.ID) === String(auth.id));
            if (!currentUser) {
                alert("No se encontró su cuenta. Intente nuevamente.");
                return;
            }
        }
        initApp();
    }

    function recoverWithRUT() {
        const rutInput = prompt("Ingrese su RUT para recuperar acceso:");
        if (!rutInput) return;
        if (!validateRUT(rutInput)) { alert("RUT no válido.\nFormato: 12.345.678-9"); return; }
        const rutNorm = formatRUT(rutInput);
        const localAuth = JSON.parse(localStorage.getItem('visor_secure_auth')||'{}');
        const rutGuardado = localAuth.rut ? formatRUT(localAuth.rut) : '';
        if (rutGuardado && rutNorm === rutGuardado) {
            alert(`RUT Verificado!\nSu ID es: ${localAuth.id}\n\nSe le redirigira para crear un nuevo PIN.`);
            switchToSetup();
            document.getElementById('setupID').value = localAuth.id;
            document.getElementById('setupRUT').value = rutNorm;
        } else {
            alert("El RUT no coincide.\nDeberá vincular nuevamente su cuenta.");
            switchToSetup();
            document.getElementById('setupRUT').value = rutNorm;
        }
    }

    // ── INIT APP ──────────────────────────────────────────────
    function pingConexion() {
        if (!currentUser) return;
        fetch(SCRIPT_URL_SOCIOS, {
            method: 'POST',
            body: JSON.stringify({ action: 'pingConexion', socioId: currentUser.ID })
        }).catch(()=>{});
    }

    function logoutConexion() {
        if (!currentUser) return;
        const payload = JSON.stringify({ action: 'logoutConexion', socioId: currentUser.ID });
        const blob = new Blob([payload], { type: 'application/json' });
        navigator.sendBeacon(SCRIPT_URL_SOCIOS, blob);
    }

    // ── INACTIVIDAD (15 min sin interacción — primer y segundo plano) ──
    // Usa timestamp en localStorage: funciona aunque el SO pause los timers en móvil.
    const INACTIVITY_LIMIT = 15 * 60 * 1000;
    const _INACT_KEY = 'propi_last_active';
    let inactivityTimer = null;

    function _updateLastActive() {
        try { localStorage.setItem(_INACT_KEY, String(Date.now())); } catch(e) {}
    }

    function _checkInactivity() {
        if (!currentUser) return;
        const last = Number(localStorage.getItem(_INACT_KEY) || 0);
        if (last && (Date.now() - last) >= INACTIVITY_LIMIT) {
            if (inactivityTimer) { clearInterval(inactivityTimer); inactivityTimer = null; }
            showToast('Sesión cerrada por inactividad (15 min)', 'warning');
            setTimeout(logout, 1200);
        }
    }

    function startInactivityClock() {
        _updateLastActive();
        // Verificar cada 60 s — detecta inactividad en primer plano
        inactivityTimer = setInterval(_checkInactivity, 60 * 1000);
        // Resetear timestamp en cada interacción del usuario
        ['click', 'touchstart', 'keydown', 'scroll'].forEach(ev =>
            document.addEventListener(ev, _updateLastActive, { passive: true })
        );
    }

    function resetInactivity() { _updateLastActive(); }
    function pauseInactivityClock() {}
    function resumeInactivityClock() {}

    document.addEventListener('visibilitychange', () => {
        if (!currentUser) return;
        if (document.visibilityState === 'hidden') {
            logoutConexion();
        } else {
            // Al volver a la app: revisar PRIMERO la inactividad. Si ya expiró (≥15 min),
            // cerrar la sesión SIN marcar "conectado" en Telegram (se desconectó, no se reconectó).
            const last = Number(localStorage.getItem(_INACT_KEY) || 0);
            if (last && (Date.now() - last) >= INACTIVITY_LIMIT) {
                _checkInactivity(); // cierra la sesión (envía la desconexión)
                return;
            }
            // Sesión aún válida: marcar conexión activa y refrescar
            pingConexion();
            if (currentUser) refresh(false);
        }
    });

    window.addEventListener('beforeunload', () => { if (currentUser) logoutConexion(); });
    window.addEventListener('pagehide', () => { if (currentUser) logoutConexion(); });

    // ── PERFIL DEL SOCIO ─────────────────────────────────────
    // Parsear fecha YYYY-MM-DD como fecha LOCAL (evita UTC midnight = día anterior en Chile)
    const _parseLocalDate = s => { const [y,m,d] = String(s).substring(0,10).split('-').map(Number); return new Date(y, m-1, d); };

    function renderPerfil() {
        if (!currentUser) return;
        const nombre = getDisplayName();
        const dIng = _parseLocalDate(currentUser.FechaIngreso);
        const hoy = new Date();
        let anos = hoy.getFullYear() - dIng.getFullYear();
        if (hoy.getMonth() < dIng.getMonth() || (hoy.getMonth() === dIng.getMonth() && hoy.getDate() < dIng.getDate())) anos--;
        anos = Math.max(0, anos);
        const areaN = String(currentUser.Area || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        const ptsFormula = Math.min(4 + (anos * 2), (areaN.includes('mesa') ? 20 : areaN.includes('cambist') ? 8 : areaN.includes('boveda') ? 10 : 12));
        const ptsSB = Number(currentUser.Puntos);
        const pts = (Number.isFinite(ptsSB) && ptsSB > 0) ? ptsSB : ptsFormula;

        document.getElementById('perfilLetra').textContent = nombre.charAt(0).toUpperCase();
        _aplicarFotoPerfil(currentUser.FotoUrl || '');
        document.getElementById('perfilNombre').textContent = nombre;
        document.getElementById('perfilID').textContent = 'ID: ' + currentUser.ID;
        document.getElementById('perfilIDCard').textContent = currentUser.ID;
        (function(){
            const elRut = document.getElementById('perfilRut');
            if (!elRut) return;
            let rutVal = currentUser.Rut && String(currentUser.Rut).trim();
            if (!rutVal) { try { const a = JSON.parse(localStorage.getItem('visor_secure_auth') || '{}'); if (a.rut) rutVal = a.rut; } catch(e) {} }
            elRut.textContent = rutVal ? formatRUT(rutVal) : '—';
        })();
        (function(){
            const elC = document.getElementById('perfilCorreo');
            if (!elC) return;
            const c = currentUser.Correo && String(currentUser.Correo).trim();
            elC.textContent = c || 'Agregar correo';
        })();
        document.getElementById('perfilArea').textContent = currentUser.Area || '—';
        document.getElementById('perfilContrato').textContent = currentUser.TipoContrato || '—';
        document.getElementById('perfilFechaIngreso').textContent = dIng.toLocaleDateString('es-CL', {day:'2-digit', month:'long', year:'numeric'});
        document.getElementById('perfilAnios').textContent = anos;
        document.getElementById('perfilPuntos').textContent = pts;
        document.getElementById('perfilAntigMsg').textContent = anos < 1
            ? 'Primer año — bienvenido al equipo 👋'
            : 'Con ' + anos + ' año' + (anos === 1 ? '' : 's') + ' en el casino, tienes ' + pts + ' puntos asignados en el reparto.';
        cargarDocumentos();
        _sincronizarTemaBtns();
        _aplicarBalanceEstilo(_balanceEstiloGuardado());
        _maybeMigrarPremium();
        _aplicarLoginShape(_loginShapeGuardada());
        _pushRefrescarEstado();
    }

    // ── TEMAS DE LA APP (claro / oscuro / rosa) ──
    const _TEMAS = ['claro', 'oscuro', 'negro', 'esmeralda', 'rosa', 'aqua', 'lavanda', 'menta', 'durazno'];
    const _TEMA_COLOR = { claro: '#001723', oscuro: '#0f172a', negro: '#000000', esmeralda: '#04120d', rosa: '#9d174d', aqua: '#0e7490', lavanda: '#5b21b6', menta: '#064e3b', durazno: '#7c2d12' };
    // Temas oscuros que reutilizan la base "oscuro" con un tinte de color (data-tinte)
    const _TEMA_TINTE = { negro: null, esmeralda: 'esmeralda' };
    function _temaActual() {
        let t = 'claro';
        try { t = localStorage.getItem('propi_tema') || 'claro'; } catch (e) {}
        return _TEMAS.includes(t) ? t : 'claro';
    }
    function _sincronizarTemaBtns() {
        const actual = _temaActual();
        document.querySelectorAll('.tema-btn').forEach(b => {
            b.classList.toggle('active', b.getAttribute('data-tema') === actual);
        });
    }
    window.aplicarTema = function (nombre) {
        if (!_TEMAS.includes(nombre)) nombre = 'claro';
        // Temas oscuros derivados: "negro" y "esmeralda" usan la base "oscuro"
        // + un atributo extra (data-negro / data-tinte) que reutiliza su restyle.
        const esDerivadoOscuro = (nombre === 'negro' || nombre === 'esmeralda');
        const base = esDerivadoOscuro ? 'oscuro' : nombre;
        document.documentElement.setAttribute('data-theme', base);
        if (nombre === 'negro') document.documentElement.setAttribute('data-negro', '1');
        else document.documentElement.removeAttribute('data-negro');
        const tinte = _TEMA_TINTE[nombre];
        if (tinte) document.documentElement.setAttribute('data-tinte', tinte);
        else document.documentElement.removeAttribute('data-tinte');
        try { localStorage.setItem('propi_tema', nombre); } catch (e) {}
        const m = document.querySelector('meta[name="theme-color"]');
        if (m) m.setAttribute('content', _TEMA_COLOR[nombre] || '#001723');
        _sincronizarTemaBtns();
    };

    // ── ESTILO DEL BALANCE (clásico / tarjeta bancaria) ──────────────
    function _balanceEstiloGuardado() {
        try { return localStorage.getItem('propi_balance_estilo') === 'tarjeta' ? 'tarjeta' : 'clasico'; }
        catch (e) { return 'clasico'; }
    }
    function _refrescarTarjeta() {
        const _set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
        const src = document.getElementById('montoRecibirLabel');
        let monto = '$0';
        if (src) { const v = src.getAttribute('data-value'); monto = (v !== null && v !== '') ? formatMoney(Number(v)) : src.textContent; }
        _set('montoRecibirTarjeta', monto);
        _set('montoRecibirTarjetaPm', monto);
        const titular = (getDisplayName() || '—').toUpperCase();
        _set('tarjetaTitular', titular);
        _set('tarjetaTitularPm', titular);
        const pp = document.getElementById('perfilPuntos');
        const puntos = (pp && pp.textContent && pp.textContent !== '—') ? (pp.textContent + ' pts') : '—';
        _set('tarjetaPuntos', puntos);
        _set('tarjetaPuntosPm', puntos);
        if (typeof currentUser !== 'undefined' && currentUser) {
            const id = String(currentUser.ID || '').replace(/\D/g, '');
            const num = '•••• •••• •••• ' + (id.slice(-4) || '0000');
            _set('tarjetaNumero', num);
            _set('tarjetaNumeroPm', num);
            if (currentUser.FechaIngreso) {
                const anio = String(currentUser.FechaIngreso).split('-')[0] || '—';
                _set('tarjetaDesde', anio);
                _set('tarjetaDesdePm', anio);
            }
        }
    }
    function _aplicarBalanceEstilo(estilo) {
        const esTarjeta = estilo === 'tarjeta';
        [['balanceClasico', 'balanceTarjeta'], ['pmBalanceCard', 'pmBalanceTarjeta']].forEach(([nId, tId]) => {
            const n = document.getElementById(nId), t = document.getElementById(tId);
            if (n) n.style.display = esTarjeta ? 'none' : '';
            if (t) t.style.display = esTarjeta ? 'block' : 'none';
        });
        if (esTarjeta) _refrescarTarjeta();
    }
    window.toggleBalanceEstilo = function () {
        const nuevo = _balanceEstiloGuardado() === 'tarjeta' ? 'clasico' : 'tarjeta';
        try { localStorage.setItem('propi_balance_estilo', nuevo); } catch (e) {}
        _aplicarBalanceEstilo(nuevo);
    };

    // ── VERSIÓN DE INICIO ────────────────────────────────────────────
    // La versión CLÁSICA fue retirada: la app usa siempre la versión nueva (premium).
    function _homeVersionGuardada() { return 'premium'; }
    function _sincronizarHomeverBtns() {
        const actual = _homeVersionGuardada();
        document.querySelectorAll('.homever-btn').forEach(b => {
            b.classList.toggle('active', b.getAttribute('data-homever') === actual);
        });
    }
    function _pmSet(id, val) { const e = document.getElementById(id); if (e) e.textContent = val; }
    function _refrescarPremium() {
        // Identidad
        if (typeof currentUser !== 'undefined' && currentUser) {
            _pmSet('pmSaludo', 'Bienvenido, ' + (getDisplayName() || '').split(' ')[0]);
            _pmSet('pmRolTxt', ((currentUser.Area || 'Fondo Solidario') + ' · Casino Puerto Varas'));
            const id = String(currentUser.ID || '').replace(/\D/g, '');
            _pmSet('pmId', '#' + (id.slice(-4) || '0000'));
            if (currentUser.FechaIngreso) {
                const p = String(currentUser.FechaIngreso).split('-');
                const MES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
                if (p.length >= 2) _pmSet('pmDesde', (MES[parseInt(p[1]) - 1] || '') + ' ' + p[0]);
            }
        }
        // Cifras en vivo (espejo del clásico, por si se cambia antes de un refresco)
        const bal = document.getElementById('montoRecibirLabel');
        if (bal) { const v = bal.getAttribute('data-value'); _pmSet('pmBalance', (v !== null && v !== '') ? formatMoney(Number(v)) : bal.textContent); }
        const pp = document.getElementById('perfilPuntos'); if (pp) _pmSet('pmPuntos', pp.textContent);
        const gp = document.getElementById('globalPtsTag'); if (gp) _pmSet('pmValorPunto', '$' + gp.textContent);
        const rt = document.getElementById('remateTag'); if (rt) _pmSet('pmRemanente', rt.textContent);
    }
    function _aplicarHomeVersion(v) {
        const esPremium = v === 'premium';
        // Pares (clásico / premium) por sección con layout propio
        [['homeClasico', 'homePremium'], ['historyClasico', 'historyPremium']].forEach(([cId, pId]) => {
            const c = document.getElementById(cId), p = document.getElementById(pId);
            if (c) c.style.display = esPremium ? 'none' : '';
            if (p) p.style.display = esPremium ? 'block' : 'none';
        });
        // Skin premium a toda la app (header, barra inferior, Estadísticas, Mensajes, Perfil)
        if (esPremium) document.documentElement.setAttribute('data-premium', '1');
        else document.documentElement.removeAttribute('data-premium');
        _sincronizarHomeverBtns();
        if (esPremium) _refrescarPremium();
    }
    window.setHomeVersion = function () {
        // Clásica retirada: siempre premium.
        try { localStorage.setItem('propi_home_version', 'premium'); } catch (e) {}
        _aplicarHomeVersion('premium');
    };

    // ── Migración única de la versión clásica → nueva (premium) ──────────
    // A los socios que tenían la clásica se les muestra un modal de "nueva versión";
    // al activarla, cambia a la tarjeta nueva con un efecto. A los demás, premium directo.
    function _maybeMigrarPremium() {
        let migrado = false, eraClasico = true;
        try {
            migrado = localStorage.getItem('propi_premium_migrado') === '1';
            eraClasico = localStorage.getItem('propi_home_version') !== 'premium';
        } catch (e) {}
        if (!migrado && eraClasico && currentUser) {
            const m = document.getElementById('nuevaVersionModal');
            if (m) { m.style.display = 'flex'; return; }
        }
        // Ya migrado, ya estaba en premium, o sin modal disponible → aplicar premium
        try { localStorage.setItem('propi_premium_migrado', '1'); localStorage.setItem('propi_home_version', 'premium'); } catch (e) {}
        _aplicarHomeVersion('premium');
    }
    window._activarNuevaVersion = function () {
        try {
            localStorage.setItem('propi_premium_migrado', '1');
            localStorage.setItem('propi_home_version', 'premium');
            localStorage.setItem('propi_balance_estilo', 'tarjeta');
        } catch (e) {}
        const m = document.getElementById('nuevaVersionModal'); if (m) m.style.display = 'none';
        _aplicarBalanceEstilo('tarjeta');
        _aplicarHomeVersion('premium');
        // Efecto de transición al estrenar la nueva versión
        const app = document.getElementById('appContainer');
        if (app) { app.classList.add('pm-switch-fx'); setTimeout(() => app.classList.remove('pm-switch-fx'), 750); }
    };

    // ── Filtros (año / mes) para "Anticipos Anteriores" premium ──
    let _pmAntAnio = 'Todos', _pmAntMes = 'Todos';

    // Aplica los filtros activos sobre los datos ya cargados
    function _pmAntFiltrar() {
        let d = _histAnticiposData || [];
        if (_pmAntAnio !== 'Todos') d = d.filter(p => _extraerAnio(p.periodo) === _pmAntAnio);
        if (_pmAntMes  !== 'Todos') d = d.filter(p => _extraerMes(p.periodo) === _pmAntMes);
        return d;
    }

    function _pmChipAnt(val, activo, onclick) {
        return `<button onclick="${onclick}" style="flex-shrink:0;padding:6px 14px;border-radius:999px;font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap;border:1px solid ${activo ? '#6366f1' : '#43474b'};background:${activo ? '#6366f1' : '#1d232a'};color:${activo ? '#fff' : '#c3c7cb'};">${val}</button>`;
    }

    function pmBuildAntFiltros() {
        const data = _histAnticiposData || [];
        const barA = document.getElementById('pmAntFiltroAnios');
        if (barA) {
            const anios = [...new Set(data.map(p => _extraerAnio(p.periodo)).filter(Boolean))].sort((a, b) => b - a);
            if (anios.length <= 1) { barA.style.display = 'none'; }
            else {
                barA.style.display = 'flex';
                barA.innerHTML = ['Todos', ...anios].map(a => _pmChipAnt(a, a === _pmAntAnio, `pmFiltrarAntAnio('${a}')`)).join('');
            }
        }
        pmBuildAntMeses();
    }

    function pmBuildAntMeses() {
        const barM = document.getElementById('pmAntFiltroMeses');
        if (!barM) return;
        const base = (_pmAntAnio === 'Todos') ? (_histAnticiposData || [])
            : (_histAnticiposData || []).filter(p => _extraerAnio(p.periodo) === _pmAntAnio);
        const set = new Set(base.map(p => _extraerMes(p.periodo)).filter(Boolean));
        const meses = MESES_ES.filter(m => set.has(m));
        if (meses.length <= 1) { barM.style.display = 'none'; return; }
        barM.style.display = 'flex';
        barM.innerHTML = ['Todos', ...meses].map(m => _pmChipAnt(m, m === _pmAntMes, `pmFiltrarAntMes('${m}')`)).join('');
    }

    window.pmFiltrarAntAnio = function (a) {
        _pmAntAnio = a; _pmAntMes = 'Todos';
        pmBuildAntFiltros();
        pmRenderAntAnt(_pmAntFiltrar());
    };
    window.pmFiltrarAntMes = function (m) {
        _pmAntMes = m;
        pmBuildAntMeses();
        pmRenderAntAnt(_pmAntFiltrar());
    };

    // Colapsar / expandir un período (acordeón)
    window.pmTogglePeriodo = function (id) {
        const body = document.getElementById('pmant-body-' + id);
        const icon = document.getElementById('pmant-icon-' + id);
        if (!body) return;
        const abierto = body.style.display === 'block';
        body.style.display = abierto ? 'none' : 'block';
        if (icon) icon.style.transform = abierto ? 'rotate(0deg)' : 'rotate(180deg)';
    };

    // Historial premium: render de "Anticipos Anteriores" (estilo oscuro, colapsable)
    function pmRenderAntAnt(data) {
        const cont = document.getElementById('pmAntAntList');
        if (!cont) return;
        if (!data || !data.length) {
            cont.innerHTML = '<div style="text-align:center;padding:40px 16px;color:#8d9196;font-size:13px;">Sin anticipos en este período.</div>';
            return;
        }
        cont.innerHTML = data.map((periodo, idx) => {
            const registros = periodo.registros || [];
            const total = registros.reduce((s, r) => s + (Number(r.monto) || 0), 0);
            const n = registros.length;
            const id = 'pm' + idx;
            const regs = registros.map(r => `<div style="display:flex;justify-content:space-between;align-items:center;padding:11px 16px;border-top:1px solid #43474b;">
                <div style="min-width:0;"><p style="font-size:13px;color:#e1e3e4;margin:0;">${r.fecha || ''}</p>${r.responsable ? `<p style="font-size:10px;color:#8d9196;margin:2px 0 0;">${r.responsable}</p>` : ''}</div>
                <span style="font-size:13px;font-weight:700;color:#c3c7cb;flex-shrink:0;margin-left:10px;">-${formatMoney(Number(r.monto) || 0)}</span>
            </div>`).join('');
            return `<div style="background:#171c22;border:1px solid #43474b;border-radius:14px;margin-bottom:12px;overflow:hidden;">
                <button onclick="pmTogglePeriodo('${id}')" style="width:100%;padding:14px 16px;display:flex;justify-content:space-between;align-items:center;background:#1d232a;border:none;cursor:pointer;text-align:left;">
                    <div style="display:flex;align-items:center;gap:8px;min-width:0;">
                        <span class="material-symbols-outlined" style="font-size:16px;color:#93c5fd;flex-shrink:0;">folder_open</span>
                        <span style="font-size:13px;font-weight:700;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${_fmtPeriodoLabel(periodo.periodo)}</span>
                        <span style="font-size:10px;color:#8d9196;flex-shrink:0;">${n} anticipo${n !== 1 ? 's' : ''}</span>
                    </div>
                    <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
                        <span style="font-size:14px;font-weight:800;color:#ffb4ab;">-${formatMoney(total)}</span>
                        <span id="pmant-icon-${id}" class="material-symbols-outlined" style="font-size:18px;color:#8d9196;transition:transform 0.2s;">expand_more</span>
                    </div>
                </button>
                <div id="pmant-body-${id}" style="display:none;">${regs}</div>
            </div>`;
        }).join('');
    }

    // Historial premium: alterna Movimientos / Anticipos Anteriores
    window.pmSwitchHist = async function (view) {
        const esAnt = view === 'anticipos';
        const vMovs = document.getElementById('pmHistMovsView');
        const vAnt = document.getElementById('pmHistAntView');
        const bMovs = document.getElementById('pmHistTabMovs');
        const bAnt = document.getElementById('pmHistTabAnt');
        if (vMovs) vMovs.style.display = esAnt ? 'none' : 'block';
        if (vAnt) vAnt.style.display = esAnt ? 'block' : 'none';
        if (bMovs) { bMovs.style.background = esAnt ? 'transparent' : '#ffffff'; bMovs.style.color = esAnt ? '#c3c7cb' : '#0f1419'; }
        if (bAnt) { bAnt.style.background = esAnt ? '#ffffff' : 'transparent'; bAnt.style.color = esAnt ? '#0f1419' : '#c3c7cb'; }
        if (esAnt) {
            const cont = document.getElementById('pmAntAntList');
            if (!_histAnticiposLoaded) {
                if (cont) cont.innerHTML = '<div style="text-align:center;padding:40px 16px;color:#c3c7cb;font-size:13px;">Cargando…</div>';
                try { await loadHistorialAnticipos(); } catch (e) {}
            }
            _pmAntAnio = 'Todos'; _pmAntMes = 'Todos';
            pmBuildAntFiltros();
            pmRenderAntAnt(_pmAntFiltrar());
        }
    };

    // ── FOTO DE PERFIL (Supabase Storage, bucket público 'avatares') ──
    function _aplicarFotoPerfil(url) {
        // Avatar del Perfil
        const av = document.getElementById('perfilAvatar');
        const letra = document.getElementById('perfilLetra');
        if (av) {
            if (url) { av.style.backgroundImage = 'url("' + url + '")'; if (letra) letra.style.display = 'none'; }
            else { av.style.backgroundImage = ''; if (letra) letra.style.display = ''; }
        }
        // Avatar del header (arriba, junto al nombre)
        const hd = document.getElementById('userAvatar');
        if (hd) {
            if (url) { hd.style.backgroundImage = 'url("' + url + '")'; hd.style.backgroundSize = 'cover'; hd.style.backgroundPosition = 'center'; hd.textContent = ''; }
            else { hd.style.backgroundImage = ''; }
        }
        // Guardar la foto en el auth local para mostrarla en el login la próxima vez
        if (url) {
            try {
                const a = JSON.parse(localStorage.getItem('visor_secure_auth') || '{}');
                if (a.id && a.foto !== url) { a.foto = url; localStorage.setItem('visor_secure_auth', JSON.stringify(a)); }
            } catch(e) {}
        }
    }

    // ── Foto ampliada (lightbox) ──
    window.verFotoGrande = function(url) {
        if (!url) return;
        const o = document.getElementById('fotoGrandeOverlay');
        const im = document.getElementById('fotoGrandeImg');
        if (!o || !im) return;
        im.src = url; o.style.display = 'flex';
    };
    window.cerrarFotoGrande = function() {
        const o = document.getElementById('fotoGrandeOverlay');
        if (o) o.style.display = 'none';
    };
    // ── Ver/ocultar PIN (ojito) ──
    window.togglePinVisible = function (id, btn) {
        const inp = document.getElementById(id);
        if (!inp) return;
        const mostrar = inp.type === 'password';
        inp.type = mostrar ? 'text' : 'password';
        const icon = btn && btn.querySelector('.material-symbols-outlined');
        if (icon) icon.textContent = mostrar ? 'visibility_off' : 'visibility';
    };

    // ── Forma de la foto del login (círculo / redondeado / cuadrado / hexágono) ──
    const _LOGIN_SHAPES = {
        circle:  { r: '50%',  clip: 'none' },
        rounded: { r: '22px', clip: 'none' },
        square:  { r: '10px', clip: 'none' },
        hex:     { r: '0',    clip: 'polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%)' }
    };
    function _loginShapeGuardada() {
        try { const s = localStorage.getItem('propi_login_shape'); return _LOGIN_SHAPES[s] ? s : 'circle'; }
        catch (e) { return 'circle'; }
    }
    function _aplicarLoginShape(shape) {
        const cfg = _LOGIN_SHAPES[shape] || _LOGIN_SHAPES.circle;
        const box = document.getElementById('fastAvatarBox');
        if (box) { box.style.borderRadius = cfg.r; box.style.clipPath = cfg.clip; box.style.webkitClipPath = cfg.clip; }
        document.querySelectorAll('.login-shape-btn').forEach(b => b.classList.toggle('active', b.getAttribute('data-shape') === shape));
    }
    window.setLoginAvatarShape = function (shape) {
        if (!_LOGIN_SHAPES[shape]) shape = 'circle';
        try { localStorage.setItem('propi_login_shape', shape); } catch (e) {}
        _aplicarLoginShape(shape);
    };

    window._authFoto = function() {
        try { return (JSON.parse(localStorage.getItem('visor_secure_auth') || '{}')).foto || ''; } catch (e) { return ''; }
    };
    // Tocar el avatar del Perfil: si hay foto la agranda; si no, abre el menú para agregarla
    window.tapPerfilAvatar = function() {
        const url = currentUser && currentUser.FotoUrl;
        if (url) verFotoGrande(url); else abrirMenuFoto();
    };

    window.abrirMenuFoto = function() {
        const m = document.getElementById('fotoMenuModal');
        if (m) { m.classList.remove('hidden'); m.classList.add('flex'); }
    };
    window.cerrarMenuFoto = function() {
        const m = document.getElementById('fotoMenuModal');
        if (m) { m.classList.add('hidden'); m.classList.remove('flex'); }
    };

    window.subirFotoPerfil = async function(input) {
        const file = input.files && input.files[0];
        input.value = '';
        if (!file || !currentUser) return;
        if (!/^image\//.test(file.type)) { alert('Selecciona una imagen.'); return; }
        if (file.size > 8 * 1024 * 1024) { alert('La imagen supera 8 MB.'); return; }
        try {
            const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
            const path = 'socio/' + currentUser.ID + '.' + ext;
            // upsert:true → reemplaza la foto anterior del socio
            const up = await dbSV.storage.from('avatares').upload(path, file, { contentType: file.type, upsert: true });
            if (up.error) throw up.error;
            const pub = dbSV.storage.from('avatares').getPublicUrl(path);
            // cache-busting para forzar recarga tras reemplazo
            const url = pub.data.publicUrl + '?v=' + Date.now();
            const res = await fetch(SCRIPT_URL_SOCIOS, { method: 'POST', body: JSON.stringify({ action: 'guardarFotoSocio', socioId: currentUser.ID, fotoUrl: url }) });
            const j = await res.json();
            if (!j || !j.success) throw new Error((j && j.error) || 'Error');
            currentUser.FotoUrl = url;
            const s = allSocios.find(x => String(x.ID) === String(currentUser.ID)); if (s) s.FotoUrl = url;
            _aplicarFotoPerfil(url);
        } catch(e) { alert('No se pudo subir la foto: ' + (e.message || e)); }
    };

    // ── MIS DOCUMENTOS (Supabase Storage) ─────────────────────
    function _escDoc(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

    async function cargarDocumentos() {
        const cont = document.getElementById('docsLista');
        if (!currentUser || !cont) return;
        cont.innerHTML = '<p style="text-align:center;color:#94a3b8;font-size:12px;padding:10px;">Cargando…</p>';
        try {
            const { data } = await dbSV.from('documentos').select('*').eq('socio_id', String(currentUser.ID)).order('created_at', { ascending: false });
            renderDocumentos(data || []);
        } catch(e) { cont.innerHTML = '<p style="text-align:center;color:#dc2626;font-size:12px;padding:10px;">Error al cargar</p>'; }
    }

    function renderDocumentos(docs) {
        const cont = document.getElementById('docsLista');
        if (!cont) return;
        if (!docs.length) { cont.innerHTML = '<p style="text-align:center;color:#94a3b8;font-size:12px;padding:8px;">Aún no has subido documentos.</p>'; return; }
        cont.innerHTML = docs.map(function(d) {
            const kb = d.tamano ? Math.round(d.tamano/1024) : 0;
            const icon = (d.mime||'').indexOf('pdf') >= 0 ? 'picture_as_pdf' : 'image';
            const esAdmin = (d.subido_por || 'socio') !== 'socio';
            const meta = esAdmin
                ? '<p style="font-size:10px;color:#6366f1;font-weight:700;margin:1px 0 0;">📎 Enviado por administración · ' + kb + ' KB</p>'
                : '<p style="font-size:10px;color:#94a3b8;margin:1px 0 0;">' + kb + ' KB</p>';
            const borrarBtn = esAdmin
                ? ''
                : '<button onclick="borrarDocumento(\'' + d.id + '\',\'' + d.storage_path + '\')" style="background:#fee2e2;border:none;border-radius:8px;padding:6px 8px;color:#dc2626;cursor:pointer;">🗑</button>';
            return '<div style="display:flex;align-items:center;gap:10px;padding:10px;border:1px solid ' + (esAdmin ? '#c7d2fe' : '#e2e8f0') + ';border-radius:12px;margin-bottom:8px;' + (esAdmin ? 'background:#f5f7ff;' : '') + '">'
                + '<span class="material-symbols-outlined" style="font-size:22px;color:#6366f1;">' + icon + '</span>'
                + '<div style="flex:1;min-width:0;">'
                + '<p style="font-size:12px;font-weight:700;color:#001723;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + _escDoc(d.nombre_archivo || 'documento') + '</p>'
                + meta
                + '</div>'
                + '<button onclick="verDocumento(\'' + d.storage_path + '\')" style="background:#eef2ff;border:none;border-radius:8px;padding:6px 10px;font-size:11px;font-weight:700;color:#4338ca;cursor:pointer;">Ver</button>'
                + borrarBtn
                + '</div>';
        }).join('');
    }

    window.subirDocumento = async function(input) {
        const file = input.files && input.files[0];
        input.value = '';
        if (!file || !currentUser) return;
        if (file.size > 15 * 1024 * 1024) { alert('El archivo supera 15 MB.'); return; }
        const btn = document.getElementById('docUploadBtn');
        const prev = btn ? btn.innerHTML : '';
        if (btn) { btn.disabled = true; btn.textContent = 'Subiendo…'; }
        const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const path = 'socio/' + currentUser.ID + '/' + Date.now() + '_' + safe;
        try {
            const up = await dbSV.storage.from('documentos').upload(path, file, { contentType: file.type, upsert: false });
            if (up.error) throw up.error;
            await dbSV.from('documentos').insert({
                id: crypto.randomUUID(), socio_id: String(currentUser.ID),
                socio_nombre: ((currentUser.Nombre||'') + ' ' + (currentUser.Apellido||'')).trim(),
                categoria: 'socio', nombre_archivo: file.name, storage_path: path,
                mime: file.type, tamano: file.size, subido_por: 'socio'
            });
            await cargarDocumentos();
        } catch(e) { alert('No se pudo subir el documento: ' + (e.message || e)); }
        finally { if (btn) { btn.disabled = false; btn.innerHTML = prev; } }
    };

    window.verDocumento = async function(path) {
        try {
            const { data, error } = await dbSV.storage.from('documentos').createSignedUrl(path, 3600);
            if (error) throw error;
            window.open(data.signedUrl, '_blank');
        } catch(e) { alert('No se pudo abrir el documento.'); }
    };

    window.borrarDocumento = async function(id, path) {
        if (!confirm('¿Eliminar este documento?')) return;
        try {
            await dbSV.storage.from('documentos').remove([path]);
            await dbSV.from('documentos').delete().eq('id', id);
            await cargarDocumentos();
        } catch(e) { alert('No se pudo eliminar.'); }
    };

    // ── AJUSTES del perfil (modal): nombre, notificaciones, tema, documentos ──
    // "Ajustes" ya no es un modal: es la sección tab-config en la barra inferior.
    // Se conservan estas funciones por compatibilidad (llamadas antiguas).
    window.abrirAjustesModal = function() {
        if (typeof switchTab === 'function') switchTab('tab-config');
    };
    window.cerrarAjustesModal = function() { /* no-op: ya no hay modal */ };

    // ── MIS DOCUMENTOS (opción en Perfil → modal) ────────────
    window.abrirDocumentosModal = function() {
        const m = document.getElementById('documentosModal');
        if (!m) return;
        m.classList.remove('hidden'); m.classList.add('flex');
        if (typeof cargarDocumentos === 'function') cargarDocumentos(); // refrescar la lista al abrir
    };
    window.cerrarDocumentosModal = function() {
        const m = document.getElementById('documentosModal');
        if (!m) return;
        m.classList.add('hidden'); m.classList.remove('flex');
    };

    // ── NOMBRE PERSONALIZADO ─────────────────────────────────
    function getDisplayName() {
        const key = `displayName_${currentUser.ID}`;
        return localStorage.getItem(key) || `${currentUser.Nombre} ${currentUser.Apellido}`;
    }
    function saveDisplayName(nombre) {
        const key = `displayName_${currentUser.ID}`;
        if (nombre && nombre.trim()) {
            localStorage.setItem(key, nombre.trim());
        } else {
            localStorage.removeItem(key);
        }
    }
    function applyDisplayName() {
        const nombre = getDisplayName();
        document.getElementById('userNameLabel').textContent = nombre;
        document.getElementById('userAvatar').textContent = nombre.charAt(0).toUpperCase();
        _aplicarFotoPerfil(currentUser && currentUser.FotoUrl ? currentUser.FotoUrl : '');
    }
    function openEditNameModal() {
        document.getElementById('editNameInput').value = getDisplayName();
        const m = document.getElementById('editNameModal');
        m.classList.remove('hidden');
        m.classList.add('flex');
        setTimeout(() => document.getElementById('editNameInput').focus(), 100);
    }
    function saveEditName() {
        const val = document.getElementById('editNameInput').value.trim();
        saveDisplayName(val);
        applyDisplayName();
        document.getElementById('editNameModal').classList.add('hidden');
        document.getElementById('editNameModal').classList.remove('flex');
    }
    function resetDisplayName() {
        localStorage.removeItem(`displayName_${currentUser.ID}`);
        applyDisplayName();
        document.getElementById('editNameModal').classList.add('hidden');
        document.getElementById('editNameModal').classList.remove('flex');
    }

    function initApp() {
        document.getElementById('loginOverlay').classList.add('hidden');
        document.getElementById('appContainer').classList.remove('hidden');
        document.getElementById('appContainer').classList.add('flex');
        applyDisplayName();
        document.getElementById('userAreaLabel').textContent = currentUser.Area;
        renderPerfil();
        initChatInput();
        showSkeletons();
        pingConexion();
        resetInactivity();
        startInactivityClock();
        checkFirstTimeHelp();
        refresh(true); // primer load con animaciones
        setInterval(()=>refresh(false), 20000); // silencioso cada 20s
        setInterval(()=>refreshChat(false), 8000);
        setInterval(pingConexion, 120000);
        // Mensajes privados del administrador (carga + refresco + aviso)
        setTimeout(()=>refreshAdminPriv(false), 2000);
        setInterval(()=>refreshAdminPriv(false), 8000);
        // Pedir el RUT si el socio aún no lo tiene (para certificados/informes)
        setTimeout(checkRutRequired, 1400);
        // Pedir el correo si aún no lo tiene (para completar información del perfil)
        setTimeout(checkCorreoRequired, 3200);
        // Mostrar una vez el aviso de foto/documentos
        setTimeout(checkInfoPerfil, 2400);
        // Estado de la solicitud de egreso pendiente
        setTimeout(renderEgresoEstado, 1800);
        setInterval(renderEgresoEstado, 30000);
        // Estado del botón de notificaciones push
        setTimeout(_pushRefrescarEstado, 2600);
        // Campana de notificaciones: inicializar marcas de "visto" a ahora si no existen
        // (evita contar todo el historial como no leído la primera vez)
        ['_rec_last_seen','_social_last_seen','_admin_priv_last_seen'].forEach(k=>{ if(localStorage.getItem(k)==null) localStorage.setItem(k, String(Date.now())); });
        setTimeout(renderNotifBell, 1500);
        setInterval(renderNotifBell, 15000);
    }

    // ── AVISO: foto de perfil y documentos (una vez por dispositivo) ──
    function checkInfoPerfil() {
        if (localStorage.getItem('propi_info_perfil_v1')) return;
        // No encimar sobre otros modales que puedan estar abiertos
        const otros = ['rutModal', 'helpModal', 'loginHelpModal', 'fotoMenuModal', 'editNameModal'];
        for (let i = 0; i < otros.length; i++) {
            const m = document.getElementById(otros[i]);
            if (m && !m.classList.contains('hidden')) { setTimeout(checkInfoPerfil, 3000); return; }
        }
        localStorage.setItem('propi_info_perfil_v1', '1');
        const m = document.getElementById('infoPerfilModal');
        if (m) { m.classList.remove('hidden'); m.classList.add('flex'); }
    }
    window.cerrarInfoPerfil = function() {
        const m = document.getElementById('infoPerfilModal');
        if (m) { m.classList.add('hidden'); m.classList.remove('flex'); }
    };
    window.irAMiPerfil = function() {
        window.cerrarInfoPerfil();
        try { switchTab('tab-perfil'); } catch(e) {}
    };

    // ── SOLICITAR RUT (para certificados/informes en socios-comicion) ──
    function checkRutRequired() {
        if (!currentUser) return;
        if (currentUser.Rut && String(currentUser.Rut).trim()) return; // ya lo tiene
        // No encimar sobre el modal de ayuda si está abierto
        const help = document.getElementById('helpModal');
        if (help && !help.classList.contains('hidden')) { setTimeout(checkRutRequired, 3000); return; }
        // Pre-llenar con el RUT de recuperación local, si existe
        let pre = '';
        try { const a = JSON.parse(localStorage.getItem('visor_secure_auth') || '{}'); if (a.rut) pre = formatRUT(a.rut); } catch(e) {}
        const inp = document.getElementById('rutModalInput');
        if (inp) inp.value = pre;
        const err = document.getElementById('rutModalError');
        if (err) err.classList.add('hidden');
        const m = document.getElementById('rutModal');
        if (m) { m.classList.remove('hidden'); m.classList.add('flex'); }
    }

    window.closeRutModal = function() {
        const m = document.getElementById('rutModal');
        if (m) { m.classList.add('hidden'); m.classList.remove('flex'); }
    };

    window.submitRut = async function() {
        const inp = document.getElementById('rutModalInput');
        const err = document.getElementById('rutModalError');
        const btn = document.getElementById('rutModalBtn');
        const raw = (inp.value || '').trim();
        if (!validateRUT(raw)) { err.textContent = 'RUT no válido. Ej: 12.345.678-9'; err.classList.remove('hidden'); return; }
        const rut = formatRUT(raw);
        btn.disabled = true; btn.textContent = 'Guardando...';
        try {
            const res = await fetch(SCRIPT_URL_SOCIOS, {
                method: 'POST',
                body: JSON.stringify({ action: 'guardarRutSocio', socioId: currentUser.ID, rut: rut, nombre: ((currentUser.Nombre||'') + ' ' + (currentUser.Apellido||'')).trim() })
            });
            const j = await res.json();
            if (!j || !j.success) throw new Error((j && j.error) || 'Error');
            currentUser.Rut = rut;
            const s = allSocios.find(x => String(x.ID) === String(currentUser.ID)); if (s) s.Rut = rut;
            btn.textContent = '✓ Guardado';
            setTimeout(function() { window.closeRutModal(); btn.disabled = false; btn.textContent = 'Guardar RUT'; }, 700);
            return;
        } catch(e) {
            err.textContent = 'No se pudo guardar, reintenta.'; err.classList.remove('hidden');
        }
        btn.disabled = false; btn.textContent = 'Guardar RUT';
    };

    // ── CORREO ELECTRÓNICO DEL SOCIO ──────────────────────────
    function checkCorreoRequired() {
        if (!currentUser) return;
        if (currentUser.Correo && String(currentUser.Correo).trim()) return; // ya lo tiene
        const help = document.getElementById('helpModal');
        if (help && !help.classList.contains('hidden')) { setTimeout(checkCorreoRequired, 3000); return; }
        const rutM = document.getElementById('rutModal');
        if (rutM && !rutM.classList.contains('hidden')) { setTimeout(checkCorreoRequired, 3000); return; }
        window.openCorreoModal();
    }
    window.openCorreoModal = function() {
        const inp = document.getElementById('correoModalInput');
        if (inp) inp.value = (currentUser && currentUser.Correo) || '';
        const err = document.getElementById('correoModalError'); if (err) err.classList.add('hidden');
        const m = document.getElementById('correoModal');
        if (m) { m.classList.remove('hidden'); m.classList.add('flex'); }
    };
    window.closeCorreoModal = function() {
        const m = document.getElementById('correoModal');
        if (m) { m.classList.add('hidden'); m.classList.remove('flex'); }
    };
    window.submitCorreo = async function() {
        const inp = document.getElementById('correoModalInput');
        const err = document.getElementById('correoModalError');
        const btn = document.getElementById('correoModalBtn');
        const raw = (inp.value || '').trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) { err.textContent = 'Correo no válido. Ej: nombre@correo.com'; err.classList.remove('hidden'); return; }
        btn.disabled = true; btn.textContent = 'Guardando...';
        try {
            const res = await fetch(SCRIPT_URL_SOCIOS, {
                method: 'POST',
                body: JSON.stringify({ action: 'guardarCorreoSocio', socioId: currentUser.ID, correo: raw, nombre: ((currentUser.Nombre||'') + ' ' + (currentUser.Apellido||'')).trim() })
            });
            const j = await res.json();
            if (!j || !j.success) throw new Error((j && j.error) || 'Error');
            currentUser.Correo = raw;
            const s = allSocios.find(x => String(x.ID) === String(currentUser.ID)); if (s) s.Correo = raw;
            btn.textContent = '✓ Guardado';
            if (typeof renderPerfil === 'function') renderPerfil();
            setTimeout(function() { window.closeCorreoModal(); btn.disabled = false; btn.textContent = 'Guardar correo'; }, 700);
            return;
        } catch(e) {
            err.textContent = 'No se pudo guardar, reintenta.'; err.classList.remove('hidden');
        }
        btn.disabled = false; btn.textContent = 'Guardar correo';
    };

    // ── SKELETON LOADERS ──────────────────────────────────────
    function showSkeletons() {
        const _mrl = document.getElementById('montoRecibirLabel');
        _mrl.removeAttribute('data-value'); // forzar re-render aunque el valor sea el mismo
        _mrl.innerHTML =
            '<div class="skeleton h-9 w-36 rounded-xl" style="background:linear-gradient(90deg,rgba(255,255,255,0.15) 25%,rgba(255,255,255,0.25) 50%,rgba(255,255,255,0.15) 75%);background-size:600px 100%;animation:shimmer 1.6s infinite linear;border-radius:10px;"></div>';
        document.getElementById('detallesContables').innerHTML = [1,2,3].map(()=>`
            <div class="flex justify-between items-center px-5 py-4">
                <div class="flex items-center gap-3">
                    <div class="skeleton w-9 h-9 rounded-xl shrink-0"></div>
                    <div class="skeleton h-4 w-32 rounded-lg"></div>
                </div>
                <div class="skeleton h-4 w-20 rounded-lg"></div>
            </div>`).join('');
        document.getElementById('anticiposList').innerHTML = [1,2,3].map(()=>`
            <div class="movement-row">
                <div class="skeleton w-10 h-10 rounded-xl shrink-0"></div>
                <div class="flex-1 space-y-2">
                    <div class="skeleton h-4 w-3/4 rounded-lg"></div>
                    <div class="skeleton h-3 w-1/3 rounded-lg"></div>
                </div>
                <div class="skeleton h-4 w-16 rounded-lg"></div>
            </div>`).join('');
        document.getElementById('historyList').innerHTML = [1,2,3,4].map(()=>`
            <div class="movement-row">
                <div class="skeleton w-10 h-10 rounded-xl shrink-0"></div>
                <div class="flex-1 space-y-2">
                    <div class="skeleton h-4 w-24 rounded-lg"></div>
                    <div class="skeleton h-3 w-16 rounded-lg"></div>
                </div>
                <div class="skeleton h-4 w-20 rounded-lg"></div>
            </div>`).join('');
    }

    function animateIn(el, delay='') {
        if (!el) return;
        el.style.opacity = '0';
        el.style.transform = 'translateY(12px)';
        el.style.transition = `opacity 0.35s ${delay} ease, transform 0.35s ${delay} ease`;
        requestAnimationFrame(() => {
            el.style.opacity = '1';
            el.style.transform = 'translateY(0)';
        });
    }

    // ── FORMATTERS ────────────────────────────────────────────
    const formatMoney = n => `$${new Intl.NumberFormat('es-CL').format(Math.round(n)||0)}`;
    const cleanDateStr = d => {
        if (!d) return "";
        const s = String(d).substring(0,10);
        if (s.includes('-')) { const p=s.split('-'); if(p[0].length===4) return `${p[2]}-${p[1]}-${p[0]}`; }
        return s;
    };
    const formatDateText = dStr => {
        let p=dStr.split('-'), d;
        if(p[0].length===4) d=new Date(p[0],p[1]-1,p[2]); else d=new Date(p[2],p[1]-1,p[0]);
        return d.toLocaleDateString('es-ES',{weekday:'long',day:'numeric',month:'long'}).replace('.','');
    };

    // ── REFRESH CHAT ONLY (polling ligero) ───────────────────
    let chatRefreshing = false;
    function mergeOptimistas(newList, oldList) {
        // Si hay mensajes optimistas (_sending), no re-renderizar si el contenido ya existe
        const hasSending = oldList.some(m => m._sending);
        if (!hasSending) return newList; // sin optimistas, devolver normal
        // Mantener los optimistas que aún no llegaron del servidor
        const serverUuids = new Set(newList.map(m => m.uuid));
        const pendientes  = oldList.filter(m => m._sending && !serverUuids.has(m.uuid));
        return [...newList, ...pendientes];
    }

    async function refreshChat(forceRender=false) {
        if (chatRefreshing) return;
        chatRefreshing = true;
        try {
            // Caché de mensajes: no re-fetch si fue hace menos de 5s
            const now5 = Date.now();
            if (!refreshChat._lastFetch || now5 - refreshChat._lastFetch > 5000) {
                refreshChat._lastFetch = now5;
            } else if (!forceRender) {
                renderChat(false);
                return;
            }

            const [adminRes, socialRes] = await Promise.all([
                fetch(`${SCRIPT_URL_RECAUDACIONES}?action=getNotes`),
                fetch(`${SCRIPT_URL_SOCIOS}?action=getNotes`).catch(()=>({json:()=>({data:[]})}))
            ]);
            const newAdmin = (await adminRes.json()).data || [];
            let newSocial = [];
            try { newSocial = (await socialRes.json()).data || []; } catch(e){}

            if (forceRender && newSocial.length > 0) {
                const ultimo = newSocial[newSocial.length - 1];
                console.log('=== ULTIMO MENSAJE SOCIAL ===', JSON.stringify(ultimo));
                console.log('currentUser.ID:', currentUser.ID, typeof currentUser.ID);
                console.log('currentSocialTarget.id:', currentSocialTarget.id, typeof currentSocialTarget.id);
                showDebugToast(ultimo);
            }

            const prevTotal = messages.admin.length + messages.social.length;
            // Preservar optimistas pendientes para evitar parpadeo
            messages.admin  = mergeOptimistas(newAdmin,  messages.admin);
            messages.social = mergeOptimistas(newSocial, messages.social);
            const newTotal = messages.admin.length + messages.social.length;

            renderChat(forceRender);
            if (newTotal !== prevTotal) checkNotifications();
            renderNotifBell();

        } catch(e) { console.error('Chat refresh error', e); }
        finally { chatRefreshing = false; }
    }

    function showDebugToast(msg) {
        const existing = document.getElementById('debugToast');
        if (existing) existing.remove();
        const d = document.createElement('div');
        d.id = 'debugToast';
        d.style.cssText = 'position:fixed;bottom:120px;left:10px;right:10px;background:#fff;border:1px solid #001723;border-radius:12px;padding:12px;z-index:999;font-size:11px;color:#191c1d;word-break:break-all;box-shadow:0 8px 24px rgba(0,0,0,0.1);';
        d.innerHTML = '<b style="color:#001723">Campos del mensaje (debug):</b><br>' +
            Object.entries(msg).map(([k,v])=>`<span style="color:#006a62">${escHtml(k)}</span>: ${escHtml(String(v))}`).join('<br>') +
            '<br><br><b>Mi ID:</b> ' + escHtml(String(currentUser.ID)) +
            '<br><b>Target ID:</b> ' + escHtml(String(currentSocialTarget.id)) +
            '<button onclick="this.parentElement.remove()" style="float:right;color:#ba1a1a;font-size:14px;margin-top:4px">✕</button>';
        document.body.appendChild(d);
        setTimeout(() => d.remove(), 15000);
    }

    // ── REFRESH DATA — FASE 1: balance (crítico) + FASE 2: notas (background) ──
    let _balanceCache = null;
    let _balanceCacheTs = 0;
    const BALANCE_CACHE_TTL = 15000; // 15 segundos

    async function refresh(isFirstLoad=false) {
        // Guard anti-solapamiento: si ya hay un refresh en curso, marcar pendiente
        // y salir. Al terminar, se corre UNO solo de seguimiento (coalescing).
        if (_refreshing) { _refreshPending = true; return; }
        _refreshing = true;
        try {
            // ── FASE 1: Las 5 llamadas de balance en paralelo ────
            // Las notas NO bloquean — se cargan en background
            // 5 llamadas en paralelo — cambiar a getAllSocioData una vez agregado al GAS
            const [recRes, dataRes, saldosRes, cierreRes, diasRes] = await Promise.all([
                fetch(`${SCRIPT_URL_RECAUDACIONES}?action=get`),
                fetch(SCRIPT_URL_SOCIOS, {method:'POST', body:JSON.stringify({action:'getAllDataDesdeSheets'})}),
                fetch(`${SCRIPT_URL_SOCIOS}?action=getSaldosAnteriores`),
                fetch(`${SCRIPT_URL_SOCIOS}?action=getSaldosCierre`),
                fetch(`${SCRIPT_URL_SOCIOS}?action=getDiasPartTime`)
            ]);

            const recJson    = await recRes.json();
            const fullSheets = await dataRes.json();
            const saldosJson = await saldosRes.json();
            const cierreJson = await cierreRes.json();
            const diasJson   = await diasRes.json();

            let recData        = recJson.data   || [];
            let sheetsData     = fullSheets.data || fullSheets;
            let saldosData     = saldosJson.data || {};
            let cierreData     = cierreJson.data || {};
            let diasTrabajados = diasJson.data || {};

            // Anti-parpadeo: si una fuente respondió "stale" (timeout por conexión
            // dormida al volver a la app), conservar los últimos datos buenos en
            // lugar de mostrar la pantalla en blanco / saldo en $0.
            if (_lastGood) {
                if (recJson._stale   && _lastGood.recData)        recData        = _lastGood.recData;
                if (fullSheets._stale&& _lastGood.sheetsData)     sheetsData     = _lastGood.sheetsData;
                if (diasJson._stale  && _lastGood.diasTrabajados) diasTrabajados = _lastGood.diasTrabajados;
            }
            // Guardar snapshot bueno solo cuando los datos clave llegaron frescos.
            if (!recJson._stale && !fullSheets._stale) {
                _lastGood = { recData, sheetsData, diasTrabajados };
            }

            // ── FASE 2: Notas en background (no bloquean el render) ─
            Promise.all([
                fetch(`${SCRIPT_URL_RECAUDACIONES}?action=getNotes`),
                fetch(`${SCRIPT_URL_SOCIOS}?action=getNotes`).catch(()=>({json:()=>({data:[]})}))
            ]).then(async ([adminNotesRes, socialNotesRes]) => {
                messages.admin = (await adminNotesRes.json()).data || [];
                try { messages.social = (await socialNotesRes.json()).data || []; } catch(e){ messages.social=[]; }
                renderChat(false);
                checkNotifications();
                renderNotifBell();
            }).catch(e => console.error('Error cargando notas:', e));

            // ── Cálculo del balance (igual que antes) ────────────
            let mapVP={};
            recData.forEach(r=>{
                let f=String(r.fecha).substring(0,10);
                let m=parseFloat(String(r.monto).replace(/\./g,''))||0;
                let d=parseFloat(r.divisor)||0;
                if(!mapVP[f]) mapVP[f]={totalVP:0,montoReal:0};
                if(d>0) mapVP[f].totalVP+=(m/d); mapVP[f].montoReal+=m;
            });

            const dIng=_parseLocalDate(currentUser.FechaIngreso), hoy=new Date();
            let anos=hoy.getFullYear()-dIng.getFullYear();
            if(hoy.getMonth()<dIng.getMonth()||(hoy.getMonth()===dIng.getMonth()&&hoy.getDate()<dIng.getDate())) anos--;
            const areaN=String(currentUser.Area||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
            const _baseF=areaN.includes('boveda')?2:4; // Bóveda comienza en 2; el resto en 4
            const ptsF=Math.min(_baseF+(Math.max(0,anos)*2),(areaN.includes('mesa')?20:areaN.includes('cambist')?8:areaN.includes('boveda')?10:12));
            const ptsSBb=Number(currentUser.Puntos);
            const pts=(Number.isFinite(ptsSBb)&&ptsSBb>0)?ptsSBb:ptsF;

            let puntoGlobalTotal=0;
            const esPT=String(currentUser.TipoContrato).toLowerCase().includes('part');
            const sID=String(currentUser.ID).trim();
            const allExtras=sheetsData.extras||{};
            let userExtras=allExtras[sID]||allExtras[currentUser.ID]||[];
            if(!userExtras.length){const k=Object.keys(allExtras).find(key=>String(key).trim()===sID);if(k)userExtras=allExtras[k];}

            globalDiasCalendar=[]; userTypeGlobal=esPT?'PT':'PLANTA';

            // Exponer para la autogestión de días PT (calendario interactivo)
            ptMapVP = mapVP; ptPuntos = pts;

            if(esPT){
                let myDias=diasTrabajados[sID]||diasTrabajados[currentUser.ID]||[];
                if(!myDias.length){const k=Object.keys(diasTrabajados).find(key=>String(key).trim()===sID);if(k)myDias=diasTrabajados[k];}
                myDias.forEach(dStr=>{
                    const fKey=String(dStr).substring(0,10), vp=mapVP[fKey]?.totalVP||0;
                    puntoGlobalTotal+=vp;
                    if(vp>0) globalDiasCalendar.push({fecha:fKey,valorPunto:vp,montoAsociado:vp*pts});
                });
                // Cargar los días que el socio marcó y aún están por confirmar/rechazados
                cargarDiasPTSolicitados();
            } else {
                Object.values(mapVP).forEach(v=>puntoGlobalTotal+=v.totalVP);
                userExtras.filter(e=>String(e.tipo).toUpperCase()==='AUSENCIA').forEach(a=>{
                    const fKey=String(a.fecha).substring(0,10), vp=mapVP[fKey]?.totalVP||0;
                    puntoGlobalTotal-=vp;
                    globalDiasCalendar.push({fecha:fKey,valorPunto:vp,montoAsociado:vp*pts});
                });
            }

            const allAnticipos=sheetsData.anticipos||{};
            let userAnticipos=allAnticipos[sID]||allAnticipos[currentUser.ID]||[];
            if(!userAnticipos.length){const k=Object.keys(allAnticipos).find(key=>String(key).trim()===sID);if(k)userAnticipos=allAnticipos[k];}

            const tAnt=userAnticipos.reduce((a,b)=>a+Number(b.cantidad||0),0);
            const tDesc=userExtras.filter(e=>e.tipo==='DESCUENTO_PERSONAL').reduce((a,b)=>a+Number(b.monto||0),0);
            let sAnt=(saldosData[sID]||saldosData[currentUser.ID]||0)+(cierreData[sID]||cierreData[currentUser.ID]||0);

            const propinaBruta=puntoGlobalTotal*pts;
            const saldoBruto=(propinaBruta+sAnt)-(tAnt+tDesc);
            let remanente=saldoBruto>0?saldoBruto%1000:saldoBruto;
            let liquido=saldoBruto>0?saldoBruto-remanente:0;

            const montoEl = document.getElementById('montoRecibirLabel');
            // Solo animar si el valor cambió o es primer load
            const prevMonto = montoEl.getAttribute('data-value');
            const newMonto = String(liquido);
            if (prevMonto !== newMonto) {
                montoEl.textContent = formatMoney(liquido);
                montoEl.setAttribute('data-value', newMonto);
                if (isFirstLoad) animateIn(montoEl, '0ms');
            }
            const _mt = document.getElementById('montoRecibirTarjeta');
            if (_mt) _mt.textContent = formatMoney(liquido);
            const _mtp = document.getElementById('montoRecibirTarjetaPm');
            if (_mtp) _mtp.textContent = formatMoney(liquido);
            document.getElementById('remateTag').textContent = formatMoney(remanente);
            document.getElementById('globalPtsTag').textContent = Math.round(puntoGlobalTotal).toLocaleString('es-CL');
            // Versión premium (dashboard): cifras en vivo
            (function () {
                const _s = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
                _s('pmBalance', formatMoney(liquido));
                _s('pmRemanente', formatMoney(remanente));
                _s('pmValorPunto', formatMoney(Math.round(puntoGlobalTotal)));
                _s('pmPuntos', String(pts));
            })();

            // Resumen contable - Lumina style
            document.getElementById('detallesContables').innerHTML = `
                <div class="flex justify-between items-center px-5 py-4">
                    <div class="flex items-center gap-3">
                        <div class="movement-icon bg-lm-accent/10" style="width:36px;height:36px;border-radius:10px">
                            <span class="material-symbols-outlined text-lm-accent text-[16px]">percent</span>
                        </div>
                        <span class="text-sm text-lm-primary">Total Bruto (${pts} pts)</span>
                    </div>
                    <b class="text-sm font-bold text-lm-primary">${formatMoney(propinaBruta)}</b>
                </div>
                <div class="flex justify-between items-center px-5 py-4">
                    <div class="flex items-center gap-3">
                        <div class="movement-icon bg-lm-green/10" style="width:36px;height:36px;border-radius:10px">
                            <span class="material-symbols-outlined text-lm-green text-[16px]">account_balance</span>
                        </div>
                        <span class="text-sm text-lm-primary">Saldo Anterior</span>
                    </div>
                    <b class="text-sm font-bold text-lm-primary">${formatMoney(sAnt)}</b>
                </div>
                <div class="flex justify-between items-center px-5 py-4">
                    <div class="flex items-center gap-3">
                        <div class="movement-icon bg-lm-red/10" style="width:36px;height:36px;border-radius:10px">
                            <span class="material-symbols-outlined text-lm-red text-[16px]">remove_circle</span>
                        </div>
                        <span class="text-sm text-lm-primary">Descuentos / Anticipos</span>
                    </div>
                    <b class="text-sm font-bold text-lm-red">-${formatMoney(tAnt+tDesc)}</b>
                </div>`;

            if (isFirstLoad) animateIn(document.getElementById('detallesContables'), '60ms');

            // Resumen contable — versión premium (dashboard oscuro)
            const _pmDet = document.getElementById('pmDetallesContables');
            if (_pmDet) {
                const _row = (icon, iconColor, label, valor, valorColor) => `
                    <div style="display:flex;justify-content:space-between;align-items:center;padding:14px 16px;border-bottom:1px solid #2a2f36;">
                        <div style="display:flex;align-items:center;gap:12px;">
                            <div style="width:36px;height:36px;border-radius:10px;background:${iconColor}22;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                                <span class="material-symbols-outlined" style="font-size:16px;color:${iconColor};">${icon}</span>
                            </div>
                            <span style="font-size:13px;color:#e1e3e4;">${label}</span>
                        </div>
                        <b style="font-size:13px;font-weight:700;color:${valorColor || '#e1e3e4'};">${valor}</b>
                    </div>`;
                _pmDet.innerHTML =
                    _row('percent', '#cee6f7', `Total Bruto (${pts} pts)`, formatMoney(propinaBruta)) +
                    _row('account_balance', '#25D366', 'Saldo Anterior', formatMoney(sAnt)) +
                    _row('remove_circle', '#ffb4ab', 'Descuentos / Anticipos', '-' + formatMoney(tAnt + tDesc), '#ffb4ab');
                _pmDet.lastElementChild && (_pmDet.lastElementChild.style.borderBottom = 'none');
            }

            // Últimos movimientos
            const listaContainer=document.getElementById('anticiposList');
            const merged=[...userAnticipos,...userExtras.filter(e=>e.tipo==='DESCUENTO_PERSONAL')].sort((a,b)=>String(b.fecha).localeCompare(String(a.fecha)));
            // Contador de pedidos: "Llevas N pedidos · te restan X · máximo 8" (clásico y premium)
            (function(){
                const MOVS_MAX = 8;            // máximo de pedidos/anticipos por período
                const cnt = merged.length;
                const restan = Math.max(0, MOVS_MAX - cnt);
                const restanCol = restan === 0 ? '#ef4444' : (restan <= 2 ? '#f59e0b' : '#16a34a');
                const html = `Llevas <b>${cnt}</b> pedido${cnt===1?'':'s'} · te restan <b style="color:${restanCol}">${restan}</b> · máximo ${MOVS_MAX}`;
                ['anticiposCount','pmMovsCount'].forEach(id=>{
                    const e=document.getElementById(id); if(e) e.innerHTML = html;
                });
            })();
            if(merged.length>0){
                listaContainer.innerHTML=merged.map(a=>`
                <div class="movement-row">
                    <div class="movement-icon bg-lm-red/10">
                        <span class="material-symbols-outlined text-lm-red text-[18px]">arrow_downward</span>
                    </div>
                    <div class="flex-1 min-w-0">
                        <p class="text-sm font-semibold text-lm-primary truncate">${a.desc||a.tipo||'Anticipo'}</p>
                        <p class="text-[11px] text-lm-muted mt-0.5">${cleanDateStr(a.fecha)}</p>
                    </div>
                    <b class="text-lm-red text-sm font-bold shrink-0">-${formatMoney(a.cantidad||a.monto)}</b>
                </div>`).join('');
            } else {
                listaContainer.innerHTML=`<div class="text-center py-10 text-xs text-lm-muted">Sin movimientos en este periodo</div>`;
            }
            if (isFirstLoad) animateIn(listaContainer, '120ms');

            // Versión premium: mismos movimientos, estilo oscuro
            const _pmMovs = document.getElementById('pmMovs');
            if (_pmMovs) {
                _pmMovs.innerHTML = (merged.length > 0)
                    ? merged.map(a => `<div style="display:flex;align-items:center;justify-content:space-between;padding:14px;border-bottom:1px solid #43474b;">
                        <div style="display:flex;align-items:center;gap:12px;min-width:0;">
                            <div style="width:40px;height:40px;border-radius:50%;background:rgba(255,180,171,0.12);display:flex;align-items:center;justify-content:center;flex-shrink:0;"><span class="material-symbols-outlined" style="color:#ffb4ab;font-size:18px;">arrow_downward</span></div>
                            <div style="min-width:0;"><p style="font-size:14px;font-weight:600;color:#e1e3e4;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${a.desc || a.tipo || 'Anticipo'}</p><p style="font-size:11px;color:#c3c7cb;margin:2px 0 0;">${cleanDateStr(a.fecha)}</p></div>
                        </div>
                        <b style="color:#ffb4ab;font-size:14px;flex-shrink:0;margin-left:10px;white-space:nowrap;">-${formatMoney(a.cantidad || a.monto)}</b>
                    </div>`).join('')
                    : '<div style="text-align:center;padding:28px;color:#c3c7cb;font-size:13px;">Sin movimientos en este periodo</div>';
            }

            // Historial — agrupado por fecha, con desglose de tipos dentro de cada día
            const ausenciasSet = new Set(
                userExtras.filter(e=>String(e.tipo).toUpperCase()==='AUSENCIA').map(a=>String(a.fecha).substring(0,10))
            );
            const diasTrabajadosSet = esPT
                ? new Set((diasTrabajados[sID]||diasTrabajados[currentUser.ID]||[]).map(d=>String(d).substring(0,10)))
                : null;

            // Agrupar recData por fecha manteniendo cada tipo individual
            const porFecha = {};
            recData.forEach(r => {
                const f = String(r.fecha).substring(0,10);
                if (!porFecha[f]) porFecha[f] = [];
                porFecha[f].push(r);
            });

            // Ordenar fechas de más reciente a más antigua
            const fechasOrdenadas = Object.keys(porFecha).sort((a,b) => b.localeCompare(a));

            document.getElementById('historyList').innerHTML = fechasOrdenadas.map(f => {
                const entradas = porFecha[f];
                const esAusencia = !esPT && ausenciasSet.has(f);
                const esDiaTrabajado = esPT && diasTrabajadosSet && diasTrabajadosSet.has(f);
                const contaParaMi = esPT ? esDiaTrabajado : !esAusencia;

                // Totales del día
                const totalDia = entradas.reduce((s, r) => s + (parseFloat(r.monto) || 0), 0);
                const vpDia = entradas.reduce((s, r) => {
                    const m = parseFloat(r.monto) || 0;
                    const d = parseFloat(r.divisor) || 0;
                    return s + (d > 0 ? m / d : 0);
                }, 0);
                const gananciaDia = vpDia * pts;

                const gananciaColor = contaParaMi ? '#10b981' : '#ef4444';
                const gananciaStr = contaParaMi ? formatMoney(gananciaDia) : ('-' + formatMoney(gananciaDia));
                const gananciaBg = contaParaMi ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.06)';
                const headerBg = contaParaMi ? 'rgba(16,185,129,0.06)' : 'rgba(239,68,68,0.04)';
                const headerBorder = contaParaMi ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.15)';

                let badge = '';
                if (esAusencia) {
                    badge = '<span style="font-size:9px;font-weight:700;background:rgba(239,68,68,0.1);color:#ef4444;padding:2px 8px;border-radius:20px">AUSENCIA</span>';
                } else if (esPT && !esDiaTrabajado) {
                    badge = '<span style="font-size:9px;font-weight:700;background:rgba(148,163,184,0.15);color:#94a3b8;padding:2px 8px;border-radius:20px">NO TRABAJADO</span>';
                } else if (esPT && esDiaTrabajado) {
                    badge = '<span style="font-size:9px;font-weight:700;background:rgba(16,185,129,0.1);color:#10b981;padding:2px 8px;border-radius:20px">TRABAJADO</span>';
                }

                // Filas de tipos individuales
                const tiposHTML = entradas.map(r => {
                    const m = parseFloat(r.monto) || 0;
                    const tipo = (r.tipo || 'Sin tipo').toString().trim();
                    return '<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid rgba(0,0,0,0.04);">'
                        + '<div style="display:flex;align-items:center;gap:8px;">'
                            + '<div style="width:7px;height:7px;border-radius:50%;background:#6366f1;flex-shrink:0"></div>'
                            + '<span style="font-size:12px;font-weight:500;color:#334155">' + tipo + '</span>'
                        + '</div>'
                        + '<span style="font-size:12px;font-weight:700;color:#001723">' + formatMoney(m) + '</span>'
                    + '</div>';
                }).join('');

                return '<div style="background:var(--color-card,#fff);border-radius:16px;box-shadow:0 1px 4px rgba(0,0,0,0.06);margin-bottom:12px;overflow:hidden;">'
                    // Cabecera de fecha
                    + '<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;background:' + headerBg + ';border-bottom:1px solid ' + headerBorder + ';">'
                        + '<div style="display:flex;align-items:center;gap:10px;">'
                            + '<div style="width:36px;height:36px;border-radius:10px;background:' + (contaParaMi ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.1)') + ';display:flex;align-items:center;justify-content:center;flex-shrink:0">'
                                + '<span class="material-symbols-outlined" style="font-size:18px;color:' + gananciaColor + '">' + (contaParaMi ? 'trending_up' : 'trending_flat') + '</span>'
                            + '</div>'
                            + '<div>'
                                + '<p style="font-size:13px;font-weight:700;color:#001723">' + cleanDateStr(f) + '</p>'
                                + '<p style="font-size:10px;color:#94a3b8;margin-top:1px">' + entradas.length + (entradas.length === 1 ? ' entrada' : ' entradas') + ' · Total: ' + formatMoney(totalDia) + '</p>'
                            + '</div>'
                        + '</div>'
                        + badge
                    + '</div>'
                    // Desglose de tipos
                    + '<div style="padding:4px 14px 8px;">'
                        + tiposHTML
                    + '</div>'
                    // Grilla de puntos y ganancia
                    + '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;padding:8px 14px 12px;">'
                        + '<div style="background:var(--color-subtle,#f1f5f9);border-radius:10px;padding:7px 8px;text-align:center">'
                            + '<p style="font-size:9px;color:#94a3b8;font-weight:700;text-transform:uppercase;margin-bottom:2px">Valor Punto</p>'
                            + '<p style="font-size:12px;font-weight:700;color:#6366f1">' + formatMoney(vpDia) + '</p>'
                        + '</div>'
                        + '<div style="background:var(--color-subtle,#f1f5f9);border-radius:10px;padding:7px 8px;text-align:center">'
                            + '<p style="font-size:9px;color:#94a3b8;font-weight:700;text-transform:uppercase;margin-bottom:2px">Mis Pts</p>'
                            + '<p style="font-size:12px;font-weight:700;color:#001723">' + pts + '</p>'
                        + '</div>'
                        + '<div style="background:' + gananciaBg + ';border-radius:10px;padding:7px 8px;text-align:center">'
                            + '<p style="font-size:9px;color:#94a3b8;font-weight:700;text-transform:uppercase;margin-bottom:2px">Mi Ganancia</p>'
                            + '<p style="font-size:12px;font-weight:700;color:' + gananciaColor + '">' + gananciaStr + '</p>'
                        + '</div>'
                    + '</div>'
                + '</div>';
            }).join('');
            if (isFirstLoad) animateIn(document.getElementById('historyList'), '60ms');

            // ── Versión premium: Historial (mismos datos + desglose de tipos, estilo oscuro) ──
            (function () {
                const stat = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
                let totalRend = 0;
                const cards = fechasOrdenadas.map(f => {
                    const entradas = porFecha[f];
                    const esAus = !esPT && ausenciasSet.has(f);
                    const esDT = esPT && diasTrabajadosSet && diasTrabajadosSet.has(f);
                    const cuenta = esPT ? esDT : !esAus;
                    const totalDia = entradas.reduce((s, r) => s + (parseFloat(r.monto) || 0), 0);
                    const vpDia = entradas.reduce((s, r) => { const m = parseFloat(r.monto) || 0; const d = parseFloat(r.divisor) || 0; return s + (d > 0 ? m / d : 0); }, 0);
                    const gananciaDia = vpDia * pts;
                    if (cuenta && gananciaDia > 0) totalRend += gananciaDia;
                    const col = cuenta ? '#3de273' : '#ffb4ab';
                    const ganStr = cuenta ? formatMoney(gananciaDia) : ('-' + formatMoney(gananciaDia));
                    let badge = '';
                    if (esAus) badge = '<span style="font-size:9px;font-weight:700;background:rgba(255,180,171,0.15);color:#ffb4ab;padding:2px 8px;border-radius:20px;">AUSENCIA</span>';
                    else if (esPT && !esDT) badge = '<span style="font-size:9px;font-weight:700;background:rgba(141,145,150,0.2);color:#8d9196;padding:2px 8px;border-radius:20px;">NO TRABAJADO</span>';
                    else if (esPT && esDT) badge = '<span style="font-size:9px;font-weight:700;background:rgba(61,226,115,0.15);color:#3de273;padding:2px 8px;border-radius:20px;">TRABAJADO</span>';
                    const tiposHTML = entradas.map(r => {
                        const m = parseFloat(r.monto) || 0;
                        const tipo = (r.tipo || 'Sin tipo').toString().trim();
                        return `<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid #282e35;">
                            <div style="display:flex;align-items:center;gap:8px;"><div style="width:7px;height:7px;border-radius:50%;background:#b3cada;flex-shrink:0;"></div><span style="font-size:12px;color:#c3c7cb;">${tipo}</span></div>
                            <span style="font-size:12px;font-weight:700;color:#f8f9fa;">${formatMoney(m)}</span>
                        </div>`;
                    }).join('');
                    return `<div style="background:#171c22;border:1px solid #43474b;border-radius:14px;margin-bottom:12px;overflow:hidden;">
                        <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;background:#1d232a;border-bottom:1px solid #43474b;">
                            <div style="display:flex;align-items:center;gap:10px;min-width:0;">
                                <div style="width:36px;height:36px;border-radius:10px;background:rgba(179,202,218,0.12);display:flex;align-items:center;justify-content:center;flex-shrink:0;"><span class="material-symbols-outlined" style="font-size:18px;color:${col};">${cuenta ? 'trending_up' : 'trending_flat'}</span></div>
                                <div style="min-width:0;"><p style="font-size:13px;font-weight:700;color:#f8f9fa;margin:0;">${cleanDateStr(f)}</p><p style="font-size:10px;color:#8d9196;margin:1px 0 0;">${entradas.length}${entradas.length === 1 ? ' entrada' : ' entradas'} · Total: ${formatMoney(totalDia)}</p></div>
                            </div>${badge}
                        </div>
                        <div style="padding:4px 14px 8px;">${tiposHTML}</div>
                        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;padding:8px 14px 12px;">
                            <div style="background:#0f1419;border-radius:10px;padding:7px 8px;text-align:center;"><p style="font-size:9px;color:#8d9196;font-weight:700;text-transform:uppercase;margin:0 0 2px;">Valor Punto</p><p style="font-size:12px;font-weight:700;color:#b3cada;margin:0;">${formatMoney(vpDia)}</p></div>
                            <div style="background:#0f1419;border-radius:10px;padding:7px 8px;text-align:center;"><p style="font-size:9px;color:#8d9196;font-weight:700;text-transform:uppercase;margin:0 0 2px;">Mis Pts</p><p style="font-size:12px;font-weight:700;color:#f8f9fa;margin:0;">${pts}</p></div>
                            <div style="background:#0f1419;border-radius:10px;padding:7px 8px;text-align:center;"><p style="font-size:9px;color:#8d9196;font-weight:700;text-transform:uppercase;margin:0 0 2px;">Mi Ganancia</p><p style="font-size:12px;font-weight:700;color:${col};margin:0;">${ganStr}</p></div>
                        </div>
                    </div>`;
                }).join('');
                stat('pmHistTotal', formatMoney(Math.round(totalRend)));
                stat('pmHistAnticipos', formatMoney(tAnt + tDesc));
                stat('pmHistPunto', formatMoney(Math.round(puntoGlobalTotal)));
                const cont = document.getElementById('pmHistList');
                if (cont) {
                    cont.innerHTML = fechasOrdenadas.length ? cards : '<div style="text-align:center;padding:32px;color:#c3c7cb;font-size:13px;">Sin movimientos en este periodo</div>';
                    const cnt = document.getElementById('pmHistCount');
                    if (cnt) cnt.textContent = fechasOrdenadas.length + (fechasOrdenadas.length === 1 ? ' día' : ' días');
                }
            })();

            const btn=document.getElementById('calendarBtnContainer');
            const hayCalendario = globalDiasCalendar.length > 0;
            if(hayCalendario) btn.classList.remove('hidden'); else btn.classList.add('hidden');
            // Versión premium: mismo criterio para el acceso "Ver Calendario"
            const btnPm = document.getElementById('pmCalBtn');
            if (btnPm) btnPm.style.display = hayCalendario ? '' : 'none';

            // Guardar datos para el comprobante PDF
            const vpVals = Object.values(mapVP);
            _lastBalance = {
                liquido, remanente, propinaBruta, sAnt, tAnt,
                pts, anos, puntoGlobalTotal,
                userAnticipos: [...userAnticipos],
                vpPromedio: vpVals.length ? vpVals.reduce((a,v)=>a+v.totalVP,0)/vpVals.length : 0
            };

            // Pasar datos a estadísticas
            renderStats(mapVP, pts);

            // Actualizar indicador de última sync
            const now = new Date();
            const hh = String(now.getHours()).padStart(2,'0');
            const mm = String(now.getMinutes()).padStart(2,'0');
            const ss = String(now.getSeconds()).padStart(2,'0');
            const lbl = document.getElementById('lastUpdateLabel');
            if (lbl) lbl.textContent = 'Actualizado ' + hh + ':' + mm + ':' + ss;

            // Las notas se renderizan cuando llega la Fase 2 (background)
            // Solo renderizamos chat si ya hay mensajes en memoria
            if(messages.admin.length > 0 || messages.social.length > 0) {
                renderChat(false);
                checkNotifications();
            }
        } catch(e) { console.error("Refresh Error", e); }
        finally {
            _refreshing = false;
            // Si llegó otra petición mientras corría, ejecutar UN solo seguimiento.
            if (_refreshPending) { _refreshPending = false; setTimeout(() => refresh(false), 60); }
        }
    }

    // ── LINKIFY ───────────────────────────────────────────────
    function linkify(text) {
        // Escapar HTML primero para neutralizar cualquier payload en el texto
        const safe = escHtml(text);
        return safe.replace(
            /(https?:\/\/[^\s<>"&]+|www\.[^\s<>"&]+)/gi,
            url => {
                // Reconstruir la URL real (sin entidades HTML)
                const rawUrl = url.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"');
                // Bloquear protocolos peligrosos
                if (/^javascript:/i.test(rawUrl) || /^data:/i.test(rawUrl)) return escHtml(rawUrl);
                const href = rawUrl.startsWith('http') ? rawUrl : 'https://' + rawUrl;
                return `<a href="${escHtml(href)}" target="_blank" rel="noopener noreferrer" style="color:#264b5f;text-decoration:underline;text-underline-offset:2px;word-break:break-all;">${url}</a>`;
            }
        );
    }
    function renderChatSilent() {
        const container = document.getElementById('chatMessages');
        if (!container) return;
        const input = document.getElementById('chatInput');
        const userIsTyping = input && document.activeElement === input && (input.innerText || '').trim().length > 0;
        if (userIsTyping) return;
        const wasAtBottom = container.scrollHeight - container.clientHeight <= container.scrollTop + 80;
        renderChat(false);
        if (wasAtBottom) {
            container.scrollTop = container.scrollHeight;
        }
    }

    // ── CHAT MODE ─────────────────────────────────────────────
    function setChatMode(mode) {
        currentChatMode=mode;
        document.getElementById('btnChatAdmin').className=mode==='ADMIN'?'wa-mode-btn active':'wa-mode-btn';
        document.getElementById('btnChatSocial').className=mode==='SOCIAL'?'wa-mode-btn active':'wa-mode-btn';
        const bp=document.getElementById('btnChatPriv'); if(bp) bp.className=mode==='PRIV'?'wa-mode-btn active':'wa-mode-btn';
        if(mode==='SOCIAL') document.getElementById('socialBar').classList.remove('hidden');
        else document.getElementById('socialBar').classList.add('hidden');
        if(mode==='ADMIN') localStorage.setItem('_rec_last_seen', Date.now());
        if(mode==='SOCIAL') localStorage.setItem('_social_last_seen', Date.now());
        if(mode==='PRIV'){ _adminPrivMarkSeen(); refreshAdminPriv(true); }
        renderChat();
        setTimeout(renderNotifBell, 250);
    }

    // ── CAMPANA DE NOTIFICACIONES (mensajes sin leer de los 3 canales) ──
    function _getUnread(){
        const items=[]; if(!currentUser) return items;
        const myId=String(currentUser.ID);
        // Soporte (notas_recaudacion): notas no mías más nuevas que la última vista
        const recSeen=parseInt(localStorage.getItem('_rec_last_seen'))||0;
        (messages.admin||[]).forEach(n=>{
            if(n._sending) return;
            const t=new Date(n.fecha).getTime();
            if(String(n.socId)!==myId && t>recSeen && (n.mensaje||n.nota||n.foto))
                items.push({canal:'ADMIN',autor:n.autor||'Administración',texto:n.mensaje||n.nota||'',foto:n.foto,t,fecha:n.fecha});
        });
        // Equipo (chat_mensajes): mensajes hacia mí o al Chat General, no míos
        const socSeen=parseInt(localStorage.getItem('_social_last_seen'))||0;
        (messages.social||[]).forEach(n=>{
            if(n._sending) return;
            const nSoc=String(n.socId||''); const nDest=String(n.destinatario||'');
            if(nSoc===myId) return;
            const paraMi=nDest===myId, general=nDest==='TODOS';
            const t=new Date(n.fecha).getTime();
            if((paraMi||general) && t>socSeen && (n.mensaje||n.nota||n.foto))
                items.push({canal:'SOCIAL',autor:n.autor||'Socio',texto:n.mensaje||n.nota||'',foto:n.foto,t,fecha:n.fecha,
                    socioId: general?'TODOS':nSoc, socioName: general?'Chat General':(n.autor||'Socio')});
        });
        // Admin (mensajes_admin): mensajes del administrador no vistos
        const privSeen=parseInt(localStorage.getItem('_admin_priv_last_seen'))||0;
        (adminPrivMsgs||[]).forEach(n=>{
            if(n._sending || n.remitente!=='ADMIN') return;
            const t=new Date(n.fecha).getTime();
            if(t>privSeen && (n.mensaje||n.foto))
                items.push({canal:'PRIV',autor:n.autor||'Administración',texto:n.mensaje||'',foto:n.foto,t,fecha:n.fecha});
        });
        items.sort((a,b)=>b.t-a.t);
        return items;
    }
    function renderNotifBell(){
        const items=_getUnread();
        const badge=document.getElementById('notifBellBadge');
        if(badge){ if(items.length){ badge.textContent=items.length>99?'99+':String(items.length); badge.style.display='flex'; } else badge.style.display='none'; }
        const menu=document.getElementById('notifMenu');
        if(menu && menu.style.display==='block') _renderNotifMenu(items);
    }
    function _renderNotifMenu(items){
        const menu=document.getElementById('notifMenu'); if(!menu) return;
        window._notifItems=items;
        const _t=f=>{ try{ return new Date(f).toLocaleString('es-CL',{timeZone:'America/Santiago',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}); }catch(e){ return ''; } };
        const chip={ADMIN:{txt:'Soporte',col:'#6366f1'},SOCIAL:{txt:'Equipo',col:'#0ea5e9'},PRIV:{txt:'Admin',col:'#264b5f'}};
        if(!items.length){ menu.innerHTML='<div style="padding:20px;text-align:center;color:#94a3b8;font-size:13px;">Sin mensajes nuevos ✅</div>'; return; }
        menu.innerHTML='<div style="padding:8px 10px;font-weight:800;font-size:12px;color:#64748b;">Mensajes sin leer ('+items.length+')</div>'+
            items.map((it,i)=>{ const c=chip[it.canal]||chip.SOCIAL;
                return `<div onclick="_irAMensaje(${i})" style="padding:9px 10px;border-radius:10px;cursor:pointer;transition:background .15s;" onmouseover="this.style.background='var(--color-subtle,#f1f5f9)'" onmouseout="this.style.background='transparent'">
                    <div style="display:flex;align-items:center;gap:6px;margin-bottom:2px;">
                        <span style="background:${c.col}22;color:${c.col};font-size:9px;font-weight:800;padding:1px 6px;border-radius:6px;">${c.txt}</span>
                        <span style="font-size:12px;font-weight:700;color:#1e293b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:140px;">${escHtml(it.autor)}</span>
                        <span style="margin-left:auto;font-size:9px;color:#94a3b8;white-space:nowrap;">${_t(it.fecha)}</span>
                    </div>
                    <div style="font-size:12px;color:#475569;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escHtml((it.texto||(it.foto?'📷 Foto':'')).slice(0,60))}</div>
                </div>`;
            }).join('');
    }
    window.toggleNotifMenu=function(){
        const menu=document.getElementById('notifMenu'); if(!menu) return;
        if(menu.style.display==='block'){ menu.style.display='none'; }
        else { _renderNotifMenu(_getUnread()); menu.style.display='block'; }
    };
    window._irAMensaje=function(i){
        const items=window._notifItems||[]; const it=items[i]; if(!it) return;
        const menu=document.getElementById('notifMenu'); if(menu) menu.style.display='none';
        switchTab('tab-chat');
        setTimeout(()=>{
            if(it.canal==='ADMIN') setChatMode('ADMIN');
            else if(it.canal==='PRIV') setChatMode('PRIV');
            else if(it.canal==='SOCIAL'){ setChatMode('SOCIAL'); if(typeof selectSocialTarget==='function') selectSocialTarget(it.socioId||'TODOS', it.socioName||'Chat General'); }
            setTimeout(renderNotifBell, 300);
        }, 60);
    };
    // Cerrar el menú al tocar fuera
    document.addEventListener('click', e => {
        const menu=document.getElementById('notifMenu'); const bell=document.getElementById('notifBell');
        if(!menu || menu.style.display!=='block') return;
        if(bell && bell.contains(e.target)) return;
        if(!menu.contains(e.target)) menu.style.display='none';
    });

    // ── MENSAJES PRIVADOS DEL ADMINISTRADOR (mensajes_admin) ──
    function _adminPrivLastSeen(){ return parseInt(localStorage.getItem('_admin_priv_last_seen'))||0; }
    function _adminPrivMarkSeen(){ localStorage.setItem('_admin_priv_last_seen', Date.now()); setTimeout(_adminPrivUpdateDot, 50); }
    function _adminPrivUpdateDot(){
        const seen=_adminPrivLastSeen();
        const hay=(adminPrivMsgs||[]).some(m=>m.remitente==='ADMIN' && new Date(m.fecha).getTime()>seen);
        const dot=document.getElementById('privUnreadDot'); if(dot) dot.style.display=hay?'block':'none';
        if(hay){ const nb=document.getElementById('notifBadge'); if(nb) nb.classList.remove('hidden'); }
    }

    async function refreshAdminPriv(force){
        if(!currentUser) return;
        try{
            const res=await fetch(SCRIPT_URL_SOCIOS,{method:'POST',body:JSON.stringify({action:'getAdminMsgs',socioId:String(currentUser.ID)})});
            const data=(await res.json()).data||[];
            // Conservar los optimistas aún no confirmados por el servidor
            const pend=(adminPrivMsgs||[]).filter(m=>m._sending && !data.some(d=>d.mensaje===m.mensaje));
            adminPrivMsgs=data.concat(pend);
            if(currentChatMode==='PRIV'){ renderChatPriv(force); _adminPrivMarkSeen(); }
            else _adminPrivUpdateDot();
            renderNotifBell();
        }catch(e){ /* silencioso */ }
    }

    function renderChatPriv(forceScroll=true){
        const container=document.getElementById('chatMessages');
        if(!container) return;
        const list=adminPrivMsgs||[];
        if(!list.length){
            container.innerHTML=`<div class="flex flex-col items-center justify-center h-full gap-3 opacity-40">
                <span class="material-symbols-outlined text-5xl text-lm-muted">shield_person</span>
                <p class="text-sm text-lm-muted text-center px-8">Aquí verás los mensajes privados<br>de la administración</p>
            </div>`;
            return;
        }
        const _TZ='America/Santiago';
        const _clKey=f=>new Date(f).toLocaleDateString('es-CL',{timeZone:_TZ});
        const _clLabel=f=>new Date(f).toLocaleDateString('es-ES',{timeZone:_TZ,weekday:'long',day:'numeric',month:'long'});
        const _clTime=f=>new Date(f).toLocaleTimeString('es-CL',{timeZone:_TZ,hour:'2-digit',minute:'2-digit',hour12:false});
        let lastDate='',html='';
        list.forEach(n=>{
            const isMine=n.remitente==='SOCIO';
            const msgDate=_clKey(n.fecha);
            if(msgDate!==lastDate){ lastDate=msgDate; html+=`<div class="wa-date-sep"><span>${_clLabel(n.fecha)}</span></div>`; }
            const rowClass=isMine?'msg-row mine first-in-group':'msg-row other first-in-group';
            const bubbleClass=isMine?'msg-mine':'msg-admin';
            html+=`<div class="${rowClass}" style="${n._sending?'opacity:0.7':''}">
                ${!isMine?`<div style="width:32px;margin-right:6px;flex-shrink:0"><div style="width:32px;height:32px;border-radius:50%;background:#264b5f;display:flex;align-items:center;justify-content:center;color:#fff"><span class="material-symbols-outlined" style="font-size:18px">shield_person</span></div></div>`:''}
                <div class="msg-bubble ${bubbleClass}">
                    ${!isMine?`<div class="wa-author" style="color:#264b5f">${escHtml(n.autor||'Administración')}</div>`:''}
                    ${n.mensaje?`<div style="font-size:14px;line-height:1.45;color:inherit;word-break:break-word">${linkify(n.mensaje||'')}</div>`:''}
                    ${n.foto?`<img src="${(n.foto+'').replace(/"/g,'%22')}" onclick="verFotoGrande('${(n.foto+'').replace(/'/g,'%27')}')" style="max-width:200px;max-height:220px;border-radius:12px;margin-top:${n.mensaje?'6px':'0'};object-fit:cover;cursor:zoom-in;display:block;">`:''}
                    <div class="wa-time"><span>${_clTime(n.fecha)}</span></div>
                </div>
            </div>`;
        });
        container.innerHTML=html;
        if(forceScroll) container.scrollTop=container.scrollHeight;
    }

    // ── Foto adjunta en el chat (Soporte / Equipo / Admin) ──
    let _chatFotoFile = null;
    window.chatAdjuntarFoto = function(input){
        const f = input.files && input.files[0];
        if(!f) return;
        if(!f.type.startsWith('image/')){ return; }
        _chatFotoFile = f;
        const prev = document.getElementById('chatFotoPreview');
        if(prev){
            const u = URL.createObjectURL(f);
            prev.style.display='flex';
            prev.innerHTML = `<img src="${u}" style="width:40px;height:40px;border-radius:8px;object-fit:cover;">
                <span style="flex:1;font-size:12px;color:#006a62;font-weight:700;">Foto lista para enviar</span>
                <button onclick="chatQuitarFoto()" style="background:none;border:none;color:#ba1a1a;cursor:pointer;font-size:16px;">✕</button>`;
        }
    };
    window.chatQuitarFoto = function(){
        _chatFotoFile = null;
        const prev = document.getElementById('chatFotoPreview');
        if(prev){ prev.style.display='none'; prev.innerHTML=''; }
        ['chatFotoCam','chatFotoGal'].forEach(id => { const inp=document.getElementById(id); if(inp) inp.value=''; });
    };
    async function _subirFotoChat(file){
        try{
            const ext=(file.name.split('.').pop()||'jpg').toLowerCase().replace(/[^a-z0-9]/g,'');
            const path='chat/'+String(currentUser.ID)+'_'+Date.now()+'.'+ext;
            const up=await dbSV.storage.from('avatares').upload(path,file,{contentType:file.type,upsert:true});
            if(up.error) return '';
            return dbSV.storage.from('avatares').getPublicUrl(path).data.publicUrl;
        }catch(e){ return ''; }
    }

    async function handleSendPriv(texto, fotoUrl){
        const tempId='tmp_'+Date.now();
        adminPrivMsgs.push({uuid:tempId,fecha:new Date().toISOString(),autor:currentUser.Nombre,remitente:'SOCIO',mensaje:texto,nota:texto,foto:fotoUrl||'',_sending:true});
        renderChatPriv(true);
        try{
            await fetch(SCRIPT_URL_SOCIOS,{method:'POST',body:JSON.stringify({
                action:'sendAdminMsg', socioId:String(currentUser.ID),
                autor:(currentUser.Nombre+' '+currentUser.Apellido).trim(),
                mensaje:texto, remitente:'SOCIO', foto_url:fotoUrl||''
            })});
            const m=adminPrivMsgs.find(x=>x.uuid===tempId); if(m) m._sending=false;
        }catch(e){}
        setTimeout(()=>refreshAdminPriv(false),600);
    }

    // ── RENDER CHAT (WhatsApp style) ──────────────────────────
    let _lastChatSignature = '';

    function renderChat(forceScroll=true) {
        if(currentChatMode==='PRIV') return renderChatPriv(forceScroll);
        const container=document.getElementById('chatMessages');
        let list=[];

        if(currentChatMode==='ADMIN'){
            list=messages.admin.filter(n=>{
                if(!n.destinatario||n.destinatario===''||n.destinatario==='ADMIN') return true;
                if(String(n.destinatario)===String(currentUser.ID)) return true;
                if(String(n.socId)===String(currentUser.ID)&&n.destinatario==='ADMIN') return true;
                return false;
            });
        } else {
            list=messages.social.filter(n=>{
                if(currentSocialTarget.id==='TODOS') return String(n.destinatario)==='TODOS';
                const myId    = String(currentUser.ID).trim();
                const target  = String(currentSocialTarget.id).trim();
                const nSoc    = String(n.socId||'').trim();
                const nDest   = String(n.destinatario||'').trim();
                const sent    = nSoc===myId && nDest===target;
                const received= nSoc===target && nDest===myId;
                return sent||received;
            });
        }

        // Firma del contenido — si no cambió nada, no tocar el DOM
        const signature = list.map(n =>
            (n.uuid||n.fecha) + '|' + (n._sending?'s':n._failed?'f':'ok') + (n.pinned?'p':'')
        ).join(',');
        if (signature === _lastChatSignature && !forceScroll) return;
        _lastChatSignature = signature;

        // En modo ADMIN: pinned messages al tope
        if (currentChatMode === 'ADMIN') {
            list = [...list].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
        }

        if(list.length===0){
            container.innerHTML=`
            <div class="flex flex-col items-center justify-center h-full gap-3 opacity-40">
                <span class="material-symbols-outlined text-5xl text-lm-muted">chat_bubble_outline</span>
                <p class="text-sm text-lm-muted">No hay mensajes aún</p>
            </div>`;
            return;
        }

        const isScrolledToBottom=container.scrollHeight-container.clientHeight<=container.scrollTop+100;

        const avatarPalette=['#001723','#264b5f','#006a62','#705d00','#ba1a1a','#3f6378'];
        const _TZ = 'America/Santiago';
        const _clKey  = f => new Date(f).toLocaleDateString('es-CL', { timeZone: _TZ });
        const _clLabel = f => new Date(f).toLocaleDateString('es-ES', { timeZone: _TZ, weekday: 'long', day: 'numeric', month: 'long' }).replace('.','');
        const _clTime  = f => new Date(f).toLocaleTimeString('es-CL', { timeZone: _TZ, hour: '2-digit', minute: '2-digit', hour12: false });
        let lastDate='', html='';
        window._chatMsgMap = {}; // mapa id→contenido para prepareEdit sin pasar texto en onclick
        list.forEach((n, idx) => {
            const isMine=String(n.socId)===String(currentUser.ID);
            const msgContent=n.mensaje||n.nota;
            const authorName=isMine?'Yo':(n.autor||'Anónimo');
            const msgId=n.uuid||n.fecha;
            window._chatMsgMap[msgId] = msgContent;
            const msgDate=_clKey(n.fecha);
            const msgTime=_clTime(n.fecha);

            if(msgDate!==lastDate){
                lastDate=msgDate;
                html+=`<div class="wa-date-sep"><span>${_clLabel(n.fecha)}</span></div>`;
            }

            const prevN=list[idx-1];
            const isFirstInGroup=!prevN||String(prevN.socId)!==String(n.socId)||_clKey(prevN.fecha)!==msgDate;

            let rowClass=isMine?'msg-row mine':'msg-row other';
            if(isFirstInGroup) rowClass+=' first-in-group';
            let bubbleClass=isMine?'msg-mine':'msg-other';
            if(currentChatMode==='ADMIN'&&!isMine&&n.destinatario!=='ADMIN') bubbleClass='msg-admin';
            // Nota destacada para este socio (Soporte): resaltar
            const esDestacado = currentChatMode==='ADMIN' && n.destacados && currentUser &&
                String(n.destacados).split(',').map(s=>s.trim()).includes(String(currentUser.ID));
            // Nombres de los socios destacados (para mostrar a todos "Destacado para: …")
            let destNombres = '';
            if(currentChatMode==='ADMIN' && n.destacados){
                const _ids = String(n.destacados).split(',').map(s=>s.trim()).filter(Boolean);
                const _noms = _ids.map(id=>{ const s=(allSocios||[]).find(u=>String(u.ID)===id); return s ? (s.Nombre||id) : id; });
                destNombres = _noms.length<=3 ? _noms.join(', ') : _noms.slice(0,3).join(', ')+' y '+(_noms.length-3)+' más';
            }

            const showAvatar=!isMine&&isFirstInGroup;
            const colorIdx=authorName.charCodeAt(0)%avatarPalette.length;
            const avatarColor=avatarPalette[colorIdx];
            // Foto del emisor (solo chat Equipo, donde socId identifica al socio)
            let avatarFoto='';
            if(currentChatMode==='SOCIAL' && n.socId){ const _s=allSocios.find(u=>String(u.ID)===String(n.socId)); if(_s) avatarFoto=(_s.FotoUrl||'').trim(); }
            const avatarInner = avatarFoto
                ? `<div style="width:32px;height:32px;border-radius:50%;background-image:url('${avatarFoto.replace(/'/g,'%27')}');background-size:cover;background-position:center;border:1px solid #e2e8f0;"></div>`
                : `<div style="width:32px;height:32px;border-radius:50%;background:${avatarColor};display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:#fff">${authorName.charAt(0).toUpperCase()}</div>`;

            let pinHtml = '', rxHtml = '';
            if(currentChatMode === 'ADMIN') {
                const myRx = JSON.parse(localStorage.getItem('_rec_my_reactions') || '{}');
                const EMOJIS = ['👍','❤️','😂'];
                const reactions = n.reactions || {};
                const lastSeen = parseInt(localStorage.getItem('_rec_last_seen')) || 0;
                const isNewMsg = lastSeen > 0 && new Date(n.fecha).getTime() > lastSeen;
                if(n.pinned) pinHtml = '<span style="font-size:0.7em;background:#f59e0b;color:#fff;padding:1px 6px;border-radius:10px;margin-bottom:3px;display:inline-block">📌 FIJADA</span><br>';
                if(isNewMsg) pinHtml += '<span style="font-size:0.7em;background:#3b82f6;color:#fff;padding:1px 6px;border-radius:10px;margin-bottom:3px;display:inline-block">NUEVO</span><br>';
                if(esDestacado) pinHtml += '<span style="font-size:0.7em;background:linear-gradient(135deg,#f59e0b,#f7d774);color:#3b1d00;padding:1px 8px;border-radius:10px;margin-bottom:3px;display:inline-block;font-weight:800">⭐ PARA TI</span><br>';
                else if(destNombres) pinHtml += '<span style="font-size:0.7em;background:#fef3c7;border:1px solid #fde68a;color:#92400e;padding:1px 8px;border-radius:10px;margin-bottom:3px;display:inline-block;font-weight:700">⭐ Destacado para: '+escHtml(destNombres)+'</span><br>';
                const meIdRx = currentUser ? (currentUser.Nombre + ' ' + currentUser.Apellido).trim() : '';
                rxHtml = `<div style="display:flex;align-items:center;gap:4px;margin-top:5px;flex-wrap:wrap">
                    <button onclick="_chatPin('${msgId}',${!n.pinned})" style="background:none;border:none;cursor:pointer;font-size:0.85em;padding:0;opacity:0.65">${n.pinned?'📌':'📍'}</button>
                    ${EMOJIS.map(e => {
                        const arr = Array.isArray(reactions[e]) ? reactions[e] : [];
                        const cnt = arr.length;
                        const mine = meIdRx ? arr.includes(meIdRx) : myRx[msgId]?.[e];
                        const names = arr.join(', ');
                        return `<button onclick="_chatReaccion('${msgId}','${e}')" title="${names}" style="background:${mine?'rgba(59,130,246,0.15)':'rgba(0,0,0,0.06)'};border:1px solid ${mine?'#93c5fd':'rgba(0,0,0,0.1)'};border-radius:20px;padding:1px 7px;cursor:pointer;font-size:0.78em">${e}${cnt?' '+cnt:''}</button>`;
                    }).join('')}
                </div>`;
            }

            html+=`
            <div class="${rowClass}" data-msg-id="${msgId}" style="${n._sending ? 'opacity:0.75' : ''}${n.pinned&&currentChatMode==='ADMIN'?' border-left:3px solid #f59e0b;':''}">
                ${!isMine?`<div style="width:32px;margin-right:6px;flex-shrink:0">${showAvatar?avatarInner:''}</div>`:''}
                <div class="msg-bubble ${bubbleClass}"${esDestacado?' style="box-shadow:0 0 0 2px #f7d774, 0 2px 10px rgba(245,158,11,0.28);"':''}>
                    ${!isMine&&isFirstInGroup?`<div class="wa-author" style="color:${avatarColor}">${escHtml(authorName)}</div>`:''}
                    ${pinHtml}<div style="font-size:14px;line-height:1.45;color:inherit;word-break:break-word">${linkify(msgContent)}</div>
                    ${n.foto ? `<img src="${(n.foto+'').replace(/"/g,'%22')}" onclick="verFotoGrande('${(n.foto+'').replace(/'/g,'%27')}')" style="max-width:200px;max-height:220px;border-radius:12px;margin-top:6px;object-fit:cover;cursor:zoom-in;display:block;">` : ''}
                    ${rxHtml}
                    <div class="wa-time">
                        <span>${msgTime}</span>
                        ${isMine
                            ? (n._failed
                                ? '<span class="material-symbols-outlined" style="font-size:13px;color:#ef4444" title="Error al enviar">error</span>'
                                : n._sending
                                    ? '<span class="material-symbols-outlined" style="font-size:13px;color:rgba(0,0,0,0.3)">schedule</span>'
                                    : '<span class="material-symbols-outlined" style="font-size:13px;color:#006a62">done_all</span>')
                            : ''}
                    </div>
                    ${isMine?`
                    <div style="display:flex;gap:10px;margin-top:5px;padding-top:5px;border-top:1px solid rgba(0,0,0,0.06)">
                        <button onclick="prepareEdit('${escHtml(msgId)}')" style="opacity:0.45;color:#191c1d"><span class="material-symbols-outlined" style="font-size:14px">edit</span></button>
                        <button onclick="deleteMsg('${msgId}')" style="opacity:0.5;color:#ba1a1a"><span class="material-symbols-outlined" style="font-size:14px">delete</span></button>
                    </div>`:''}
                </div>
            </div>`;
        });

        container.innerHTML=html;

        // Banner estilo WhatsApp para mensaje fijado (solo modo ADMIN)
        const pinnedBanner = document.getElementById('pinnedBanner');
        if (pinnedBanner) {
            const pinnedMsg = currentChatMode === 'ADMIN' ? list.find(n => n.pinned) : null;
            if (pinnedMsg) {
                const preview = (pinnedMsg.mensaje || pinnedMsg.nota || '').substring(0, 70);
                const pid = pinnedMsg.uuid || pinnedMsg.fecha;
                window._pinnedId = pid;
                pinnedBanner.innerHTML =
                    `<span style="color:#f59e0b;font-size:18px;flex-shrink:0">📌</span>` +
                    `<div onclick="window._goToPinned()" style="flex:1;cursor:pointer;overflow:hidden;min-width:0">` +
                    `<div style="font-size:0.68em;color:#b45309;font-weight:700;letter-spacing:0.03em">Mensaje fijado</div>` +
                    `<div style="font-size:0.82em;color:#333;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${preview}</div>` +
                    `</div>`;
                pinnedBanner.style.display = 'flex';
            } else {
                pinnedBanner.style.display = 'none';
                pinnedBanner.innerHTML = '';
                window._pinnedId = null;
            }
        }

        if(forceScroll || isScrolledToBottom){
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    container.scrollTop = container.scrollHeight;
                });
            });
        }
    }

    // ── NOTIFICATIONS ─────────────────────────────────────────
    function checkNotifications() {
        const total=messages.admin.length+messages.social.length;
        if(total>lastMsgCount){
            document.getElementById('notifBadge').classList.remove('hidden');
            const all=[...messages.admin,...messages.social].sort((a,b)=>new Date(b.fecha)-new Date(a.fecha));
            const newest=all[0];
            if(newest&&String(newest.socId)!==String(currentUser.ID)){
                showToast(newest.autor||'Nuevo',newest.mensaje||newest.nota);
            }
            lastMsgCount=total;
            localStorage.setItem('lastMsgCountV19',lastMsgCount);
        }
    }

    function showToast(autor, msg) {
        const t=document.getElementById('toastNotification');
        document.getElementById('toastMessage').textContent=`${autor}: ${msg}`;
        t.classList.add('show');
        try { new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3').play(); } catch(e){}
        setTimeout(()=>t.classList.remove('show'),4000);
    }

    // ── CHAT INPUT BEHAVIOR ────────────────────────────────────
    function getChatText() {
        const el = document.getElementById('chatInput');
        return el ? el.innerText.trim() : '';
    }
    function clearChatInput() {
        const el = document.getElementById('chatInput');
        if (el) el.innerText = '';
    }

    function initChatInput() {
        const tx   = document.getElementById('chatInput');
        const nav  = document.getElementById('bottomNav');
        const spc  = document.getElementById('chatSpacer');

        // Siempre restaurar el spacer y el nav (puede quedar en estado roto tras logout)
        if (spc) spc.style.height = (nav ? nav.offsetHeight || 72 : 72) + 'px';
        if (nav) nav.style.display = '';

        if (!tx || tx._init) return;
        tx._init = true;

        const msgs = document.getElementById('chatMessages');

        function scrollEnd() {
            if (msgs) msgs.scrollTop = msgs.scrollHeight;
        }

        function kbOpen() {
            if (nav) nav.style.display = 'none';
            spc.style.height = '0px';
            setTimeout(scrollEnd, 80);
        }

        function kbClose() {
            if (nav) nav.style.display = '';
            spc.style.height = (nav ? nav.offsetHeight : 72) + 'px';
            setTimeout(scrollEnd, 80);
        }

        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', () => {
                const kbH = Math.max(0, Math.round(
                    window.innerHeight - window.visualViewport.height - window.visualViewport.offsetTop
                ));
                kbH > 100 ? kbOpen() : kbClose();
            });
        }

        tx.addEventListener('focus', () => { setTimeout(kbOpen, 300); });
        tx.addEventListener('blur',  () => { setTimeout(kbClose, 200); });
    }


    // ── EDIT MESSAGE ──────────────────────────────────────────
    function prepareEdit(id) {
        editingMessageId=id;
        const text = (window._chatMsgMap && window._chatMsgMap[id]) || '';
        const input=document.getElementById('chatInput');
        input.innerText=text; input.focus();
        const range=document.createRange(), sel=window.getSelection();
        range.selectNodeContents(input); range.collapse(false);
        sel.removeAllRanges(); sel.addRange(range);
        document.getElementById('editModeIndicator').style.display='flex';
        document.getElementById('sendBtn').innerHTML='<span class="material-symbols-outlined text-white text-xl">check</span>';
    }

    function cancelEdit() {
        editingMessageId=null;
        clearChatInput();
        document.getElementById('editModeIndicator').style.display='none';
        document.getElementById('sendBtn').innerHTML='<span class="material-symbols-outlined text-white text-xl">send</span>';
    }

    async function handleSend(e) {
        if (e && e.preventDefault) e.preventDefault();
        const texto = getChatText();
        if (!texto && !_chatFotoFile) return;

        const btn = document.getElementById('sendBtn');
        btn.disabled = true;
        clearChatInput();

        // Subir foto adjunta (si hay) antes de enviar
        let fotoUrl = '';
        if (_chatFotoFile && !editingMessageId) { fotoUrl = await _subirFotoChat(_chatFotoFile); chatQuitarFoto(); }

        // Modo privado con la administración: ruta aislada
        if (currentChatMode === 'PRIV') { await handleSendPriv(texto, fotoUrl); btn.disabled = false; return; }

        const url    = currentChatMode === 'ADMIN' ? SCRIPT_URL_RECAUDACIONES : SCRIPT_URL_SOCIOS;
        const dest   = currentChatMode === 'ADMIN' ? 'ADMIN' : currentSocialTarget.id;
        const action = editingMessageId ? 'editNote' : 'addNote';
        const tempId = 'tmp_' + Date.now();

        // ── Mostrar mensaje al instante (optimista) ──
        if (!editingMessageId) {
            const optimista = {
                uuid: tempId,
                fecha: new Date().toISOString(),
                autor: currentUser.Nombre,
                socId: currentUser.ID,
                mensaje: texto,
                nota: texto,
                destinatario: dest,
                foto: fotoUrl || '',
                _sending: true
            };
            if (currentChatMode === 'ADMIN') messages.admin.push(optimista);
            else messages.social.push(optimista);
            renderChat(true);
        }

        try {
            await fetch(url, {
                method: 'POST',
                body: JSON.stringify({
                    action,
                    autor: currentUser.Nombre,
                    mensaje: texto,
                    socId: currentUser.ID,
                    destinatario: dest,
                    noteId: editingMessageId,
                    foto_url: fotoUrl || ''
                })
            });

            // Confirmar optimista: solo actualizar el DOM sin re-renderizar nada
            if (!editingMessageId) {
                const list = currentChatMode === 'ADMIN' ? messages.admin : messages.social;
                const idx  = list.findIndex(m => m.uuid === tempId);
                if (idx !== -1) list[idx]._sending = false;

                // Cambiar solo el ícono del reloj → doble check, sin tocar el resto
                const bubble = document.querySelector(`[data-msg-id="${tempId}"] .wa-time span.material-symbols-outlined`);
                if (bubble) {
                    bubble.textContent = 'done_all';
                    bubble.style.color = '#006a62';
                }
                const row = document.querySelector(`[data-msg-id="${tempId}"]`);
                if (row) row.style.opacity = '1';

                // NO llamar refreshChat — el ciclo de 8s lo actualizará solo
            } else {
                await refreshChat(true);
            }

        } catch(err) {
            // Marcar como fallido
            const list = currentChatMode === 'ADMIN' ? messages.admin : messages.social;
            const m = list.find(x => x.uuid === tempId);
            if (m) { m._sending = false; m._failed = true; }
            renderChat(false);
            console.error('Error enviando:', err);
        } finally {
            editingMessageId = null;
            document.getElementById('editModeIndicator').style.display='none';
            btn.innerHTML = '<span class="material-symbols-outlined" style="color:white;font-size:22px">send</span>';
            btn.disabled = false;
        }
    }

    async function deleteMsg(id) {
        // 1. Atenuar el mensaje inmediatamente — feedback visual al instante
        const row = document.querySelector(`[data-msg-id="${id}"]`);
        if (row) {
            row.style.transition = 'opacity 0.2s';
            row.style.opacity    = '0.35';
            row.style.pointerEvents = 'none';
            // Agregar spinner sobre la burbuja
            const bubble = row.querySelector('.msg-bubble');
            if (bubble) {
                const spinner = document.createElement('div');
                spinner.id = 'del-spinner-' + id;
                spinner.style.cssText = 'position:absolute;inset:0;background:rgba(255,255,255,0.5);border-radius:inherit;display:flex;align-items:center;justify-content:center;';
                spinner.innerHTML = '<span class="material-symbols-outlined" style="font-size:18px;color:#ba1a1a;animation:spin 0.8s linear infinite">autorenew</span>';
                bubble.style.position = 'relative';
                bubble.appendChild(spinner);
            }
        }

        try {
            const url = currentChatMode==='ADMIN' ? SCRIPT_URL_RECAUDACIONES : SCRIPT_URL_SOCIOS;
            await fetch(url, {
                method: 'POST',
                body: JSON.stringify({action:'deleteNote', noteId:id, autor:currentUser.Nombre})
            });
            // 2. Animar salida suave
            if (row) {
                row.style.transition = 'opacity 0.25s, max-height 0.3s, margin 0.3s';
                row.style.opacity    = '0';
                row.style.maxHeight  = row.offsetHeight + 'px';
                setTimeout(() => {
                    row.style.maxHeight = '0';
                    row.style.margin    = '0';
                    row.style.padding   = '0';
                    row.style.overflow  = 'hidden';
                }, 50);
                setTimeout(() => {
                    // Quitar de la lista local y limpiar firma para permitir re-render
                    if (currentChatMode === 'ADMIN')
                        messages.admin  = messages.admin.filter(m => String(m.uuid||m.fecha) !== String(id));
                    else
                        messages.social = messages.social.filter(m => String(m.uuid||m.fecha) !== String(id));
                    _lastChatSignature = '';
                    renderChat(false);
                }, 350);
            }
        } catch(e) {
            // Si falla, restaurar el mensaje
            if (row) {
                row.style.opacity = '1';
                row.style.pointerEvents = '';
                const sp = document.getElementById('del-spinner-' + id);
                if (sp) sp.remove();
            }
            console.error('Error borrando:', e);
        }
    }

    // ── PIN & REACTIONS (ADMIN chat) ──────────────────────────
    window._goToPinned = () => {
        const pid = window._pinnedId;
        if (!pid) return;
        const el = document.querySelector(`[data-msg-id="${pid}"]`);
        if (!el) return;
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const bubble = el.querySelector('.msg-bubble') || el;
        bubble.style.transition = 'background 0.3s';
        const orig = bubble.style.background;
        bubble.style.background = 'rgba(245,158,11,0.25)';
        setTimeout(() => { bubble.style.background = orig; }, 1400);
    };

    window._chatPin = async (id, pinned) => {
        // Si se va a fijar, desfijar cualquier otro primero (un solo pin a la vez)
        if (pinned) {
            const others = messages.admin.filter(m => m.pinned && (m.uuid||m.fecha) !== id);
            for (const o of others) {
                const oid = o.uuid || o.fecha;
                await fetch(SCRIPT_URL_RECAUDACIONES, { method:'POST', body: JSON.stringify({ action:'togglePin', id: oid, pinned: false }) });
                o.pinned = false;
            }
        }
        // Actualizar localmente para respuesta inmediata
        const msg = messages.admin.find(m => (m.uuid||m.fecha) === id);
        if (msg) msg.pinned = pinned;
        _lastChatSignature = '';
        renderChat(false);
        // Sincronizar con Supabase
        await fetch(SCRIPT_URL_RECAUDACIONES, { method:'POST', body: JSON.stringify({ action:'togglePin', id, pinned }) });
    };
    window._chatReaccion = async (id, emoji) => {
        const myRx = JSON.parse(localStorage.getItem('_rec_my_reactions') || '{}');
        const meId = currentUser ? (currentUser.Nombre + ' ' + currentUser.Apellido).trim() : 'Socio';
        const msg = messages.admin.find(m => (m.uuid||m.fecha) === id);
        if (!msg) return;
        if (!msg.reactions) msg.reactions = {};
        const arr = Array.isArray(msg.reactions[emoji]) ? [...msg.reactions[emoji]] : [];
        const pos = arr.indexOf(meId);
        const adding = pos === -1;
        if (adding) arr.push(meId); else arr.splice(pos, 1);
        if (arr.length === 0) delete msg.reactions[emoji]; else msg.reactions[emoji] = arr;
        // Mantener localStorage para highlight visual
        if (!myRx[id]) myRx[id] = {};
        if (adding) myRx[id][emoji] = true; else delete myRx[id][emoji];
        localStorage.setItem('_rec_my_reactions', JSON.stringify(myRx));
        _lastChatSignature = '';
        renderChat(false);
        fetch(SCRIPT_URL_RECAUDACIONES, { method:'POST', body: JSON.stringify({ action:'toggleReaction', id, emoji, user: meId, add: adding }) }).catch(()=>{});
    };

    // ── INGRESAR RECAUDACION ──────────────────────────────────
    let _recTipoSelected = 'TarjetaMDA';

    window.selRecTipo = (tipo) => {
        _recTipoSelected = tipo;
        document.querySelectorAll('.rec-tipo-btn').forEach(b => {
            if (b.dataset.tipo === tipo) b.classList.add('active');
            else b.classList.remove('active');
        });
    };

    // Calcula el total de puntos del reparto (mismo criterio que socios-comicion →
    // "Gestión de Socios" → Total Puntos / Pts Planta). Solo socios visibles/activos
    // (fecha_inicio_puntos, regla del día 15). Usa el valor de BD si es > 0, si no la fórmula.
    function _recCalcTotalPuntos() {
        const hoy = new Date();
        let total = 0, planta = 0;
        (allSocios || []).forEach(s => {
            const fechaStr = s.FechaIngreso;
            if (!fechaStr) return;
            const fechaPuntosRaw = (s.FechaInicioPuntos && String(s.FechaInicioPuntos).trim()) ? String(s.FechaInicioPuntos).trim() : fechaStr;
            const pr = String(fechaPuntosRaw).split('-');
            const anio15 = parseInt(pr[0]), mes15 = parseInt(pr[1]) - 1;
            if (!Number.isFinite(anio15) || !Number.isFinite(mes15)) return;
            const fechaParaPuntos = new Date(anio15, mes15, 15);
            const visible = hoy >= fechaParaPuntos;
            if (!visible) return; // solo socios activos/visibles
            let anios = hoy.getFullYear() - anio15;
            if (hoy.getMonth() < mes15 || (hoy.getMonth() === mes15 && hoy.getDate() < 15)) anios--;
            if (anios < 0) anios = 0;
            const areaNorm = String(s.Area || '').toLowerCase().trim();
            let pts;
            if (areaNorm === 'gastoscomision' || areaNorm.includes('gastos')) {
                pts = 1;
            } else {
                let cap = 10;
                if (areaNorm === 'mesas') cap = 20;
                else if (areaNorm === 'maquinas') cap = 12;
                else if (areaNorm === 'tecnicos') cap = 12;
                else if (areaNorm === 'boveda') cap = 10;
                else if (areaNorm.includes('cambista')) cap = 8;
                const maxPos = Math.min(4 + anios * 2, cap);
                const ptsSB = Number(s.Puntos);
                pts = (Number.isFinite(ptsSB) && ptsSB > 0) ? ptsSB : maxPos;
            }
            total += pts;
            if (String(s.TipoContrato) === 'Planta') planta += pts;
        });
        return { total, planta };
    }

    window.abrirModalRec = () => {
        if (!currentUser) return;
        document.getElementById('recFecha').value = new Date().toISOString().split('T')[0];
        document.getElementById('recMonto').value = '';
        document.getElementById('recDivisor').value = '';
        // Mostrar el total de puntos como dato de referencia
        const _pts = _recCalcTotalPuntos();
        const elTP = document.getElementById('recInfoTotalPuntos');
        const elPP = document.getElementById('recInfoPtsPlanta');
        if (elTP) elTP.textContent = _pts.total.toLocaleString('es-CL') + ' pts';
        if (elPP) elPP.textContent = _pts.planta.toLocaleString('es-CL') + ' pts';
        selRecTipo('TarjetaMDA');
        document.getElementById('modalRecaudacion').style.display = 'flex';
    };

    window.cerrarModalRec = () => {
        document.getElementById('modalRecaudacion').style.display = 'none';
    };

    window.fmtRecMonto = (inp) => {
        const v = inp.value.replace(/\D/g, '');
        inp.value = v ? '$' + parseInt(v).toLocaleString('es-ES') : '';
    };

    window.enviarRec = async () => {
        if (!currentUser) return;
        if (!_recTipoSelected) return showToast('Selecciona una categoría', 'error');
        const fecha = document.getElementById('recFecha').value;
        const monto = parseInt((document.getElementById('recMonto').value || '').replace(/\D/g, '')) || 0;
        const divisorRaw = parseFloat(document.getElementById('recDivisor').value) || 0;
        if (!fecha) return showToast('Selecciona una fecha', 'error');
        if (!monto) return showToast('Ingresa un monto válido', 'error');
        const btn = document.getElementById('btnEnviarRec');
        btn.disabled = true; btn.textContent = 'Registrando...';
        try {
            const payload = {
                action: 'addRecaudacion',
                tipo: _recTipoSelected,
                fecha,
                monto,
                registrado_por_id: String(currentUser.ID),
                registrado_por_nombre: (currentUser.Nombre + ' ' + currentUser.Apellido).trim()
            };
            if (divisorRaw > 0) payload.divisor = divisorRaw;
            const res = await fetch(SCRIPT_URL_RECAUDACIONES, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify(payload)
            });
            const json = await res.json();
            if (json.success) {
                showToast('Recaudación registrada ✓', 'success');
                cerrarModalRec();
            } else {
                showToast('Error: ' + (json.error || 'No se pudo guardar'), 'error');
            }
        } catch(e) { showToast('Error al registrar', 'error'); }
        finally { btn.disabled = false; btn.textContent = 'Registrar Recaudación'; }
    };

    // ── SOLICITUD DE EGRESO (anticipo de propina) ─────────────
    window.abrirModalEgreso = () => {
        if (!currentUser) return;
        document.getElementById('egresoMonto').value = '';
        document.getElementById('egresoNota').value = '';
        document.getElementById('modalEgreso').style.display = 'flex';
    };
    window.cerrarModalEgreso = () => {
        document.getElementById('modalEgreso').style.display = 'none';
    };
    window.fmtEgresoMonto = (inp) => {
        const v = inp.value.replace(/\D/g, '');
        inp.value = v ? '$' + parseInt(v).toLocaleString('es-ES') : '';
    };

    window.enviarEgreso = async () => {
        if (!currentUser) return;
        const monto = parseInt((document.getElementById('egresoMonto').value || '').replace(/\D/g, '')) || 0;
        const nota = (document.getElementById('egresoNota').value || '').trim();
        const btn = document.getElementById('btnEnviarEgreso');
        if (!monto) { btn.textContent = 'Ingresa un monto'; setTimeout(() => btn.textContent = 'Enviar solicitud', 1600); return; }
        btn.disabled = true; btn.textContent = 'Enviando...';
        try {
            const res = await fetch(SCRIPT_URL_SOCIOS, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({
                    action: 'solicitarEgreso',
                    socioId: String(currentUser.ID),
                    socioNombre: (currentUser.Nombre + ' ' + currentUser.Apellido).trim(),
                    monto, nota
                })
            });
            const json = await res.json();
            if (json.success) {
                btn.textContent = '✓ Solicitud enviada';
                setTimeout(() => { cerrarModalEgreso(); btn.textContent = 'Enviar solicitud'; renderEgresoEstado(); }, 1100);
            } else {
                btn.textContent = 'Error, reintenta';
                setTimeout(() => btn.textContent = 'Enviar solicitud', 1800);
            }
        } catch (e) {
            btn.textContent = 'Error de conexión';
            setTimeout(() => btn.textContent = 'Enviar solicitud', 1800);
        } finally { btn.disabled = false; }
    };

    // Muestra la tarjeta con la solicitud de egreso pendiente del socio (si la hay)
    async function renderEgresoEstado() {
        const box = document.getElementById('egresoEstadoBox');
        const boxPm = document.getElementById('pmEgresoEstadoBox');
        if ((!box && !boxPm) || !currentUser) return;
        const _ocultar = () => {
            if (box) { box.classList.add('hidden'); box.innerHTML = ''; }
            if (boxPm) { boxPm.style.display = 'none'; boxPm.innerHTML = ''; }
        };
        try {
            const res = await fetch(SCRIPT_URL_SOCIOS, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({ action: 'miSolicitudEgreso', socioId: String(currentUser.ID) })
            });
            const s = (await res.json()).data;
            if (!s) { _ocultar(); return; }
            const montoTxt = '$' + (Number(s.monto) || 0).toLocaleString('es-CL');
            // Clásico (claro, con clases de tema)
            if (box) {
                box.innerHTML = `
                  <div style="background:#e0f2fe;border:1px solid #7dd3fc;border-radius:16px;padding:12px 14px;">
                    <div style="display:flex;align-items:center;gap:12px">
                      <div style="width:36px;height:36px;border-radius:10px;background:rgba(2,132,199,0.12);display:flex;align-items:center;justify-content:center;flex-shrink:0">
                        <span class="material-symbols-outlined" style="font-size:20px;color:#0284c7">hourglass_top</span>
                      </div>
                      <div style="flex:1;min-width:0">
                        <div style="font-size:12px;font-weight:800;color:#075985">Egreso solicitado · pendiente</div>
                        <div style="font-size:11px;color:#0369a1;margin-top:1px">${montoTxt} — a la espera de que la administración lo procese</div>
                      </div>
                    </div>
                    <button onclick="cancelarEgreso()" style="width:100%;margin-top:10px;padding:9px;background:#fff;border:1px solid #fca5a5;border-radius:11px;color:#dc2626;font-size:12px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;">
                      <span class="material-symbols-outlined" style="font-size:16px;">cancel</span> Cancelar solicitud
                    </button>
                  </div>`;
                box.classList.remove('hidden');
            }
            // Premium (dashboard oscuro)
            if (boxPm) {
                boxPm.innerHTML = `
                  <div style="background:#0b2a3a;border:1px solid #0e7490;border-radius:16px;padding:14px;">
                    <div style="display:flex;align-items:center;gap:12px">
                      <div style="width:38px;height:38px;border-radius:10px;background:rgba(14,116,144,0.35);display:flex;align-items:center;justify-content:center;flex-shrink:0">
                        <span class="material-symbols-outlined" style="font-size:20px;color:#67e8f9">hourglass_top</span>
                      </div>
                      <div style="flex:1;min-width:0">
                        <div style="font-size:13px;font-weight:800;color:#a5f3fc">Egreso solicitado · pendiente</div>
                        <div style="font-size:11px;color:#7dd3fc;margin-top:2px">${montoTxt} — a la espera de que la administración lo procese</div>
                      </div>
                    </div>
                    <button onclick="cancelarEgreso()" style="width:100%;margin-top:12px;padding:10px;background:#2a1618;border:1px solid #7f1d1d;border-radius:12px;color:#ffb4ab;font-size:12px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;">
                      <span class="material-symbols-outlined" style="font-size:16px;">cancel</span> Cancelar solicitud
                    </button>
                  </div>`;
                boxPm.style.display = 'block';
            }
        } catch (e) { /* silencioso */ }
    }
    window.renderEgresoEstado = renderEgresoEstado;

    // El socio cancela su solicitud de egreso pendiente (por error / arrepentimiento).
    window.cancelarEgreso = async function () {
        if (!currentUser) return;
        if (!confirm('¿Cancelar tu solicitud de egreso pendiente?\n\nSe eliminará y la administración ya no la verá.')) return;
        try {
            const res = await fetch(SCRIPT_URL_SOCIOS, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({ action: 'cancelarEgreso', socioId: String(currentUser.ID) })
            });
            const r = await res.json();
            if (r && r.success) {
                if (typeof showToast === 'function') showToast('Egreso', 'Solicitud cancelada ✓');
                renderEgresoEstado();
            } else {
                alert('No se pudo cancelar. Intenta de nuevo.');
            }
        } catch (e) { alert('No se pudo cancelar. Revisa tu conexión.'); }
    };

    // ── NOTIFICACIONES PUSH (Web Push) ─────────────────────────
    const VAPID_PUBLIC_KEY = 'BFzJrgZgoGMHxdHbqCyiftayb-JINxQNy3ek3h1YRH9yoZQIBp7zfFgr8IG72rLkzRpBsLPY2XVvy5k4G_gA6RI';
    function _urlB64ToUint8(base64) {
        const pad = '='.repeat((4 - base64.length % 4) % 4);
        const b = (base64 + pad).replace(/-/g, '+').replace(/_/g, '/');
        const raw = atob(b); const arr = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
        return arr;
    }
    async function _guardarPushSub(sub) {
        if (!currentUser) return;
        try {
            await fetch(SCRIPT_URL_SOCIOS, { method: 'POST', body: JSON.stringify({
                action: 'savePushSub', socioId: String(currentUser.ID),
                sub: sub.toJSON ? sub.toJSON() : sub, ua: navigator.userAgent
            })});
        } catch (e) { /* silencioso */ }
    }
    function _pushPintarBtn(activa, denegado) {
        const btn = document.getElementById('btnNotif'); if (!btn) return;
        const lbl = document.getElementById('btnNotifLabel');
        const sub = document.getElementById('btnNotifSub');
        const ic  = document.getElementById('btnNotifIcon');
        if (denegado) {
            if (lbl) lbl.textContent = 'Notificaciones bloqueadas';
            if (sub) sub.textContent = 'Actívalas en los ajustes del navegador';
            if (ic)  ic.textContent = 'notifications_off';
            btn.dataset.on = 'no';
        } else if (activa) {
            if (lbl) lbl.textContent = 'Notificaciones activadas';
            if (sub) sub.textContent = 'Toca para desactivarlas';
            if (ic)  ic.textContent = 'notifications_active';
            btn.dataset.on = 'si';
        } else {
            if (lbl) lbl.textContent = 'Activar notificaciones';
            if (sub) sub.textContent = 'Recibe avisos aunque la app esté cerrada';
            if (ic)  ic.textContent = 'notifications';
            btn.dataset.on = 'no';
        }
    }
    async function _pushRefrescarEstado() {
        const btn = document.getElementById('btnNotif'); if (!btn) return;
        if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
            btn.style.display = 'none'; return;
        }
        let activa = false;
        try {
            const reg = await navigator.serviceWorker.ready;
            const sub = await reg.pushManager.getSubscription();
            activa = !!sub && Notification.permission === 'granted';
            if (sub && currentUser) _guardarPushSub(sub); // mantener fresca la suscripción
        } catch (e) {}
        _pushPintarBtn(activa, Notification.permission === 'denied');
        // Refrescar también el banner (si acaba de activar/desactivar, ocultarlo)
        _maybeShowNotifPrompt();
    }

    // ── Banner "Activar notificaciones" en la pantalla principal ─────────────
    // Aparece solo si el socio aún NO decidió (permiso 'default') y no lo pospuso.
    function _maybeShowNotifPrompt() {
        const el = document.getElementById('notifPrompt'); if (!el) return;
        try {
            if (!currentUser) { el.style.display = 'none'; return; }
            if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) { el.style.display = 'none'; return; }
            if (Notification.permission !== 'default') { el.style.display = 'none'; return; } // ya aceptó o bloqueó
            const snooze = parseInt(localStorage.getItem('notif_prompt_snooze') || '0');
            if (snooze && Date.now() < snooze) { el.style.display = 'none'; return; }
            el.style.display = 'block';
        } catch (e) {}
    }
    window._notifPromptActivar = async function () {
        const el = document.getElementById('notifPrompt'); if (el) el.style.display = 'none';
        if (typeof activarNotificaciones === 'function') await activarNotificaciones();
    };
    window._notifPromptCerrar = function () {
        const el = document.getElementById('notifPrompt'); if (el) el.style.display = 'none';
        // No molestar: posponer 3 días
        try { localStorage.setItem('notif_prompt_snooze', String(Date.now() + 3 * 24 * 60 * 60 * 1000)); } catch (e) {}
    };

    window.activarNotificaciones = async function () {
        const btn = document.getElementById('btnNotif');
        if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
            alert('Tu navegador no admite notificaciones.\n\n📱 En iPhone: primero agrega la app a la pantalla de inicio (Compartir → "Agregar a inicio") y ábrela desde ahí.');
            return;
        }
        if (btn && btn.dataset.on === 'si') { await _desactivarNotificaciones(); return; }
        try {
            const perm = await Notification.requestPermission();
            if (perm !== 'granted') {
                _pushPintarBtn(false, perm === 'denied');
                if (perm === 'denied') alert('Bloqueaste las notificaciones. Puedes activarlas en los ajustes del navegador para este sitio.');
                return;
            }
            const reg = await navigator.serviceWorker.ready;
            let sub = await reg.pushManager.getSubscription();
            if (!sub) {
                sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: _urlB64ToUint8(VAPID_PUBLIC_KEY) });
            }
            await _guardarPushSub(sub);
            _pushPintarBtn(true, false);
        } catch (e) {
            alert('No se pudieron activar las notificaciones.\n\n📱 En iPhone recuerda: agrega la app a la pantalla de inicio y ábrela desde ahí.');
        }
    };
    async function _desactivarNotificaciones() {
        try {
            const reg = await navigator.serviceWorker.ready;
            const sub = await reg.pushManager.getSubscription();
            if (sub) {
                const ep = sub.endpoint;
                await sub.unsubscribe().catch(() => {});
                try { await fetch(SCRIPT_URL_SOCIOS, { method: 'POST', body: JSON.stringify({ action: 'deletePushSub', endpoint: ep }) }); } catch (e) {}
            }
        } catch (e) {}
        _pushPintarBtn(false, false);
    }
    window._pushRefrescarEstado = _pushRefrescarEstado;

    // ── MODAL HELPERS ─────────────────────────────────────────
    function toggleModal(id, show) {
        const m=document.getElementById(id);
        if(show){m.classList.remove('hidden');m.classList.add('flex');if(id==='usersModal')renderUsersList();}
        else{m.classList.add('hidden');m.classList.remove('flex');}
    }

    function renderUsersList() {
        const term=document.getElementById('userSearch').value.toLowerCase();
        const list=allSocios.filter(u=>String(u.ID)!==String(currentUser.ID)&&(u.Nombre.toLowerCase().includes(term)||u.Apellido.toLowerCase().includes(term)));
        const avatarColors=['#001723','#264b5f','#006a62','#705d00','#ba1a1a'];
        let html=`<button onclick="selectSocialTarget('TODOS','Chat General')" class="w-full text-left p-3.5 rounded-2xl hover:bg-lm-subtle flex items-center gap-3 transition-all mb-1">
            <div class="w-10 h-10 rounded-full bg-lm-primary/10 text-lm-primary flex items-center justify-center font-bold text-sm border border-lm-primary/20 shrink-0">G</div>
            <div><p class="text-sm font-semibold text-lm-primary">Chat General</p><p class="text-xs text-lm-muted mt-0.5">Público para todos</p></div>
        </button>`;
        list.forEach((u,i)=>{
            const c=avatarColors[i%avatarColors.length];
            const foto=(u.FotoUrl||'').trim();
            const av = foto
                ? `<div class="w-10 h-10 rounded-full shrink-0" style="background-image:url('${foto.replace(/'/g,'%27')}');background-size:cover;background-position:center;border:1px solid #e2e8f0;"></div>`
                : `<div class="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shrink-0 text-white" style="background:${c}">${u.Nombre.charAt(0)}</div>`;
            html+=`<button onclick="selectSocialTarget('${u.ID}','${u.Nombre} ${u.Apellido}')" class="w-full text-left p-3.5 rounded-2xl hover:bg-lm-subtle flex items-center gap-3 transition-all">
                ${av}
                <div><p class="text-sm font-semibold text-lm-primary">${u.Nombre} ${u.Apellido}</p><p class="text-xs text-lm-muted mt-0.5">${u.Area}</p></div>
            </button>`;
        });
        document.getElementById('usersListContent').innerHTML=html;
    }

    function selectSocialTarget(id, name) {
        currentSocialTarget={id,name};
        document.getElementById('targetNameLabel').textContent=name;
        const ti=document.getElementById('targetIcon');
        const soc = id!=='TODOS' ? allSocios.find(u=>String(u.ID)===String(id)) : null;
        const foto = soc && (soc.FotoUrl||'').trim();
        if(ti){
            if(foto){ ti.style.backgroundImage='url("'+foto+'")'; ti.style.backgroundSize='cover'; ti.style.backgroundPosition='center'; ti.textContent=''; }
            else { ti.style.backgroundImage=''; ti.textContent=id==='TODOS'?'G':name.charAt(0); }
        }
        toggleModal('usersModal',false);
        renderChat();
    }

    // ── TAB SWITCHING ─────────────────────────────────────────
    // ── HISTORIAL DE ANTICIPOS ANTERIORES ────────────────────────────────────
    let _histAnticiposLoaded = false;
    let _histAnticiposData   = [];
    let _histAnticiposFiltro = 'Todos';
    let _histAnticiposMesFiltro = 'Todos';
    const MESES_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

    function switchHistView(view) {
        const elRend = document.getElementById('histViewRendimientos');
        const elAnts = document.getElementById('histViewAnticipos');
        const btnRend = document.getElementById('histToggleRendimientos');
        const btnAnts = document.getElementById('histToggleAnticipos');
        if (view === 'rendimientos') {
            elRend.classList.remove('hidden');
            elAnts.classList.add('hidden');
            btnRend.classList.add('bg-lm-card', 'text-lm-primary', 'shadow-sm', 'border', 'border-lm-border');
            btnRend.classList.remove('text-lm-muted');
            btnAnts.classList.remove('bg-lm-card', 'text-lm-primary', 'shadow-sm', 'border', 'border-lm-border');
            btnAnts.classList.add('text-lm-muted');
        } else {
            elRend.classList.add('hidden');
            elAnts.classList.remove('hidden');
            btnAnts.classList.add('bg-lm-card', 'text-lm-primary', 'shadow-sm', 'border', 'border-lm-border');
            btnAnts.classList.remove('text-lm-muted');
            btnRend.classList.remove('bg-lm-card', 'text-lm-primary', 'shadow-sm', 'border', 'border-lm-border');
            btnRend.classList.add('text-lm-muted');
            if (!_histAnticiposLoaded) loadHistorialAnticipos();
        }
    }

    async function loadHistorialAnticipos() {
        if (!currentUser) return;
        const container = document.getElementById('historialAnticiposContainer');
        container.innerHTML = `
            <div class="flex flex-col gap-3">
                ${[1,2,3].map(() => `<div class="bg-lm-card border border-lm-border rounded-[20px] h-16 animate-pulse"></div>`).join('')}
            </div>`;
        try {
            const res = await fetch(SCRIPT_URL_SOCIOS, {
                method: 'POST',
                body: JSON.stringify({ action: 'getHistorialCompletoSocio', idSocio: currentUser.ID })
            });
            const json = await res.json();
            _histAnticiposLoaded = true;
            _histAnticiposData   = json.data || [];
            _histAnticiposFiltro = 'Todos';
            _histAnticiposMesFiltro = 'Todos';
            buildFiltroAnios(_histAnticiposData);
            buildFiltroMeses('Todos', _histAnticiposData);
            renderHistorialAnticipos(_histAnticiposData);
        } catch(e) {
            container.innerHTML = `
                <div class="flex flex-col items-center gap-3 py-10 text-lm-muted">
                    <span class="material-symbols-outlined text-[36px] opacity-40">error_outline</span>
                    <p class="text-sm">Error al cargar. Intenta nuevamente.</p>
                    <button onclick="_histAnticiposLoaded=false;loadHistorialAnticipos()"
                        class="text-xs font-semibold text-lm-accent border border-lm-accent/30 rounded-xl px-4 py-2">
                        Reintentar
                    </button>
                </div>`;
        }
    }

    function _extraerAnio(periodo) {
        const m = String(periodo).match(/\b(20\d{2})\b/);
        return m ? m[1] : null;
    }

    function _extraerMes(periodo) {
        const str = String(periodo);
        const numMatch = str.match(/\b20\d{2}[-\/](\d{1,2})\b/);
        if (numMatch) {
            const n = parseInt(numMatch[1], 10);
            if (n >= 1 && n <= 12) return MESES_ES[n - 1];
        }
        for (const mes of MESES_ES) {
            if (str.toLowerCase().includes(mes.toLowerCase())) return mes;
        }
        return null;
    }

    // Etiqueta legible del período (los archivados pueden venir como
    // "CIERRE_JULIO_DE 2026", "JULIO_2026" o "2026-06-15").
    function _fmtPeriodoLabel(periodo) {
        const s = String(periodo || '').trim();
        if (!s || s === 'Activo' || s === 'Archivado') return s || 'Período';
        const md = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
        if (md) { const mo = parseInt(md[2], 10); if (mo >= 1 && mo <= 12) return `${MESES_ES[mo - 1]} ${md[1]}`; }
        const t = s.replace(/^CIERRE[_\s]*/i, '')
            .replace(/_/g, ' ')
            .replace(/\bde\b/gi, ' ')
            .replace(/\s+/g, ' ')
            .toLowerCase()
            .replace(/\b\w/g, c => c.toUpperCase())
            .trim();
        return t || s;
    }

    function buildFiltroMeses(anio, data) {
        const bar = document.getElementById('antFiltroMeses');
        const filtered = anio === 'Todos' ? data : data.filter(p => _extraerAnio(p.periodo) === anio);
        const mesesSet = new Set(filtered.map(p => _extraerMes(p.periodo)).filter(Boolean));
        const meses = MESES_ES.filter(m => mesesSet.has(m));
        if (meses.length <= 1) { bar.classList.add('hidden'); return; }
        _histAnticiposMesFiltro = 'Todos';
        bar.classList.remove('hidden');
        bar.innerHTML = ['Todos', ...meses].map(m => `
            <button onclick="filtrarAnticiposMes('${m}')" id="antFiltroMes-${m}"
                class="flex-shrink-0 px-4 py-1.5 rounded-full text-[11px] font-bold border transition-all
                       ${m === 'Todos' ? 'bg-lm-primary text-white border-lm-primary' : 'bg-lm-card text-lm-muted border-lm-border'}">
                ${m}
            </button>`).join('');
    }

    function filtrarAnticiposMes(mes) {
        _histAnticiposMesFiltro = mes;
        document.querySelectorAll('[id^="antFiltroMes-"]').forEach(b => {
            const activo = b.id === 'antFiltroMes-' + mes;
            b.className = b.className.replace(/bg-lm-primary text-white border-lm-primary|bg-lm-card text-lm-muted border-lm-border/g, '').trim()
                + (activo ? ' bg-lm-primary text-white border-lm-primary' : ' bg-lm-card text-lm-muted border-lm-border');
        });
        const porAnio = _histAnticiposFiltro === 'Todos'
            ? _histAnticiposData
            : _histAnticiposData.filter(p => _extraerAnio(p.periodo) === _histAnticiposFiltro);
        const filtrado = mes === 'Todos'
            ? porAnio
            : porAnio.filter(p => _extraerMes(p.periodo) === mes);
        renderHistorialAnticipos(filtrado);
    }

    function buildFiltroAnios(data) {
        const bar = document.getElementById('antFiltroAnios');
        const anios = [...new Set(data.map(p => _extraerAnio(p.periodo)).filter(Boolean))].sort((a,b) => b-a);
        if (anios.length <= 1) { bar.classList.add('hidden'); return; }
        bar.classList.remove('hidden');
        bar.innerHTML = ['Todos', ...anios].map(a => `
            <button onclick="filtrarAnticipos('${a}')" id="antFiltro-${a}"
                class="flex-shrink-0 px-4 py-1.5 rounded-full text-[11px] font-bold border transition-all
                       ${a === 'Todos' ? 'bg-lm-primary text-white border-lm-primary' : 'bg-lm-card text-lm-muted border-lm-border'}">
                ${a}
            </button>`).join('');
    }

    function filtrarAnticipos(anio) {
        _histAnticiposFiltro = anio;
        document.querySelectorAll('[id^="antFiltro-"]').forEach(b => {
            const activo = b.id === 'antFiltro-' + anio;
            b.className = b.className.replace(/bg-lm-primary text-white border-lm-primary|bg-lm-card text-lm-muted border-lm-border/g, '').trim()
                + (activo ? ' bg-lm-primary text-white border-lm-primary' : ' bg-lm-card text-lm-muted border-lm-border');
        });
        const filtrado = anio === 'Todos'
            ? _histAnticiposData
            : _histAnticiposData.filter(p => _extraerAnio(p.periodo) === anio);
        buildFiltroMeses(anio, _histAnticiposData);
        renderHistorialAnticipos(filtrado);
    }

    function togglePeriodo(id) {
        const body   = document.getElementById('ant-body-' + id);
        const icon   = document.getElementById('ant-icon-' + id);
        const abierto = !body.classList.contains('hidden');
        body.classList.toggle('hidden', abierto);
        icon.style.transform = abierto ? 'rotate(0deg)' : 'rotate(180deg)';
    }

    function renderHistorialAnticipos(data) {
        const container = document.getElementById('historialAnticiposContainer');
        if (!data || data.length === 0) {
            container.innerHTML = `
                <div class="flex flex-col items-center gap-3 py-16 text-lm-muted">
                    <span class="material-symbols-outlined text-[40px] opacity-30">receipt_long</span>
                    <p class="text-sm">Sin anticipos en este período.</p>
                </div>`;
            return;
        }
        container.innerHTML = data.map((periodo, idx) => {
            const total = periodo.registros.reduce((s, r) => s + (Number(r.monto) || 0), 0);
            const id    = 'p' + idx;
            const rows  = periodo.registros.map(r => `
                <div class="flex justify-between items-center px-4 py-3 border-b border-lm-border last:border-0">
                    <div>
                        <p class="text-sm font-medium text-lm-primary">${r.fecha}</p>
                        ${r.responsable ? `<p class="text-[10px] text-lm-muted mt-0.5">${r.responsable}</p>` : ''}
                    </div>
                    <span class="text-sm font-semibold" style="color:var(--color-red,#ef4444)">-${formatMoney(r.monto)}</span>
                </div>`).join('');
            return `
                <div class="bg-lm-card border border-lm-border rounded-[20px] overflow-hidden mb-3 shadow-sm">
                    <button onclick="togglePeriodo('${id}')"
                        class="w-full flex justify-between items-center px-4 py-3 active:bg-lm-subtle transition-colors">
                        <div class="flex items-center gap-2">
                            <span class="material-symbols-outlined text-lm-accent text-[16px]">folder_open</span>
                            <span class="text-sm font-bold text-lm-primary">${_fmtPeriodoLabel(periodo.periodo)}</span>
                            <span class="text-[10px] text-lm-muted">${periodo.registros.length} anticipo${periodo.registros.length !== 1 ? 's' : ''}</span>
                        </div>
                        <div class="flex items-center gap-2">
                            <span class="text-sm font-bold" style="color:var(--color-red,#ef4444)">-${formatMoney(total)}</span>
                            <span id="ant-icon-${id}" class="material-symbols-outlined text-lm-muted text-[18px] transition-transform duration-200">expand_more</span>
                        </div>
                    </button>
                    <div id="ant-body-${id}" class="hidden border-t border-lm-border">
                        ${rows}
                    </div>
                </div>`;
        }).join('');
    }

    function switchTab(id) {
        document.querySelectorAll('.tab-section').forEach(t => {
            t.classList.remove('active');
            // Si es tab-chat (fixed), ocultarlo explícitamente
            if (t.id === 'tab-chat') t.style.display = 'none';
        });
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

        const tab = document.getElementById(id);
        tab.classList.add('active');

        if (id === 'tab-chat') {
            tab.style.display = 'flex';
            document.getElementById('notifBadge').classList.add('hidden');
            lastMsgCount = messages.admin.length + messages.social.length;
            localStorage.setItem('lastMsgCountV19', lastMsgCount);
            setTimeout(() => {
                const c = document.getElementById('chatMessages');
                if (c) c.scrollTop = c.scrollHeight;
            }, 80);
        }

        const btn = document.querySelector(`button[onclick="switchTab('${id}')"]`);
        if (btn) btn.classList.add('active');

        if (id === 'tab-stats') {
            setTimeout(() => renderStatsChart(), 80);
        }
    }

    function logout() {
        if (inactivityTimer) { clearInterval(inactivityTimer); inactivityTimer = null; }
        // Avisar la desconexión (Telegram) ANTES de limpiar el usuario
        try { logoutConexion(); } catch(e) {}
        try { localStorage.removeItem(_INACT_KEY); } catch(e) {}
        // Al cerrar sesión (inactividad o manual) se exige el PIN de nuevo: borrar el PIN de sesión
        try { sessionStorage.removeItem('visor_secure_auth_sess'); } catch(e) {}
        currentUser = null;
        document.getElementById('appContainer').classList.add('hidden');
        document.getElementById('appContainer').classList.remove('flex');
        document.getElementById('loginOverlay').classList.remove('hidden');
        document.getElementById('fastPIN').value = '';
        checkSecurity();
    }

    // ── CALENDAR ─────────────────────────────────────────────
    let calCurrentYear = null, calCurrentMonth = null;
    const calMeses = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

    function openCalendar() {
        const now = new Date();
        calCurrentYear  = now.getFullYear();
        calCurrentMonth = now.getMonth();
        document.getElementById('calendarTitle').textContent = userTypeGlobal==='PT' ? "Turnos Realizados" : "Mis Ausencias";
        renderCalendarGrid();
        const modal = document.getElementById('calendarModal');
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        if (userTypeGlobal === 'PT') cargarDiasPTSolicitados();
    }

    // ── Autogestión de días Part-Time ────────────────────────
    // Clave de período (15 → 14) a la que pertenece una fecha: "YYYY-MM-15_YYYY-MM-14"
    function _periodKeyPT(fKey) {
        const d = _parseLocalDate(fKey);
        let y = d.getFullYear(), m = d.getMonth(); // 0-based
        let iniY = y, iniM = m, finY = y, finM = m;
        if (d.getDate() >= 15) { finM = m + 1; if (finM > 11) { finM = 0; finY = y + 1; } }
        else { iniM = m - 1; if (iniM < 0) { iniM = 11; iniY = y - 1; } }
        const p = (yy, mm, dd) => yy + '-' + String(mm + 1).padStart(2, '0') + '-' + dd;
        return p(iniY, iniM, '15') + '_' + p(finY, finM, '14');
    }

    // Carga los días que el socio marcó y están PENDIENTE/RECHAZADO
    async function cargarDiasPTSolicitados() {
        if (!currentUser || userTypeGlobal !== 'PT') return;
        try {
            const res = await fetch(SCRIPT_URL_SOCIOS, {
                method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({ action: 'misDiasPTSolicitados', socioId: String(currentUser.ID) })
            });
            const j = await res.json();
            ptDiasSolicitados = (j.data || []).map(x => ({
                fecha: String(x.fecha).substring(0, 10),
                estado: x.estado,
                valor: Number(x.valor_estimado) || 0,
                motivo: x.motivo_rechazo || ''
            }));
        } catch (e) { console.warn('[PT] misDiasPTSolicitados:', e.message); ptDiasSolicitados = []; }
        const modal = document.getElementById('calendarModal');
        if (modal && !modal.classList.contains('hidden')) renderCalendarGrid();
        renderPTConfirmarCard();
    }

    // Tarjeta "Por confirmar" en la pantalla principal (clásica + premium).
    // Muestra cuánto ganará el socio PT con los días que marcó y aún no se validan.
    function renderPTConfirmarCard() {
        const cardCl = document.getElementById('ptConfirmarCardClasica');
        const cardPm = document.getElementById('ptConfirmarCardPm');
        const pend = (userTypeGlobal === 'PT') ? ptDiasSolicitados.filter(d => d.estado === 'PENDIENTE') : [];
        const monto = pend.reduce((a, d) => {
            const live = (ptMapVP[d.fecha]?.totalVP || 0) * ptPuntos;
            return a + (live > 0 ? live : (Number(d.valor) || 0));
        }, 0);
        // Total estimado = lo ya confirmado (días en planilla) + lo que está por confirmar
        const confirmado = globalDiasCalendar.reduce((a, b) => a + (Number(b.montoAsociado) || 0), 0);
        const totalEst = confirmado + monto;
        // Total del "valor punto por noche": VP acumulado de días confirmados + VP de los días por confirmar
        const vpConfirmado = globalDiasCalendar.reduce((a, b) => a + (Number(b.valorPunto) || 0), 0);
        const vpPend = pend.reduce((a, d) => a + (ptMapVP[d.fecha]?.totalVP || 0), 0);
        const vpTotal = vpConfirmado + vpPend;
        const show = pend.length > 0;
        const diasTxt = pend.length + ' día' + (pend.length > 1 ? 's' : '') + ' marcado' + (pend.length > 1 ? 's' : '') + ' · a la espera de validación';
        if (cardCl) {
            cardCl.style.display = show ? 'block' : 'none';
            if (show) {
                const m = document.getElementById('ptConfPendMontoCl'); if (m) m.textContent = '+' + formatMoney(monto);
                const d = document.getElementById('ptConfPendDiasCl'); if (d) d.textContent = diasTxt;
                const t = document.getElementById('ptConfTotalEstCl'); if (t) t.textContent = formatMoney(totalEst);
                const v = document.getElementById('ptConfTotalVPCl'); if (v) v.textContent = formatMoney(vpTotal);
            }
        }
        if (cardPm) {
            cardPm.style.display = show ? 'block' : 'none';
            if (show) {
                const m = document.getElementById('ptConfPendMontoPm'); if (m) m.textContent = '+' + formatMoney(monto);
                const d = document.getElementById('ptConfPendDiasPm'); if (d) d.textContent = diasTxt;
                const t = document.getElementById('ptConfTotalEstPm'); if (t) t.textContent = formatMoney(totalEst);
                const v = document.getElementById('ptConfTotalVPPm'); if (v) v.textContent = formatMoney(vpTotal);
            }
        }
    }

    // El socio toca un día del calendario: lo marca (por confirmar) o lo quita.
    async function togglePTDia(fKey) {
        if (ptCargandoDia) return;
        if (userTypeGlobal !== 'PT' || !currentUser) return;

        // No permitir tocar un día ya confirmado (está en la planilla)
        const yaConfirmado = globalDiasCalendar.some(d => String(d.fecha).split('T')[0].substring(0, 10) === fKey);
        if (yaConfirmado) { showToast('Sistema', 'Este día ya fue confirmado por la comisión.'); return; }

        // No permitir marcar días futuros
        const hoyKey = (function () { const n = new Date(); return n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0') + '-' + String(n.getDate()).padStart(2, '0'); })();
        if (fKey > hoyKey) { showToast('Sistema', 'No puedes marcar días futuros.'); return; }

        const existente = ptDiasSolicitados.find(d => d.fecha === fKey);
        ptCargandoDia = true;
        try {
            if (existente && existente.estado === 'PENDIENTE') {
                // Quitar la marca
                const res = await fetch(SCRIPT_URL_SOCIOS, {
                    method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                    body: JSON.stringify({ action: 'desmarcarDiaPT', socioId: String(currentUser.ID), fecha: fKey })
                });
                const j = await res.json();
                if (j.success) {
                    ptDiasSolicitados = ptDiasSolicitados.filter(d => d.fecha !== fKey);
                    showToast('Turno', 'Día quitado.');
                } else { showToast('Turno', 'No se pudo quitar el día.'); }
            } else {
                // Marcar el día (por confirmar). Valor estimado según la recaudación del día.
                const vp = ptMapVP[fKey]?.totalVP || 0;
                const valorEstimado = Math.round(vp * ptPuntos);
                const res = await fetch(SCRIPT_URL_SOCIOS, {
                    method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                    body: JSON.stringify({
                        action: 'marcarDiaPT',
                        socioId: String(currentUser.ID),
                        socioNombre: ((currentUser.Nombre || '') + ' ' + (currentUser.Apellido || '')).trim(),
                        area: currentUser.Area || '',
                        fecha: fKey,
                        periodo: _periodKeyPT(fKey),
                        valorEstimado
                    })
                });
                const j = await res.json();
                if (j.success) {
                    ptDiasSolicitados = ptDiasSolicitados.filter(d => d.fecha !== fKey);
                    ptDiasSolicitados.push({ fecha: fKey, estado: 'PENDIENTE', valor: valorEstimado, motivo: '' });
                    showToast('Turno', 'Día marcado — queda por confirmar por la comisión.');
                } else { showToast('Turno', 'No se pudo marcar el día.'); }
            }
        } catch (e) {
            console.warn('[PT] togglePTDia:', e.message);
            showToast('Turno', 'Error de conexión.');
        } finally {
            ptCargandoDia = false;
            renderCalendarGrid();
            renderPTConfirmarCard();
        }
    }

    function calNavMes(dir) {
        calCurrentMonth += dir;
        if (calCurrentMonth > 11) { calCurrentMonth = 0;  calCurrentYear++; }
        if (calCurrentMonth < 0)  { calCurrentMonth = 11; calCurrentYear--; }
        renderCalendarGrid();
    }

    function renderCalendarGrid() {
        const year  = calCurrentYear;
        const month = calCurrentMonth;
        document.getElementById('calendarMonthLabel').textContent = calMeses[month] + ' ' + year;

        // Grid: solo marca días del mes visible
        const prefix = year + '-' + String(month+1).padStart(2,'0');
        const diasDelMes = globalDiasCalendar.filter(d =>
            String(d.fecha).split('T')[0].substring(0,10).startsWith(prefix)
        );

        // Totales: siempre del período completo (todos los meses)
        const totalPeriodo = globalDiasCalendar.reduce((a,b) => a + b.montoAsociado, 0);
        document.getElementById('modalTotalDias').textContent     = globalDiasCalendar.length;
        document.getElementById('modalTotalGenerado').textContent = formatMoney(totalPeriodo);

        // Valor estimado en vivo de un día marcado (según la recaudación de ese día × puntos).
        // Si aún no hay recaudación cargada, cae al valor guardado al marcar.
        const _ptValorDia = d => {
            const live = (ptMapVP[d.fecha]?.totalVP || 0) * ptPuntos;
            return live > 0 ? live : (Number(d.valor) || 0);
        };

        // Resumen "por confirmar" + total estimado para el socio Part-Time
        const _resumenPT = document.getElementById('calPTResumen');
        if (_resumenPT) {
            const _pend = (userTypeGlobal === 'PT') ? ptDiasSolicitados.filter(d => d.estado === 'PENDIENTE') : [];
            const _pendMonto = _pend.reduce((a, d) => a + _ptValorDia(d), 0);
            if (_pend.length > 0) {
                _resumenPT.style.display = 'block';
                document.getElementById('calPTPendMonto').textContent = '+' + formatMoney(_pendMonto);
                document.getElementById('calPTPendDias').textContent = _pend.length + ' día' + (_pend.length > 1 ? 's' : '') + ' marcado' + (_pend.length > 1 ? 's' : '') + ' · a la espera de validación';
                document.getElementById('calPTTotalEst').textContent = formatMoney(totalPeriodo + _pendMonto);
            } else {
                _resumenPT.style.display = 'none';
            }
        }

        // Dibujar grid del mes visible
        const grid = document.getElementById('calendarGrid');
        grid.innerHTML = '';
        let firstDay = new Date(year, month, 1).getDay();
        firstDay = firstDay === 0 ? 6 : firstDay - 1;
        for (let i = 0; i < firstDay; i++) grid.innerHTML += '<div class="calendar-day"></div>';
        const daysInMonth = new Date(year, month+1, 0).getDate();
        const esPT = userTypeGlobal === 'PT';
        for (let i = 1; i <= daysInMonth; i++) {
            const fKey = year + '-' + String(month+1).padStart(2,'0') + '-' + String(i).padStart(2,'0');
            const marked = globalDiasCalendar.find(d => String(d.fecha).split('T')[0].substring(0,10) === fKey);
            let cls, attrs = '';
            if (marked) {
                cls = esPT ? 'worked' : 'absent';
            } else if (esPT) {
                // Día marcado por el socio, aún no confirmado (o rechazado)
                const sol = ptDiasSolicitados.find(d => d.fecha === fKey);
                cls = sol ? (sol.estado === 'RECHAZADO' ? 'pt-rechazado' : 'pt-pendiente') : 'bg-lm-subtle';
            } else {
                cls = 'bg-lm-subtle';
            }
            if (esPT) attrs = ' role="button" onclick="togglePTDia(\'' + fKey + '\')"';
            grid.innerHTML += '<div class="calendar-day ' + cls + '"' + attrs + '>' + i + '</div>';
        }
        // Ayuda para el socio PT
        if (esPT) {
            const pend = ptDiasSolicitados.filter(d => d.estado === 'PENDIENTE');
            const hint = document.getElementById('calPTHint');
            if (hint) {
                hint.style.display = 'block';
                hint.innerHTML = 'Toca un día para marcar tu turno. Queda <b style="color:#b45309">por confirmar</b> hasta que la comisión lo valide.'
                    + (pend.length ? ' <b>' + pend.length + '</b> día' + (pend.length > 1 ? 's' : '') + ' por confirmar.' : '');
            }
        } else {
            const hint = document.getElementById('calPTHint');
            if (hint) hint.style.display = 'none';
        }

        // Detalle: SIEMPRE muestra todos los registros del período completo
        const sortedTodos = [...globalDiasCalendar].sort((a,b) => String(a.fecha).localeCompare(String(b.fecha)));
        const label = userTypeGlobal === 'PT' ? 'Días trabajados del período' : 'Ausencias del período';
        const colorLabel = userTypeGlobal === 'PT' ? '#10b981' : '#ba1a1a';

        let detalleHTML = '<p style="font-size:9px;font-weight:700;color:' + colorLabel + ';text-transform:uppercase;letter-spacing:0.08em;margin-bottom:10px;">' + label + ' (' + sortedTodos.length + ')</p>';

        if (diasDelMes.length === 0 && sortedTodos.length > 0) {
            // Aviso: este mes no tiene registros pero sí hay en otros meses del período
            detalleHTML += '<div style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.2);border-radius:12px;padding:10px 14px;margin-bottom:10px;display:flex;align-items:center;gap:8px;">'
                + '<span class="material-symbols-outlined" style="font-size:16px;color:#f59e0b;flex-shrink:0">info</span>'
                + '<p style="font-size:11px;color:#92400e;margin:0;">Este mes no tiene registros, pero el período tiene ' + sortedTodos.length + ' registro' + (sortedTodos.length>1?'s':'') + ' en otros meses. Navega para verlos.</p>'
                + '</div>';
        }

        if (sortedTodos.length === 0) {
            detalleHTML += '<p style="text-align:center;font-size:12px;color:#94a3b8;padding:16px 0;">Sin registros en el período actual</p>';
        } else {
            detalleHTML += sortedTodos.map(function(d) {
                const esMesActual = String(d.fecha).split('T')[0].substring(0,10).startsWith(prefix);
                const bgExtra = esMesActual ? '' : 'opacity:0.6;';
                return '<div class="flex justify-between items-center bg-lm-subtle rounded-2xl p-4 border border-lm-border" style="' + bgExtra + '">'
                    + '<div>'
                    + '<p class="text-xs font-semibold text-lm-primary mb-0.5">' + formatDateText(d.fecha) + '</p>'
                    + '<p class="text-[11px] text-lm-accent">VP: ' + formatMoney(d.valorPunto) + '</p>'
                    + '</div>'
                    + '<span class="' + (userTypeGlobal==='PT'?'text-lm-green':'text-lm-red') + ' font-bold text-base">'
                    + (userTypeGlobal==='PT'?'+':'-') + formatMoney(d.montoAsociado)
                    + '</span></div>';
            }).join('');
        }

        // Días marcados por el socio PT que aún están por confirmar / rechazados
        if (userTypeGlobal === 'PT') {
            const pend = [...ptDiasSolicitados].sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
            const pendientes = pend.filter(d => d.estado === 'PENDIENTE');
            const rechazados = pend.filter(d => d.estado === 'RECHAZADO');
            if (pendientes.length) {
                detalleHTML += '<p style="font-size:9px;font-weight:700;color:#b45309;text-transform:uppercase;letter-spacing:0.08em;margin:16px 0 10px;">Por confirmar (' + pendientes.length + ')</p>';
                detalleHTML += pendientes.map(function (d) {
                    const vpNoche = ptMapVP[d.fecha]?.totalVP || 0;
                    return '<div class="flex justify-between items-center rounded-2xl p-4" style="background:rgba(245,158,11,0.10);border:1px solid rgba(245,158,11,0.35);">'
                        + '<div>'
                        + '<p class="text-xs font-semibold mb-0.5" style="color:#92400e;">' + formatDateText(d.fecha) + '</p>'
                        + '<p class="text-[11px]" style="color:#b45309;">VP por noche: ' + (vpNoche > 0 ? formatMoney(vpNoche) : 'sin recaudación aún') + '</p>'
                        + '<p class="text-[11px]" style="color:#b45309;">⏳ Esperando validación de la comisión</p>'
                        + '</div>'
                        + '<span class="font-bold text-base" style="color:#b45309;">~' + formatMoney(_ptValorDia(d)) + '</span>'
                        + '</div>';
                }).join('');
            }
            if (rechazados.length) {
                detalleHTML += '<p style="font-size:9px;font-weight:700;color:#b91c1c;text-transform:uppercase;letter-spacing:0.08em;margin:16px 0 10px;">Rechazados (' + rechazados.length + ')</p>';
                detalleHTML += rechazados.map(function (d) {
                    return '<div class="rounded-2xl p-4" style="background:rgba(239,68,68,0.07);border:1px solid rgba(239,68,68,0.28);">'
                        + '<div class="flex justify-between items-center">'
                        + '<p class="text-xs font-semibold mb-0.5" style="color:#991b1b;">' + formatDateText(d.fecha) + '</p>'
                        + '<span class="text-[11px] font-bold" style="color:#b91c1c;">Rechazado</span>'
                        + '</div>'
                        + (d.motivo ? '<p class="text-[11px] mt-1" style="color:#7f1d1d;">Motivo: ' + d.motivo + '</p>' : '')
                        + '<p class="text-[10px] mt-1" style="color:#b91c1c;">Toca el día en el calendario para volver a marcarlo.</p>'
                        + '</div>';
                }).join('');
            }
        }

        document.getElementById('calendarDetailsList').innerHTML = detalleHTML;
    }

    function closeCalendar() { document.getElementById('calendarModal').classList.add('hidden'); }

    // Minimiza/expande la cuadrícula del calendario para dar más espacio al detalle de abajo.
    let calMinimized = false;
    function toggleCalMinimize() {
        calMinimized = !calMinimized;
        const wrap = document.getElementById('calGridWrap');
        const icon = document.getElementById('calMinBtnIcon');
        const txt  = document.getElementById('calMinBtnTxt');
        if (wrap) wrap.style.display = calMinimized ? 'none' : 'block';
        if (icon) icon.textContent = calMinimized ? 'expand_more' : 'expand_less';
        if (txt)  txt.textContent  = calMinimized ? 'Mostrar calendario' : 'Minimizar calendario';
    }

    function descargarComprobante() {
        if (!currentUser || _lastBalance.liquido === 0 && _lastBalance.propinaBruta === 0) {
            alert('Los datos aún no han cargado. Espera un momento e intenta nuevamente.');
            return;
        }

        const u = currentUser;
        const b = _lastBalance;
        const hoy = new Date();
        const fechaEmision = hoy.toLocaleDateString('es-CL', {day:'2-digit',month:'2-digit',year:'numeric'});

        // Período: 15 del mes anterior al 14 del mes actual
        const mesActual = hoy.getMonth();
        const anioActual = hoy.getFullYear();
        const inicio = new Date(anioActual, mesActual - 1, 15);
        const fin    = new Date(anioActual, mesActual, 14);
        const fmtFecha = d => d.toLocaleDateString('es-CL', {day:'2-digit',month:'2-digit',year:'numeric'});
        const periodoStr = fmtFecha(inicio) + ' AL ' + fmtFecha(fin);

        // Próximo aumento de puntos
        const dIng = _parseLocalDate(u.FechaIngreso);
        const proxAnio = new Date(dIng);
        proxAnio.setFullYear(hoy.getFullYear() + (hoy >= new Date(hoy.getFullYear(), dIng.getMonth(), dIng.getDate()) ? 1 : 0));
        const proxAumentoStr = proxAnio.toLocaleDateString('es-CL', {day:'2-digit', month:'short'}).toUpperCase();

        // Valor punto promedio
        const vpStr = b.vpPromedio > 0 ? formatMoney(b.vpPromedio) : '—';

        // Filas de anticipos
        const anticipoRows = b.userAnticipos.length > 0
            ? b.userAnticipos.map((a, i) => {
                const fecha = new Date(a.fecha + 'T12:00:00').toLocaleDateString('es-CL', {day:'2-digit',month:'2-digit',year:'numeric'});
                return `<tr>
                    <td style="padding:3px 5px;border-bottom:1px solid #eee;text-align:center;color:#aaa;font-size:9px;">${i+1}</td>
                    <td style="padding:3px 5px;border-bottom:1px solid #eee;color:#2980b9;font-weight:700;font-size:9px;">Anticipo</td>
                    <td style="padding:3px 5px;border-bottom:1px solid #eee;font-size:9px;">${fecha}<br><span style='color:#999;font-size:8px;'>${a.responsable||'Adelanto'}</span></td>
                    <td style="padding:3px 5px;border-bottom:1px solid #eee;text-align:right;font-weight:bold;font-size:9px;">-${formatMoney(a.cantidad)}</td>
                </tr>`;
            }).join('')
            : `<tr><td colspan="4" style="text-align:center;padding:6px;color:#aaa;font-size:9px;">Sin anticipos en este período</td></tr>`;

        const html = `<!DOCTYPE html>
<html><head><title>Comprobante ${u.Nombre} ${u.Apellido} - ${fechaEmision}</title>
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family: Arial, sans-serif; font-size: 10px; color:#000; background:white; }
.page { width:80mm; margin:0 auto; padding:8px; }
.header { text-align:center; border:2px solid #000; padding:8px; margin-bottom:10px; }
.header h1 { font-size:12px; font-weight:bold; letter-spacing:1px; }
.section-title { text-align:center; font-weight:bold; font-size:10px; border-bottom:1px solid #000; padding-bottom:2px; margin:8px 0 5px; letter-spacing:1px; }
.row { display:flex; justify-content:space-between; padding:2px 0; border-bottom:1px solid #eee; }
.row.big { font-size:18px; font-weight:900; border-top:2px solid #000; border-bottom:2px solid #000; margin:5px 0; padding:5px 0; justify-content:center; }
table { width:100%; border-collapse:collapse; font-size:8px; }
th { background:#f0f0f0; padding:2px; border-bottom:1px solid #ccc; }
.divider { border-top:1px solid #000; margin:5px 0; }
.copy-label { text-align:center; font-size:8px; font-weight:bold; background:#000; color:white; padding:2px; margin-bottom:5px; }
.firmas { display:flex; gap:10px; margin-top:20px; }
.firma-box { flex:1; text-align:center; }
.firma-linea { border-top:1px solid #000; margin-bottom:4px; margin-top:15px; }
.firma-label { font-size:7px; color:#555; }
.footer { text-align:center; font-size:7px; color:#888; margin-top:5px; }
@media print { @page { margin:2mm; size:80mm auto; } }
</style>
<script>window.onload=function(){setTimeout(function(){window.print();},400);}<\/script>
</head><body><div class='page'>
    <div class='copy-label'>★ COMPROBANTE SOCIO ★</div>
    <div class='header'>
        <h1>FONDO DE SOLIDARIDAD</h1>
        <p>CASINO DE PTO. VARAS</p>
        <p>LEY 17312 DEL 29/07/70</p>
        <p><strong>PUERTO VARAS</strong></p>
    </div>
    <div class='section-title'>DATOS</div>
    <div class='row'><label>NOMBRE</label><strong>${escHtml((u.Nombre+' '+u.Apellido).toUpperCase())}</strong></div>
    <div class='row'><label>ÁREA</label><span>${escHtml(u.Area.toUpperCase())}</span></div>
    <div class='row'><label>CONTRATO</label><span>${escHtml(u.TipoContrato.toUpperCase())}</span></div>
    <div class='row'><label>AÑO INGRESO</label><span>${_parseLocalDate(u.FechaIngreso).getFullYear()}</span></div>
    <div class='row'><label>PUNTOS</label><span>${b.pts}</span></div>
    <div class='row'><label>SUBE PUNTOS</label><span>${proxAumentoStr}</span></div>
    <div class='divider'></div>
    <div class='section-title'>CIERRE PUNTO</div>
    <div class='row'><label>MIS PUNTOS</label><span>${Math.round(b.puntoGlobalTotal).toLocaleString('es-CL')}</span></div>
    <div class='divider'></div>
    <div class='section-title'>DETALLE</div>
    <div class='row'><label>BRUTO (Alcance)</label><span>${formatMoney(b.propinaBruta)}</span></div>
    <div class='row'><label>ANTICIPOS</label><span>${formatMoney(b.tAnt)}</span></div>
    <div class='row'><label>SALDO ANTERIOR</label><span>${formatMoney(b.sAnt)}</span></div>
    <div class='row'><label>SALDO REAL</label><strong>${formatMoney(b.propinaBruta + b.sAnt - b.tAnt)}</strong></div>
    <div class='divider'></div>
    <div style='text-align:center;font-size:9px;font-weight:bold;margin-top:6px;letter-spacing:1px;'>TOTAL A COBRAR</div>
    <div class='row big'><span>${formatMoney(b.liquido)}</span></div>
    <div class='row'><label>REMANENTE</label><span>${formatMoney(b.remanente)}</span></div>
    <div class='divider'></div>
    <div class='section-title'>MOVIMIENTOS / RESPONSABLES</div>
    <table><thead><tr><th>#</th><th>Tipo</th><th>Detalle</th><th>Monto</th></tr></thead>
    <tbody>${anticipoRows}</tbody></table>
    <div class='divider'></div>
    <div style='text-align:center;font-weight:bold;font-size:10px;margin:4px 0;'>PERÍODO ${periodoStr}</div>
    <div class='firmas'>
        <div class='firma-box'><div class='firma-linea'></div><div class='firma-nombre'>${escHtml((u.Nombre+' '+u.Apellido).toUpperCase())}</div><div class='firma-label'>FIRMA SOCIO</div></div>
    </div>
    <div class='footer'>Emitido: ${fechaEmision} | Sistema Fondo Solidario | CarlosPN Interactive®</div>
</div></body></html>`;

        // Abrir en nueva ventana e imprimir/guardar
        const win = window.open('', '_blank');
        if (win) {
            win.document.write(html);
            win.document.close();
        } else {
            // Fallback: descarga directa como archivo HTML
            const blob = new Blob([html], {type:'text/html;charset=utf-8'});
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'Comprobante_' + u.Nombre + '_' + u.Apellido + '_' + fechaEmision.replace(/\//g,'-') + '.html';
            a.click();
        }
    }

    function toggleAbout(show) {
        const m = document.getElementById('aboutModal');
        if (show) { m.classList.remove('hidden'); m.classList.add('flex'); _initAboutSwipe(); }
        else       { m.classList.add('hidden');    m.classList.remove('flex'); }
    }
    // El asa (raya) del modal "Acerca de": tocarla cierra (onclick en el HTML) y
    // deslizarla hacia abajo también cierra. IMPORTANTE: no se aplica `transform`
    // al sheet — eso rompía la fusión (mix-blend-mode) del logo y lo volvía blanco.
    let _aboutSwipeInit = false;
    function _initAboutSwipe() {
        if (_aboutSwipeInit) return;
        const zone = document.getElementById('aboutHandleZone');
        if (!zone) return;
        _aboutSwipeInit = true;
        let startY = null;
        zone.addEventListener('touchstart', e => { startY = e.touches[0].clientY; }, { passive: true });
        zone.addEventListener('touchmove', e => {
            if (startY === null) return;
            if ((e.touches[0].clientY - startY) > 55) { startY = null; toggleAbout(false); } // deslizó hacia abajo → cerrar
        }, { passive: true });
        zone.addEventListener('touchend', () => { startY = null; });
        zone.addEventListener('touchcancel', () => { startY = null; });
    }


    // ── ESTADÍSTICAS ──────────────────────────────────────────
    let statsView = 'dia';
    let statsMapVP = {};   // mapVP del período: { fecha: {totalVP, montoReal} }
    let statsPts = 0;      // puntos del usuario
    let statsChart = null; // instancia del canvas

    function setStatsView(v) {
        statsView = v;
        ['dia','semana','mes'].forEach(k => {
            const btn = document.getElementById(`stats-btn-${k}`);
            if (k === v) {
                btn.className = 'flex-1 py-2.5 rounded-2xl text-[11px] font-bold transition-all bg-lm-primary text-white';
            } else {
                btn.className = 'flex-1 py-2.5 rounded-2xl text-[11px] font-bold transition-all bg-lm-subtle text-lm-muted border border-lm-border';
            }
        });
        renderStatsChart();
        renderStatsTable();
    }

    function getPeriodo() {
        // Período: del 15 del mes anterior (o actual) al 14 del mes siguiente
        const hoy = new Date();
        let inicio, fin;
        if (hoy.getDate() >= 15) {
            inicio = new Date(hoy.getFullYear(), hoy.getMonth(), 15);
            fin    = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 14);
        } else {
            inicio = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 15);
            fin    = new Date(hoy.getFullYear(), hoy.getMonth(), 14);
        }
        return { inicio, fin };
    }

    // Si el período actual no tiene datos, retrocede al período anterior
    function getActivePeriodo(mapVP) {
        const { inicio, fin } = getPeriodo();
        const hoyReal = new Date(); hoyReal.setHours(0,0,0,0);
        if (!mapVP || Object.keys(mapVP).length === 0) return { inicio, fin, hoy: hoyReal };
        const hayDatos = Object.keys(mapVP).some(f => {
            const fd = new Date(f + 'T12:00:00');
            return fd >= inicio && fd <= fin;
        });
        if (hayDatos) return { inicio, fin, hoy: hoyReal };
        // Período anterior
        const pInicio = new Date(inicio.getFullYear(), inicio.getMonth() - 1, 15);
        const pFin    = new Date(fin.getFullYear(),   fin.getMonth() - 1,   14);
        return { inicio: pInicio, fin: pFin, hoy: new Date(pFin) };
    }

    function toDateStr(d) {
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    }

    function renderStats(mapVP, pts) {
        // Guardar para re-render al cambiar vista
        statsMapVP = mapVP;
        statsPts   = pts;

        const { inicio, fin, hoy } = getActivePeriodo(mapVP);

        // Etiqueta del período
        const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
        const { inicio: inicioCal } = getPeriodo();
        const esPeriodoAnterior = inicio < inicioCal;
        document.getElementById('stats-periodo-label').textContent =
            `${inicio.getDate()} ${meses[inicio.getMonth()]} → ${fin.getDate()} ${meses[fin.getMonth()]} ${fin.getFullYear()}` +
            (esPeriodoAnterior ? ' (período cerrado)' : '');

        // Construir array de TODOS los días del período
        const diasPeriodo = [];
        let cur = new Date(inicio);
        while (cur <= fin) {
            diasPeriodo.push(toDateStr(cur));
            cur.setDate(cur.getDate() + 1);
        }
        const totalDias = diasPeriodo.length; // 30 o 31

        // Días reales (ya pasaron y tienen dato)
        const diasReales = diasPeriodo.filter(f => {
            const fd = new Date(f + 'T12:00:00');
            return fd <= hoy && mapVP[f];
        });

        // Ganancia real acumulada hasta hoy
        let gananciaReal = 0;
        diasReales.forEach(f => { gananciaReal += (mapVP[f]?.totalVP || 0) * pts; });

        // Días transcurridos (con o sin recaudación)
        const diasTransc = diasPeriodo.filter(f => new Date(f+'T12:00:00') <= hoy).length;
        const diasRest   = totalDias - diasTransc;

        // Promedio diario basado en días CON recaudación
        const promDia = diasReales.length > 0 ? gananciaReal / diasReales.length : 0;
        const promSemana = promDia * 7;

        // Proyección al final del período
        const diasSinDato = diasPeriodo.filter(f => new Date(f+'T12:00:00') > hoy).length;
        const proyeccion   = gananciaReal + (promDia * diasSinDato);

        // Actualizar tarjetas
        document.getElementById('stats-ganado-hoy').textContent       = formatMoney(Math.round(gananciaReal));
        document.getElementById('stats-dias-transcurridos').textContent = `${diasTransc} día${diasTransc!==1?'s':''} transcurrido${diasTransc!==1?'s':''}`;
        document.getElementById('stats-proyeccion').textContent        = formatMoney(Math.round(proyeccion));
        document.getElementById('stats-dias-restantes').textContent    = `${diasSinDato} día${diasSinDato!==1?'s':''} restante${diasSinDato!==1?'s':''}`;
        document.getElementById('stats-prom-dia').textContent          = formatMoney(Math.round(promDia));
        document.getElementById('stats-prom-semana').textContent       = formatMoney(Math.round(promSemana));
        document.getElementById('stats-pts-label').textContent         = `${pts} pts`;

        // ── Valor del Punto general ──────────────────────────────
        // vpAcumulado = suma de totalVP de los días del período hasta hoy
        // (esto es "Mis Puntos" — el acumulado general de 1 punto)
        let vpAcumHoy = 0, diasConVP = 0;
        diasPeriodo.forEach(f => {
            const fd = new Date(f + 'T12:00:00');
            if (fd <= hoy && mapVP[f] && mapVP[f].totalVP > 0) {
                vpAcumHoy += mapVP[f].totalVP;
                diasConVP++;
            }
        });
        const promVPDia   = diasConVP > 0 ? vpAcumHoy / diasConVP : 0;
        const vpProyectado = vpAcumHoy + promVPDia * diasSinDato;

        document.getElementById('stats-vp-hoy').textContent      = formatMoney(Math.round(vpAcumHoy));
        document.getElementById('stats-vp-dias').textContent      = `${diasConVP} día${diasConVP!==1?'s':''} con rec.`;
        document.getElementById('stats-vp-proy').textContent      = formatMoney(Math.round(vpProyectado));
        document.getElementById('stats-vp-prom-dia').textContent  = `Prom/día: ${formatMoney(Math.round(promVPDia))}`;

        renderStatsChart();
        renderStatsTable();
    }

    function renderStatsChart() {
        const canvas = document.getElementById('statsChart');
        if (!canvas || !currentUser) return;
        const ctx = canvas.getContext('2d');
        const { inicio, fin, hoy } = getActivePeriodo(statsMapVP);
        const pts = statsPts;

        // Construir datos según vista
        let labels = [], valoresReales = [], valoresProyectados = [];

        if (statsView === 'dia') {
            document.getElementById('stats-chart-title').textContent = 'Ganancia acumulada por día';
            let cur = new Date(inicio), acum = 0;
            while (cur <= fin) {
                const f = toDateStr(cur);
                const esPasado = cur <= hoy;
                const ganDia   = (statsMapVP[f]?.totalVP || 0) * pts;
                if (esPasado) {
                    acum += ganDia;
                    valoresReales.push(acum);
                    valoresProyectados.push(null);
                } else {
                    valoresReales.push(null);
                    valoresProyectados.push(acum); // mantiene el último real
                }
                labels.push(cur.getDate());
                cur.setDate(cur.getDate() + 1);
            }
            // Rellenar proyección desde último real
            let ultimoReal = 0;
            valoresReales.forEach(v => { if (v !== null) ultimoReal = v; });
            const diasSinDato = fin - hoy > 0 ? Math.ceil((fin - hoy) / 86400000) : 0;
            const promDia = ultimoReal > 0 && hoy > inicio ? ultimoReal / Math.max(1, Math.ceil((hoy - inicio) / 86400000)) : 0;
            let proyAcum = ultimoReal;
            valoresProyectados = valoresProyectados.map((v, i) => {
                if (v === null) return null;
                proyAcum += promDia;
                return Math.round(proyAcum);
            });

        } else if (statsView === 'semana') {
            document.getElementById('stats-chart-title').textContent = 'Ganancia por semana del período';
            let semana = 1, ganSem = 0, count = 0;
            let cur = new Date(inicio);
            while (cur <= fin) {
                const f = toDateStr(cur);
                const esPasado = cur <= hoy;
                if (esPasado) ganSem += (statsMapVP[f]?.totalVP || 0) * pts;
                count++;
                if (count === 7 || cur.getTime() >= fin.getTime()) {
                    labels.push(`Sem ${semana}`);
                    if (esPasado || (new Date(inicio).getDate() + (semana-1)*7) <= hoy.getDate()) {
                        valoresReales.push(Math.round(ganSem));
                        valoresProyectados.push(null);
                    } else {
                        valoresReales.push(null);
                        const prom = valoresReales.filter(x=>x!==null);
                        const avg = prom.length ? prom.reduce((a,b)=>a+b,0)/prom.length : 0;
                        valoresProyectados.push(Math.round(avg));
                    }
                    semana++; ganSem = 0; count = 0;
                }
                cur.setDate(cur.getDate() + 1);
            }

        } else { // mes completo — acumulado diario simple
            document.getElementById('stats-chart-title').textContent = 'Proyección al cierre del período';
            let cur = new Date(inicio), acum = 0, diasCon = 0;
            const diasTotales = Math.ceil((fin - inicio) / 86400000) + 1;
            while (cur <= hoy && cur <= fin) {
                const f = toDateStr(cur);
                const g = (statsMapVP[f]?.totalVP || 0) * pts;
                if (g > 0) { acum += g; diasCon++; }
                cur.setDate(cur.getDate() + 1);
            }
            const promDia = diasCon > 0 ? acum / diasCon : 0;
            // Puntos mensuales: 4 valores — semana 1,2,3 y fin
            [7,14,21,diasTotales].forEach((d,i) => {
                labels.push(`Sem ${i+1}`);
                const diasReal = Math.min(d, Math.ceil((hoy - inicio)/86400000)+1);
                const diasProyect = d - diasReal;
                const val = Math.round(acum * (diasReal/Math.max(diasCon,1)) + promDia * diasProyect);
                if (diasReal >= d) { valoresReales.push(val); valoresProyectados.push(null); }
                else { valoresReales.push(null); valoresProyectados.push(val); }
            });
        }

        // ── Dibujar en Canvas ────────────────────────────────
        const dpr = window.devicePixelRatio || 1;
        canvas.width  = canvas.offsetWidth  * dpr;
        canvas.height = canvas.offsetHeight * dpr;
        ctx.scale(dpr, dpr);
        const W = canvas.offsetWidth, H = canvas.offsetHeight;
        ctx.clearRect(0,0,W,H);

        const allVals = [...valoresReales, ...valoresProyectados].filter(v => v !== null);
        const maxVal  = Math.max(...allVals, 1);
        const minVal  = 0;
        const padL = 52, padR = 16, padT = 16, padB = 30;
        const cW = W - padL - padR, cH = H - padT - padB;
        const n  = labels.length;

        const xPos = i => padL + (i / (n - 1)) * cW;
        const yPos = v => padT + cH - ((v - minVal) / (maxVal - minVal)) * cH;

        // Grid lines
        ctx.strokeStyle = '#e7e8e9'; ctx.lineWidth = 1;
        [0, 0.25, 0.5, 0.75, 1].forEach(t => {
            const y = padT + cH * (1 - t);
            ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
            ctx.fillStyle = '#9ba3ab'; ctx.font = '9px Inter';
            ctx.textAlign = 'right';
            ctx.fillText(formatMoney(Math.round(maxVal * t)).replace('$','$'), padL - 4, y + 3);
        });

        // Línea real
        const realesIdx = valoresReales.map((v,i)=>v!==null?i:-1).filter(i=>i>=0);
        if (realesIdx.length > 1) {
            // Área bajo la curva
            ctx.beginPath();
            ctx.moveTo(xPos(realesIdx[0]), yPos(valoresReales[realesIdx[0]]));
            realesIdx.forEach(i => ctx.lineTo(xPos(i), yPos(valoresReales[i])));
            ctx.lineTo(xPos(realesIdx[realesIdx.length-1]), padT + cH);
            ctx.lineTo(xPos(realesIdx[0]), padT + cH);
            ctx.closePath();
            ctx.fillStyle = 'rgba(0,23,35,0.07)';
            ctx.fill();

            ctx.beginPath();
            ctx.moveTo(xPos(realesIdx[0]), yPos(valoresReales[realesIdx[0]]));
            realesIdx.forEach(i => ctx.lineTo(xPos(i), yPos(valoresReales[i])));
            ctx.strokeStyle = '#001723'; ctx.lineWidth = 2.5;
            ctx.lineJoin = 'round'; ctx.stroke();

            // Puntos
            realesIdx.forEach(i => {
                ctx.beginPath();
                ctx.arc(xPos(i), yPos(valoresReales[i]), 3.5, 0, Math.PI*2);
                ctx.fillStyle = '#001723'; ctx.fill();
            });
        }

        // Línea proyección (punteada)
        const proyIdx = valoresProyectados.map((v,i)=>v!==null?i:-1).filter(i=>i>=0);
        // Empezar desde el último punto real
        const startProyIdx = realesIdx.length > 0 ? realesIdx[realesIdx.length-1] : proyIdx[0];
        if (proyIdx.length > 0) {
            ctx.setLineDash([5, 4]);
            ctx.beginPath();
            if (realesIdx.length > 0 && valoresReales[startProyIdx] !== null) {
                ctx.moveTo(xPos(startProyIdx), yPos(valoresReales[startProyIdx]));
            } else {
                ctx.moveTo(xPos(proyIdx[0]), yPos(valoresProyectados[proyIdx[0]]));
            }
            proyIdx.forEach(i => ctx.lineTo(xPos(i), yPos(valoresProyectados[i])));
            ctx.strokeStyle = '#264b5f'; ctx.lineWidth = 2;
            ctx.stroke();
            ctx.setLineDash([]);

            // Punto final proyectado
            const last = proyIdx[proyIdx.length-1];
            ctx.beginPath();
            ctx.arc(xPos(last), yPos(valoresProyectados[last]), 4, 0, Math.PI*2);
            ctx.fillStyle = '#264b5f'; ctx.fill();
        }

        // Etiquetas eje X
        ctx.fillStyle = '#9ba3ab'; ctx.font = '9px Inter'; ctx.textAlign = 'center';
        const step = statsView === 'dia' ? Math.ceil(n / 8) : 1;
        labels.forEach((l, i) => {
            if (i % step === 0 || i === n-1) {
                ctx.fillText(l, xPos(i), H - 6);
            }
        });
    }

    function renderStatsTable() {
        const container = document.getElementById('stats-table');
        if (!container) return;
        const { inicio, fin, hoy } = getActivePeriodo(statsMapVP);
        const pts = statsPts;
        const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

        if (statsView === 'dia') {
            const dias = [];
            let cur = new Date(inicio);
            while (cur <= fin) {
                dias.push(new Date(cur));
                cur.setDate(cur.getDate() + 1);
            }
            const promDia = (() => {
                let ac = 0, cnt = 0;
                dias.forEach(d => {
                    const f = toDateStr(d);
                    if (d <= hoy && statsMapVP[f]) { ac += (statsMapVP[f].totalVP || 0) * pts; cnt++; }
                });
                return cnt > 0 ? ac / cnt : 0;
            })();

            container.innerHTML = dias.map(d => {
                const f = toDateStr(d);
                const esPasado = d <= hoy;
                const esHoy    = toDateStr(d) === toDateStr(hoy);
                const ganancia = esPasado && statsMapVP[f] ? Math.round((statsMapVP[f].totalVP || 0) * pts) : null;
                const esProy   = !esPasado;
                const dia = d.getDate();
                const mes = meses[d.getMonth()];
                return `<div class="flex items-center justify-between bg-lm-card border ${esHoy?'border-lm-primary':'border-lm-border'} rounded-2xl px-4 py-3 ${esHoy?'ring-1 ring-lm-primary/20':''}">
                    <div class="flex items-center gap-3">
                        <div class="w-9 h-9 rounded-xl flex items-center justify-center ${esHoy?'bg-lm-primary text-white':esProy?'bg-lm-subtle text-lm-muted':'bg-lm-high text-lm-primary'} text-[11px] font-bold">${dia}</div>
                        <div>
                            <p class="text-sm font-semibold text-lm-primary">${dia} ${mes}</p>
                            <p class="text-[10px] text-lm-muted">${esHoy?'Hoy':esProy?'Proyectado':'Real'}</p>
                        </div>
                    </div>
                    <div class="text-right">
                        ${ganancia !== null
                            ? `<p class="text-sm font-bold text-lm-green">+${formatMoney(ganancia)}</p>`
                            : esProy
                                ? `<p class="text-sm font-bold text-lm-muted">${formatMoney(Math.round(promDia))}</p>`
                                : `<p class="text-xs text-lm-muted">Sin recaudación</p>`
                        }
                    </div>
                </div>`;
            }).join('');

        } else if (statsView === 'semana') {
            let semana = 1, rows = '';
            let cur = new Date(inicio), ganSem = 0, diasSem = 0, esProySem = false;
            while (cur <= fin) {
                const f = toDateStr(cur);
                const esPasado = cur <= hoy;
                if (!esPasado) esProySem = true;
                if (esPasado && statsMapVP[f]) ganSem += (statsMapVP[f].totalVP || 0) * pts;
                diasSem++;
                if (diasSem === 7 || cur.getTime() >= fin.getTime()) {
                    rows += `<div class="flex items-center justify-between bg-lm-card border border-lm-border rounded-2xl px-4 py-3">
                        <div class="flex items-center gap-3">
                            <div class="w-9 h-9 rounded-xl flex items-center justify-center ${esProySem?'bg-lm-subtle text-lm-muted':'bg-lm-primary text-white'} text-[11px] font-bold">S${semana}</div>
                            <div>
                                <p class="text-sm font-semibold text-lm-primary">Semana ${semana}</p>
                                <p class="text-[10px] text-lm-muted">${diasSem} día${diasSem!==1?'s':''} · ${esProySem?'Proyectado':'Real'}</p>
                            </div>
                        </div>
                        <p class="text-sm font-bold ${esProySem?'text-lm-muted':'text-lm-green'}">${formatMoney(Math.round(ganSem))}</p>
                    </div>`;
                    semana++; ganSem = 0; diasSem = 0; esProySem = false;
                }
                cur.setDate(cur.getDate() + 1);
            }
            container.innerHTML = rows;

        } else { // mes completo
            let ganReal = 0, diasCon = 0;
            let cur = new Date(inicio);
            while (cur <= hoy && cur <= fin) {
                const f = toDateStr(cur);
                if (statsMapVP[f]) { ganReal += (statsMapVP[f].totalVP||0) * pts; diasCon++; }
                cur.setDate(cur.getDate() + 1);
            }
            const diasTot = Math.ceil((fin - inicio)/86400000) + 1;
            const diasRest = diasTot - Math.ceil((hoy - inicio)/86400000) - 1;
            const promDia  = diasCon > 0 ? ganReal / diasCon : 0;
            const proyFin  = ganReal + promDia * Math.max(0, diasRest);
            const pct      = Math.round((ganReal / Math.max(proyFin, 1)) * 100);

            container.innerHTML = `
            <div class="bg-lm-card border border-lm-border rounded-[20px] p-5">
                <div class="flex justify-between items-center mb-4">
                    <div>
                        <p class="text-[10px] text-lm-muted font-bold uppercase tracking-widest mb-1">Progreso del período</p>
                        <p class="text-2xl font-extrabold text-lm-primary font-headline">${pct}%</p>
                    </div>
                    <div class="text-right">
                        <p class="text-[10px] text-lm-muted font-bold uppercase tracking-widest mb-1">Al cierre</p>
                        <p class="text-xl font-extrabold text-lm-accent font-headline">${formatMoney(Math.round(proyFin))}</p>
                    </div>
                </div>
                <div class="w-full h-2 bg-lm-high rounded-full overflow-hidden mb-5">
                    <div class="h-full bg-lm-primary rounded-full transition-all" style="width:${pct}%"></div>
                </div>
                <div class="grid grid-cols-3 gap-3 text-center">
                    <div class="bg-lm-subtle rounded-2xl p-3">
                        <p class="text-[9px] text-lm-muted font-bold uppercase mb-1">Días con rec.</p>
                        <p class="text-base font-extrabold text-lm-primary">${diasCon}</p>
                    </div>
                    <div class="bg-lm-subtle rounded-2xl p-3">
                        <p class="text-[9px] text-lm-muted font-bold uppercase mb-1">Días restantes</p>
                        <p class="text-base font-extrabold text-lm-primary">${Math.max(0,diasRest)}</p>
                    </div>
                    <div class="bg-lm-subtle rounded-2xl p-3">
                        <p class="text-[9px] text-lm-muted font-bold uppercase mb-1">Prom. diario</p>
                        <p class="text-base font-extrabold text-lm-primary">${formatMoney(Math.round(promDia))}</p>
                    </div>
                </div>
            </div>`;
        }
    }

    // ── AYUDA / ONBOARDING ────────────────────────────────────
    const helpSlides = [
        {
            icon: 'waving_hand',
            color: '#001723',
            title: '¡Bienvenido a tu App del Fondo!',
            body: 'Esta aplicación es <b>tu herramienta personal</b> del Fondo Solidario de Propina del Casino de Puerto Varas.<br><br>Acá podrás ver en todo momento <b>cuánto dinero te corresponde cobrar</b>, revisar el detalle de las recaudaciones, ver tus datos como socio y comunicarte con el equipo.<br><br>Esta guía te explicará cada sección paso a paso. No te preocupes si nunca has usado una app así — es muy sencillo.',
            preview: `
              <div style="background:linear-gradient(135deg,#001723,#002d40,#264b5f);border-radius:18px;padding:18px;position:relative;overflow:hidden;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
                  <div style="display:flex;align-items:center;gap:8px;">
                    <div style="width:32px;height:32px;border-radius:10px;background:rgba(255,255,255,0.15);display:flex;align-items:center;justify-content:center;font-weight:700;color:#fff;font-size:13px;">J</div>
                    <div><div style="font-size:9px;color:rgba(255,255,255,0.45)">Bienvenido</div><div style="font-size:12px;color:#fff;font-weight:600">Juan Pérez</div></div>
                  </div>
                  <div style="display:flex;gap:6px;">
                    <div style="width:28px;height:28px;border-radius:8px;background:rgba(255,255,255,0.1);display:flex;align-items:center;justify-content:center;"><span class="material-symbols-outlined" style="font-size:14px;color:rgba(255,255,255,0.6)">help</span></div>
                    <div style="width:28px;height:28px;border-radius:8px;background:rgba(255,255,255,0.1);display:flex;align-items:center;justify-content:center;"><span class="material-symbols-outlined" style="font-size:14px;color:rgba(255,255,255,0.6)">logout</span></div>
                  </div>
                </div>
                <div style="display:flex;justify-content:space-around;border-top:1px solid rgba(255,255,255,0.08);padding-top:12px;">
                  <div style="text-align:center;"><span class="material-symbols-outlined" style="font-size:18px;color:#fff">account_balance_wallet</span><div style="font-size:9px;color:rgba(255,255,255,0.5);margin-top:2px">Balance</div></div>
                  <div style="text-align:center;"><span class="material-symbols-outlined" style="font-size:18px;color:rgba(255,255,255,0.35)">receipt_long</span><div style="font-size:9px;color:rgba(255,255,255,0.35);margin-top:2px">Historial</div></div>
                  <div style="text-align:center;"><span class="material-symbols-outlined" style="font-size:18px;color:rgba(255,255,255,0.35)">bar_chart</span><div style="font-size:9px;color:rgba(255,255,255,0.35);margin-top:2px">Stats</div></div>
                  <div style="text-align:center;"><span class="material-symbols-outlined" style="font-size:18px;color:rgba(255,255,255,0.35)">chat</span><div style="font-size:9px;color:rgba(255,255,255,0.35);margin-top:2px">Mensajes</div></div>
                  <div style="text-align:center;"><span class="material-symbols-outlined" style="font-size:18px;color:rgba(255,255,255,0.35)">badge</span><div style="font-size:9px;color:rgba(255,255,255,0.35);margin-top:2px">Perfil</div></div>
                </div>
              </div>`
        },
        {
            icon: 'account_balance_wallet',
            color: '#001723',
            title: 'Balance — ¿Cuánto me toca cobrar?',
            body: 'Esta es la primera pantalla que verás al entrar. El <b>número grande</b> es el dinero que te corresponde cobrar en este período.<br><br>Debajo del monto principal encontrarás <b>dos tarjetas</b>:<br><br>💰 <b>Remanente:</b> El sobrante si tu monto no termina en número redondo — ese dinero pasa al próximo período y no se pierde.<br><br>⭐ <b>Valor punto por noche:</b> Cuánto vale cada punto de propina en el período actual. A mayor recaudación del casino, mayor será este valor.',
            preview: `
              <div style="background:linear-gradient(135deg,#001723,#002d40,#264b5f);border-radius:18px;padding:18px;">
                <div style="font-size:9px;color:rgba(255,255,255,0.45);text-transform:uppercase;letter-spacing:0.1em;margin-bottom:4px;">Balance a Recibir</div>
                <div style="font-size:30px;font-weight:800;color:#fff;font-family:Manrope,sans-serif;margin-bottom:14px;">$148.000</div>
                <div style="display:flex;gap:8px;">
                  <div style="flex:1;background:rgba(255,255,255,0.1);border-radius:14px;padding:10px 12px;border:1px solid rgba(255,255,255,0.12);">
                    <div style="display:flex;align-items:center;gap:5px;margin-bottom:5px;">
                      <span class="material-symbols-outlined" style="font-size:13px;color:rgba(255,255,255,0.6)">savings</span>
                      <span style="font-size:8px;font-weight:700;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:0.05em">Remanente</span>
                    </div>
                    <div style="font-size:17px;font-weight:700;color:#fff">$420</div>
                  </div>
                  <div style="flex:1;background:rgba(255,255,255,0.1);border-radius:14px;padding:10px 12px;border:1px solid rgba(255,255,255,0.12);">
                    <div style="display:flex;align-items:center;gap:5px;margin-bottom:5px;">
                      <span class="material-symbols-outlined" style="font-size:13px;color:rgba(255,255,255,0.6)">stars</span>
                      <span style="font-size:8px;font-weight:700;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:0.05em">Valor punto</span>
                    </div>
                    <div style="font-size:17px;font-weight:700;color:#fff">$1.600</div>
                  </div>
                </div>
              </div>`
        },
        {
            icon: 'percent',
            color: '#264b5f',
            title: '¿Cómo se calcula ese monto?',
            body: 'Tu balance se calcula sumando y restando tres cosas que ves en el <b>Resumen Contable</b>:<br><br>✅ <b>Total Bruto:</b> Lo que generaste según tus puntos y lo recaudado.<br>✅ <b>Saldo Anterior:</b> Si quedó algo pendiente del mes pasado, se suma aquí.<br>❌ <b>Descuentos / Anticipos:</b> Lo que ya retiraste o se descontó — se resta del total.<br><br>El resultado de esa operación es tu monto final a cobrar.',
            preview: `
              <div style="background:#fff;border:1px solid #e1e3e4;border-radius:18px;overflow:hidden;">
                <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 14px;border-bottom:1px solid #f3f4f5;">
                  <div style="display:flex;align-items:center;gap:8px;">
                    <div style="width:30px;height:30px;background:rgba(38,75,95,0.1);border-radius:8px;display:flex;align-items:center;justify-content:center;"><span class="material-symbols-outlined" style="font-size:14px;color:#264b5f">percent</span></div>
                    <div><div style="font-size:11px;color:#191c1d;font-weight:500">Total Bruto (10 pts)</div><div style="font-size:9px;color:#9ba3ab">Lo que generaste</div></div>
                  </div>
                  <b style="font-size:12px;color:#191c1d">$160.000</b>
                </div>
                <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 14px;border-bottom:1px solid #f3f4f5;">
                  <div style="display:flex;align-items:center;gap:8px;">
                    <div style="width:30px;height:30px;background:rgba(0,106,98,0.1);border-radius:8px;display:flex;align-items:center;justify-content:center;"><span class="material-symbols-outlined" style="font-size:14px;color:#006a62">account_balance</span></div>
                    <div><div style="font-size:11px;color:#191c1d;font-weight:500">Saldo Anterior</div><div style="font-size:9px;color:#9ba3ab">Del período pasado</div></div>
                  </div>
                  <b style="font-size:12px;color:#191c1d">+ $8.000</b>
                </div>
                <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 14px;">
                  <div style="display:flex;align-items:center;gap:8px;">
                    <div style="width:30px;height:30px;background:rgba(186,26,26,0.08);border-radius:8px;display:flex;align-items:center;justify-content:center;"><span class="material-symbols-outlined" style="font-size:14px;color:#ba1a1a">remove_circle</span></div>
                    <div><div style="font-size:11px;color:#191c1d;font-weight:500">Descuentos / Anticipos</div><div style="font-size:9px;color:#9ba3ab">Lo que ya retiraste</div></div>
                  </div>
                  <b style="font-size:12px;color:#ba1a1a">- $20.000</b>
                </div>
              </div>`
        },
        {
            icon: 'remove_circle',
            color: '#ba1a1a',
            title: 'Anticipos y Descuentos',
            body: 'En la parte de abajo del Balance, en <b>Últimos Movimientos</b>, verás una lista de cada anticipo o descuento aplicado a tu cuenta en este período.<br><br>🔸 <b>Anticipo:</b> Es plata que retiraste antes de la liquidación oficial del mes. Se descuenta de tu total.<br>🔸 <b>Descuento personal:</b> Algún cargo específico registrado a tu nombre.<br><br>Si ves algo que no reconoces o crees que es un error, escríbele al equipo por Mensajes.',
            preview: `
              <div>
                <div style="font-size:9px;color:#9ba3ab;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:8px;">Últimos Movimientos</div>
                <div style="display:flex;flex-direction:column;gap:6px;">
                  <div style="display:flex;align-items:center;gap:10px;background:#fff;border:1px solid #e7e8e9;border-radius:14px;padding:10px 12px;">
                    <div style="width:34px;height:34px;background:rgba(186,26,26,0.08);border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0;"><span class="material-symbols-outlined" style="font-size:16px;color:#ba1a1a">arrow_downward</span></div>
                    <div style="flex:1;"><div style="font-size:12px;font-weight:600;color:#191c1d">Anticipo solicitado</div><div style="font-size:10px;color:#9ba3ab">25-03-2026</div></div>
                    <b style="font-size:12px;color:#ba1a1a;white-space:nowrap">-$20.000</b>
                  </div>
                  <div style="display:flex;align-items:center;gap:10px;background:#fff;border:1px solid #e7e8e9;border-radius:14px;padding:10px 12px;">
                    <div style="width:34px;height:34px;background:rgba(186,26,26,0.08);border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0;"><span class="material-symbols-outlined" style="font-size:16px;color:#ba1a1a">arrow_downward</span></div>
                    <div style="flex:1;"><div style="font-size:12px;font-weight:600;color:#191c1d">Descuento personal</div><div style="font-size:10px;color:#9ba3ab">18-03-2026</div></div>
                    <b style="font-size:12px;color:#ba1a1a;white-space:nowrap">-$5.000</b>
                  </div>
                </div>
              </div>`
        },
        {
            icon: 'add_circle',
            color: '#6366f1',
            title: 'Registrar la Recaudación del Día',
            body: 'En el Balance hay un botón morado <b>"Recaudación del Día"</b>. Sirve para registrar lo recaudado en la noche <b>directamente desde tu app</b>, aunque no tengas la app de Recaudaciones Diarias instalada.<br><br>Al tocarlo se abre un formulario donde eliges:<br><br>🏷️ <b>Categoría:</b> TarjetaMDA, EfectivoMDA, SalaDeJuegos o Bóveda.<br>📅 <b>Fecha</b> y 💵 <b>Monto</b> recaudado.<br>➗ <b>Divisor</b> (opcional): si no lo sabes, déjalo en blanco.<br><br>Arriba verás el <b>total de puntos</b> del reparto como dato de referencia.<br><br>📄 Dentro del mismo formulario hay un botón <b>"Abrir Diario de Recaudación"</b> que te lleva al <b>diario completo</b> de recaudaciones. Así entre todos mantienen la información al día.',
            preview: `
              <div>
                <div style="display:flex;gap:8px;margin-bottom:12px;">
                  <div style="flex:1;background:linear-gradient(135deg,#6366f1,#8b5cf6);border-radius:14px;padding:11px;text-align:center;color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;gap:5px;box-shadow:0 4px 12px rgba(99,102,241,0.3);"><span class="material-symbols-outlined" style="font-size:15px">add_circle</span>Recaudación del Día</div>
                  <div style="flex:1;background:linear-gradient(135deg,#0ea5e9,#0284c7);border-radius:14px;padding:11px;text-align:center;color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;gap:5px;box-shadow:0 4px 12px rgba(14,165,233,0.3);"><span class="material-symbols-outlined" style="font-size:15px">request_quote</span>Solicitar Egreso</div>
                </div>
                <div style="background:#fff;border:1px solid #e1e3e4;border-radius:16px;padding:12px;">
                  <div style="font-size:9px;color:#94a3b8;font-weight:800;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:7px;">Categoría</div>
                  <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:10px;">
                    <div style="background:#eef2ff;border:1px solid #c7d2fe;border-radius:9px;padding:6px;text-align:center;font-size:10px;font-weight:700;color:#4338ca;">💳 TarjetaMDA</div>
                    <div style="background:#f3f4f5;border:1px solid #e2e8f0;border-radius:9px;padding:6px;text-align:center;font-size:10px;font-weight:600;color:#64748b;">💵 EfectivoMDA</div>
                  </div>
                  <div style="font-size:9px;color:#94a3b8;font-weight:800;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px;">Monto</div>
                  <div style="background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:10px;padding:9px 11px;font-size:14px;font-weight:800;color:#1e293b;">$6.400.000</div>
                </div>
              </div>`
        },
        {
            icon: 'request_quote',
            color: '#0284c7',
            title: 'Solicitar un Egreso (anticipo)',
            body: 'Junto al botón anterior está <b>"Solicitar Egreso"</b> (celeste). Con él puedes pedir un <b>anticipo de propina</b> sin tener que ir presencialmente.<br><br>Solo ingresas el <b>monto</b> que necesitas y, si quieres, un <b>motivo</b>. Tu solicitud le llega a la administración como <b>pendiente</b>.<br><br>⏳ Mientras no la procesen, verás en tu Balance una tarjeta <b>"Egreso solicitado · pendiente"</b>.<br><br>✅ Cuando la administración la registre, se convertirá en un anticipo normal y aparecerá descontado en tu Balance, en <b>Últimos Movimientos</b>.',
            preview: `
              <div>
                <div style="background:#f8fafc;border-radius:16px;padding:14px;border:1px solid #e1e3e4;margin-bottom:10px;">
                  <div style="font-size:13px;font-weight:800;color:#1e293b;margin-bottom:8px;">Solicitar Egreso</div>
                  <div style="font-size:9px;color:#94a3b8;font-weight:800;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px;">Monto solicitado</div>
                  <div style="background:#fff;border:1.5px solid #e2e8f0;border-radius:10px;padding:9px 11px;font-size:15px;font-weight:800;color:#1e293b;margin-bottom:10px;">$50.000</div>
                  <div style="background:linear-gradient(135deg,#0ea5e9,#0284c7);border-radius:12px;padding:10px;text-align:center;color:#fff;font-size:12px;font-weight:700;">Enviar solicitud</div>
                </div>
                <div style="background:#e0f2fe;border:1px solid #7dd3fc;border-radius:14px;padding:11px 13px;display:flex;align-items:center;gap:10px;">
                  <span class="material-symbols-outlined" style="font-size:20px;color:#0284c7">hourglass_top</span>
                  <div><div style="font-size:11px;font-weight:800;color:#075985">Egreso solicitado · pendiente</div><div style="font-size:10px;color:#0369a1;margin-top:1px">$50.000 — esperando a la administración</div></div>
                </div>
              </div>`
        },
        {
            icon: 'receipt_long',
            color: '#006a62',
            title: 'Historial — El detalle día a día',
            body: 'En la sección <b>Historial</b> tienes dos vistas que cambias con los botones de arriba:<br><br>📋 <b>Rendimientos:</b> El detalle día a día — cada fecha muestra lo que entró al casino, y abajo ves tu <b>Valor Punto</b>, <b>Mis Puntos</b> y <b>Ganancia</b> de ese día.<br><br>🗂 <b>Anticipos Anteriores:</b> Todos los anticipos de períodos pasados, con filtros por año y mes.<br><br>🟢 Verde (flecha arriba) = ese día suma a tu propina · Sin color = ese día no suma (ausencia o Part-Time).',
            preview: `
              <div>
                <div style="background:#f1f5f9;border-radius:14px;padding:3px;display:flex;gap:3px;margin-bottom:10px;">
                  <div style="flex:1;background:#001723;color:#fff;border-radius:11px;padding:7px;font-size:11px;font-weight:700;text-align:center;">Rendimientos</div>
                  <div style="flex:1;color:#94a3b8;border-radius:11px;padding:7px;font-size:11px;font-weight:600;text-align:center;">Anticipos Ant.</div>
                </div>
                <div style="background:#fff;border-radius:14px;box-shadow:0 1px 4px rgba(0,0,0,0.08);overflow:hidden;">
                  <div style="background:rgba(16,185,129,0.06);border-bottom:1px solid rgba(16,185,129,0.15);padding:10px 12px;display:flex;align-items:center;gap:8px;">
                    <div style="width:28px;height:28px;border-radius:8px;background:rgba(16,185,129,0.12);display:flex;align-items:center;justify-content:center;"><span class="material-symbols-outlined" style="font-size:14px;color:#10b981">trending_up</span></div>
                    <div><div style="font-size:11px;font-weight:700;color:#001723">Vie 28 Mar 2026</div><div style="font-size:9px;color:#94a3b8">3 entradas · $6.400.000</div></div>
                  </div>
                  <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px;padding:8px 12px;">
                    <div style="background:#f1f5f9;border-radius:8px;padding:5px;text-align:center;"><div style="font-size:7px;color:#94a3b8;font-weight:700">VALOR PTO</div><div style="font-size:11px;font-weight:700;color:#6366f1">$1.600</div></div>
                    <div style="background:#f1f5f9;border-radius:8px;padding:5px;text-align:center;"><div style="font-size:7px;color:#94a3b8;font-weight:700">MIS PTS</div><div style="font-size:11px;font-weight:700;color:#001723">10</div></div>
                    <div style="background:rgba(16,185,129,0.08);border-radius:8px;padding:5px;text-align:center;"><div style="font-size:7px;color:#94a3b8;font-weight:700">GANANCIA</div><div style="font-size:11px;font-weight:700;color:#10b981">$16.000</div></div>
                  </div>
                </div>
              </div>`
        },
        {
            icon: 'folder_open',
            color: '#264b5f',
            title: 'Anticipos Anteriores — Historial de períodos pasados',
            body: 'En <b>Historial → Anticipos Anteriores</b> puedes revisar todos los anticipos que solicitaste en meses y años pasados, todo en un solo lugar.<br><br>📅 <b>Filtro por año:</b> Si tienes anticipos de varios años aparecen botones para filtrar. Toca un año para ver solo ese período.<br><br>📆 <b>Filtro por mes:</b> Al seleccionar un año específico aparecen los meses disponibles para acotar aún más la búsqueda.<br><br>📂 <b>Acordeón por período:</b> Cada período aparece como una tarjeta que puedes expandir tocándola para ver el detalle: fecha, monto y responsable de cada anticipo.',
            preview: `
              <div>
                <div style="display:flex;gap:5px;margin-bottom:6px;">
                  <div style="background:#001723;color:#fff;border-radius:20px;padding:4px 10px;font-size:10px;font-weight:700;white-space:nowrap">Todos</div>
                  <div style="background:#fff;border:1px solid #e1e3e4;color:#94a3b8;border-radius:20px;padding:4px 10px;font-size:10px;font-weight:600;white-space:nowrap">2025</div>
                  <div style="background:#fff;border:1px solid #e1e3e4;color:#94a3b8;border-radius:20px;padding:4px 10px;font-size:10px;font-weight:600;white-space:nowrap">2024</div>
                </div>
                <div style="display:flex;gap:5px;margin-bottom:10px;">
                  <div style="background:#001723;color:#fff;border-radius:20px;padding:4px 10px;font-size:10px;font-weight:700;white-space:nowrap">Todos</div>
                  <div style="background:#fff;border:1px solid #e1e3e4;color:#94a3b8;border-radius:20px;padding:4px 10px;font-size:10px;font-weight:600;white-space:nowrap">Enero</div>
                  <div style="background:#fff;border:1px solid #e1e3e4;color:#94a3b8;border-radius:20px;padding:4px 10px;font-size:10px;font-weight:600;white-space:nowrap">Marzo</div>
                </div>
                <div style="display:flex;flex-direction:column;gap:6px;">
                  <div style="background:#fff;border:1px solid #e1e3e4;border-radius:14px;overflow:hidden;">
                    <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;">
                      <div style="display:flex;align-items:center;gap:6px;">
                        <span class="material-symbols-outlined" style="font-size:14px;color:#264b5f">folder_open</span>
                        <span style="font-size:12px;font-weight:700;color:#001723">Cierre 2025-03</span>
                        <span style="font-size:9px;color:#94a3b8">2 anticipos</span>
                      </div>
                      <div style="display:flex;align-items:center;gap:4px;">
                        <span style="font-size:11px;font-weight:700;color:#ba1a1a">-$45.000</span>
                        <span class="material-symbols-outlined" style="font-size:15px;color:#94a3b8">expand_less</span>
                      </div>
                    </div>
                    <div style="border-top:1px solid #f1f5f9;padding:0 12px;">
                      <div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #f8fafc;"><span style="font-size:11px;color:#001723">15/03/2025</span><span style="font-size:11px;font-weight:700;color:#ba1a1a">-$25.000</span></div>
                      <div style="display:flex;justify-content:space-between;padding:7px 0;"><span style="font-size:11px;color:#001723">28/03/2025</span><span style="font-size:11px;font-weight:700;color:#ba1a1a">-$20.000</span></div>
                    </div>
                  </div>
                  <div style="background:#fff;border:1px solid #e1e3e4;border-radius:14px;">
                    <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;">
                      <div style="display:flex;align-items:center;gap:6px;">
                        <span class="material-symbols-outlined" style="font-size:14px;color:#264b5f">folder_open</span>
                        <span style="font-size:12px;font-weight:700;color:#001723">Cierre 2025-01</span>
                        <span style="font-size:9px;color:#94a3b8">1 anticipo</span>
                      </div>
                      <div style="display:flex;align-items:center;gap:4px;">
                        <span style="font-size:11px;font-weight:700;color:#ba1a1a">-$30.000</span>
                        <span class="material-symbols-outlined" style="font-size:15px;color:#94a3b8">expand_more</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>`
        },
        {
            icon: 'bar_chart',
            color: '#264b5f',
            title: 'Estadísticas — Tu resumen del período',
            body: 'En la sección <b>Stats</b> puedes ver gráficos y resúmenes de tu rendimiento en el período actual.<br><br>📊 Muestra la evolución de la recaudación y cómo han variado tus ganancias día a día.<br><br>Es útil para tener una visión rápida de cómo va el mes sin necesidad de revisar el historial entrada por entrada.',
            preview: `
              <div style="background:#fff;border:1px solid #e1e3e4;border-radius:18px;padding:14px;">
                <div style="font-size:9px;color:#264b5f;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:10px;">Período Activo</div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;">
                  <div style="background:#f8f9fa;border-radius:12px;padding:10px;text-align:center;">
                    <div style="font-size:9px;color:#9ba3ab;font-weight:700;margin-bottom:3px;">DÍAS CON DATO</div>
                    <div style="font-size:20px;font-weight:800;color:#001723">18</div>
                  </div>
                  <div style="background:#f8f9fa;border-radius:12px;padding:10px;text-align:center;">
                    <div style="font-size:9px;color:#9ba3ab;font-weight:700;margin-bottom:3px;">VALOR PUNTO HOY</div>
                    <div style="font-size:20px;font-weight:800;color:#006a62">$1.050</div>
                  </div>
                </div>
                <div style="height:50px;background:linear-gradient(180deg,rgba(38,75,95,0.08) 0%,rgba(38,75,95,0.02) 100%);border-radius:8px;display:flex;align-items:flex-end;gap:3px;padding:4px 6px;">
                  ${[40,55,35,70,60,80,50,75,65,90,45,85,70,95,60,80,75,88].map(h=>`<div style="flex:1;background:#264b5f;border-radius:3px 3px 0 0;opacity:0.7;height:${h}%"></div>`).join('')}
                </div>
              </div>`
        },
        {
            icon: 'event_note',
            color: '#705d00',
            title: 'Calendario de Ausencias y Turnos',
            body: 'El botón <b>"Ver Calendario"</b> aparece en tu Balance si eres <b>Part-Time</b> o si tienes <b>ausencias</b> registradas.<br><br>🟢 <b>Verde (Part-Time):</b> Los días que trabajaste — esos suman puntos a tu propina.<br>🔴 <b>Rojo (Planta):</b> Los días que faltaste — esos restan puntos de tu propina.<br><br>Si ves un día marcado incorrectamente, avísale a la administración por Mensajes.',
            preview: `
              <div style="background:#fff;border:1px solid #e1e3e4;border-radius:18px;padding:14px;">
                <div style="font-size:14px;font-weight:800;color:#191c1d;font-family:Manrope,sans-serif;margin-bottom:2px;">Calendario Marzo 2026</div>
                <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;margin:8px 0 4px;">
                  ${['Lu','Ma','Mi','Ju','Vi','Sa','Do'].map(d=>`<div style="text-align:center;font-size:8px;color:#9ba3ab;font-weight:700">${d}</div>`).join('')}
                </div>
                <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;">
                  ${['',' ','','','','1','2'].map(d=>d?`<div style="aspect-ratio:1;border-radius:7px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:500;background:#f3f4f5;color:#9ba3ab">${d}</div>`:`<div></div>`).join('')}
                  ${['3','4','5','6','7','8','9'].map((d,i)=>{const worked=[3,5,6].includes(parseInt(d));return `<div style="aspect-ratio:1;border-radius:7px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:600;${worked?'background:rgba(0,106,98,0.12);color:#006a62;border:1px solid rgba(0,106,98,0.2)':'background:#f3f4f5;color:#9ba3ab'}">${d}</div>`;}).join('')}
                  ${['10','11','12','13','14','15','16'].map((d,i)=>{const worked=[10,12,13,15].includes(parseInt(d));return `<div style="aspect-ratio:1;border-radius:7px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:600;${worked?'background:rgba(0,106,98,0.12);color:#006a62;border:1px solid rgba(0,106,98,0.2)':'background:#f3f4f5;color:#9ba3ab'}">${d}</div>`;}).join('')}
                </div>
              </div>`
        },
        {
            icon: 'chat',
            color: '#001723',
            title: 'Mensajes — Habla con el Equipo',
            body: 'En la sección <b>Mensajes</b> puedes comunicarte directamente con la administración o con tus compañeros.<br><br>🎧 <b>Soporte:</b> Escríbele a la administración — para dudas, consultas o si algo no cuadra en tus datos.<br><br>👥 <b>Equipo:</b> Chat entre socios. Puedes escribir al <b>Chat General</b> para que todos lo vean, o elegir a un compañero específico para un mensaje privado.<br><br>🔴 Si ves un <b>punto rojo</b> en el ícono de Mensajes, significa que tienes un mensaje nuevo sin leer.',
            preview: `
              <div style="border-radius:16px;overflow:hidden;border:1px solid #e1e3e4;">
                <div style="background:#001723;padding:10px 12px;display:flex;gap:6px;">
                  <div style="flex:1;background:rgba(255,255,255,0.18);border-radius:8px;padding:7px;text-align:center;font-size:11px;font-weight:700;color:#fff;display:flex;align-items:center;justify-content:center;gap:4px;"><span class="material-symbols-outlined" style="font-size:13px">support_agent</span>Soporte</div>
                  <div style="flex:1;background:rgba(255,255,255,0.07);border-radius:8px;padding:7px;text-align:center;font-size:11px;font-weight:600;color:rgba(255,255,255,0.45);display:flex;align-items:center;justify-content:center;gap:4px;"><span class="material-symbols-outlined" style="font-size:13px">forum</span>Equipo</div>
                </div>
                <div style="background:#e5ddd5;padding:10px 10px 6px;">
                  <div style="display:flex;justify-content:flex-start;margin-bottom:6px;">
                    <div style="background:#fff;border-radius:8px;border-bottom-left-radius:2px;padding:7px 10px;max-width:75%;box-shadow:0 1px 2px rgba(0,0,0,0.1);">
                      <div style="font-size:11px;font-weight:700;color:#001723;margin-bottom:2px;">Administración</div>
                      <div style="font-size:12px;color:#191c1d;">Hola Juan, tu anticipo fue aprobado ✓</div>
                      <div style="font-size:9px;color:rgba(0,0,0,0.35);text-align:right;margin-top:3px;">10:24</div>
                    </div>
                  </div>
                  <div style="display:flex;justify-content:flex-end;">
                    <div style="background:#d9fdd3;border-radius:8px;border-bottom-right-radius:2px;padding:7px 10px;max-width:75%;box-shadow:0 1px 2px rgba(0,0,0,0.1);">
                      <div style="font-size:12px;color:#191c1d;">Muchas gracias!</div>
                      <div style="font-size:9px;color:rgba(0,106,98,0.65);text-align:right;margin-top:3px;display:flex;align-items:center;justify-content:flex-end;gap:2px;">10:25 <span class="material-symbols-outlined" style="font-size:11px;color:#006a62">done_all</span></div>
                    </div>
                  </div>
                </div>
              </div>`
        },
        {
            icon: 'shield_person',
            color: '#264b5f',
            title: 'Mensajes del Administrador (privado)',
            body: 'Dentro de <b>Mensajes</b>, además de "Soporte" y "Equipo", tienes la pestaña <b>"Admin"</b> 🛡️.<br><br>Ahí llegan los <b>mensajes privados</b> que la administración te envía <b>solo a ti</b> — nadie más los ve.<br><br>💬 Puedes <b>responderle</b> directamente desde ahí, como una conversación normal.<br><br>🔴 Cuando tengas un mensaje nuevo del administrador, verás un <b>punto rojo</b> en la pestaña "Admin" y en el ícono de Mensajes.',
            preview: `
              <div style="border-radius:16px;overflow:hidden;border:1px solid #e1e3e4;">
                <div style="background:#001723;padding:8px 10px;display:flex;gap:5px;">
                  <div style="flex:1;background:rgba(255,255,255,0.07);border-radius:8px;padding:6px;text-align:center;font-size:10px;font-weight:600;color:rgba(255,255,255,0.45);">Soporte</div>
                  <div style="flex:1;background:rgba(255,255,255,0.07);border-radius:8px;padding:6px;text-align:center;font-size:10px;font-weight:600;color:rgba(255,255,255,0.45);">Equipo</div>
                  <div style="flex:1;background:rgba(255,255,255,0.18);border-radius:8px;padding:6px;text-align:center;font-size:10px;font-weight:700;color:#fff;position:relative;">Admin<span style="position:absolute;top:2px;right:6px;width:7px;height:7px;background:#ff5252;border-radius:50%;"></span></div>
                </div>
                <div style="background:#e5ddd5;padding:10px;">
                  <div style="display:flex;justify-content:flex-start;margin-bottom:6px;">
                    <div style="background:#fef3cd;border-radius:8px;border-bottom-left-radius:2px;padding:7px 10px;max-width:78%;box-shadow:0 1px 2px rgba(0,0,0,0.1);">
                      <div style="font-size:10px;font-weight:800;color:#264b5f;margin-bottom:2px;">🛡️ Administración</div>
                      <div style="font-size:12px;color:#191c1d;">Hola, pasa por oficina a firmar tu contrato.</div>
                      <div style="font-size:9px;color:rgba(0,0,0,0.35);text-align:right;margin-top:3px;">09:15</div>
                    </div>
                  </div>
                  <div style="display:flex;justify-content:flex-end;">
                    <div style="background:#d9fdd3;border-radius:8px;border-bottom-right-radius:2px;padding:7px 10px;max-width:78%;box-shadow:0 1px 2px rgba(0,0,0,0.1);">
                      <div style="font-size:12px;color:#191c1d;">Perfecto, voy en la tarde 👍</div>
                      <div style="font-size:9px;color:rgba(0,106,98,0.65);text-align:right;margin-top:3px;">09:18</div>
                    </div>
                  </div>
                </div>
              </div>`
        },
        {
            icon: 'badge',
            color: '#6366f1',
            title: 'Perfil — Tus datos como Socio',
            body: 'En la sección <b>Perfil</b> puedes ver toda tu información como socio del Fondo:<br><br>🏢 <b>Área</b> donde trabajas<br>📋 <b>Tipo de contrato</b> (Planta o Part-Time)<br>📅 <b>Fecha de ingreso</b> al casino<br>🪪 <b>ID de Socio</b><br>⭐ <b>Años en el casino</b> y los <b>puntos</b> que te corresponden según tu antigüedad<br><br>También puedes cambiar el <b>nombre que aparece en la app</b> — solo cambia en este celular, no afecta tus datos reales.',
            preview: `
              <div style="background:#fff;border:1px solid #e1e3e4;border-radius:18px;overflow:hidden;">
                <div style="text-align:center;padding:16px 16px 12px;border-bottom:1px solid #f1f5f9;">
                  <div style="width:52px;height:52px;border-radius:16px;background:linear-gradient(135deg,#001723,#006a62);display:flex;align-items:center;justify-content:center;margin:0 auto 8px;"><span style="font-size:22px;font-weight:700;color:#fff">J</span></div>
                  <div style="font-size:14px;font-weight:700;color:#001723">Juan Pérez</div>
                  <div style="font-size:10px;color:#94a3b8;margin-top:2px">ID: SOC-001</div>
                </div>
                <div style="padding:8px 14px;">
                  <div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #f1f5f9;"><span style="font-size:11px;color:#64748b">Área</span><span style="font-size:11px;font-weight:700;color:#001723">Mesas</span></div>
                  <div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #f1f5f9;"><span style="font-size:11px;color:#64748b">Contrato</span><span style="font-size:11px;font-weight:700;color:#001723">Planta</span></div>
                  <div style="display:flex;justify-content:space-between;padding:7px 0;"><span style="font-size:11px;color:#64748b">Ingreso</span><span style="font-size:11px;font-weight:700;color:#001723">marzo de 2013</span></div>
                </div>
                <div style="background:linear-gradient(135deg,#001723,#006a62);margin:0 12px 12px;border-radius:12px;padding:10px;display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                  <div style="text-align:center;"><div style="font-size:8px;color:rgba(255,255,255,0.5);font-weight:700;margin-bottom:2px">AÑOS</div><div style="font-size:18px;font-weight:700;color:#fff">13</div></div>
                  <div style="text-align:center;"><div style="font-size:8px;color:rgba(255,255,255,0.5);font-weight:700;margin-bottom:2px">PUNTOS</div><div style="font-size:18px;font-weight:700;color:#4ade80">20</div></div>
                </div>
              </div>`
        },
        {
            icon: 'photo_camera',
            color: '#6366f1',
            title: 'Tu Foto de Perfil',
            body: 'En <b>Perfil</b> puedes ponerte una foto. Toca tu <b>avatar</b> (o el botón de la cámara) y elige:<br><br>📷 <b>Tomar foto:</b> abre la cámara del celular al instante.<br>🖼️ <b>Elegir de galería:</b> busca una foto que ya tengas guardada.<br><br>Tu foto aparecerá en el <b>inicio de sesión</b>, arriba junto a tu nombre y en tu Perfil. La administración también la verá en Gestión de Socios, para reconocerte fácilmente.<br><br>Es totalmente opcional — si no subes ninguna, se muestra la inicial de tu nombre.',
            preview: `
              <div style="background:#fff;border:1px solid #e1e3e4;border-radius:18px;padding:16px;text-align:center;">
                <div style="position:relative;width:72px;margin:0 auto 10px;">
                  <div style="width:72px;height:72px;border-radius:20px;background:linear-gradient(135deg,#001723,#006a62);display:flex;align-items:center;justify-content:center;"><span style="font-size:28px;font-weight:700;color:#fff">J</span></div>
                  <div style="position:absolute;bottom:-3px;right:-3px;width:26px;height:26px;border-radius:50%;background:#6366f1;border:2px solid #fff;display:flex;align-items:center;justify-content:center;"><span class="material-symbols-outlined" style="font-size:14px;color:#fff">photo_camera</span></div>
                </div>
                <div style="display:flex;flex-direction:column;gap:6px;">
                  <div style="display:flex;align-items:center;gap:8px;background:#f8f9fa;border:1px solid #e7e8e9;border-radius:12px;padding:9px 12px;"><span class="material-symbols-outlined" style="font-size:18px;color:#6366f1">photo_camera</span><span style="font-size:12px;font-weight:600;color:#001723">Tomar foto</span></div>
                  <div style="display:flex;align-items:center;gap:8px;background:#f8f9fa;border:1px solid #e7e8e9;border-radius:12px;padding:9px 12px;"><span class="material-symbols-outlined" style="font-size:18px;color:#6366f1">image</span><span style="font-size:12px;font-weight:600;color:#001723">Elegir de galería</span></div>
                </div>
              </div>`
        },
        {
            icon: 'folder',
            color: '#6366f1',
            title: 'Mis Documentos — Envía tu contrato',
            body: 'En <b>Perfil → Mis Documentos</b> puedes adjuntar archivos y hacerlos llegar a la administración sin salir de la app.<br><br>📄 Toca <b>"Subir documento"</b> y elige un <b>PDF o una imagen</b> (por ejemplo, tu <b>contrato</b> firmado u otro papel que te pidan).<br><br>🔒 Tus documentos son <b>privados</b>: solo tú y la administración pueden verlos.<br><br>Ahí mismo verás la lista de lo que ya subiste, y puedes abrir o eliminar cada archivo.',
            preview: `
              <div style="background:#fff;border:1px solid #e1e3e4;border-radius:18px;padding:16px;">
                <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
                  <div style="width:34px;height:34px;border-radius:10px;background:rgba(99,102,241,0.1);display:flex;align-items:center;justify-content:center;"><span class="material-symbols-outlined" style="font-size:18px;color:#6366f1">folder</span></div>
                  <div><div style="font-size:13px;font-weight:800;color:#001723">Mis Documentos</div><div style="font-size:10px;color:#94a3b8">Contrato u otros (PDF o imagen)</div></div>
                </div>
                <div style="background:#6366f1;color:#fff;border-radius:12px;padding:10px;font-size:12px;font-weight:700;text-align:center;display:flex;align-items:center;justify-content:center;gap:6px;margin-bottom:10px;"><span class="material-symbols-outlined" style="font-size:16px">upload_file</span>Subir documento</div>
                <div style="display:flex;align-items:center;gap:8px;background:#f8f9fa;border:1px solid #e7e8e9;border-radius:12px;padding:9px 11px;">
                  <span class="material-symbols-outlined" style="font-size:18px;color:#ba1a1a">picture_as_pdf</span>
                  <div style="flex:1;min-width:0;"><div style="font-size:11px;font-weight:600;color:#001723">Contrato_2026.pdf</div><div style="font-size:9px;color:#94a3b8">Subido ✓</div></div>
                  <span class="material-symbols-outlined" style="font-size:16px;color:#94a3b8">visibility</span>
                </div>
              </div>`
        },
        {
            icon: 'badge',
            color: '#264b5f',
            title: '¿Por qué me pidieron el RUT?',
            body: 'La primera vez que abres la app te pedimos tu <b>RUT chileno</b>. Es un paso rápido y sirve para dos cosas importantes:<br><br>🔑 <b>Recuperar tu PIN:</b> si algún día lo olvidas, con tu RUT podrás recuperar el acceso.<br><br>📜 <b>Tus certificados:</b> el RUT se usa para generar tus certificados oficiales del Fondo con tus datos correctos.<br><br>Se guarda de forma segura. Una vez ingresado, <b>no vuelve a aparecer</b>. Si tienes algún problema, la administración también puede registrarlo por ti en Gestión de Socios.',
            preview: `
              <div style="background:#fff;border:1px solid #e1e3e4;border-radius:18px;padding:18px;">
                <div style="width:44px;height:44px;border-radius:13px;background:rgba(38,75,95,0.1);display:flex;align-items:center;justify-content:center;margin:0 auto 10px;"><span class="material-symbols-outlined" style="font-size:22px;color:#264b5f">badge</span></div>
                <div style="font-size:13px;font-weight:800;color:#001723;text-align:center;margin-bottom:3px;">Confirma tu RUT</div>
                <div style="font-size:10px;color:#94a3b8;text-align:center;margin-bottom:12px;">Para recuperar tu PIN y tus certificados</div>
                <div style="background:#f3f4f5;border:1px solid #c2c7cc;border-radius:12px;padding:11px;font-size:16px;color:#191c1d;text-align:center;letter-spacing:0.04em;margin-bottom:10px;">12.345.678-9</div>
                <div style="background:#001723;border-radius:12px;padding:10px;font-size:12px;font-weight:700;color:#fff;text-align:center;">Guardar</div>
              </div>`
        },
        {
            icon: 'palette',
            color: '#db2777',
            title: 'Personaliza tu App — Temas',
            body: '¿Quieres que la app se vea a tu gusto? En <b>Perfil → ⚙️ Ajustes → Tema de la app</b> puedes elegir entre <b>seis estilos</b>:<br><br>☀️ <b>Claro</b> · 🌙 <b>Oscuro</b> · ⚫ <b>Negro</b> · 🌸 <b>Rosa</b> · 💧 <b>Aqua</b> · 🌿 <b>Lavanda</b>.<br><br>El nuevo tema <b>Negro</b> es ideal para pantallas OLED — fondo totalmente negro. El logo de la marca <b>se adapta</b> al tema que elijas.<br><br>El tema queda <b>guardado en tu celular</b> y se aplica cada vez que abres la app. Puedes cambiarlo las veces que quieras.',
            preview: `
              <div style="background:#fff;border:1px solid #e1e3e4;border-radius:18px;padding:16px;">
                <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">
                  <div style="width:34px;height:34px;border-radius:10px;background:rgba(219,39,119,0.1);display:flex;align-items:center;justify-content:center;"><span class="material-symbols-outlined" style="font-size:18px;color:#db2777">palette</span></div>
                  <div><div style="font-size:13px;font-weight:800;color:#001723">Tema de la app</div><div style="font-size:10px;color:#94a3b8">Se guarda en este celular</div></div>
                </div>
                <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;">
                  <div style="border:2px solid #6366f1;border-radius:12px;padding:10px 6px;text-align:center;box-shadow:0 0 0 3px rgba(99,102,241,0.12);">
                    <div style="width:30px;height:30px;border-radius:50%;background:linear-gradient(135deg,#f8f9fa,#e7e8e9);border:1px solid #cbd5e1;margin:0 auto 6px;display:flex;align-items:center;justify-content:center;"><span class="material-symbols-outlined" style="font-size:16px;color:#001723">light_mode</span></div>
                    <div style="font-size:10px;font-weight:700;color:#334155">Claro</div>
                  </div>
                  <div style="border:2px solid #e2e8f0;border-radius:12px;padding:10px 6px;text-align:center;">
                    <div style="width:30px;height:30px;border-radius:50%;background:linear-gradient(135deg,#1e293b,#0f172a);border:1px solid #334155;margin:0 auto 6px;display:flex;align-items:center;justify-content:center;"><span class="material-symbols-outlined" style="font-size:16px;color:#60a5fa">dark_mode</span></div>
                    <div style="font-size:10px;font-weight:700;color:#334155">Oscuro</div>
                  </div>
                  <div style="border:2px solid #e2e8f0;border-radius:12px;padding:10px 6px;text-align:center;">
                    <div style="width:30px;height:30px;border-radius:50%;background:linear-gradient(135deg,#fbcfe8,#db2777);border:1px solid #f5d6e2;margin:0 auto 6px;display:flex;align-items:center;justify-content:center;"><span class="material-symbols-outlined" style="font-size:16px;color:#fff">favorite</span></div>
                    <div style="font-size:10px;font-weight:700;color:#334155">Rosa</div>
                  </div>
                </div>
              </div>`
        },
        {
            icon: 'notifications_active',
            color: '#0284c7',
            title: 'Notificaciones en tu teléfono',
            body: 'En <b>Perfil</b> puedes tocar <b>"Activar notificaciones"</b> para recibir avisos <b>aunque la app esté cerrada</b>:<br><br>🛡️ Mensajes del <b>administrador</b>.<br>💸 Cuando tu <b>egreso</b> es procesado o rechazado.<br><br>La primera vez el teléfono te pedirá <b>permiso</b>: toca "Permitir".<br><br>🍏 <b>En iPhone</b> es necesario primero <b>agregar la app a la pantalla de inicio</b> (botón Compartir → "Agregar a inicio") y abrirla desde ese ícono. Recién ahí funcionan las notificaciones.',
            preview: `
              <div style="background:#fff;border:1px solid #e1e3e4;border-radius:18px;padding:16px;">
                <div style="display:flex;align-items:center;gap:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;padding:12px;margin-bottom:12px;">
                  <div style="width:34px;height:34px;border-radius:10px;background:rgba(14,165,233,0.12);display:flex;align-items:center;justify-content:center;"><span class="material-symbols-outlined" style="font-size:18px;color:#0284c7">notifications_active</span></div>
                  <div style="flex:1;"><div style="font-size:12px;font-weight:800;color:#001723">Notificaciones activadas</div><div style="font-size:10px;color:#94a3b8">Recibirás avisos en el teléfono</div></div>
                  <div style="width:34px;height:20px;border-radius:12px;background:#0284c7;position:relative;"><div style="position:absolute;top:2px;right:2px;width:16px;height:16px;border-radius:50%;background:#fff;"></div></div>
                </div>
                <div style="display:flex;gap:9px;align-items:flex-start;background:#001723;border-radius:12px;padding:10px 12px;">
                  <div style="width:26px;height:26px;border-radius:7px;background:#0284c7;display:flex;align-items:center;justify-content:center;flex-shrink:0;"><span class="material-symbols-outlined" style="font-size:15px;color:#fff">shield_person</span></div>
                  <div style="min-width:0;"><div style="font-size:11px;font-weight:800;color:#fff">Administración</div><div style="font-size:10px;color:rgba(255,255,255,0.7);">Hola, pasa por oficina a firmar 👋</div></div>
                </div>
              </div>`
        },
        {
            icon: 'lock',
            color: '#264b5f',
            title: 'Seguridad — Tu PIN',
            body: 'Tu cuenta está protegida con un <b>PIN de 4 dígitos</b> que solo tú conoces. Nadie más puede ver tu información.<br><br>⏱ <b>Cierre automático:</b> Si dejas de usar la app por 15 minutos seguidos, se cierra sola por seguridad. Solo vuelve a poner tu PIN para entrar de nuevo.<br><br>🔁 <b>¿Olvidaste el PIN?</b> Toca "¿Olvidó su PIN?" en la pantalla de inicio y usa tu RUT para recuperarlo.<br><br>⚠️ <b>Nunca compartas tu PIN</b> — la administración jamás te lo pedirá.',
            preview: `
              <div style="background:#f8f9fa;border-radius:18px;padding:20px;text-align:center;border:1px solid #e1e3e4;">
                <div style="width:56px;height:56px;border-radius:50%;background:#e7e8e9;border:2px solid rgba(38,75,95,0.2);margin:0 auto 10px;display:flex;align-items:center;justify-content:center;">
                  <span style="font-size:22px;font-weight:800;color:#264b5f;font-family:Manrope,sans-serif;">J</span>
                </div>
                <div style="font-size:15px;font-weight:700;color:#001723;font-family:Manrope,sans-serif;">Juan</div>
                <div style="font-size:10px;color:#9ba3ab;margin-bottom:14px;">ID: SOC-001</div>
                <div style="font-size:9px;color:#9ba3ab;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px;">Ingrese su PIN</div>
                <div style="background:#fff;border:1px solid #c2c7cc;border-radius:14px;padding:12px;font-size:22px;color:#191c1d;letter-spacing:0.5em;text-align:center;margin-bottom:12px;">••••</div>
                <div style="background:#001723;border-radius:12px;padding:10px;font-size:13px;font-weight:600;color:#fff;">Ingresar</div>
                <div style="margin-top:10px;font-size:10px;color:#264b5f;font-weight:600;">¿Olvidó su PIN?</div>
              </div>`
        },
        {
            icon: 'dashboard',
            color: '#001723',
            title: 'Elige tu estilo — Clásica o Dashboard',
            body: 'Ahora puedes elegir <b>cómo se ve tu app</b>. Anda a <b>Perfil → ⚙️ Ajustes → Versión de inicio</b>:<br><br>📱 <b>Clásica:</b> la vista de siempre.<br><br>✨ <b>Dashboard:</b> una vista más moderna tipo panel — con tu balance, accesos rápidos y movimientos.<br><br>💳 Además, en el balance puedes tocar el botón de tarjeta para ver tu saldo como una <b>tarjeta bancaria</b>.<br><br>🎨 Todo se adapta al <b>tema de color</b> que elijas (claro, oscuro, rosa, aqua o lavanda).',
            preview: `
              <div style="display:flex;gap:8px;">
                <div style="flex:1;background:#f8f9fa;border:1px solid #e1e3e4;border-radius:14px;padding:12px;text-align:center;">
                  <span class="material-symbols-outlined" style="font-size:22px;color:#264b5f;">wallet</span>
                  <div style="font-size:11px;font-weight:700;color:#001723;margin-top:4px;">Clásica</div>
                </div>
                <div style="flex:1;background:linear-gradient(135deg,#171c22,#282e36);border:1px solid #43474b;border-radius:14px;padding:12px;text-align:center;">
                  <span class="material-symbols-outlined" style="font-size:22px;color:#cee6f7;">dashboard</span>
                  <div style="font-size:11px;font-weight:700;color:#e1e3e4;margin-top:4px;">Dashboard</div>
                </div>
              </div>`
        },
        {
            icon: 'mail',
            color: '#001723',
            title: 'Tu correo electrónico',
            body: 'La primera vez que entres, la app te pedirá tu <b>correo electrónico</b> para completar tu información. Queda guardado en tu perfil.<br><br>✏️ Puedes agregarlo o cambiarlo cuando quieras desde <b>Perfil → Información Laboral → Correo</b>.<br><br>Sirve para que la administración pueda tener tus datos completos y contactarte si lo necesita.',
            preview: `
              <div style="background:#f8f9fa;border:1px solid #e1e3e4;border-radius:18px;padding:18px;">
                <div style="width:48px;height:48px;border-radius:14px;background:rgba(99,102,241,0.12);display:flex;align-items:center;justify-content:center;margin:0 auto 10px;">
                  <span class="material-symbols-outlined" style="font-size:24px;color:#6366f1">mail</span>
                </div>
                <div style="font-size:12px;font-weight:700;color:#001723;text-align:center;margin-bottom:8px;">Agrega tu correo</div>
                <div style="background:#fff;border:1px solid #c2c7cc;border-radius:12px;padding:10px;font-size:12px;color:#64748b;text-align:center;">nombre@correo.com</div>
              </div>`
        },
        {
            icon: 'account_circle',
            color: '#001723',
            title: 'Personaliza tu ingreso',
            body: '👁 En la pantalla de ingreso, toca el <b>ojito</b> del PIN para ver o esconder los números mientras los escribes.<br><br>🖼 Y en <b>Perfil → ⚙️ Ajustes → Forma de la foto</b> eliges cómo se ve tu foto en el login: <b>círculo, redondeado, cuadrado o hexágono</b>.',
            preview: `
              <div style="background:#f8f9fa;border:1px solid #e1e3e4;border-radius:18px;padding:18px;display:flex;justify-content:center;gap:12px;align-items:center;">
                <span style="width:34px;height:34px;background:#264b5f;border-radius:50%;"></span>
                <span style="width:34px;height:34px;background:#264b5f;border-radius:10px;"></span>
                <span style="width:34px;height:34px;background:#264b5f;border-radius:3px;"></span>
                <span style="width:34px;height:34px;background:#264b5f;clip-path:polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%);"></span>
              </div>`
        },
        {
            icon: 'check_circle',
            color: '#006a62',
            title: '¡Ya estás listo para usar la app!',
            body: 'Eso es todo. Ya conoces cada sección de tu app del Fondo Solidario.<br><br>📌 Recuerda que puedes <b>volver a ver esta guía</b> en cualquier momento tocando el botón <b>?</b> que está arriba a la derecha.<br><br>💬 Si tienes una duda o algo no cuadra, escríbele al equipo en <b>Mensajes → Soporte</b>.<br><br>¡Bienvenido! 🎉',
            preview: `
              <div style="background:linear-gradient(135deg,#001723,#002d40);border-radius:18px;padding:20px;text-align:center;">
                <div style="display:flex;justify-content:space-around;margin-bottom:16px;">
                  <div style="text-align:center;opacity:0.9;"><div style="width:38px;height:38px;background:rgba(255,255,255,0.12);border-radius:11px;display:flex;align-items:center;justify-content:center;margin:0 auto 4px;"><span class="material-symbols-outlined" style="font-size:17px;color:#fff">account_balance_wallet</span></div><div style="font-size:8px;color:rgba(255,255,255,0.5)">Balance</div></div>
                  <div style="text-align:center;opacity:0.9;"><div style="width:38px;height:38px;background:rgba(255,255,255,0.12);border-radius:11px;display:flex;align-items:center;justify-content:center;margin:0 auto 4px;"><span class="material-symbols-outlined" style="font-size:17px;color:#fff">receipt_long</span></div><div style="font-size:8px;color:rgba(255,255,255,0.5)">Historial</div></div>
                  <div style="text-align:center;opacity:0.9;"><div style="width:38px;height:38px;background:rgba(255,255,255,0.12);border-radius:11px;display:flex;align-items:center;justify-content:center;margin:0 auto 4px;"><span class="material-symbols-outlined" style="font-size:17px;color:#fff">bar_chart</span></div><div style="font-size:8px;color:rgba(255,255,255,0.5)">Stats</div></div>
                  <div style="text-align:center;opacity:0.9;"><div style="width:38px;height:38px;background:rgba(255,255,255,0.12);border-radius:11px;display:flex;align-items:center;justify-content:center;margin:0 auto 4px;"><span class="material-symbols-outlined" style="font-size:17px;color:#fff">chat</span></div><div style="font-size:8px;color:rgba(255,255,255,0.5)">Mensajes</div></div>
                  <div style="text-align:center;opacity:0.9;"><div style="width:38px;height:38px;background:rgba(255,255,255,0.12);border-radius:11px;display:flex;align-items:center;justify-content:center;margin:0 auto 4px;"><span class="material-symbols-outlined" style="font-size:17px;color:#fff">badge</span></div><div style="font-size:8px;color:rgba(255,255,255,0.5)">Perfil</div></div>
                </div>
                <div style="background:rgba(0,200,150,0.15);border:1px solid rgba(0,200,150,0.3);border-radius:12px;padding:10px;display:flex;align-items:center;gap:8px;margin-bottom:10px;">
                  <span class="material-symbols-outlined" style="font-size:20px;color:#3adccc;flex-shrink:0">check_circle</span>
                  <div style="text-align:left;"><div style="font-size:11px;font-weight:700;color:#fff">Guía completada</div><div style="font-size:10px;color:rgba(255,255,255,0.5)">Toca ? para volver a verla</div></div>
                </div>
                <button onclick="closeHelp();toggleAbout(true)" style="width:100%;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.15);border-radius:12px;padding:10px;font-size:12px;font-weight:600;color:rgba(255,255,255,0.7);cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;">
                  <span class="material-symbols-outlined" style="font-size:15px">code</span> Acerca del desarrollador
                </button>
              </div>`
        }
    ];

    let helpCurrentSlide = 0;

    function openHelp() {
        helpCurrentSlide = 0;
        renderHelpSlide();
        helpToggleIndex(false); // asegurar que se muestra el contenido, no el índice
        const m = document.getElementById('helpModal');
        m.classList.remove('hidden');
        m.classList.add('flex');
    }

    function closeHelp() {
        document.getElementById('helpModal').classList.add('hidden');
        document.getElementById('helpModal').classList.remove('flex');
        localStorage.setItem('helpSeen_v2', '1');
    }

    function helpNext() {
        if (helpCurrentSlide < helpSlides.length - 1) {
            helpCurrentSlide++;
            renderHelpSlide();
        } else {
            closeHelp();
        }
    }

    function helpPrev() {
        if (helpCurrentSlide > 0) {
            helpCurrentSlide--;
            renderHelpSlide();
        }
    }

    function helpGoTo(idx) {
        helpCurrentSlide = idx;
        renderHelpSlide();
    }

    // ── Índice de temas (menú seleccionable que salta directo a cada ayuda) ──
    function helpRenderIndex() {
        const cont = document.getElementById('helpIndex');
        if (!cont) return;
        cont.innerHTML = helpSlides.map((s, i) => `
            <button onclick="helpIndexGoTo(${i})" style="display:flex;align-items:center;gap:12px;width:100%;text-align:left;background:${i === helpCurrentSlide ? (s.color + '12') : 'transparent'};border:none;border-radius:12px;padding:11px 10px;cursor:pointer;">
                <span style="width:38px;height:38px;flex-shrink:0;border-radius:12px;background:${s.color}14;display:flex;align-items:center;justify-content:center;">
                    <span class="material-symbols-outlined" style="font-size:20px;color:${s.color};">${s.icon}</span>
                </span>
                <span style="flex:1;min-width:0;font-size:13.5px;font-weight:700;color:#001723;line-height:1.3;">${s.title}</span>
                <span style="font-size:11px;color:#c2c7cc;font-weight:700;flex-shrink:0;">${i + 1}</span>
            </button>`).join('');
    }

    function helpToggleIndex(force) {
        const idx = document.getElementById('helpIndex');
        const content = document.getElementById('helpContent');
        const dots = document.getElementById('helpDots');
        const nav = document.getElementById('helpNav');
        if (!idx || !content) return;
        const open = (force !== undefined) ? force : (idx.style.display === 'none');
        if (open) helpRenderIndex();
        idx.style.display = open ? 'block' : 'none';
        content.style.display = open ? 'none' : 'block';
        if (dots) dots.style.display = open ? 'none' : 'flex';
        if (nav) nav.style.display = open ? 'none' : 'flex';
        const bt = document.getElementById('helpIndexBtnTxt');
        if (bt) bt.textContent = open ? 'Volver' : 'Temas';
    }

    function helpIndexGoTo(i) {
        helpToggleIndex(false);
        helpGoTo(i);
    }
    window.helpToggleIndex = helpToggleIndex;
    window.helpIndexGoTo = helpIndexGoTo;

    function renderHelpSlide() {
        const s = helpSlides[helpCurrentSlide];
        const total = helpSlides.length;
        const isLast = helpCurrentSlide === total - 1;
        const isFirst = helpCurrentSlide === 0;

        document.getElementById('helpIcon').textContent = s.icon;
        document.getElementById('helpIcon').style.color = s.color;
        document.getElementById('helpIconWrap').style.background = s.color + '12';
        document.getElementById('helpIconWrap').style.borderColor = s.color + '25';
        document.getElementById('helpTitle').textContent = s.title;
        document.getElementById('helpBody').innerHTML = s.body;
        document.getElementById('helpPreview').innerHTML = s.preview || '';

        // dots
        let dots = '';
        for (let i = 0; i < total; i++) {
            dots += `<button onclick="helpGoTo(${i})" style="width:${i===helpCurrentSlide?'22px':'8px'};height:8px;border-radius:4px;background:${i===helpCurrentSlide?s.color:'#c2c7cc'};transition:all 0.3s;border:none;cursor:pointer;padding:0;"></button>`;
        }
        document.getElementById('helpDots').innerHTML = dots;

        // botones
        document.getElementById('helpBtnPrev').style.visibility = isFirst ? 'hidden' : 'visible';
        const btnNext = document.getElementById('helpBtnNext');
        btnNext.textContent = isLast ? 'Entendido ✓' : 'Siguiente';
        btnNext.style.background = s.color;

        // counter
        document.getElementById('helpCounter').textContent = `${helpCurrentSlide + 1} / ${total}`;
    }

    function checkFirstTimeHelp() {
        if (!localStorage.getItem('helpSeen_v2')) {
            setTimeout(() => openHelp(), 600);
        }
    }
