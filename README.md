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
