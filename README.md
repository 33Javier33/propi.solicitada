# Bóveda Personal — App Socio Fondo Solidario Casino Puerto Varas

PWA (Progressive Web App) para socios del Fondo Solidario de Propina del Casino de Puerto Varas. Permite a cada socio consultar su balance, historial de recaudaciones, anticipos, estadísticas y comunicarse con el equipo administrativo.

---

## Tabla de Contenidos

1. [Resumen del Sistema](#resumen-del-sistema)
2. [Arquitectura](#arquitectura)
3. [Estructura de Archivos](#estructura-de-archivos)
4. [Frontend](#frontend)
   - [Paleta de Colores (Tailwind)](#paleta-de-colores-tailwind)
   - [Secciones / Tabs](#secciones--tabs)
   - [Componentes Clave](#componentes-clave)
5. [Backend — Google Apps Script](#backend--google-apps-script)
   - [Endpoints GAS](#endpoints-gas)
   - [Hojas de Cálculo (Google Sheets)](#hojas-de-cálculo-google-sheets)
   - [Integración Telegram](#integración-telegram)
6. [Service Worker y Caché PWA](#service-worker-y-caché-pwa)
7. [Despliegue](#despliegue)
8. [Flujo de Desarrollo](#flujo-de-desarrollo)
9. [Historial de Cambios](#historial-de-cambios)

---

## Resumen del Sistema

| Campo | Valor |
|---|---|
| Nombre de la App | Bóveda Personal |
| Short name (PWA) | Bóveda |
| Versión actual | V19 (interna) |
| Idioma | Español |
| Orientación | Portrait |
| Color tema | `#001723` (azul marino oscuro) |
| Framework CSS | Tailwind CSS CDN v3 (plugins: forms, container-queries) |
| Fuentes | Inter (cuerpo), Manrope (titulares), Material Symbols Outlined (íconos) |

---

## Arquitectura

```
┌─────────────────────────────────────────────────────┐
│                  Dispositivo del Socio               │
│  PWA instalada (standalone, portrait)                │
│  ┌──────────────────────────────────────────────┐   │
│  │  index.html  →  app.css  +  app.js           │   │
│  │  Service Worker (sw.js) — cache v12          │   │
│  └────────────────┬─────────────────────────────┘   │
└───────────────────┼─────────────────────────────────┘
                    │ fetch (interceptado por supabase-api.js)
         ┌──────────┴──────────┐
         │                     │
  ┌──────▼──────┐       ┌──────▼──────┐
  │  Supabase   │       │  Supabase   │
  │  Socios     │       │  Recaud.    │
  │  (teemahk…) │       │  (lpulmj…)  │
  └─────────────┘       └─────────────┘
```

**Dos proyectos Supabase independientes:**
- **Proyecto socios** (`teemahksasdougehrcly`) — socios, anticipos, extras, saldos, chat, conexiones
- **Proyecto recaudaciones** (`lpulmjzboogixbdxxayo`) — recaudaciones diarias, divisores, notas

> La integración usa un interceptor `window.fetch` en `supabase-api.js` que redirige transparentemente las llamadas GAS hacia Supabase sin modificar `app.js`.

---

## Estructura de Archivos

```
propi.solicitada/
├── index.html          # HTML puro (878 líneas) — estructura de la app
├── app.css             # CSS + configuración de estilos (270 líneas)
├── app.js              # JavaScript completo de la app (2435 líneas)
├── supabase-api.js     # Interceptor fetch → Supabase (nuevo)
├── originalindex.html  # Copia completa en un solo archivo (auto-generada)
├── build.sh            # Script que reconstruye originalindex.html
├── sw.js               # Service Worker — caché v12, network-first
├── manifest.json       # Manifiesto PWA
├── vercel.json         # Cabeceras HTTP para despliegue en Vercel
├── gas/
│   └── code.gs         # Google Apps Script completo (referencia histórica)
├── migration/
│   └── migrate_to_supabase.gs  # Instrucciones de migración (referencia)
├── img/
│   ├── icon-192x192.png
│   └── icon-512x512.png
└── .claude/
    └── settings.json   # Hooks Claude Code (auto-rebuild originalindex.html)
```

### Separación HTML / CSS / JS

El archivo de trabajo principal es `index.html` + `app.css` + `app.js`.
`originalindex.html` se regenera automáticamente con `./build.sh` cada vez que se edita cualquiera de los tres archivos separados (via hook de Claude Code en `.claude/settings.json`).

---

## Frontend

### Paleta de Colores (Tailwind)

| Token | Color | Uso |
|---|---|---|
| `lm-bg` | `#f8f9fa` | Fondo general de la app |
| `lm-card` | `#ffffff` | Tarjetas y superficies |
| `lm-border` | `#e1e3e4` | Bordes |
| `lm-primary` | `#001723` | Color principal (azul marino) |
| `lm-primary-mid` | `#002d40` | Hover de primario |
| `lm-accent` | `#264b5f` | Acento secundario |
| `lm-secondary` | `#006a62` | Verde (éxito / ganancias) |
| `lm-red` | `#ba1a1a` | Rojo (descuentos / anticipos) |
| `lm-muted` | `#72787d` | Texto secundario |
| `lm-subtle` | `#f3f4f5` | Fondos sutiles |
| `wa-bg` | `#e5ddd5` | Fondo chat WhatsApp-style |
| `wa-mine` | `#d9fdd3` | Burbuja mensaje propio |

### Secciones / Tabs

| ID | Ícono | Descripción |
|---|---|---|
| `tab-home` | `account_balance_wallet` | **Balance** — monto a cobrar, remanente, valor punto por noche, resumen contable, últimos movimientos, calendario |
| `tab-history` | `receipt_long` | **Historial** — dos sub-vistas: *Rendimientos* (detalle diario) y *Anticipos Anteriores* (histórico con filtros) |
| `tab-stats` | `bar_chart` | **Estadísticas** — gráficos del período activo |
| `tab-chat` | `chat` | **Mensajes** — chat Soporte (admin) y Equipo (entre socios) |
| `tab-perfil` | `badge` | **Perfil** — datos del socio, años, puntos de antigüedad |

### Componentes Clave

#### Header
```html
<header class="px-5 pt-safe-top py-3.5 flex items-center justify-between shrink-0 glass z-20">
```
- `pt-safe-top`: clase personalizada = `calc(env(safe-area-inset-top) + 0.875rem)` → respeta notch/Dynamic Island en iPhone
- `glass`: fondo semi-transparente con `backdrop-filter: blur(24px)`

#### Hero Card (Balance)
- Tarjeta oscura con gradiente `#001723 → #002d40 → #264b5f`
- Muestra el monto principal formateado en pesos chilenos
- Dos tarjetas secundarias debajo:
  - **Remanente** (`#remateTag`): sobrante del período anterior
  - **Valor punto por noche** (`#globalPtsTag`): valor unitario del punto en el período

#### Bottom Nav
```html
<nav id="bottomNav" class="fixed bottom-0 w-full z-[60] pb-safe-bottom">
```
- `pb-safe-bottom`: clase personalizada = `env(safe-area-inset-bottom)` → respeta home indicator iPhone

#### Toast Notifications
- Posición: `top: calc(env(safe-area-inset-top) + 16px)` → aparece debajo del notch
- Animación con `cubic-bezier(0.34, 1.56, 0.64, 1)`

#### Anticipos Anteriores (dentro de tab-history)
Toggle entre dos vistas: **Rendimientos** | **Anticipos Anteriores**

La vista de anticipos incluye:
- Filtro por **año** (pastillas, aparece si hay ≥ 2 años)
- Filtro por **mes** (pastillas, aparece al seleccionar un año con ≥ 2 meses)
- **Acordeón** por período: cada período es una tarjeta colapsable con total y detalle de registros

**Funciones JS relacionadas:**
```javascript
switchHistView(view)           // alterna Rendimientos / Anticipos Anteriores
loadHistorialAnticipos()       // fetch con lazy-load (solo carga una vez)
buildFiltroAnios(data)         // construye pastillas de año
buildFiltroMeses(anio, data)   // construye pastillas de mes según año activo
filtrarAnticipos(anio)         // filtra por año + resetea filtro de mes
filtrarAnticiposMes(mes)       // filtra por mes sobre los datos del año activo
togglePeriodo(id)              // expande/colapsa un acordeón de período
renderHistorialAnticipos(data) // renderiza la lista de acordeones
_extraerAnio(periodo)          // extrae año con regex /\b(20\d{2})\b/
_extraerMes(periodo)           // extrae mes de nombres como "Cierre 2025-03" o "Marzo 2025"
```

#### Login / Autenticación
- PIN de 4 dígitos por socio
- Cierre automático por inactividad (15 min)
- Recuperación de PIN via RUT
- Dispositivo vinculado mediante ID Socio + RUT + PIN en primer uso

#### Guía de Ayuda (helpModal)
- Array `helpSlides` con 11 slides (actualizado en cada feature relevante)
- Cada slide: `{ icon, color, title, body, preview }` donde `preview` es HTML con mockup visual
- Accesible desde botón `?` en el header
- Se muestra automáticamente la primera vez que el socio abre la app

---

## Backend — Google Apps Script

El GAS completo de referencia está en `gas/code.gs`. Los cambios exclusivos de esta app se describen abajo.

### Endpoints GAS

**SCRIPT_URL_SOCIOS** (`doGet` + `doPost`)

| Action | Método | Descripción |
|---|---|---|
| `getSocios` | GET | Lista todos los socios |
| `getDatosSocio` | GET | Datos de un socio específico |
| `getAllDataDesdeSheets` | POST | Datos completos de anticipos, extras, notas del socio |
| `getSaldosAnteriores` | GET | Saldos anteriores del período |
| `getSaldosCierre` | GET | Saldos de cierre / remanentes |
| `getDiasPartTime` | GET | Días trabajados (socios Part-Time) |
| `getNotes` | GET | Notas del período (mensajes admin) |
| `pingConexion` | POST | Heartbeat cada 2 min — actualiza UltimaConexion, Telegram si lleva >5 min inactivo |
| `logoutConexion` | POST | Registra logout y **borra UltimaConexion** (fuerza Telegram en próximo login) |
| `getHistorialConexiones` | GET | Historial de conexiones del socio |
| `addNote` / `deleteNote` | POST | CRUD de notas admin |
| `registrarBatchAnticipos` | POST | Registra múltiples anticipos |
| `registrarBatchExtras` | POST | Registra movimientos extra |
| `actualizarAnticipo` | POST | Modifica un anticipo existente |
| `reiniciarAnticipos` / `reiniciarExtras` | POST | Borra anticipos/extras del período |
| `borrarMovimiento` | POST | Elimina un movimiento por UUID |
| `registrarSaldoAnterior` | POST | Guarda saldo anterior para el próximo período |
| `guardarDiasPartTime` / `guardarBatchDiasPartTime` | POST | Guarda días Part-Time |
| `guardarCierreIndividual` | POST | Guarda cierre de un socio |
| `guardarDistribucion` | POST | Guarda distribución del período |
| `addSocio` / `updateSocio` / `deleteSocio` | POST | CRUD de socios |
| `getAuditoria` / `logAccionAuditoria` | GET/POST | Auditoría de acciones |
| `getCredenciales` / `setCredencial` / `deleteCredencial` | POST | Gestión de credenciales |
| `registrarRetiroAnticipo` | POST | Registra retiro de anticipo |
| `getRetirosAnticipos` | GET | Lista retiros de anticipos |
| `getHistorialAnticiposSocio` | GET | Historial de anticipos de un socio |
| `getHistorialCompletoSocio` | POST | **Nuevo** — combina `AnticiposGuardados` + hojas `Anticipos_*` ordenadas por período desc |
| `registrarMaterial` / `borrarMaterial` | POST | CRUD de materiales |
| `getAllMaterialesDesdeSheets` | POST | Lista todos los materiales |
| `archivarCarpetaEnSheets` | POST | Archiva una carpeta |

**SCRIPT_URL_RECAUDACIONES** (`doGet`)

| Action | Descripción |
|---|---|
| `get` | Datos de recaudación diaria del período activo |
| `getNotes` | Notas de recaudaciones |
| `ping` | Verificación de conexión |

### Hojas de Cálculo (Google Sheets)

| Constante GAS | Nombre de hoja | Columnas principales |
|---|---|---|
| `HOJA_SOCIOS` | `Socios` | ID, Nombre, Apellido, FechaIngreso, Area, TipoContrato, UltimaConexion |
| `HOJA_ANTICIPOS` | `Anticipos` | ID Socio, Nombre Completo, Fecha Anticipo, Monto, Estado, UUID, Responsable, AreaResponsable |
| `HOJA_EXTRAS` | `MovimientosExtras` | ID Socio, Nombre, Fecha, Tipo, Monto, Detalle/Nota, Estado, UUID |
| `HOJA_SALDOS` | `SaldosAnteriores` | ID Socio, Nombre, MontoSaldo, UltimaActualizacion |
| `HOJA_DIAS_PT` | `DiasPartTime` | ID Socio, Nombre, DiasJSON |
| `HOJA_SALDOS_CIERRE` | `SaldosCierreMes` | ID Socio, Nombre, MontoRemanente, FechaCierre |
| `HOJA_CHAT_SOCIAL` | `MensajesApp` | Mensajería entre socios |
| `HOJA_ANTICIPOS_HISTORIAL` | `AnticiposGuardados` | Anticipos de períodos cerrados (cols: ID, ?, Fecha, Monto, FechaCierre, ?, Responsable) |
| `HOJA_HISTORIAL_CONEXIONES` | `HistorialConexiones` | Log de conexiones por socio |
| `HOJA_AUDITORIA` | `AuditoriaLogs` | Auditoría de todas las acciones |
| `HOJA_CREDENCIALES` | `Credenciales` | PINs y credenciales de socios |
| `HOJA_RETIROS_ANTICIPOS` | `RetirosAnticipos` | Retiros de anticipos registrados |
| `HOJA_MATERIALES` | `RecaudacionMateriales` | Materiales de recaudación |
| — | `Anticipos_*` | Hojas dinámicas por período (ej: `Anticipos_2025-Enero`) para historial completo |

### Integración Telegram

El bot de Telegram se gestiona enteramente en `gas/code.gs`:

- **Login**: al hacer `pingConexion`, si `(now - UltimaConexion) > 300000ms (5 min)`, envía notificación al bot
- **Logout**: `logoutConexion` borra `UltimaConexion` → garantiza que el próximo login siempre notifique
- **Comandos admin vía Telegram**: `/recaudacion`, `/montosDiarios`, `/sala`, `/online`, `/anticipos`, `/buscar [nombre]`, `/historial [nombre]`, `/resumen`
- **doTelegramWebhook**: recibe eventos del webhook de Telegram y enruta a las funciones correspondientes

---

## Service Worker y Caché PWA

**Archivo:** `sw.js` — versión `boveda-personal-v14`

**Estrategia:**
- Archivos propios (`index.html`, `app.css`, `app.js`, `manifest.json`, imágenes) → **Network-first** (siempre intenta red, fallback a caché)
- Llamadas a `script.google.com` (GAS) → **Always network**, nunca caché, fallback a JSON de error
- CDNs externos (fonts, Tailwind) → **No interceptar**

**Actualizaciones:**
- `skipWaiting()` en install → el nuevo SW se activa de inmediato
- `clients.claim()` en activate → toma control de todas las pestañas abiertas
- Banner de "Nueva versión disponible" → `showUpdateBanner()` en el front; el usuario acepta y el SW envía `SKIP_WAITING`
- Chequeo automático de actualización en `visibilitychange` (cada vez que la app vuelve al frente)

**Archivos cacheados:**
```
index.html · app.css · app.js · manifest.json
img/icon-192x192.png · img/icon-512x512.png
```

**Headers especiales (vercel.json):**
- `sw.js` → `Cache-Control: no-cache, no-store, must-revalidate` (el service worker nunca se sirve desde caché del servidor)
- `Service-Worker-Allowed: /`

---

## Despliegue

La app se despliega en **Vercel** directamente desde este repositorio GitHub (`33Javier33/propi.solicitada`), rama `main`.

**Rama principal:** `main`  
**Rama de desarrollo Claude Code:** `claude/sheets-to-supabase-migration-i1dlcm` (migración Supabase)

Para actualizar la app en producción: hacer push a `main`. Vercel detecta el push y redistribuye automáticamente.

**Reinstalación del PWA en iPhone** (tras cambios de CSS/JS):
El service worker usa network-first, por lo que los cambios se aplican en la siguiente apertura con conexión. Si el SW no se actualiza, desinstalar la app del home screen y volver a agregarla.

---

## Flujo de Desarrollo

### Archivos a editar

| Tarea | Archivo |
|---|---|
| Estructura HTML, modales, layout | `index.html` |
| Estilos, CSS variables, clases custom | `app.css` |
| Lógica JS, funciones, llamadas GAS | `app.js` |
| Adaptador Supabase / interceptor fetch | `supabase-api.js` |
| Backend / lógica Google Sheets (referencia) | `gas/code.gs` |
| Caché PWA | `sw.js` (incrementar `CACHE_NAME` al cambiar archivos) |

### Build automático

Al editar `index.html`, `app.css` o `app.js` dentro de Claude Code, el hook en `.claude/settings.json` ejecuta automáticamente `./build.sh`, que regenera `originalindex.html` (versión completa en un solo archivo).

Para ejecutar manualmente:
```bash
./build.sh
```

### Convención de versiones — Service Worker

Cada vez que se publican cambios en archivos del front-end, incrementar el número de versión en `sw.js`:
```javascript
const CACHE_NAME = 'boveda-personal-v14'; // ← incrementar
```

### Commit y push

```bash
git add -p                    # revisar cambios antes de agregar
git commit -m "descripción"
git push -u origin main
```

> **Importante:** Cada vez que se implementa un cambio relevante en la app, actualizar la sección [Historial de Cambios](#historial-de-cambios) en este README.

---

## Historial de Cambios

#### 2026-07-20 — Fix: carga lenta (~30s) al volver a la app (SW v113)
- **Causa:** al reanudar la app, si una consulta a Supabase venía vacía o la conexión quedaba "dormida", el interceptor **esperaba al GAS** (arranque en frío ~30s) y **bloqueaba todo el `Promise.all`** del balance → la app parecía pegada.
- **Fix:** helper `_conTimeout` que limita cada llamada: las consultas Supabase del balance (`getAllDataDesdeSheets`, `getSaldosAnteriores`, `get` de recaudaciones) y sus respaldos al GAS ahora tienen **timeout (6–8s)**. En el caso normal Supabase responde al instante; si algo se demora, la app sigue con lo que hay y se actualiza en segundo plano — nunca se congela 30s.
- Archivos: `supabase-api.js`. SW v113.

#### 2026-07-20 — Fix: el logo se volvía blanco al tocar la raya (SW v112)
- **Causa:** el gesto de deslizar aplicaba un `transform` al sheet del modal; eso, junto al `mix-blend-mode` del logo, rompía la composición y volvía el logo (y su zona) **blanco** en tema oscuro. El `isolation:isolate` agregado en v111 lo empeoraba.
- **Fix:** se quitó el `transform` del sheet y el `isolation`. Ahora **tocar la raya cierra** y **deslizarla hacia abajo también** (detección de gesto sin animar el sheet), así el logo **nunca se rompe** y sigue fundiéndose con el tema como antes.
- Archivos: `index.html` (sin `isolation` en `#aboutSheet`/`#loginOverlay`), `app.js` (`_initAboutSwipe` sin transform). SW v112.

#### 2026-07-20 — Fusión del logo a prueba de fallos (isolation) (SW v111)
- El logo (`.marca-logo`) usa `mix-blend-mode` para fundirse con el tema. En algunos dispositivos, con el `backdrop-blur` del modal, la fusión no resolvía bien y el logo podía "perderse". Se agregó `isolation:isolate` al **sheet del modal Acerca de** y al **login**, para que el logo se funda de forma confiable contra el fondo de la tarjeta en todos los temas. (El logo no se había quitado; solo se blindó su fusión.)
- Archivos: `index.html` (`#aboutSheet`, `#loginOverlay`). SW v111.

#### 2026-07-20 — Modal "Acerca de": la raya (asa) ahora cierra (tocar o deslizar) (SW v110)
- La barra/asa del modal "Acerca de" no tenía función. Ahora **al tocarla se cierra** y **al deslizarla hacia abajo también** (con animación). Además, tocar el fondo oscuro fuera de la tarjeta cierra el modal.
- Archivos: `index.html` (`#aboutHandleZone` con onclick + `#aboutSheet`), `app.js` (`_initAboutSwipe` con gestos touch). SW v110.

#### 2026-07-20 — Marca (logo CarlosPN) al pie del login (SW v109)
- Se agregó el **logo de marca** (`carlospn-logo.png`, clase `.marca-logo` que se funde con el tema) al **pie de la pantalla de login**, con la línea "© 2026 · Todos los derechos reservados". No interfiere con el ingreso (`pointer-events:none`).
- Archivos: `index.html` (bloque marca en `#loginOverlay`). SW v109.

#### 2026-07-20 — Guía de instalación en el login (Android / iPhone) (SW v108)
- En la pantalla de **login** hay un botón **"¿Cómo instalar la app?"** que abre una guía con pasos para **Android (Chrome)** y **iPhone (Safari)**. En Android, si el navegador lo permite, aparece un botón **"⬇️ Instalar ahora"** (captura `beforeinstallprompt`).
- **Primera vez:** si la app **no está instalada** (no corre como PWA) y no se vio antes la guía, se muestra **automáticamente antes de ingresar** el PIN, para asegurar que la instalen. Si ya está instalada o ya la vieron, no se auto-muestra; el botón queda siempre disponible.
- Archivos: `index.html` (botón + `#installGuideModal`), `app.js` (`abrirGuiaInstalar`, `_instalarPWA`, `_maybeMostrarGuiaInstalar`, `beforeinstallprompt`). SW v108.

#### 2026-07-20 — Solo versión nueva (premium): se retira la clásica + migración con efecto (SW v107)
- La app usa **solo la versión nueva (premium)**. `_homeVersionGuardada()` siempre devuelve `premium` y el selector "Versión de inicio" en Ajustes quedó oculto (la clásica se retira).
- **Migración única:** a los socios que tenían la clásica les aparece un **modal "Nueva versión disponible"**; al tocar **"✨ Activar nueva versión"** cambian a la **tarjeta nueva** (balance estilo tarjeta) y a toda la versión premium, con un **efecto de transición** (`.pm-switch-fx`). Se marca `propi_premium_migrado` para no repetirlo. Quienes ya estaban en premium pasan directo, sin modal.
- Archivos: `index.html` (modal `#nuevaVersionModal`, selector de versión oculto), `app.js` (`_maybeMigrarPremium`, `_activarNuevaVersion`, `_homeVersionGuardada`/`setHomeVersion` forzados a premium), `app.css` (animación `pmSwitchFx`). SW v107.

#### 2026-07-20 — Banner "Activar notificaciones" en la pantalla principal (SW v106)
- Aparece un **banner automático** (abajo, sobre la nav) invitando a activar las notificaciones, **solo si el socio aún no decidió** (permiso `default`) y no lo pospuso. Botón **"Activar"** → pide el permiso y, al aceptar, **queda suscrito automáticamente** (llama a `activarNotificaciones`). Botón **"Ahora no"** lo pospone 3 días.
- Se oculta solo cuando el permiso ya fue concedido o bloqueado. (El botón de Ajustes sigue disponible para activar/desactivar manualmente.)
- Archivos: `index.html` (`#notifPrompt`), `app.js` (`_maybeShowNotifPrompt`, `_notifPromptActivar`, `_notifPromptCerrar`; se refresca desde `_pushRefrescarEstado`). SW v106.

#### 2026-07-19 — Puntos Bóveda: base 2 en la fórmula de respaldo (SW v105)
- Alineación con socios-comicion: la fórmula de respaldo de puntos (usada solo cuando el puntaje del socio aún no está guardado) ahora usa **base 2 para Bóveda** (antes 4), +2 por año, tope 10. No afecta a socios con puntaje guardado.
- Archivos: `app.js`. SW v105.

#### 2026-07-19 — Fix logo de marca: fusión correcta (el PNG tiene fondo BLANCO) (SW v104)
- Corrección del intento anterior: el PNG del logo tiene fondo **blanco** (no negro), por eso en temas oscuros quedaba una "caja" blanca. Ahora: **temas claros** `mix-blend-mode: multiply` (el blanco se vuelve transparente, el logo azul marino se ve); **temas oscuros** (oscuro/negro/esmeralda) `filter: invert(1) hue-rotate(180deg)` + `mix-blend-mode: screen` (el blanco → negro → transparente, y el diseño queda claro y visible). Verificado numéricamente: el fondo se funde exacto con el color del tema y el logo queda como marca de agua.
- Archivos: `app.css` (regla `.marca-logo`). SW v104.

#### 2026-07-19 — Logo de marca: se funde con el fondo como marca de agua (SW v103)
- (Intento con supuesto equivocado de fondo negro — corregido en v104.)
- Archivos: `app.css` (regla `.marca-logo`). SW v103.

#### 2026-07-19 — Temas: tema Negro ahora ennegrece TODAS las tarjetas + nuevos temas (SW v102)
- **Fix tema Negro:** antes solo cambiaba el fondo; las tarjetas (clásicas, premium e inline) se quedaban azul-grisáceas del tema oscuro porque `--lm-card` y las variables premium (`--pm-card`, etc.) no se sobreescribían y algunas reglas de negro quedaban pisadas por las de oscuro. Ahora un bloque al final de `app.css` (gana por orden de fuente) pone **todas las tarjetas negras (#141414) con borde y texto de contraste**. También se corrigió el contraste de las tarjetas ámbar/verde de días PT en temas oscuros (texto más claro).
- **Temas nuevos con contraste:** **Esmeralda** (verde oscuro, base oscuro + `data-tinte`), **Menta** (verde-agua claro) y **Durazno** (cálido claro). Total: 9 temas.
- Archivos: `app.css` (overrides de negro + 3 temas nuevos + contraste PT oscuro), `app.js` (`_TEMAS`, `_TEMA_TINTE`, `aplicarTema` maneja `data-tinte`), `index.html` (botones de tema + script anti-parpadeo actualizado). SW v102.

#### 2026-07-19 — Días PT: notificar a las DOS apps al marcar un día (Edge Function push-notify v5)
- Al marcar un día, ahora se notifica por push a **ambas aplicaciones**: al **administrador** (socios-comicion) *"Día Part-Time por confirmar"* y al **socio** (propi.solicitada) *"Día enviado — en proceso"* confirmándole que su turno quedó registrado y está en espera de validación. Antes solo se avisaba al administrador.
- El trigger de BD ahora dispara con **INSERT o UPDATE a PENDIENTE**, así también avisa cuando un socio **vuelve a marcar** un día que le habían rechazado (sin generar avisos de más al confirmar/rechazar, gracias a la cláusula `WHEN NEW.estado='PENDIENTE'`).
- Backend: Edge Function `push-notify` v5 (helper `push()` reutilizable, doble envío para `dias_pt_solicitados`), trigger `trg_notify_push_dia_pt` (INSERT OR UPDATE). Requiere que el socio tenga las notificaciones activadas en su app.

#### 2026-07-19 — Días PT: total estimado del valor punto por noche en la tarjeta (SW v101)
- La tarjeta "Por confirmar" (clásica y premium) ahora muestra también **"Valor punto x noche (est.)"** = el VP acumulado de los días confirmados + el VP de los días por confirmar. Así el socio ve el total estimado del valor punto por noche, además del monto.
- Archivos: `index.html` (`#ptConfTotalVPCl` / `#ptConfTotalVPPm`), `app.js` (`renderPTConfirmarCard` suma VP confirmado + pendiente). SW v101.

#### 2026-07-19 — Días PT: mostrar el "VP por noche" en cada día por confirmar (SW v100)
- En el detalle "Por confirmar" del calendario, cada día ahora muestra su **VP por noche** (valor de 1 punto esa noche, según la recaudación del día), igual que los días ya confirmados. Si aún no hay recaudación cargada para ese día, indica "sin recaudación aún".
- Archivos: `app.js` (línea VP en el detalle de días pendientes). SW v100.

#### 2026-07-19 — Días PT: "Total estimado" también en la tarjeta de inicio (SW v99)
- La tarjeta "Por confirmar" de la pantalla principal (clásica y premium) ahora muestra además el **Total estimado** = lo ya confirmado (días en planilla) + lo que está por confirmar. Así el socio ve de una sola vez **todo lo que obtendrá**, sin abrir el calendario.
- Archivos: `index.html` (`#ptConfTotalEstCl` / `#ptConfTotalEstPm`), `app.js` (`renderPTConfirmarCard` calcula el total). SW v99.

#### 2026-07-19 — Días PT: tarjeta "Por confirmar" en pantalla principal + calendario minimizable (SW v98)
- **Tarjeta "Por confirmar" en la pantalla principal** (clásica y premium): el socio Part-Time ve, sin abrir el calendario, cuánto ganará cuando la comisión valide los días que marcó (monto + N días). Al tocarla abre el calendario.
- **Calendario minimizable:** botón "Minimizar calendario / Mostrar calendario" que colapsa la cuadrícula para dejar más espacio al detalle de abajo (el modal quedaba muy apretado en pantallas chicas). Se compactaron márgenes y tarjetas del encabezado del modal.
- Archivos: `index.html` (`#ptConfirmarCardClasica`, `#ptConfirmarCardPm`, botón `#calMinBtn`, `#calGridWrap`), `app.js` (`renderPTConfirmarCard`, `toggleCalMinimize`). SW v98.

#### 2026-07-19 — Días PT: mostrar monto estimado en el calendario (SW v97)
- En el calendario del socio Part-Time se agregó un resumen **"Por confirmar" + "Total estimado"**: el socio ve cuánto ganaría con los días que marcó (aún por validar) y el total proyectado del período (confirmado + por confirmar).
- El valor de cada día marcado se calcula **en vivo** con la recaudación de ese día × sus puntos (si aún no hay recaudación cargada, usa el valor guardado al marcar). Aplica tanto al resumen como al detalle "Por confirmar".
- Archivos: `index.html` (bloque `#calPTResumen`), `app.js` (`_ptValorDia`, cálculo del resumen). SW v97.

#### 2026-07-19 — Autogestión de días trabajados Part-Time (SW v96)
- Los socios **Part-Time** ahora pueden **marcar sus días trabajados** tocando el día en su calendario ("Turnos Realizados"). El día queda **"por confirmar"** en un color ámbar distinto y muestra el **valor estimado** que ganarían (`~$…`, calculado con la recaudación de ese día × sus puntos).
- Al marcar un día se crea una solicitud `PENDIENTE` en la tabla `dias_pt_solicitados` (proyecto socios). La administración recibe una **notificación push** ("Día Part-Time por confirmar") aunque tenga la app cerrada.
- Cuando el encargado **valida** el día en socios-comicion, éste pasa a la planilla real (`dias_pt`) y en la app del socio cambia de ámbar a **verde (confirmado)** con su valor definitivo. Si lo **rechaza**, el socio ve el motivo y puede volver a marcarlo.
- El socio puede **quitar** un día que aún esté por confirmar (solo mientras esté `PENDIENTE`). No se permite marcar días futuros ni días ya confirmados.
- Realtime: el calendario del socio se actualiza solo cuando la comisión confirma/rechaza (suscripción a `dias_pt_solicitados` y `dias_pt`).
- Archivos: `supabase-api.js` (acciones `marcarDiaPT`, `desmarcarDiaPT`, `misDiasPTSolicitados` + realtime), `app.js` (calendario interactivo, `togglePTDia`, `cargarDiasPTSolicitados`, detalle "por confirmar"/"rechazados"), `app.css` (estilos `.pt-pendiente` / `.pt-rechazado`), `index.html` (hint del calendario). Backend: tabla `dias_pt_solicitados` + trigger push, edge function `push-notify` v4. SW v96.

#### 2026-07-16 — El socio puede cancelar su solicitud de egreso pendiente (SW v95)
- Se agregó un botón **"Cancelar solicitud"** en la tarjeta de egreso pendiente (en ambas versiones, clásica y premium). Sirve para cuando el socio la hizo por error o se arrepiente.
- Nueva acción `cancelarEgreso` (Supabase): borra **solo** las solicitudes con estado `PENDIENTE` del socio (nunca las ya procesadas) y avisa a socios-comicion por realtime, así deja de aparecer en el panel de administración.
- Archivos: `supabase-api.js` (acción `cancelarEgreso`), `app.js` (botón + `cancelarEgreso()`). SW v95.

#### 2026-07-16 — Congruencia versión Premium: Resumen Contable (Saldo Anterior) y egreso pendiente (SW v94)
- **Problema:** en la versión **Premium/Dashboard** no aparecían el **Resumen Contable** (con "Saldo Anterior") ni el estado de la **solicitud de egreso pendiente** — solo estaban en la versión Clásica.
- **Fix:** se agregaron al dashboard premium los contenedores `#pmDetallesContables` (Resumen Contable con estilo oscuro) y `#pmEgresoEstadoBox` (egreso pendiente). El JS ahora **llena ambas versiones** (clásica y premium) con la misma información: Total Bruto, Saldo Anterior, Descuentos/Anticipos, y la tarjeta de egreso pendiente.
- Archivos: `index.html` (contenedores premium), `app.js` (`renderEgresoEstado` y resumen contable llenan premium). SW v94.

#### 2026-07-16 — Ayuda: menú índice seleccionable que salta directo a cada tema (SW v93)
- La guía de ayuda ahora tiene un botón **"Temas"** (menú índice) arriba a la izquierda: abre una **lista seleccionable** de los 23 temas (ícono + título + número). Al tocar uno salta **directo** a esa ayuda (como en socios-comicion). El botón cambia a "Volver" para regresar al contenido.
- **Contenido actualizado con lo último:** la ayuda de **Temas** ahora menciona los 6 estilos (incluido el nuevo **Negro** OLED) y que el logo se adapta al tema; la ayuda de **Recaudación del Día** menciona el botón **"Abrir Diario de Recaudación"**.
- Archivos: `index.html` (botón Temas, contenedores `#helpIndex`/`#helpContent`/`#helpNav`), `app.js` (`helpToggleIndex`, `helpRenderIndex`, `helpIndexGoTo` + textos actualizados). SW v93.

#### 2026-07-16 — Botón "Abrir Diario de Recaudación" en el modal Recaudación del Día (SW v92)
- Se agregó un botón dentro del modal **Ingresar Recaudación** que abre **diario.propi** (`https://diario-propi.vercel.app/`) en una pestaña nueva, para acceder al diario completo de recaudaciones desde la app del socio.
- Archivos: `index.html`. SW v92.

#### 2026-07-16 — Tema "Negro" (OLED) + logo de marca que se mimetiza con el tema (SW v91)
- **Nuevo tema "Negro"** en Perfil → Ajustes → Tema de la app (además de Oscuro/noche). Se aplica como el tema Oscuro + atributo `data-negro` que empuja los fondos a **negro puro** (OLED), reutilizando todo el restyle oscuro sin duplicar CSS.
- **Logo de marca adaptativo:** el logo del modal Acerca de ahora se **mimetiza con el fondo del tema**. En temas claros su fondo blanco se funde (`mix-blend-mode:multiply`); en Oscuro/Negro se invierte (`invert + hue-rotate`) para que el fondo del logo se vuelva oscuro (mimetizado) y el diseño quede claro y visible.
- Se corrigió también el script pre-render de tema (antes solo aceptaba claro/oscuro/rosa; ahora los 6 temas, evitando parpadeo con aqua/lavanda/negro).
- Archivos: `app.css` (tema negro + logo), `app.js` (`aplicarTema`, `_TEMAS`, `_TEMA_COLOR`), `index.html` (botón, script pre-render, clase `marca-logo`). SW v91.

#### 2026-07-16 — Login: botón "Contactar Comisión" chico arriba (ya no tapa "Activar Dispositivo") (SW v90)
- **Problema:** el botón "Contactar a La Comisión Propina" (`#loginCTA`) estaba `absolute bottom-8` ocupando todo el ancho abajo, y se interponía con el botón "Activar Dispositivo" del setup.
- **Fix:** ahora es un **botón pequeño tipo pill arriba-centro** (con safe-area), texto corto "Contactar Comisión", ícono de WhatsApp reducido. No ocupa toda la pantalla ni tapa el formulario.
- Archivos: `index.html`. SW v90.

#### 2026-07-16 — Logo de marca "CarlosPN Interactive" en el modal Acerca de (SW v89)
- Se agregó el logo oficial (`img/carlospn-logo.png`) arriba de la marca en el modal **Acerca de**, reemplazando el ícono `code` placeholder. Debajo queda el subtítulo "Sistema Profesional de Gestión · 2026".
- Archivos: `index.html`, `img/carlospn-logo.png` (nuevo). SW v89.

#### 2026-07-16 — Fix: anticipos anteriores AÚN repetían fechas — dedup por registro (SW v88)
- La agrupación por mes no bastaba: si un mismo anticipo venía de GAS y de Supabase con etiquetas de período distintas, seguía apareciendo dos veces.
- **Fix definitivo:** ahora se deduplica **por registro** (`fecha`+`monto`): Supabase es la fuente de verdad y de GAS solo se agregan los anticipos que **no** estén ya en Supabase. No se deduplica dentro de una misma fuente, así que no se pierden dos anticipos iguales legítimos del mismo día.
- Además, los registros con período nulo se agrupan por el mes real derivado de la fecha (regla 15→14), y cada grupo se ordena por fecha.
- Archivos: `supabase-api.js` (`getHistorialCompletoSocio`). SW v88.

#### 2026-07-16 — Fix: anticipos anteriores repetían fechas/meses (SW v87)
- **Bug:** tras leer el histórico de GAS y Supabase, un mismo mes podía aparecer **duplicado** porque venía con nombres distintos ("Julio 2026" en GAS vs "CIERRE_JULIO_DE 2026" en Supabase), repitiendo las fechas.
- **Fix:** ahora los períodos se agrupan por **mes canónico (año-mes)** y cada mes usa **una sola fuente** (Supabase reemplaza el mes completo si lo tiene; GAS solo para meses que Supabase no tenga). Se evita duplicar sin riesgo de sub-contar (no se hace dedup por registro, que podría borrar dos anticipos iguales del mismo día).
- Archivos: `supabase-api.js` (`getHistorialCompletoSocio`). SW v87.

#### 2026-07-16 — Fix: los anticipos anteriores del mes no aparecían (SW v86)
- **Bug:** los anticipos anteriores del socio no mostraban los períodos recién archivados (ej. el mes en curso). Causa: `getHistorialCompletoSocio` leía el histórico **solo desde GAS**, pero el archivado actual (al marcar Cobrado o al cerrar el mes en socios-comicion) se guarda en la tabla Supabase `anticipos_historial`, no en GAS.
- **Fix:** ahora también se lee `anticipos_historial` de Supabase y se fusiona con lo de GAS (evitando duplicar períodos que ya vengan de GAS).
- **Extra:** las etiquetas de período se muestran legibles (`_fmtPeriodoLabel`): "CIERRE_JULIO_DE 2026", "JULIO_2026" o "2026-06-15" → "Julio 2026".
- Archivos: `supabase-api.js` (lectura de `anticipos_historial`), `app.js` (`_fmtPeriodoLabel` en las 2 vistas de anticipos anteriores). SW v86.

#### 2026-07-09 — Contador de pedidos descriptivo (SW v85)
- El contador de Últimos Movimientos ahora dice **"Llevas N pedidos · te restan X · máximo 8"** (antes "N / 8"). El número que resta se pinta verde/ámbar/rojo según cuánto queda. Clásico y Dashboard.

#### 2026-07-09 — Contador de movimientos "N / 8" en Últimos Movimientos (SW v84)
- Junto al título **"Últimos Movimientos"** (Balance) se agregó un **contador** con la cantidad de movimientos del período y el **máximo** (por defecto **8**), formato **"5 / 8"**. Aplica a la versión clásica y a la Dashboard.
- Cambia de color al llegar/pasar el máximo: ámbar si iguala 8, rojo si lo supera.
- El máximo está en la constante `MOVS_MAX` (app.js) — fácil de ajustar.
- Archivos: `index.html` (badges `#anticiposCount` / `#pmMovsCount`), `app.js` (actualiza los contadores con `merged.length`). SW v84.

#### 2026-07-09 — Notas destacadas: "Destacado para: …" visible para todos en Soporte (SW v83)
- Antes, en el chat **Soporte** de propi solo el socio destacado veía algo ("⭐ PARA TI"); el resto veía la nota sin ninguna marca de destacado. Ahora **todos** ven un badge **"⭐ Destacado para: [nombres]"** en la nota (resuelve IDs → nombres con `allSocios`), y el socio destacado sigue viendo **"⭐ PARA TI"** + anillo dorado.
- Nota: la nota destacada se guarda y muestra correctamente en Supabase (`notas_recaudacion.destacados`). Solo aparece en **Soporte** (que es donde viven las notas admin), no en Equipo/Admin (son otros sistemas de mensajes).
- Archivos: `app.js` (badge "Destacado para" en render del chat Soporte). SW v83.

#### 2026-07-09 — Fix deploy: vercel.json con rutas exactas (los cambios no se reflejaban) (SW v82)
- **Causa probable**: el `vercel.json` usaba un `source` con grupo/alternación `"/(index.html|app.js|app.css|supabase-api.js|originalindex.html)"`. Ese patrón puede **fallar la validación de Vercel y romper el deploy**, dejando la app servida en la última versión buena (por eso desde ~v78 los cambios no se reflejaban en el dispositivo).
- **Fix**: se reescribió `vercel.json` con **una regla por archivo con ruta exacta** (`/index.html`, `/app.js`, `/app.css`, `/supabase-api.js`, `/`), 100% válidas para Vercel. Mismo arreglo en `diario.propi`. (`socios-comicion` ya usaba `/js/(.*)`, patrón válido, y sí desplegaba.)
- Al corregir el deploy, todas las versiones acumuladas (v78–v82) quedan disponibles. SW v82.

#### 2026-07-09 — Acceso al Diario de Recaudación desde Ajustes (SW v81)
- En **Perfil → ⚙️ Ajustes** se agregó un acceso **"Diario de Recaudación"** que abre `diario.propi` en una pestaña nueva (`https://diario-propi.vercel.app/`).
- Nota: la URL está hardcodeada en `index.html` (marcada con comentario) — ajustar si el dominio de despliegue es distinto.
- Archivos: `index.html` (enlace en el modal de Ajustes). SW v81.

#### 2026-07-09 — Notas destacadas: "⭐ Para ti" en el chat Soporte (SW v80)
- Cuando la administración crea una nota **destacada para un socio** (desde socios-comicion), a ese socio le aparece en el chat **Soporte** con un **anillo dorado** y la etiqueta **⭐ PARA TI**, para que no se le pase.
- Se lee de `notas_recaudacion.destacados` (IDs de socio); si el `currentUser.ID` está en la lista, se resalta la burbuja.
- Archivos: `supabase-api.js` (getNotes REC devuelve `destacados`), `app.js` (resaltado en el render del chat ADMIN/Soporte). SW v80.

#### 2026-07-09 — Scroll Dashboard a prueba de balas: espaciador al final (SW v79)
- Refuerzo del fix de scroll de la versión Dashboard: además del padding inferior con `env(safe-area-inset-bottom)`, se agregó un **div espaciador** (`90px + área segura`) al final de `#homePremium` (tras "Últimos Movimientos") y de `#historyPremium`. Así el último ítem (ej. el primer anticipo con su fecha) **nunca queda tapado por la barra inferior** en ningún teléfono, incluso en casos límite de flex/scroll.
- Archivos: `index.html` (espaciadores). SW v79.

#### 2026-07-09 — Vercel: no-cache para HTML/JS core (destraba versiones viejas) (SW v78)
- **Causa**: dispositivos quedaban "pegados" en una versión vieja porque el navegador/CDN servía copias cacheadas de `index.html`/`app.js`/`app.css`/`supabase-api.js`, y el updater viejo no lograba refrescarlas.
- **Fix**: se ampliaron los headers en `vercel.json` para servir esos archivos core (y `/`) con `Cache-Control: no-cache, must-revalidate` (antes solo `sw.js`). Así el navegador revalida siempre y baja la versión nueva en la próxima apertura, sin necesidad de recarga forzada.
- Esto, junto al fix de scroll (v77, que sí está aplicado en el código pero no había llegado a los dispositivos), resuelve el problema del scroll una vez que baje la versión.
- Archivos: `vercel.json`. SW v78.

#### 2026-07-09 — Fix scroll versión Dashboard + guía de ayuda actualizada (SW v77)
- **Fix scroll en versión Dashboard**: en `#homePremium` y `#historyPremium` se cambió `min-height:calc(100vh - 120px)` (el `100vh` varía en iPhone/Android y descuadraba el scroll) por `min-height:100%`, y el padding inferior pasó a `calc(110px + env(safe-area-inset-bottom))`. Así el contenido siempre llega al final y libra la barra inferior en todos los modelos (iPhone con notch, Redmi, etc.).
- **Guía de ayuda actualizada**: se agregaron slides para **Versión de inicio (Clásica/Dashboard)**, **Correo electrónico** y **Personalizar el ingreso (ojito del PIN + forma de la foto)**; y el slide de Temas ahora menciona los 5 temas (Claro/Oscuro/Rosa/Aqua/Lavanda) y el botón ⚙️ Ajustes.
- Archivos: `index.html` (padding/min-height premium + novedades del banner), `app.js` (helpSlides). SW v77.

#### 2026-07-09 — Fix robusto de actualización: banner + recarga garantizada (SW v76)
- **Recarga garantizada al activar el SW nuevo**: se cambió a un patrón estándar con guardia — cuando el SW nuevo toma control (`controllerchange`) la app recarga UNA vez para aplicar la versión (sin recargar en la instalación inicial). Antes dependía de una bandera (`_updateApplying`) que podía no dispararse.
- **Detección más amplia**: ahora también se sigue el SW que ya está `installing` al cargar (no solo `waiting`), así el banner aparece en más casos. Red de seguridad: si `controllerchange` no dispara en 2.5 s, recarga igual.
- **Contenido siempre fresco**: en el Service Worker los archivos core (html/js/css y navegaciones) se piden con `cache:'no-store'`, así el navegador/CDN no puede servir una copia vieja → la versión nueva baja de verdad.
- Nota: como con los fixes anteriores, esto recién toma efecto tras cargar esta versión una vez.
- Archivos: `index.html` (`_seguirWorker`, controllerchange con guardia, `_aplicarActualizacion`), `sw.js` (fetch `no-store` para core). SW v76.

#### 2026-07-09 — Correo del socio: se solicita al ingresar, se guarda en Supabase y se muestra en el perfil (SW v75)
- Al ingresar a la app, si el socio **no tiene correo**, aparece un aviso: "Se solicita agregar tu correo electrónico para completar tu información" (modal `#correoModal`, ~3s después de entrar; espera si el modal de RUT/ayuda está abierto).
- El correo se **guarda en Supabase** (nueva columna `socios.correo`, acción `guardarCorreoSocio` en `supabase-api.js`, con auditoría). El mapeo `getSocios` ahora incluye `Correo`.
- Se muestra en **Perfil → Información Laboral** (fila "Correo" ✉️). La fila es **tocable para agregar/editar** el correo manualmente (abre el mismo modal). Validación de formato de email.
- Archivos: `supabase-api.js` (`guardarCorreoSocio` + `Correo` en getSocios), `index.html` (`#correoModal` + fila Correo en el perfil), `app.js` (`checkCorreoRequired`, `openCorreoModal`, `submitCorreo`, poblar `#perfilCorreo`). Migración Supabase: `add_correo_to_socios`. SW v75.

#### 2026-07-09 — Forma de la foto movida a Ajustes + foto de login más grande (SW v74)
- El selector **"Forma de la foto"** se movió del login a **Perfil → ⚙️ Ajustes** (junto a Tema y Versión de inicio). Cambia la forma del avatar del login (Círculo/Redondeado/Cuadrado/Hexágono) y se guarda por dispositivo. El resaltado del chip activo se sincroniza al abrir el perfil.
- La **foto del login se hizo más grande** (de 80px a 128px, `w-20`→`w-32`), con el ícono/placeholder acorde.
- El **ojito para ver el PIN** se mantiene en el login (es un botón del propio campo).
- Archivos: `index.html` (selector movido al modal, avatar login `w-32`), `app.js` (`_aplicarLoginShape` en `renderPerfil`). SW v74.

#### 2026-07-09 — Login: ojito para ver el PIN + elegir forma de la foto (SW v73)
- **Ojito (ver PIN)**: se agregó un botón 👁 en los campos de PIN (acceso rápido `#fastPIN` y "Crear PIN" `#setupPIN`) para mostrar/ocultar el PIN. Alterna `type` password/text y el ícono visibility/visibility_off.
- **Forma de la foto del login**: en el acceso rápido se agregó un selector "Forma de la foto" con 4 opciones — **Círculo, Redondeado, Cuadrado, Hexágono**. Se aplica al avatar del login y se guarda por dispositivo (`propi_login_shape`).
- Archivos: `index.html` (ojitos + selector de forma), `app.css` (`.login-shape-btn`), `app.js` (`togglePinVisible`, `setLoginAvatarShape`, `_aplicarLoginShape`). SW v73.

#### 2026-07-09 — Dashboard: ahora SÍ sigue el tema (claro/oscuro/rosa/aqua/lavanda) (SW v72)
- Antes el Dashboard forzaba una paleta oscura fija y elegir un tema casi no cambiaba nada. Ahora el **layout Dashboard sigue completamente el tema de color**: con temas claros se ve claro, con Oscuro se ve oscuro, y con Rosa/Aqua/Lavanda toma esos colores.
- Se implementó con variables `--pm-*` (fondo, tarjeta, texto, acento, verde, rojo, borde) definidas por tema, y reglas `.pm-layout [style*=...]` que mapean los colores fijos del layout premium a esas variables. Las secciones con skin (Estadísticas/Mensajes/Perfil) ahora siguen el tema por su cuenta (se quitó el forzado oscuro `data-premium`).
- Las **tarjetas bancarias** se mantienen oscuras a propósito (como una tarjeta real), protegidas del mapeo.
- Archivos: `app.css` (variables `--pm-*` + mapeo `.pm-layout`), `index.html` (clase `pm-layout` en `#homePremium` y `#historyPremium`). SW v72.

#### 2026-07-09 — Dashboard: el acento sigue el tema de color elegido (SW v71)
- Antes, en la versión Dashboard el skin premium tenía una paleta fija y **elegir un tema no cambiaba nada**. Ahora el **acento premium sigue el tema de color** (Rosa, Aqua, Lavanda) manteniendo el fondo oscuro.
- Se hace con reglas `:root[data-premium][data-premium][data-theme="X"]` que cambian las variables de acento (`--lm-primary`/`--lm-accent`/`--lm-secondary`) para las secciones con skin, y overridean los colores de acento fijos del layout premium (`#cee6f7` celeste y `#6366f1` índigo de los íconos del Perfil) al color del tema. Oscuro y Claro mantienen el acento azul/celeste por defecto.
- Los verdes de montos positivos se mantienen (color semántico de ganancia).
- Archivos: `app.css` (acento premium por tema). SW v71.

#### 2026-07-09 — Dashboard: tarjeta "Valor Punto" + Mis Puntos dentro de la tarjeta bancaria (SW v70)
- La tarjeta de stat que decía **"Mis Puntos"** ahora se titula **"Valor Punto"** y muestra ese valor ($ del punto a hoy) como número grande (verde).
- **Mis Puntos** se movió **dentro de la tarjeta bancaria** (vista tarjeta del balance): aparece en la fila inferior, al centro (Titular · Mis Puntos · Miembro desde), en dorado. Aplica a la tarjeta clásica y a la premium.
- Se pobla en `_refrescarTarjeta` leyendo los puntos del socio (`#perfilPuntos`). IDs nuevos: `tarjetaPuntos` / `tarjetaPuntosPm`.
- Archivos: `index.html` (tarjeta Valor Punto + columna Mis Puntos en ambas tarjetas bancarias), `app.js` (`_refrescarTarjeta`). SW v70.

#### 2026-07-09 — Dashboard: "Mis Puntos" y "Remanente" lado a lado (SW v69)
- En la home de la versión Dashboard, las tarjetas **Mis Puntos** y **Remanente** pasaron de estar apiladas (una debajo de otra) a estar **lado a lado** en dos columnas, ocupando menos espacio. Se rediseñaron como tarjetas compactas verticales (ícono + título arriba, valor grande, y un dato secundario abajo: "Valor punto" / "Pasa al próximo mes"). IDs sin cambios (`pmPuntos`, `pmValorPunto`, `pmRemanente`).
- Archivos: `index.html` (grid de stats premium a 2 columnas). SW v69.

#### 2026-07-09 — Fix: el banner de actualización no aparecía (chequeo periódico) (SW v68)
- **Causa**: la app solo chequeaba actualizaciones al cargar y al volver al foco (`visibilitychange`). Si quedaba abierta en primer plano, nunca se chequeaba → el banner no aparecía y había que recargar a mano (Ctrl+R).
- **Fix**: el Service Worker ahora se registra con `updateViaCache:'none'` (nunca cachea `sw.js` por HTTP) y se agregó un **chequeo periódico cada 45 s** (`reg.update()`) mientras la app está abierta. Así el banner aparece solo poco después de publicar una versión.
- Además, al terminar la cuenta regresiva de 15 s el banner ahora **recarga** para aplicar la versión (la sesión se mantiene por el auto-login), en vez de solo activarse en silencio — así la versión aparece sin acción manual.
- Nota: este arreglo recién toma efecto **después de cargar esta versión una vez** (la app en ejecución todavía tiene la lógica vieja). De ahí en adelante, las actualizaciones aparecen solas.
- Archivos: `index.html` (registro SW + `setInterval` de chequeo + cuenta regresiva recarga). SW v68.

#### 2026-07-09 — Calendario condicional en premium + cambio de tarjeta en ambas versiones (SW v67)
- **Calendario**: en la versión Dashboard el acceso "Ver Calendario de Turnos" aparecía siempre. Ahora se oculta si no hay días/ausencias que mostrar (`globalDiasCalendar.length === 0`), igual que en la clásica (para Planta sin ausencias no aparece).
- **Efecto de cambio de tarjeta en ambas versiones**: el botón 💳 que alterna entre la tarjeta normal y la **tarjeta bancaria** ahora también está en la versión **Dashboard**. Se agregó una tarjeta bancaria premium (`#pmBalanceTarjeta`) y `_aplicarBalanceEstilo` / `_refrescarTarjeta` ahora manejan los dos juegos de tarjetas (clásica y premium) con la misma preferencia (`propi_balance_estilo`).
- Archivos: `index.html` (`#pmBalanceCard`, `#pmBalanceTarjeta`, botón 💳), `app.js` (`_aplicarBalanceEstilo`/`_refrescarTarjeta` para ambas versiones, `#pmCalBtn` condicional, monto premium en vivo). SW v67.

#### 2026-07-09 — Fix: Perfil y Mensajes no tomaban el skin premium (especificidad) (SW v66)
- **Causa**: en tema Oscuro, sus convertidores de estilos inline (`:root[data-theme="oscuro"] [style*=...]`) tenían **más especificidad** que el skin premium por clase, así que ganaban. Estadísticas cambiaba (usa variables) pero **Perfil y Mensajes** (usan estilos inline `#fff`/`#001723`) se quedaban con los colores del Oscuro.
- **Fix**: el skin premium pasó de una clase en `body` a un atributo `data-premium` en `<html>`, con selector `:root[data-premium][data-premium] …` (atributo repetido) para **garantizar mayor especificidad** que las reglas del tema Oscuro. Ahora Perfil y Mensajes sí toman la paleta premium.
- Archivos: `app.css` (reglas `:root[data-premium][data-premium]`), `app.js` (`_aplicarHomeVersion` set/removeAttribute `data-premium`). SW v66.

#### 2026-07-09 — Versión Dashboard: skin premium en toda la app + fix header en Mensajes (SW v65)
- **Fix Mensajes**: el skin anterior ponía un fondo opaco directo sobre `#tab-chat`, que **tapaba el header** (foto, campana, área, ayuda, cerrar) que se ve por el espaciador superior del chat. Ahora el skin se aplica al `body` (no al chat directo), así el header vuelve a verse.
- **Header y barra inferior acordes al tema**: al aplicar `.premium-skin` al `body`, el header (`.glass`) y la barra de navegación (`#bottomNav`) toman las variables premium (`--glass-bg` / `--nav-bg` / `--nav-border`), quedando en el tono oscuro premium.
- **Paleta más distinta**: el skin ahora usa los tonos del mockup (fondo `#0f1419`, tarjetas `#171c22`, verde `#3de273`) en vez de la paleta oscura estándar, para que se note el cambio respecto al tema Oscuro. Se mantiene el primario azul para no romper el contraste de botones/tarjetas con texto blanco.
- Archivos: `app.css` (`.premium-skin` con variables de header/nav + tonos mockup), `app.js` (`_aplicarHomeVersion` aplica el skin al `body`). SW v65.

#### 2026-07-09 — Versión Dashboard: tema premium también en Estadísticas, Mensajes y Perfil (SW v64)
- Se completó la **Versión Dashboard** aplicando el **tema oscuro premium** a las secciones **Estadísticas**, **Mensajes** y **Perfil**, reutilizando su mismo layout y cableado (no se duplicó lógica).
- Se hace con una clase `.premium-skin` que redefine la paleta (variables `--lm-*`, `--color-card`, `--chat-bg`, etc.) y convierte los estilos inline claros a oscuros, sólo en esas tres pestañas y sólo cuando la versión Dashboard está activa. Usa los colores del tema oscuro (probados) para no romper contrastes.
- `_aplicarHomeVersion` ahora: muestra los layouts premium de inicio/historial **y** aplica/quita `.premium-skin` en `#tab-stats`, `#tab-chat`, `#tab-perfil`. Al volver a "Clásica", todo regresa al tema de color elegido.
- Archivos: `app.css` (`.premium-skin`), `app.js` (`_aplicarHomeVersion`). SW v64.

#### 2026-07-09 — Historial premium: desglose de tipos por día (SW v63)
- La lista de **Movimientos** del Historial premium ahora muestra, por día, una **tarjeta con el desglose de tipos** (Mesas, MDA, Bóveda, etc. con su monto), igual que la versión clásica, más la grilla **Valor Punto / Mis Pts / Mi Ganancia** y la etiqueta del día (Ausencia / Trabajado / No trabajado). Antes solo mostraba una línea por día sin los tipos.
- Archivos: `app.js` (reconstrucción del bloque premium del historial con `tiposHTML`), `index.html` (`#pmHistList` sin caja, cada día es su propia tarjeta). SW v63.

#### 2026-07-09 — Historial premium: opción "Anticipos Anteriores" (SW v62)
- En la vista **Historial** de la Versión Dashboard se agregó el toggle **Movimientos / Anticipos Anteriores** (igual que en la clásica).
- "Anticipos Anteriores" reutiliza la misma carga de datos (`loadHistorialAnticipos` → `getHistorialCompletoSocio`) y los muestra en **estilo oscuro**: cada período como tarjeta con su total y el detalle de registros (fecha, responsable, monto). Se carga la primera vez que se abre.
- Archivos: `index.html` (toggle + `#pmHistMovsView` / `#pmHistAntView` / `#pmAntAntList`), `app.js` (`pmSwitchHist`, `pmRenderAntAnt`). SW v62.

#### 2026-07-09 — Versión Dashboard: también el Historial en estilo premium (SW v61)
- La **Versión Dashboard** ahora incluye la sección **Historial** en estilo oscuro premium (además del inicio). Al activar Dashboard, el Historial muestra: **stats** (Total Rendimiento, Anticipos Solicitados, Valor Punto a hoy) y una **lista de movimientos** que combina rendimientos por día (verde) y anticipos (rojo), ordenados por fecha, con contador — todo con **datos reales**.
- Se envolvió el historial clásico en `#historyClasico` y se agregó `#historyPremium`. `_aplicarHomeVersion` alterna ahora ambas secciones (inicio + historial) a la vez.
- Archivos: `index.html` (`#historyPremium`), `app.js` (poblado de `pmHist*` en el cálculo, toggle por pares en `_aplicarHomeVersion`). SW v61.

#### 2026-07-09 — Nueva "Versión de inicio: Dashboard (Premium)" seleccionable (SW v60)
- Se agregó una **versión alternativa de la pantalla de inicio/Balance** con estética oscura premium (tipo dashboard), **manteniendo la clásica**. Se elige desde **⚙️ Ajustes → Versión de inicio** (Clásica / Dashboard) y se guarda por dispositivo (`propi_home_version`).
- La versión Dashboard incluye: saludo, **tarjeta de balance premium** (balance, miembro desde, ID), **Accesos Rápidos** (Recaudación del Día, Solicitar Egreso, Ver Calendario), **stats** (Mis Puntos + Valor Punto Hoy, Remanente) y **Últimos Movimientos** — todo poblado con los **datos reales** del socio (mismos cálculos que la clásica).
- El home clásico se envolvió en `#homeClasico`; la nueva vista es `#homePremium` (oscura, hardcodeada, independiente del tema de color).
- Archivos: `index.html` (`#homePremium`, selector en el modal de Ajustes), `app.js` (`setHomeVersion`, `_aplicarHomeVersion`, `_refrescarPremium`, poblado de `pm*` en el cálculo del balance), `app.css` (`.homever-btn`). SW v60.

#### 2026-07-09 — Barra inferior legible en oscuro + 2 temas nuevos + Balance estilo tarjeta bancaria (SW v59)
- **Barra de navegación en modo oscuro**: la pestaña activa quedaba casi invisible (usaba `#001723` fijo). Ahora usa `rgb(var(--lm-primary))`, así resalta en todos los temas.
- **Dos temas nuevos** para probar: **Aqua** (turquesa 💧) y **Lavanda** (púrpura 🌿), ambos claros. Se eligen desde ⚙️ Ajustes → Tema. (`_TEMAS`/`_TEMA_COLOR` en `app.js`, bloques de variables en `app.css`.)
- **Balance estilo "tarjeta bancaria"** (versión alternativa, se mantiene la clásica): en la pestaña **Balance**, botón 💳 en la tarjeta para alternar entre la vista clásica y una **tarjeta tipo bancaria** (chip dorado, monto, número enmascarado con los últimos 4 del ID, titular y "miembro desde"). La preferencia se guarda por dispositivo (`propi_balance_estilo`). El botón 🔄 en la tarjeta vuelve a la clásica.
- Archivos: `app.css` (`.nav-btn.active`, temas aqua/lavanda), `index.html` (botones de tema, `#balanceTarjeta`, botón alternar), `app.js` (`toggleBalanceEstilo`, `_aplicarBalanceEstilo`, `_refrescarTarjeta`, sync del monto). SW v59.

#### 2026-07-09 — Perfil: engranaje ⚙️ arriba abre Ajustes en modal + Antigüedad dentro de Información Laboral (SW v58)
- **Ajustes y personalización** ya no ocupa espacio en la página: se movió a un **engranaje ⚙️ en la esquina superior derecha** del Perfil. Al tocarlo abre un **modal** (hoja inferior) con las 4 opciones: Cambiar nombre, Notificaciones, Tema y Mis Documentos. Reemplaza la barra desplegable anterior.
- **Antigüedad y Puntos** se integró **dentro de Información Laboral**: "Años en Casino" 🏅 y "Mis Puntos" ⭐ ahora son filas de esa tarjeta (con el mensaje descriptivo al pie). Se eliminó la tarjeta verde separada.
- Archivos: `index.html` (engranaje `abrirAjustesModal()`, `#ajustesModal`, filas de antigüedad en Info Laboral), `app.js` (`abrirAjustesModal`/`cerrarAjustesModal`; se quitó `togglePerfilAjustes`), `app.css` (se quitó la regla de la barra). SW v58.

#### 2026-07-09 — Perfil: RUT en Información Laboral + barra de Ajustes visible en oscuro (SW v57)
- En **Perfil → Información Laboral** se agregó la fila **RUT** del socio (huella 🔎). Toma `currentUser.Rut` y, si no viene, usa el RUT guardado en el login del dispositivo (`visor_secure_auth`), formateado (12.345.678-9).
- **Modo oscuro**: la barra **⚙️ Ajustes y personalización** perdía contraste (quedaba igual que las tarjetas). Se le dio un fondo/borde propios en oscuro para que resalte como botón. Archivos: `app.css` (`#perfilAjustesBtn` en `[data-theme="oscuro"]`).
- Archivos: `index.html` (fila RUT), `app.js` (poblar `#perfilRut`). SW v57.

#### 2026-07-09 — Perfil: opciones agrupadas en un desplegable "Ajustes y personalización" (SW v56)
- En **Perfil**, las opciones **Cambiar mi nombre**, **Notificaciones**, **Tema de la app** y **Mis Documentos** ahora están dentro de un botón desplegable **⚙️ Ajustes y personalización** que las muestra/oculta al tocarlo (chevron que rota).
- Deja el Perfil más limpio: por defecto se ve solo la tarjeta del socio + el botón de ajustes; el resto se despliega bajo demanda.
- Archivos: `index.html` (botón `#perfilAjustesBtn` + contenedor `#perfilAjustesPanel` envolviendo los 4 bloques), `app.js` (`togglePerfilAjustes`). SW v56.

#### 2026-07-09 — La administración puede enviar documentos al socio (Mis Documentos) (SW v55)
- Ahora los documentos que la **administración** sube desde socios-comicion (Documentación → por socio) le aparecen al socio en **Perfil → Mis Documentos**, junto con los que él mismo subió.
- Los documentos enviados por la administración se muestran **destacados** (fondo lila + etiqueta "📎 Enviado por administración") y **el socio no puede eliminarlos** (solo puede borrar los que subió él).
- Sin cambios de esquema: se reutiliza la tabla `documentos` (`categoria='socio'`, `socio_id`, `subido_por`). El socio ya filtra por su `socio_id`, así que el documento aparece automáticamente.
- Archivos: `app.js` (`renderDocumentos`: distingue `subido_por` ≠ `'socio'`). SW v55.

#### 2026-07-07 — Campana de notificaciones en el header (SW v53)
- Nueva **campana** 🔔 en el header (junto al área/ayuda/salir) con un **badge del número de mensajes sin leer** de los tres canales.
- Al **tocarla** despliega un **menú** con los mensajes sin leer (etiqueta del canal: Soporte / Equipo / Admin, autor, texto y hora).
- Al **tocar un mensaje** lleva al canal correcto: Soporte→Soporte, Admin→Admin, y Equipo→Equipo abriendo la conversación del socio que escribió (o Chat General si era general).
- No leídos = mensajes de otros posteriores a la última vez que abriste ese canal (marcas `_rec_last_seen`, `_social_last_seen`, `_admin_priv_last_seen`; se inicializan a "ahora" la primera vez para no contar el historial).
- Archivos: `index.html` (campana + menú), `app.js` (`_getUnread`, `renderNotifBell`, `toggleNotifMenu`, `_irAMensaje`; enganchado a los ciclos de refresco). SW v53.


#### 2026-07-07 — Fix: no marcar "conectado" en Telegram al volver tras inactividad (SW v52)
- **Bug:** al volver a la app después de los 15 min de inactividad, el `visibilitychange` hacía `pingConexion()` (enviaba "conectado" a Telegram) **antes** de verificar la inactividad, mostrando una reconexión falsa cuando en realidad la sesión se cerró por inactividad.
- **Fix:** al volver, primero se verifica la inactividad; si ya expiró, se cierra la sesión **sin** enviar "conectado". Además `logout()` ahora envía la **desconexión** (`logoutConexion`) antes de limpiar el usuario, para que Telegram refleje el cierre.
- Archivos: `app.js` (handler `visibilitychange` + `logout`). SW v52.


#### 2026-07-07 — Actualización realmente silenciosa + no vuelve al login (SW v51)
- **Bug 1 (volvía al login):** al aplicar una actualización, la recarga mostraba el login pidiendo el PIN. Ahora `checkSecurity` **auto-entra** si la sesión sigue viva (PIN de sesión en `sessionStorage`), salvo que haya expirado por inactividad (≥15 min). El cierre por inactividad/manual (`logout`) ahora **borra el PIN de sesión**, así tras inactividad sí se pide PIN (seguridad intacta).
- **Bug 2 (el aviso reaparecía al Actualizar):** se quitó la recarga prematura (fallback de 1200 ms) que recargaba antes de que el nuevo SW activara. Ahora el botón "Actualizar" recarga **una sola vez** vía `controllerchange` (con red de seguridad a 3.5 s) y no reaparece.
- **Auto-update (15 s):** ahora es **realmente silencioso** — activa el nuevo SW en segundo plano **sin recargar**; se aplica al reabrir la app. La recarga automática por `controllerchange` solo ocurre si el usuario tocó "Actualizar".
- Archivos: `app.js` (`checkSecurity` auto-login + `logout` limpia sesión), `index.html` (`_actualizarSilencioso`, `_aplicarActualizacion`, `controllerchange` guardado). SW v51.


#### 2026-07-07 — Equipo: foto del socio en la lista de contactos y el chat (SW v50)
- Al elegir con quién mensajear en **Equipo**, la **lista de contactos** ahora muestra la **foto** de cada socio (antes solo la inicial), y la **barra del destinatario** muestra su foto al seleccionarlo.
- En las burbujas del chat Equipo, el avatar del emisor muestra su foto (se identifica por `socId`). Si el socio no tiene foto, se mantiene la inicial.
- Archivos: `app.js` (`renderUsersList`, `selectSocialTarget`, avatar en `renderChat`). SW v50.


#### 2026-07-07 — Chat: opción de Cámara y Galería al adjuntar foto (SW v49)
- La barra del chat ahora tiene **dos botones**: **📷 (Tomar foto — cámara)** e **🖼️ (Elegir de galería)**, en vez de un solo botón que abría solo la galería.
- Archivos: `index.html` (dos inputs con/sin `capture` + dos botones), `app.js` (reset de ambos inputs). SW v49.


#### 2026-07-07 — Enviar y ver fotos en el chat (Soporte, Equipo y Admin) (SW v48)
- El socio ahora puede **adjuntar una foto** (botón 📷 en la barra del chat) y enviarla en **cualquier canal**: Soporte, Equipo o Admin. Se sube al bucket público `avatares` (carpeta `chat/`).
- Las fotos **se ven** en las burbujas de los tres canales, ampliables al tocarlas. Incluye las fotos que envía la administración desde socios-comicion (Mensajes/Admin) y las notas de Soporte.
- Interceptor: `addNote` (Soporte→`notas_recaudacion`, Equipo→`chat_mensajes`) y `sendAdminMsg` (`mensajes_admin`) ahora guardan/leen `foto_url`; los mapeos de `getNotes`/`getAdminMsgs` devuelven `foto`.
- Archivos: `index.html` (botón + preview), `app.js` (adjuntar/subir/enviar/render), `supabase-api.js` (handlers). SW v48.


#### 2026-07-07 — Ver foto en las notas de Soporte (SW v47)
- Las notas del administrador (chat **Soporte**) ahora pueden traer una **foto**: si la nota tiene imagen, se muestra en la burbuja y **se amplía al tocarla** (lightbox).
- La foto la adjunta la administración desde socios-comicion (sección Notas). Aquí solo se lee la URL (`notas_recaudacion.foto_url`).
- Archivos: `supabase-api.js` (mapea `foto` en getNotes REC), `app.js` (render de la imagen en el chat). SW v47.


#### 2026-07-07 — Foto de perfil ampliable al tocarla (SW v46)
- Al **tocar la foto de perfil** (en Perfil, en el header junto al nombre, y en el login) se abre un **lightbox** que la muestra en grande. Si no hay foto, tocar el avatar del Perfil abre el menú para agregarla (la inicial se mantiene como siempre si no sube foto — opcional).
- Nuevo overlay `#fotoGrandeOverlay` + `verFotoGrande()`, `cerrarFotoGrande()`, `tapPerfilAvatar()`, `_authFoto()`.
- Archivos: `index.html` (overlay + onclicks), `app.js`. SW v46.


#### 2026-07-07 — El botón "Contactar a La Comisión Propina" solo aparece sin cuenta activa (SW v45)
- **Cambio de comportamiento:** el botón de WhatsApp del login ahora **solo se muestra cuando NO hay una cuenta activa vinculada** en el dispositivo (usuario nuevo, pantalla "Vincular Cuenta"). Si el socio ya tiene su cuenta (acceso rápido con PIN) o ya ingresó, el botón **desaparece**.
- Implementación: el CTA (`#loginCTA`) arranca oculto y `_toggleLoginCTA()` lo muestra solo si no existe `auth.id` en `visor_secure_auth`. Se re-evalúa en `checkSecurity`, `switchToSetup` y `cancelRecovery`.
- Archivos: `index.html` (`id="loginCTA"` + oculto por defecto), `app.js` (`_toggleLoginCTA`). SW v45.


#### 2026-07-07 — Notificaciones push al teléfono (SW v44)
- **Nueva funcionalidad:** el socio puede activar **notificaciones push** desde **Perfil → "Activar notificaciones"**. Recibe avisos en el teléfono **aunque la app esté cerrada** para: **mensajes del administrador** y **egresos procesados/rechazados** (ambos llegan como mensaje del administrador).
- **Arquitectura:** Web Push (VAPID) + Service Worker. La suscripción del navegador se guarda en la tabla `push_subscriptions` (proyecto socios). Un **trigger** en `mensajes_admin` (pg_net) llama a la **Edge Function `push-notify`**, que envía el push con `web-push` a las suscripciones del socio.
- **iPhone:** las notificaciones web requieren que el socio **agregue la app a la pantalla de inicio** (instalarla como PWA) y la abra desde ahí; iOS no permite push en una pestaña de Safari. En Android/Chrome funcionan directo.
- El SW ahora maneja los eventos `push` (muestra la notificación) y `notificationclick` (enfoca/abre la app).
- Nueva diapositiva de ayuda explicando cómo activarlas (incluye el caso iPhone).
- Archivos: `sw.js` (handlers push + v44), `app.js` (suscripción + botón + helpSlide), `supabase-api.js` (`savePushSub`/`deletePushSub`), `index.html` (botón en Perfil). Backend: tabla `push_subscriptions`, Edge Function `push-notify`, trigger en `mensajes_admin`. SW v44.


#### 2026-07-07 — Mensajes privados del Administrador (SW v43)
- **Nueva funcionalidad:** en la pestaña **Mensajes** se agregó un tercer modo **"Admin" 🛡️** con la conversación **privada** entre el socio y la administración (solo ese socio la ve). El socio puede **leer y responder**.
- Muestra un **punto rojo** en la pestaña "Admin" y en el ícono de Mensajes del nav cuando hay un mensaje nuevo del administrador.
- Se implementó como un **modo aislado** (`renderChatPriv`/`handleSendPriv`/`refreshAdminPriv`) para no tocar la lógica de Soporte/Equipo.
- Los mensajes que envía el responsable desde **socios-comicion → 💬 Mensajes** aparecen aquí.
- Nueva diapositiva de ayuda explicando la pestaña "Admin".
- Fuente: nueva tabla `mensajes_admin` (proyecto socios, RLS anon, realtime).
- Archivos: `index.html` (botón modo + dot), `app.js` (render/send/refresh privados + helpSlide), `supabase-api.js` (acciones `getAdminMsgs`/`sendAdminMsg`). SW v43.


#### 2026-07-07 — Guía de ayuda: botones "Recaudación del Día" y "Solicitar Egreso" (SW v42)
- Se agregaron **2 diapositivas** a la guía (`helpSlides`), después de "Anticipos y Descuentos":
  1. **Registrar la Recaudación del Día** — explica el botón morado del Balance: categorías, fecha, monto y divisor opcional.
  2. **Solicitar un Egreso (anticipo)** — explica el botón celeste: pedir un anticipo con monto y motivo, el estado "pendiente" y cómo termina reflejado en el Balance.
- Cada diapositiva incluye su `preview` visual acorde al estilo de la guía.
- Archivos: `app.js` (helpSlides). SW v42.


#### 2026-07-07 — Solicitud de Egreso (anticipo) desde la app (SW v41)
- **Nueva funcionalidad:** en el Balance, junto a "Recaudación del Día", se agregó el botón **"Solicitar Egreso"**. Abre un modal donde el socio ingresa un **monto** y un **motivo** opcional, y envía la solicitud de **anticipo de propina**.
- La solicitud se guarda como **PENDIENTE** en la tabla `solicitudes_egreso` (proyecto socios). En la app queda una tarjeta de estado ("Egreso solicitado · pendiente") mientras la administración no la procese.
- En **socios-comicion → Anticipos y Ausencias** aparece un aviso con los egresos pendientes; al tocar uno, se abre el socio con el monto pre-cargado para registrar el anticipo. Al registrarlo, la solicitud pasa a **PROCESADO** (realtime).
- Archivos: `index.html` (botón + modal + tarjeta estado), `app.js` (`abrirModalEgreso`, `enviarEgreso`, `renderEgresoEstado`), `supabase-api.js` (acciones `solicitarEgreso` y `miSolicitudEgreso`). Nueva tabla Supabase `solicitudes_egreso` (RLS anon, realtime). SW v41.


#### 2026-07-07 — Guía de ayuda: nuevas diapositivas de las últimas funciones (SW v40)
- Se agregaron **4 diapositivas** a la guía (`helpSlides`), entre "Perfil" y "Seguridad":
  1. **Tu Foto de Perfil** — cómo subir foto desde cámara o galería y dónde aparece.
  2. **Mis Documentos — Envía tu contrato** — adjuntar PDF/imagen (contrato u otros), privados.
  3. **¿Por qué me pidieron el RUT?** — explica que sirve para recuperar el PIN y para los certificados; se guarda seguro y no vuelve a pedirse.
  4. **Personaliza tu App — Temas** — elegir Claro / Oscuro / Rosa, guardado en el dispositivo.
- Cada diapositiva incluye su `preview` visual acorde al estilo de la guía.
- Archivos: `app.js` (helpSlides). SW v40.


#### 2026-07-07 — Fix: chat legible en tema Oscuro (SW v39)
- **Bug:** en tema Oscuro las burbujas del chat conservaban colores fijos (fondo claro y `color:inherit`), por lo que el texto de los mensajes quedaba casi invisible (letras claras sobre burbuja clara).
- **Fix:** el chat ahora es *theme-aware*. El fondo del área de mensajes usa `--chat-bg` por tema (Claro beige, Rosa rosado, Oscuro `#0b141a`). En Oscuro se agregaron reglas de alta especificidad (`#chatMessages ...`) que fuerzan estilo tipo WhatsApp dark: burbujas `#202c33`/`#005c4b`, texto `#e9edef`, autor `#53bdeb`, hora `#8696a0`, colas, separador de fecha, banner fijado y barra de entrada.
- Se cuidó la especificidad para que el color del autor/hora no fuera pisado por la regla general del cuerpo del mensaje.
- Archivos: `app.css`. SW v39.


#### 2026-07-07 — Fix: el chat ya no queda en blanco por fallos transitorios de Supabase (SW v38)
- **Bug:** los handlers `getNotes` de `supabase-api.js` (chat Soporte → `notas_recaudacion`, chat Equipo → `chat_mensajes`) hacían `const { data } = await ...` **ignorando el error**. Si Supabase fallaba un instante (los proyectos tuvieron pausas/restauraciones recientes), la consulta devolvía error y el handler entregaba `[]`, dejando el chat **vacío** hasta el siguiente refetch exitoso.
- **Fix:** ambos handlers ahora (1) **reintentan una vez** ante error y (2) si aun así falla, devuelven los **últimos mensajes leídos con éxito** (`_lastNotasRec` / `_lastChatSocial`) en vez de vaciar el chat. Un hipo transitorio ya no borra la conversación en pantalla.
- Se verificó en Supabase que los datos existen y son legibles por el rol `anon`: Soporte 59 mensajes, Equipo 4. El tema (Claro/Oscuro/Rosa) **no** afecta la carga del chat.
- Archivos: `supabase-api.js`. SW v38.


#### 2026-07-07 — Temas de la app: Claro / Oscuro / Rosa (SW v37)
- **Nueva funcionalidad:** el usuario puede personalizar la apariencia de la app desde **Perfil → "Tema de la app"**. Tres opciones: **Claro** (por defecto, el de siempre), **Oscuro** y **Rosa** (tema femenino).
- La elección se guarda como **memoria** en `localStorage` (`propi_tema`) y se aplica automáticamente al abrir la app, en cualquier dispositivo donde se haya elegido.
- **Cómo funciona:** los colores de Tailwind `lm-*`/`wa-*` se convirtieron a variables CSS con canales RGB (`rgb(var(--lm-x) / <alpha-value>)`), conservando los modificadores de opacidad (`bg-lm-primary/10`). Cada tema redefine esas variables con `:root[data-theme="claro|oscuro|rosa"]`.
- El tema Oscuro además sobreescribe los estilos inline con color fijo (tarjetas `#fff`, textos `#001723`, inputs, divisores) mediante reglas de mayor peso, para que Perfil y modales se vean correctamente en oscuro.
- Se aplica el tema **antes del render** con un script inline en `<head>` (evita el parpadeo/FOUC) y se actualiza el `theme-color` de la barra del navegador según el tema.
- Archivos: `index.html` (config Tailwind con variables, script early-theme, tarjeta selector en Perfil), `app.css` (variables `:root` por tema + overrides de oscuro + estilos del selector), `app.js` (`window.aplicarTema`, `_temaActual`, `_sincronizarTemaBtns`). SW v37.


#### 2026-07-06 — Aviso de nueva versión arriba + auto-actualización a los 15s (SW v36)
- El aviso de "Nueva versión disponible" ahora aparece **arriba** (antes abajo, tapado por el teclado), con **cuenta regresiva de 15s**: si el usuario no toca "Actualizar", se aplica sola.
- Muestra un texto de **novedades** de la versión (`APP_NOVEDADES`, editable por release).
- El SW ya no hace `skipWaiting` automático en install: espera el mensaje `SKIP_WAITING` (del botón o del temporizador) para activar, así no reinicia sin avisar. Fallback de recarga por si no dispara `controllerchange`.
- Archivos: `index.html` (banner arriba + lógica 15s), `sw.js` (install sin skipWaiting + listener de mensaje). SW v36.


#### 2026-07-06 — Aviso informativo: foto de perfil y documentos (SW v35)
- Al abrir la app aparece una vez (por dispositivo) un modal explicando que desde el Perfil pueden **agregar su foto** y **enviar documentos** (como el contrato). Botón "Ir a mi Perfil" que abre la sección.
- Se muestra sin encimarse con otros modales (RUT/ayuda). Flag `propi_info_perfil_v1`.
- Archivos: `index.html` (modal), `app.js` (checkInfoPerfil/cerrarInfoPerfil/irAMiPerfil). SW v35.


#### 2026-07-06 — Foto de perfil también en el login y en el header (SW v34)
- La foto del socio ahora se muestra además en el **avatar del header** (arriba, junto al nombre) y en el **avatar del login** (acceso rápido), no solo en el Perfil.
- La foto se guarda en el auth local (`visor_secure_auth.foto`) para poder mostrarla en la pantalla de ingreso antes de cargar los datos.
- Archivos: `index.html` (id en avatar del login), `app.js` (_aplicarFotoPerfil cubre header+login, checkSecurity muestra la foto). SW v34.


#### 2026-07-06 — Foto de perfil: elegir entre cámara o galería (SW v33)
- Al tocar el avatar ahora aparece un menú: **Tomar foto** (abre la cámara, input con `capture=user`) o **Elegir de galería** (input sin capture).
- Archivos: `index.html` (dos inputs + menú), `app.js` (abrirMenuFoto/cerrarMenuFoto). SW v33.


#### 2026-07-06 — Foto de perfil del socio (SW v32)
- En el Perfil, el socio puede **subir su foto** (toca el avatar o el botón de cámara). Se muestra como avatar.
- Se guarda en **Supabase Storage** (bucket público `avatares`, ruta `socio/<id>.<ext>`, con upsert que reemplaza la anterior) y la URL pública queda en `socios.foto_url`. Se refleja en socios-comicion (Gestión de Socios).
- Acción `guardarFotoSocio`. Archivos: `index.html` (avatar+cámara), `app.js` (subirFotoPerfil/_aplicarFotoPerfil), `supabase-api.js` (map FotoUrl + handler). SW v32.


#### 2026-07-06 — Mis Documentos: el socio adjunta documentos (SW v31)
- En el Perfil se agregó **Mis Documentos**: el socio puede subir su contrato u otros archivos (PDF/imagen), verlos y eliminarlos.
- Se almacenan en **Supabase Storage** (bucket privado `documentos`, base de socios) con metadatos en la tabla `documentos`. Visibles/recuperables desde socios-comicion.
- Usa `dbSV.storage` (subida, URL firmada 1h para ver, borrado). Límite 15 MB por archivo.
- Archivos: `index.html` (apartado en Perfil), `app.js` (cargar/subir/ver/borrar). SW v31.


#### 2026-07-06 — Modal para pedir el RUT del socio (SW v30)
- Al abrir la app, si el socio aún no tiene RUT registrado, aparece un modal solicitándolo (placeholder `11.111.111-?`), explicando que se usará para informes y certificados. Se pre-llena con el RUT de recuperación local si existe.
- El RUT se valida (RUT chileno) y se guarda en Supabase (columna nueva `socios.rut`) vía acción `guardarRutSocio`; queda disponible en socios-comicion (Gestión de Socios y Certificados). El evento queda en auditoría.
- Archivos: `index.html` (modal), `app.js` (checkRutRequired/submitRut), `supabase-api.js` (handler + map Rut). SW v30.


#### 2026-07-05 — Auditoría: registrar quién ingresó la recaudación del día (SW v29)
- Al registrar una recaudación desde la app, ahora se escribe un evento en la **auditoría de socios-comicion** (tabla `auditoria` de la base de socios, `dbSV`), con la acción "Registrar Recaudación".
- Guarda quién la ingresó (`registrado_por_nombre` / `registrado_por_id`), tipo, fecha, monto y divisor. Aparece en el historial de auditoría de socios-comicion con origen `propi.solicitada`.
- El registro es no bloqueante (no afecta el guardado de la recaudación si la auditoría falla).
- Archivo modificado: `supabase-api.js`. SW incrementado a v29.

#### 2026-07-02 — Modal recaudación: dato de Total Puntos y Pts Planta (SW v28)
- En el modal "Ingresar Recaudación del Día" se agregó un recuadro informativo (solo lectura) con **Total Puntos** y **Pts Planta**, el mismo dato que muestra socios-comicion en Gestión de Socios.
- Se calcula desde `allSocios` con el mismo criterio que socios-comicion: solo socios visibles/activos (regla del día 15 según `FechaInicioPuntos`), usando el valor de BD (`Puntos`) si es > 0 o la fórmula por antigüedad/área si no. Sirve como referencia al ingresar el divisor.
- Nueva función `_recCalcTotalPuntos()` en `app.js`; se actualiza al abrir el modal.
- SW incrementado a v28 por cambios en `app.js` e `index.html`.

#### 2026-07-02 — Fix: el divisor no se guardaba en Supabase al registrar recaudación (SW v27)
- Bug: al ingresar una recaudación del día con divisor, el handler `addRecaudacion` de `supabase-api.js` insertaba solo `id, fecha, tipo, monto` en la tabla `recaudaciones` e **ignoraba por completo `b.divisor`**. El divisor vive en una tabla aparte (`divisores`, una fila por fecha) que el handler `get` mergea por fecha, pero nunca se escribía ahí. Por eso el divisor no subía a Supabase ni aparecía en las otras apps (diario.propi, socios-comicion) que leen de la misma tabla.
- Fix: `addRecaudacion` ahora hace `upsert` en `divisores` (`{ fecha, valor }`, on conflict `fecha`) cuando llega `b.divisor > 0`. Las tres apps comparten el mismo proyecto Supabase de recaudaciones, así que el divisor ahora se propaga a todas.
- SW incrementado a v27 por cambio en `supabase-api.js`.

#### 2026-06-24 — Fix: sin divisor no infla el VP (valor punto) (SW v26)
- Bug: al registrar una recaudación sin divisor, el código usaba `|| 1` como fallback, dividiendo el monto por 1 y sumando el total completo al VP acumulado del socio, dando cifras elevadas e incorrectas.
- Fix: cambiado `|| 1` → `|| 0` con guarda `if(d > 0)` en los dos lugares donde se calcula VP (balance histórico y detalle de ganancias). Sin divisor, el día no contribuye al VP.
- Fix: condición de envío del divisor al GAS cambiada de `> 1` a `> 0`, permitiendo guardar divisores válidos como 1 ó 1.5 que antes se descartaban.
- SW incrementado a v26 por cambio en `app.js`.

#### 2026-06-20 — Fix: balance lento — getDiasPartTime dejó de bloquear el Promise.all (SW v24)
- Bug: el fix anterior de días PT hacía `Promise.allSettled([Supabase, GAS])` bloqueante. El `Promise.all` del balance en `app.js` esperaba al más lento (GAS: 2-5 s) antes de mostrar cualquier dato.
- Fix: `getDiasPartTime` ahora responde inmediatamente con datos de Supabase. GAS va en background solo en la primera carga de sesión; si detecta socios PT faltantes en Supabase, los guarda en un cache de sesión y dispara un refresh único para actualizar el balance. En cargas posteriores del mismo sesión usa el cache sin volver a llamar GAS.
- SW incrementado a v24 por cambio en `supabase-api.js`.

#### 2026-06-20 — Fix: socios Part-Time sin días trabajados en el calendario (SW v23)
- Bug: `getDiasPartTime` en `supabase-api.js` leía SOLO Supabase. Si la tabla `dias_pt` no tenía todos los socios PT (porque no habían guardado días desde la nueva app), aparecían con 0 días → sin calendario ni alcance.
- Fix: fetch paralelo GAS + Supabase. GAS es la base (cubre todos los socios PT con su historial completo); Supabase anula GAS solo para socios que actualizaron días desde la app (datos más recientes). El resultado es la unión correcta de ambas fuentes.
- SW incrementado a v23 por cambio en `supabase-api.js`.

#### 2026-06-19 — Rendimiento: balance instantáneo, migración automática anticipos a Supabase (SW v22)
- `getSaldosCierre` ya no bloquea el `Promise.all` del balance: retorna `{}` inmediato (o caché 24h) y recalcula el balance en background cuando llegan los datos de GAS.
- `getAllDataDesdeSheets` ahora migra anticipos/extras desde Sheets a Supabase la primera vez que detecta Supabase vacío (`_migrarASupabase`). A partir de entonces, Supabase es la fuente primaria.
- SW incrementado a v22 para forzar recarga del interceptor actualizado.

#### 2026-06-19 — Fix: anticipos aparecen en Últimos Movimientos (SW v21)
- Bug: `supabase-api.js` no tenía fallback a GAS cuando la tabla `anticipos` de Supabase está vacía (anticipos aún en Google Sheets). `getAllDataDesdeSheets` devolvía datos vacíos y la sección "Últimos Movimientos" quedaba en blanco.
- Fix: si Supabase devuelve 0 anticipos y 0 extras, se llama al GAS original como respaldo. Cuando los anticipos migren a Supabase se usará esa fuente automáticamente.
- SW v21: incrementado por cambio en `supabase-api.js`.

#### 2026-06-17 — Hardening de seguridad: XSS, autenticación y SRI (SW v20)
- C-1 (CRÍTICA): PIN eliminado de localStorage. Ahora se guarda solo el hash SHA-256 del PIN; el PIN plano va a sessionStorage (se borra al cerrar el navegador). Compatibilidad backward: instalaciones antiguas piden login completo en nueva sesión.
- C-2 (CRÍTICA): Chat renderizado — `linkify()` ahora escapa HTML entities antes de convertir URLs, bloqueando inyección de HTML/JS en mensajes del chat.
- C-3 (CRÍTICA): onclick del botón editar ya no embebe `msgContent` en el atributo. Se usa `window._chatMsgMap` para lookup por ID, eliminando template injection.
- C-4 (CRÍTICA): `showDebugToast` escapa todos los valores del objeto API antes de insertarlos en innerHTML.
- A-4 (ALTA): `linkify()` bloquea protocolos `javascript:` y `data:` en URLs.
- A-5 (ALTA): `document.write()` del comprobante PDF escapa nombre, área y contrato del usuario.
- A-1 (ALTA): Supabase JS anclado a versión 2.49.4 con atributo `integrity` SHA-512 (SRI).
- SW v20.

#### 2026-06-17 — Historial anticipos: GAS único para archivados, elimina duplicados (SW v19)
- Bug: combinar GAS + Supabase duplicaba meses porque GAS usa "MAYO_2026" y Supabase "MAYO 2026".
- Fix: histórico archivado viene solo del GAS (cacheado 1h); Supabase solo provee anticipos activos del mes actual.
- Una sola fuente por tipo de dato → sin conflictos de naming ni duplicados.
- SW v19.

#### 2026-06-17 — Historial anticipos: combinar Supabase + GAS para cubrir meses faltantes (SW v18)
- Bug: Supabase solo tenía meses migrados inicialmente; meses posteriores estaban solo en Sheets.
- El fallback a GAS solo activaba si data.length === 0, así que meses parcialmente migrados quedaban incompletos.
- Fix: getHistorialCompletoSocio ahora combina SIEMPRE Supabase + GAS (cacheado 1h). GAS es la base completa; Supabase sobreescribe los períodos que ya tiene.
- Para completar la migración: correr backfillAnticiposFaltantes() en el GAS editor (migrate_to_supabase.gs).
- SW v18.

#### 2026-06-17 — Migración completa a Supabase: saldos e historial anticipos (SW v17)
- `getSaldosAnteriores` ahora lee de `saldos_socio` en Supabase (67 filas, fuente de verdad); GAS solo como fallback si Supabase está vacío.
- `getHistorialCompletoSocio` ahora lee de `anticipos_historial` en Supabase (256 filas) + `anticipos` activos; GAS solo como fallback si no hay datos para el socio.
- Políticas RLS SELECT/INSERT creadas en Supabase para anon key sobre `anticipos_historial` y `saldos_socio`.
- SW actualizado a v17.

#### 2026-06-17 — Anticipos Anteriores: historial desde Google Sheets vía GAS (SW v16)
- Bug: la sección "Anticipos Anteriores" siempre aparecía vacía porque leía de `anticipos_historial` en Supabase, que nunca se pobla (el archivado va a Google Sheets).
- Fix: `getHistorialCompletoSocio` en `supabase-api.js` ahora llama al GAS (`getHistorialCompletoSocio`), que lee todas las hojas `Anticipos_*` y `AnticiposGuardados` en Google Sheets.
- Los anticipos activos del período actual siguen leyéndose de Supabase; ambas fuentes se combinan.
- Caché localStorage con TTL 1 hora para el GAS; en cargas posteriores es instantáneo y se refresca en background.
- SW actualizado a v16.

#### 2026-06-17 — Saldo Anterior: caché local + GAS en background (SW v15)
- Fix de rendimiento: getSaldosAnteriores y getSaldosCierre ahora usan caché localStorage (TTL 24h).
- Primera carga: espera el GAS una sola vez. Cargas siguientes: instantáneas desde caché.
- El GAS se refresca en background en cada visita para mantener el dato actualizado.
- SW actualizado a v15 para distribuir el nuevo supabase-api.js.

#### 2026-06-17 — Saldo Anterior sincronizado con socios-comicion
- Bug: `getSaldosAnteriores` leía de Supabase (`saldos_socio`) que podía estar desactualizado; `getSaldosCierre` retornaba vacío.
- Fix: ambas acciones ahora pasan directamente al GAS real (misma fuente que socios-comicion), que lee las hojas "SaldosAnteriores" + "SaldosCierreMes".
- Resultado: "Saldo Anterior" en propi.solicitada = "Saldo Mes Ant." en socios-comicion para el mismo socio.

### v19 — Junio 2026

#### 2026-06-15 — Puntos consistentes entre perfil y balance; fallback a fórmula si Supabase tiene 0
- Bug: perfil mostraba 0 pts cuando Supabase tenía puntos=0 (dato incorrecto); balance seguía con fórmula → inconsistentes.
- Fix: ambos (perfil línea 293 y balance línea 545) usan `currentUser.Puntos` de Supabase solo si es > 0; si no, caen a fórmula.
- Esto garantiza que datos incorrectos en Supabase no rompan la visualización.
- SW actualizado a `boveda-personal-v14`.

#### 2026-06-15 — Perfil muestra puntos desde Supabase, no recalculados por fórmula
- Bug: el perfil calculaba `pts = 4 + (años × 2)` localmente, ignorando `currentUser.Puntos` de Supabase.
- Fix: usa `currentUser.Puntos` si está definido; solo cae a fórmula si el campo viene vacío (socios sin dato en Supabase).
- SW actualizado a `boveda-personal-v14`.

#### 2026-06-15 — Cierre por inactividad corregido (primer y segundo plano)
- Bug: el timer solo se activaba al ir al segundo plano; si la app quedaba abierta e inactiva en primer plano nunca cerraba.
- Fix: reemplazado por sistema de timestamp en localStorage (`propi_last_active`), actualizado en cada click/touch/scroll/key. Un `setInterval` de 60 s verifica si pasaron 15 min desde la última interacción → cierra sesión. Al volver de segundo plano también verifica inmediatamente.
- SW actualizado a `boveda-personal-v14`.

#### 2026-06-15 — Estadísticas muestran período anterior si el actual está vacío
- `getActivePeriodo(mapVP)`: nuevo helper que detecta si el período actual (15→14) tiene datos; si no, usa el período anterior.
- `renderStats`, `renderStatsChart`, `renderStatsTable`: todas usan `getActivePeriodo` en lugar de `getPeriodo` directo.
- La etiqueta del período muestra "(período cerrado)" cuando se está mostrando datos históricos.
- SW actualizado a `boveda-personal-v11`.

#### 2026-06-15 — Service Worker v10 + supabase-api.js en caché
- SW actualizado a `boveda-personal-v10`.
- `supabase-api.js` agregado a la lista de precaché del SW (era el único archivo clave sin cobertura offline).
- CLAUDE.md actualizado para reflejar versión actual del SW.

#### 2026-06-14 — Anticipos y extras leen desde Supabase; GAS escribe en Supabase server-side
- **Problema raíz:** Los anticipos registrados en socios-comicion nunca llegaban a Supabase porque el interceptor browser-side fallaba silenciosamente.
- **Solución:** `backend.gs` en socios-comicion ahora escribe en Supabase via `UrlFetchApp` (server-side) después de escribir en Sheets. Funciones afectadas: `registrarBatchAnticipos`, `registrarBatchExtras`, `borrarMovimientoGlobal`, `actualizarAnticipo`.
- `supabase-api.js` en propi.solicitada: `getAllDataDesdeSheets` y `getHistorialCompletoSocio` ahora leen de Supabase (tablas `anticipos`, `extras`, `anticipos_historial`) en lugar de pasar a GAS.
- Realtime listener activo para INSERT en tabla `anticipos` — actualiza la UI automáticamente cuando llega un nuevo anticipo.

#### 2026-06-13 — Fix anticipos anteriores: agrupación por período en Supabase
- **Problema:** La sección "Anticipos Anteriores" no mostraba datos.
- **Causa:** El handler `getHistorialCompletoSocio` en `supabase-api.js` devolvía un array plano, pero `renderHistorialAnticipos` espera un array agrupado por período (`{ periodo, registros }` ).
- **Fix:** El handler ahora agrupa los anticipos por período (derivado del campo `periodo` en `anticipos_historial`, o calculado desde `fecha` para anticipos actuales), ordenado de más reciente a más antiguo.
- Service Worker actualizado a `boveda-personal-v8`.

#### 2026-06-23 — Campo divisor opcional en modal Ingresar Recaudación
- Agregado campo numérico "Divisor (opcional)" al modal de ingreso de recaudación del día.
- Si se deja en blanco no se envía al GAS; si se completa, se incluye en el payload `addRecaudacion`.
- Se limpia automáticamente al abrir el modal.

#### 2026-06-13 — Migración backend Google Sheets → Supabase
- Reemplazado el backend de Google Apps Script (GAS) por Supabase como base de datos.
- Nuevo archivo `supabase-api.js`: interceptor de `window.fetch` y `navigator.sendBeacon` que redirige transparentemente todas las llamadas a las URLs GAS hacia dos proyectos Supabase sin modificar `app.js`.
  - Proyecto socios (`teemahksasdougehrcly`): tablas `socios`, `anticipos`, `extras`, `saldos_socio`, `dias_pt`, `chat_mensajes`, `historial_conexiones`, `anticipos_historial`.
  - Proyecto recaudaciones (`lpulmjzboogixbdxxayo`): tablas `recaudaciones`, `divisores`, `notas_recaudacion`.
- `index.html` actualizado para cargar `@supabase/supabase-js@2` (CDN jsdelivr) y `supabase-api.js` antes de `app.js`.
- Service Worker actualizado a `boveda-personal-v7` para forzar recarga del `index.html` modificado.
- Los scripts GAS originales se mantienen en `gas/code.gs` como referencia histórica.

#### 2026-06-01 — Corrección Safe Area iPhone
- **Problema:** En iPhone con notch/Dynamic Island, el header quedaba detrás de la barra de estado.
- **Causa:** Las clases `.pt-safe-top` y `.pb-safe-bottom` estaban referenciadas en el HTML pero nunca definidas en el CSS.
- **Fix:** Definidas en `app.css`:
  - `.pt-safe-top { padding-top: calc(env(safe-area-inset-top) + 0.875rem) !important }`
  - `.pb-safe-bottom { padding-bottom: env(safe-area-inset-bottom) !important }`
- Agregado `html { height: 100% }` y `body { height: 100% }` para cadena de altura correcta en iOS PWA.

#### 2026-06-01 — Separación HTML / CSS / JS
- `index.html` separado en tres archivos: `index.html` (878 líneas), `app.css` (270 líneas), `app.js` (2435 líneas).
- `originalindex.html`: copia completa en un solo archivo, auto-generada por `build.sh`.
- `build.sh`: script Python que reconstruye `originalindex.html` desde los tres archivos separados.
- Hook Claude Code (`.claude/settings.json`): ejecuta `build.sh` automáticamente al editar cualquiera de los tres archivos.
- `sw.js` actualizado a `boveda-personal-v6` — ahora cachea `app.css` y `app.js`.

#### 2026-05-XX — Filtro por Mes en Anticipos Anteriores
- Nuevo filtro de mes en la sección Anticipos Anteriores del Historial.
- Aparece al seleccionar un año específico (si hay ≥ 2 meses con datos).
- Funciones: `_extraerMes`, `buildFiltroMeses`, `filtrarAnticiposMes`.
- `filtrarAnticipos` actualizado: ahora resetea y reconstruye el filtro de mes al cambiar de año.

#### 2026-05-XX — Actualización Guía de Ayuda (helpSlides)
- Slide "Balance": texto e imagen actualizados — muestra las dos tarjetas separadas (Remanente y Valor punto por noche), ya no menciona "Mis Puntos".
- Slide "Historial": texto actualizado para explicar el toggle Rendimientos / Anticipos Anteriores.
- **Nuevo slide**: "Anticipos Anteriores" — explica filtros año/mes y acordeón por período.

#### 2026-05-XX — Filtro por Año y Acordeón en Anticipos Anteriores
- Sección Anticipos Anteriores con filtros pill de año y acordeón por período.
- Lazy-load: datos se cargan solo en la primera apertura de la pestaña.
- Cada período es una tarjeta colapsable con monto total y detalle de registros.

#### 2026-05-XX — Nueva Sección Anticipos Anteriores
- Toggle "Rendimientos / Anticipos Anteriores" en el tab Historial.
- Nueva acción GAS: `getHistorialCompletoSocio` — combina datos de `AnticiposGuardados` y hojas `Anticipos_*`.
- GAS `logoutConexion` actualizado: borra `UltimaConexion` en la hoja Socios para garantizar notificación Telegram en el próximo login.

#### 2026-05-XX — Tarjetas Remanente y Valor Punto por Noche
- "Mis Puntos" renombrado a "Valor punto por noche".
- Remanente y Valor punto por noche ahora son tarjetas separadas y más grandes debajo del hero de balance (antes eran chips pequeños dentro de la tarjeta).

#### 2026-05-XX — Script GAS en Repositorio
- `gas/code.gs`: copia completa del script de Google Apps Script como referencia de código fuente.

#### 2026-05-XX — Mejoras Service Worker
- Estrategia network-first para archivos propios.
- Banner de "Nueva versión disponible" con botón de actualización inmediata.
- Chequeo de actualizaciones en `visibilitychange`.
