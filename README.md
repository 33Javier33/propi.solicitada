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
│  │  Service Worker (sw.js) — cache v7           │   │
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
├── sw.js               # Service Worker — caché v7, network-first
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

**Archivo:** `sw.js` — versión `boveda-personal-v7`

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
const CACHE_NAME = 'boveda-personal-v8'; // ← incrementar
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

### v19 — Junio 2026

#### 2026-06-15 — Cierre por inactividad corregido (primer y segundo plano)
- Bug: el timer solo se activaba al ir al segundo plano; si la app quedaba abierta e inactiva en primer plano nunca cerraba.
- Fix: reemplazado por sistema de timestamp en localStorage (`propi_last_active`), actualizado en cada click/touch/scroll/key. Un `setInterval` de 60 s verifica si pasaron 15 min desde la última interacción → cierra sesión. Al volver de segundo plano también verifica inmediatamente.
- SW actualizado a `boveda-personal-v12`.

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
