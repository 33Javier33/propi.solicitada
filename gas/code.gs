// ==============================================================================
// SCRIPT MAESTRO V25.1 - CON HISTORIAL DE AUDITORÍA + CREDENCIALES
// + INTEGRACIÓN TELEGRAM (@GestionPtopinaBot)
// ==============================================================================

// ── CONFIGURACIÓN TELEGRAM ────────────────────────────────────────────────────
const TELEGRAM_TOKEN = '8318855772:AAEDfwR7BdyF5gL7nMJjaYowvMF9gh6yfCw';
const TELEGRAM_CHAT_ID = '5981473068';

function telegramEnviar(mensaje) {
  try {
    const url = 'https://api.telegram.org/bot' + TELEGRAM_TOKEN + '/sendMessage';
    UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: mensaje, parse_mode: 'HTML' }),
      muteHttpExceptions: true
    });
  } catch(e) {
    console.log('Telegram error: ' + e.toString());
  }
}

function probarTelegram() {
  telegramEnviar('🔔 Prueba de conexión exitosa!');
}

function telegramEnviarA(chatId, mensaje) {
  try {
    const url = 'https://api.telegram.org/bot' + TELEGRAM_TOKEN + '/sendMessage';
    UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ chat_id: chatId, text: mensaje, parse_mode: 'HTML' }),
      muteHttpExceptions: true
    });
  } catch(e) { console.log('Telegram error: ' + e.toString()); }
}

var URL_SOCIOCOMISION_TG = 'https://script.google.com/macros/s/AKfycbzCs74u0wnowFhgAbYM_EL11eEyOH4GivGzwg1v0ovMLW6QvwqOuL9HRhxmAwL9m8X6/exec';
var MON_TIMEOUT_MS_TG = 180000;

function doTelegramWebhook(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var msg = data.message;
    if (!msg || !msg.text) return;
    var texto = msg.text.trim().toLowerCase();
    var textoO = msg.text.trim();
    var chatId = msg.chat.id;

    if (texto === '/start') {
      telegramEnviarA(chatId,
        '👋 <b>Hola! Soy el bot del Fondo Solidario</b>\n' +
        'Casino de Puerto Varas\n\n' +
        '<b>Comandos disponibles:</b>\n' +
        '/resumen — Estado general del mes\n' +
        '/socios — Conteo de socios\n' +
        '/anticipos — Total de anticipos del periodo\n' +
        '/recaudacion — Recaudacion del periodo\n' +
        '/montos — Ultimos dias de montos diarios\n' +
        '/sala — Quienes estan en sala ahora\n' +
        '/online — Socios conectados en este momento\n' +
        '/informe — Resumen completo de anticipos\n' +
        '/socio [nombre] — Buscar un socio especifico\n' +
        '/historial [nombre] — Anticipos de un socio\n' +
        '/ayuda — Ver todos los comandos'
      );
    } else if (texto === '/resumen') {
      telegramEnviarA(chatId, telegramObtenerResumen());
    } else if (texto === '/socios') {
      var lista = getSocios();
      var planta = lista.filter(function(s){ return s.TipoContrato === 'Planta'; }).length;
      var pt = lista.filter(function(s){ return s.TipoContrato === 'Part-Time'; }).length;
      telegramEnviarA(chatId,
        '👥 <b>Socios del Fondo</b>\n---------------------\n' +
        'Total: ' + lista.length + '\nPlanta: ' + planta + '\nPart-Time: ' + pt
      );
    } else if (texto === '/anticipos') {
      var ants = getAllAnticiposDesdeSheets();
      var total = 0; var nSocios = Object.keys(ants).length;
      Object.values(ants).forEach(function(lista){ lista.forEach(function(a){ total += Number(a.monto) || 0; }); });
      telegramEnviarA(chatId,
        '💰 <b>Anticipos del Periodo</b>\n---------------------\n' +
        'Socios con anticipos: ' + nSocios + '\nTotal egresos: $' + total.toLocaleString('es-CL')
      );
    } else if (texto === '/recaudacion' || texto === '/rec') {
      telegramEnviarA(chatId, 'Consultando recaudaciones...');
      telegramEnviarA(chatId, telegramGetRecaudacion());
    } else if (texto === '/montos') {
      telegramEnviarA(chatId, 'Obteniendo montos diarios...');
      telegramEnviarA(chatId, telegramGetMontosDiarios());
    } else if (texto === '/sala') {
      telegramEnviarA(chatId, 'Consultando sala...');
      telegramEnviarA(chatId, telegramGetSala());
    } else if (texto === '/online') {
      telegramEnviarA(chatId, telegramGetOnline());
    } else if (texto === '/informe') {
      telegramEnviarA(chatId, 'Generando informe de anticipos...');
      telegramEnviarA(chatId, telegramGetInformeAnticipos());
    } else if (texto.startsWith('/socio ')) {
      var busqSocio = textoO.substring(7).trim();
      if (!busqSocio) { telegramEnviarA(chatId, 'Escribe el nombre: /socio Carlos'); }
      else { telegramEnviarA(chatId, 'Buscando socio...'); telegramEnviarA(chatId, telegramBuscarSocio(busqSocio)); }
    } else if (texto.startsWith('/historial ')) {
      var busqHist = textoO.substring(11).trim();
      if (!busqHist) { telegramEnviarA(chatId, 'Escribe el nombre: /historial Carlos'); }
      else { telegramEnviarA(chatId, 'Buscando historial...'); telegramEnviarA(chatId, telegramGetHistorial(busqHist)); }
    } else if (texto === '/ayuda') {
      telegramEnviarA(chatId,
        '<b>Comandos disponibles</b>\n\n' +
        '<b>Fondo Solidario:</b>\n' +
        '/resumen — Estado general del mes\n' +
        '/socios — Conteo de socios\n' +
        '/anticipos — Total de anticipos\n' +
        '/informe — Resumen completo de anticipos\n' +
        '/historial [nombre] — Anticipos de un socio\n' +
        '/socio [nombre] — Info de un socio\n\n' +
        '<b>Recaudacion:</b>\n' +
        '/recaudacion — Recaudacion del periodo\n' +
        '/montos — Ultimos dias con detalle\n\n' +
        '<b>Sala:</b>\n' +
        '/sala — Quienes estan en sala ahora\n' +
        '/online — Socios online\n\n' +
        '<b>Notificaciones automaticas:</b>\n' +
        '- Anticipo registrado\n- Ausencia registrada\n' +
        '- Nuevo socio agregado\n- Cierre de mes\n- Recaudacion registrada'
      );
    } else {
      telegramEnviarA(chatId, 'Comando no reconocido. Escribe /ayuda para ver las opciones.');
    }
  } catch(err) {
    console.log('Webhook error: ' + err.toString());
  }
}

const URL_REC_TELEGRAM = 'https://script.google.com/macros/s/AKfycbz_kCb4aEe437zHGbRqnjCibw1NtAqfCbTNmsVPn9jaZOPBFaZ6-FwmiTLqVxq39X1P/exec';

function telegramGetRecaudacion() {
  try {
    var respT = UrlFetchApp.fetch(URL_REC_TELEGRAM + '?action=getTotal', {muteHttpExceptions:true});
    var dT = JSON.parse(respT.getContentText());
    var total = (dT.totalAcumulado || 0) / 100;
    var ultDia = (dT.totalLastDivisorDay || 0) / 100;
    var divisor = dT.lastDivisor || 1;
    var fechaDiv = dT.lastDivisorDate || 'N/A';
    var punto = divisor > 1 ? Math.round(ultDia / divisor) : 0;
    var desglose = dT.desgloseEsperado || [];

    var respR = UrlFetchApp.fetch(URL_REC_TELEGRAM + '?action=get', {muteHttpExceptions:true});
    var dR = JSON.parse(respR.getContentText());
    var regs = dR.data || [];
    var pFecha = {};
    regs.forEach(function(r) {
      if (!r.fecha) return;
      if (!pFecha[r.fecha]) pFecha[r.fecha] = {tipos:{}, divisor:r.divisor};
      pFecha[r.fecha].tipos[r.tipo] = (pFecha[r.fecha].tipos[r.tipo]||0) + (r.monto||0);
    });
    var fechas = Object.keys(pFecha).sort().reverse().slice(0,5);

    var respN = UrlFetchApp.fetch(URL_REC_TELEGRAM + '?action=getNotes', {muteHttpExceptions:true});
    var dN = JSON.parse(respN.getContentText());
    var notas = (dN.data || []).slice(-3);

    var m = '<b>Recaudacion del Periodo</b>\nCasino de Puerto Varas\n---------------------\n';
    m += '<b>Total acumulado:</b> $' + total.toLocaleString('es-CL') + '\n';
    if (desglose.length > 0) {
      m += '\n<b>Por tipo:</b>\n';
      desglose.forEach(function(d){ m += ' - ' + d.tipo + ': $' + ((d.monto||0)/100).toLocaleString('es-CL') + '\n'; });
    }
    m += '\n<b>Ultimo dia con divisor:</b> ' + fechaDiv + '\n';
    m += ' Recaudado: $' + ultDia.toLocaleString('es-CL') + '\n';
    m += ' Divisor: ' + divisor + '\n';
    m += punto > 0 ? ' Punto noche: $' + punto.toLocaleString('es-CL') + '\n' : ' Sin divisor\n';
    if (fechas.length > 0) {
      m += '\n<b>Ultimos ' + fechas.length + ' dias:</b>\n';
      fechas.forEach(function(f) {
        var d = pFecha[f];
        var tD = Object.values(d.tipos).reduce(function(a,b){return a+b;},0);
        var fV = f.split('-').reverse().join('/');
        m += ' <b>' + fV + '</b>: $' + tD.toLocaleString('es-CL') + (d.divisor?' div:'+d.divisor:' SIN DIV') + '\n';
        Object.keys(d.tipos).forEach(function(t){ m += ' - '+t+': $'+d.tipos[t].toLocaleString('es-CL')+'\n'; });
      });
    }
    if (notas.length > 0) {
      m += '\n<b>Notas:</b>\n';
      notas.forEach(function(n){ m += ' - '+(n.autor||'')+': '+(n.mensaje||'')+'\n'; });
    }
    m += '---------------------\n' + new Date().toLocaleString('es-CL');
    return m;
  } catch(e) { return 'Error recaudaciones: ' + e.toString(); }
}

function telegramGetMontosDiarios() {
  try {
    var respR = UrlFetchApp.fetch(URL_REC_TELEGRAM + '?action=get', {muteHttpExceptions:true});
    var dR = JSON.parse(respR.getContentText());
    var regs = dR.data || [];
    var pFecha = {};
    regs.forEach(function(r) {
      if (!r.fecha) return;
      if (!pFecha[r.fecha]) pFecha[r.fecha] = {tipos:{}, divisor:r.divisor};
      pFecha[r.fecha].tipos[r.tipo] = (pFecha[r.fecha].tipos[r.tipo]||0) + (r.monto||0);
    });
    var fechas = Object.keys(pFecha).sort().reverse().slice(0, 10);
    if (!fechas.length) return 'Sin registros de recaudacion.';
    var m = '<b>Montos Diarios (ultimos ' + fechas.length + ' dias)</b>\nCasino de Puerto Varas\n---------------------\n';
    fechas.forEach(function(f) {
      var d = pFecha[f];
      var tD = Object.values(d.tipos).reduce(function(a,b){return a+b;},0);
      var fV = f.split('-').reverse().join('/');
      var div = d.divisor ? ' div:' + d.divisor + ' pto:$' + Math.round(tD/d.divisor).toLocaleString('es-CL') : ' SIN DIV';
      m += '\n<b>' + fV + '</b>: $' + tD.toLocaleString('es-CL') + div + '\n';
      Object.keys(d.tipos).forEach(function(t){ m += ' - ' + t + ': $' + d.tipos[t].toLocaleString('es-CL') + '\n'; });
    });
    m += '---------------------\n' + new Date().toLocaleString('es-CL');
    return m;
  } catch(e) { return 'Error obteniendo montos: ' + e.toString(); }
}

function telegramGetSala() {
  try {
    var resp = UrlFetchApp.fetch(URL_SOCIOCOMISION_TG + '?action=read', {muteHttpExceptions:true});
    var data = JSON.parse(resp.getContentText());
    var users = Array.isArray(data) ? data : [];
    var activos = users.filter(function(u){ return u.Estado === 'Activo'; });
    if (!activos.length) return '🏢 <b>Sala vacia</b>\nNo hay socios en sala en este momento.';
    var m = '🏢 <b>En Sala Ahora</b> (' + activos.length + ')\n---------------------\n';
    activos.forEach(function(u){
      var hora = u.Timestamp ? new Date(u.Timestamp).toLocaleTimeString('es-CL',{hour:'2-digit',minute:'2-digit'}) : '--:--';
      m += '- ' + (u.Nombre||'') + ' ' + (u.Apellido||'') + ' <i>' + (u.Seccion||u['Sección']||'') + '</i> ' + hora + '\n';
    });
    m += '---------------------\n' + new Date().toLocaleString('es-CL');
    return m;
  } catch(e) { return 'Error consultando sala: ' + e.toString(); }
}

function telegramGetOnline() {
  try {
    var resp = UrlFetchApp.fetch(URL_SOCIOCOMISION_TG + '?action=read', {muteHttpExceptions:true});
    var data = JSON.parse(resp.getContentText());
    var users = Array.isArray(data) ? data : [];
    var now = new Date();
    var online = users.filter(function(u){ return u.UltimaConexion && (now - new Date(u.UltimaConexion) < MON_TIMEOUT_MS_TG); });
    var activos = users.filter(function(u){ return u.Estado === 'Activo'; });
    return '📡 <b>Estado de Conexion</b>\n---------------------\n' +
      'En sala ahora: ' + activos.length + '\n' +
      'Online reciente (3h): ' + online.length + '\n' +
      'Total socios: ' + users.length + '\n---------------------\n' + now.toLocaleString('es-CL');
  } catch(e) { return 'Error consultando online: ' + e.toString(); }
}

function telegramGetInformeAnticipos() {
  try {
    var socios = getSocios();
    var ants = getAllAnticiposDesdeSheets();
    var totalGeneral = 0;
    var lineas = [];
    socios.forEach(function(s) {
      var lista = ants[s.ID] || [];
      if (!lista.length) return;
      var totalSocio = lista.reduce(function(a,b){ return a + (Number(b.monto)||0); }, 0);
      totalGeneral += totalSocio;
      var detalle = lista.map(function(a){ return ' ' + (a.fecha||'?') + ': $' + (Number(a.monto)||0).toLocaleString('es-CL'); }).join('\n');
      lineas.push('<b>' + (s.Nombre||'') + ' ' + (s.Apellido||'') + '</b>\n' + detalle + '\nTotal: $' + totalSocio.toLocaleString('es-CL'));
    });
    if (!lineas.length) return 'Sin anticipos registrados en el periodo actual.';
    var header = '<b>Informe de Anticipos</b>\nCasino de Puerto Varas\n---------------------\n';
    var footer = '\n---------------------\nTOTAL GENERAL: $' + totalGeneral.toLocaleString('es-CL');
    return header + lineas.join('\n\n') + footer;
  } catch(e) { return 'Error generando informe: ' + e.toString(); }
}

function telegramBuscarSocio(nombre) {
  try {
    var socios = getSocios();
    var q = nombre.toLowerCase();
    var encontrados = socios.filter(function(s){ return ((s.Nombre||'') + ' ' + (s.Apellido||'')).toLowerCase().includes(q); });
    if (!encontrados.length) return 'No se encontro ningun socio con "' + nombre + '".';
    var ants = getAllAnticiposDesdeSheets();
    var m = '';
    encontrados.slice(0, 3).forEach(function(s) {
      var lista = ants[s.ID] || [];
      var totalAnt = lista.reduce(function(a,b){ return a + (Number(b.monto)||0); }, 0);
      m += '👤 <b>' + (s.Nombre||'') + ' ' + (s.Apellido||'') + '</b>\nID: ' + s.ID + '\n';
      m += 'Area: ' + (s.Area||'') + ' | Contrato: ' + (s.TipoContrato||'') + '\n';
      m += 'Anticipos este periodo: ' + lista.length + ' ($' + totalAnt.toLocaleString('es-CL') + ')\n\n';
    });
    if (encontrados.length > 3) m += '...y ' + (encontrados.length - 3) + ' mas. Se mas especifico.';
    return m.trim();
  } catch(e) { return 'Error buscando socio: ' + e.toString(); }
}

function telegramGetHistorial(nombre) {
  try {
    var socios = getSocios();
    var q = nombre.toLowerCase();
    var encontrado = socios.find(function(s){ return ((s.Nombre||'') + ' ' + (s.Apellido||'')).toLowerCase().includes(q); });
    if (!encontrado) return 'No se encontro socio con "' + nombre + '".';
    var ants = getAllAnticiposDesdeSheets();
    var lista = ants[encontrado.ID] || [];
    if (!lista.length) return '👤 <b>' + encontrado.Nombre + ' ' + encontrado.Apellido + '</b>\nSin anticipos en el periodo actual.';
    var total = lista.reduce(function(a,b){ return a + (Number(b.monto)||0); }, 0);
    var m = '👤 <b>' + encontrado.Nombre + ' ' + encontrado.Apellido + '</b>\n';
    m += (encontrado.Area||'') + ' | ' + (encontrado.TipoContrato||'') + '\n---------------------\n';
    lista.forEach(function(a){
      var resp = a.responsable ? ' (' + a.responsable + ')' : '';
      m += (a.fecha||'?') + ': $' + (Number(a.monto)||0).toLocaleString('es-CL') + resp + '\n';
    });
    m += '---------------------\nTOTAL: $' + total.toLocaleString('es-CL');
    return m;
  } catch(e) { return 'Error obteniendo historial: ' + e.toString(); }
}

function telegramObtenerResumen() {
  try {
    const socios = getSocios();
    const ants = getAllAnticiposDesdeSheets();
    const totalAnt = Object.values(ants).reduce((acc, lista) =>
      acc + lista.reduce((s, a) => s + (Number(a.monto) || 0), 0), 0);
    const nConAnt = Object.keys(ants).length;
    return (
      '📊 <b>Resumen Fondo Solidario</b>\n' +
      'Casino de Puerto Varas\n─────────────────────\n' +
      '👥 Socios totales: ' + socios.length + '\n' +
      '💰 Anticipos registrados: ' + nConAnt + ' socios\n' +
      '💸 Total anticipos: $' + totalAnt.toLocaleString('es-CL') + '\n' +
      '─────────────────────\n🕐 ' + new Date().toLocaleString('es-CL')
    );
  } catch(e) { return '⚠️ Error obteniendo resumen: ' + e.toString(); }
}

// ==============================================================================
// NOMBRES DE LAS HOJAS
// ==============================================================================
const HOJA_SOCIOS               = "Socios";
const HOJA_ANTICIPOS            = "Anticipos";
const HOJA_EXTRAS               = "MovimientosExtras";
const HOJA_SALDOS               = "SaldosAnteriores";
const HOJA_DIAS_PT              = "DiasPartTime";
const HOJA_SALDOS_CIERRE        = "SaldosCierreMes";
const HOJA_CHAT_SOCIAL          = "MensajesApp";
const HOJA_ANTICIPOS_HISTORIAL  = "AnticiposGuardados";
const HOJA_HISTORIAL_CONEXIONES = "HistorialConexiones";
const HOJA_AUDITORIA            = "AuditoriaLogs";
const HOJA_CREDENCIALES         = "Credenciales";
const HOJA_RETIROS_ANTICIPOS    = "RetirosAnticipos";
const HOJA_MATERIALES           = "RecaudacionMateriales";

// ==============================================================================
// FUNCIÓN DE AUDITORÍA — registra quién hizo qué, dónde y cuándo
// ==============================================================================
function registrarAuditoria(usuario, accion, detalle, idAfectado, geoLat, geoLng, deviceID, ip, userAgent) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const s = ss.getSheetByName(HOJA_AUDITORIA);
    if (!s) return;
    s.appendRow([
      new Date(),
      usuario || 'Sistema',
      accion   || '',
      detalle  || '',
      idAfectado || '',
      geoLat || '',
      geoLng || '',
      deviceID || '',
      ip || '',
      userAgent || ''
    ]);
  } catch(e) {
    console.log('Auditoria error: ' + e.toString());
  }
}

// ==============================================================================
// RUTAS HTTP
// ==============================================================================
function doGet(e) { return handleRequest(e, 'GET'); }

function doPost(e) {
  try {
    if (e.postData && e.postData.contents) {
      var body = JSON.parse(e.postData.contents);
      if (body.update_id !== undefined) return doTelegramWebhook(e);
    }
  } catch(err) {}
  return handleRequest(e, 'POST');
}

function handleRequest(e, method) {
  const lock = LockService.getScriptLock();
  lock.tryLock(30000);

  try {
    setupSheets();
    let action, payload = {};

    if (method === 'GET') {
      action = e.parameter.action;
    } else {
      if (!e.postData || !e.postData.contents) throw new Error('Datos vacíos.');
      payload = JSON.parse(e.postData.contents);
      action = payload.action;
    }

    let responseData;
    switch (action) {

      case 'getSocios':
        responseData = { status: 'success', data: getSocios() };
        break;

      case 'getDatosSocio':
        const idBusqueda = method === 'GET' ? e.parameter.socioId : payload.socioId;
        responseData = { status: 'success', data: getDatosSocioIndividual(idBusqueda) };
        break;

      case 'getAllDataDesdeSheets':
        responseData = { status: 'success', anticipos: getAllAnticiposDesdeSheets(), extras: getAllExtrasDesdeSheets() };
        break;

      case 'getSaldosAnteriores':
        responseData = { status: 'success', data: getAllSaldosAnteriores() };
        break;

      case 'getSaldosCierre':
        responseData = { status: 'success', data: getAllSaldosCierre() };
        break;

      case 'getDiasPartTime':
        responseData = { status: 'success', data: getAllDiasPartTime() };
        break;

      case 'getNotes':
        responseData = { status: 'success', data: getChatMessages() };
        break;

      case 'pingConexion':
        pingConexion(payload.socioId);
        responseData = { status: 'success', message: 'Ping registrado' };
        break;

      case 'getHistorialConexiones':
        const socId = method === 'GET' ? e.parameter.socioId : payload.socioId;
        responseData = { status: 'success', data: getHistorialConexiones(socId) };
        break;

      case 'logoutConexion':
        logoutConexion(payload.socioId);
        responseData = { status: 'success', message: 'Logout registrado' };
        break;

      case 'addNote':
        addChatMessage(payload.autor, payload.mensaje, payload.socId, payload.destinatario);
        responseData = { status: 'success', message: 'Mensaje enviado' };
        break;

      case 'deleteNote':
        const deleted = deleteChatMessage(payload.noteId);
        responseData = { status: deleted ? 'success' : 'error', message: deleted ? 'Borrado' : 'No encontrado' };
        break;

      case 'registrarBatchAnticipos':
        if (payload.detalleAnticipos) registrarBatchAnticipos(payload.detalleAnticipos, payload.responsable);
        responseData = { status: 'success', message: 'Anticipos guardados' };
        break;

      case 'registrarBatchExtras':
        if (payload.detalleExtras) registrarBatchExtras(payload.detalleExtras, payload.responsable);
        responseData = { status: 'success', message: 'Extras/Ausencias guardados' };
        break;

      case 'actualizarAnticipo':
        actualizarAnticipo(payload.uuid, payload.fecha, payload.monto, payload.responsable, payload.areaResponsable);
        responseData = { status: 'success', message: 'Anticipo actualizado' };
        break;

      case 'reiniciarAnticipos':
        reiniciarAnticipos(payload.tabNombre, payload.responsable);
        responseData = { status: 'success', message: 'Anticipos archivados' };
        break;

      case 'reiniciarExtras':
        reiniciarExtras(payload.tabNombre, payload.responsable);
        responseData = { status: 'success', message: 'Ausencias archivadas' };
        break;

      case 'borrarMovimiento':
        const borradoExito = borrarMovimientoGlobal(payload.uuid, payload.tipo, payload.responsable, payload.detalle);
        responseData = borradoExito
          ? { status: 'success', message: 'Eliminado correctamente' }
          : { status: 'error', message: 'No se encontró el registro' };
        break;

      case 'registrarSaldoAnterior':
        registrarSaldo(payload.id, payload.nombre, payload.monto, payload.responsable);
        responseData = { status: 'success', message: 'Saldo actualizado' };
        break;

      case 'guardarDiasPartTime':
        guardarDiasPT(payload.id, payload.nombre, payload.dias);
        responseData = { status: 'success', message: 'Días actualizados' };
        break;

      case 'guardarBatchDiasPartTime':
        responseData = guardarBatchDiasPartTime(payload);
        break;

      case 'guardarCierreIndividual':
        registrarCierreManual(payload.id, payload.nombre, payload.monto);
        archivarAnticiposSocio(payload.id);
        responseData = { status: 'success', message: 'Cierre y archivado completado' };
        break;

      case 'guardarDistribucion':
        const sheetName = procesarCierreMensual(payload);
        responseData = { status: 'success', message: 'Mes cerrado correctamente', sheetName: sheetName };
        break;

      case 'addSocio':
        responseData = { status: 'success', data: addSocio(payload.socio, payload.responsable) };
        break;

      case 'updateSocio':
        updateSocio(payload.socioId, payload.updates, payload.responsable);
        responseData = { status: 'success', message: 'Socio Actualizado' };
        break;

      case 'deleteSocio':
        deleteSocio(payload.socioId, payload.responsable);
        responseData = { status: 'success', message: 'Socio Eliminado' };
        break;

      case 'getAuditoria':
        responseData = { status: 'success', data: getAuditoria() };
        break;

      case 'logAccionAuditoria':
        registrarAuditoria(payload.usuario, payload.accion, payload.detalle, payload.idAfectado);
        responseData = { status: 'success', message: 'Registrado' };
        break;

      case 'getCredenciales':
        responseData = { status: 'success', data: getCredenciales() };
        break;

      case 'setCredencial':
        setCredencial(payload.ini, payload.area, payload.pin);
        responseData = { status: 'success', message: 'Credencial guardada' };
        break;

      case 'deleteCredencial':
        deleteCredencial(payload.ini, payload.area);
        responseData = { status: 'success', message: 'Credencial eliminada' };
        break;

      case 'registrarRetiroAnticipo':
        registrarRetiroAnticipo(payload.firma, payload.nombre, payload.monto, payload.billetes, payload.responsable);
        responseData = { status: 'success', message: 'Retiro de anticipo registrado' };
        break;

      case 'getRetirosAnticipos':
        responseData = { status: 'success', data: getRetirosAnticipos() };
        break;

      case 'getHistorialAnticiposSocio':
        responseData = { status: 'success', data: getHistorialAnticiposSocio(payload.idSocio, payload.nombreSocio) };
        break;

      // ── NUEVO: historial completo para la app (AnticiposGuardados + tabs Anticipos_*) ──
      case 'getHistorialCompletoSocio':
        responseData = { status: 'success', data: getHistorialCompletoSocio(payload.idSocio) };
        break;

      case 'registrarMaterial': registrarMaterial(payload); responseData = { status: 'success' }; break;
      case 'borrarMaterial': borrarMaterial(payload.uuid, payload.responsable); responseData = { status: 'success' }; break;
      case 'getAllMaterialesDesdeSheets': responseData = { status: 'success', data: getAllMaterialesDesdeSheets() }; break;

      case 'archivarCarpetaEnSheets':
        const tabCarp = archivarCarpetaEnSheets(payload);
        responseData = { status: 'success', tabNombre: tabCarp };
        break;

      default:
        responseData = { status: 'error', message: 'Acción desconocida: ' + action };
    }
    return createResponse(responseData);

  } catch (error) {
    return createResponse({ status: 'error', message: error.toString() });
  } finally {
    lock.releaseLock();
  }
}

function createResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

// ==============================================================================
// CONFIGURACIÓN INICIAL DE HOJAS
// ==============================================================================
function setupSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheets = {
    [HOJA_SOCIOS]:               ['ID', 'Nombre', 'Apellido', 'FechaIngreso', 'Area', 'TipoContrato', 'UltimaConexion'],
    [HOJA_ANTICIPOS]:            ['ID Socio', 'Nombre Completo', 'Fecha Anticipo', 'Monto', 'Estado', 'UUID', 'Responsable', 'AreaResponsable'],
    [HOJA_EXTRAS]:               ['ID Socio', 'Nombre', 'Fecha', 'Tipo', 'Monto', 'Detalle/Nota', 'Estado', 'UUID'],
    [HOJA_SALDOS]:               ['ID Socio', 'Nombre', 'MontoSaldo', 'UltimaActualizacion'],
    [HOJA_DIAS_PT]:              ['ID Socio', 'Nombre', 'DiasJSON'],
    [HOJA_SALDOS_CIERRE]:        ['ID Socio', 'Nombre', 'MontoRemanente', 'FechaCierre'],
    [HOJA_CHAT_SOCIAL]:          ['UUID', 'Fecha', 'Autor', 'ID_Socio', 'Mensaje', 'Destinatario', 'Estado'],
    [HOJA_ANTICIPOS_HISTORIAL]:  ['ID Socio', 'Nombre', 'Fecha Original', 'Monto', 'Fecha de Cierre', 'UUID'],
    [HOJA_HISTORIAL_CONEXIONES]: ['ID Socio', 'Nombre', 'Area', 'FechaEntrada', 'Tipo', 'FechaSalida'],
    [HOJA_AUDITORIA]:            ['Timestamp', 'Usuario', 'Accion', 'Detalle', 'ID_Afectado', 'GeoLat', 'GeoLng', 'DeviceID', 'IP', 'UserAgent'],
    [HOJA_CREDENCIALES]:         ['Ini', 'Area', 'PIN', 'UltimaActualizacion'],
    [HOJA_RETIROS_ANTICIPOS]:    ['Firma', 'Nombre', 'Monto', 'Billetes', 'FechaRegistro', 'Responsable'],
    [HOJA_MATERIALES]:           ['UUID', 'Fecha', 'Tipo', 'Monto', 'Nota', 'Responsable', 'Periodo', 'Estado']
  };

  for (const [name, headers] of Object.entries(sheets)) {
    if (!ss.getSheetByName(name)) {
      ss.insertSheet(name).appendRow(headers);
    }
  }
}

// ==============================================================================
// BORRAR MOVIMIENTO (Anticipos o Ausencias) — con auditoría
// ==============================================================================
function borrarMovimientoGlobal(uuid, tipo, usuario, detalle) {
  if (!uuid) return false;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetName = (tipo === 'Anticipo') ? HOJA_ANTICIPOS : HOJA_EXTRAS;
  const uuidColIndex = (tipo === 'Anticipo') ? 5 : 7;

  const sheet = ss.getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() <= 1) return false;

  const data = sheet.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) {
    if (String(data[i][uuidColIndex]) === String(uuid)) {
      const nombreSocio = data[i][1] || data[i][0];
      const monto = data[i][(tipo === 'Anticipo') ? 3 : 4];
      const fecha = data[i][2] ? Utilities.formatDate(new Date(data[i][2]), SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone(), 'yyyy-MM-dd') : '?';

      sheet.deleteRow(i + 1);

      registrarAuditoria(
        usuario || 'Desconocido',
        'Eliminar ' + tipo,
        'Socio: ' + nombreSocio + ' | Monto: $' + Number(monto).toLocaleString('es-CL') + ' | Fecha: ' + fecha + (detalle ? ' | ' + detalle : ''),
        uuid
      );
      return true;
    }
  }
  return false;
}

// ==============================================================================
// CIERRE MENSUAL — con auditoría
// ==============================================================================
function procesarCierreMensual(payload) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tz = ss.getSpreadsheetTimeZone();
  const fechaStr = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd_HH-mm");
  const reportName = "Cierre_" + fechaStr;
  const reportSheet = ss.insertSheet(reportName);
  const diasPT = getAllDiasPartTime();
  const headers = [
    "ID Socio", "Nombre Completo", "Área", "Contrato",
    "Pts Antigüedad", "Pts Finales", "Propina Bruta Asignada",
    "Desc. Ausencia ($)", "Días Trabajados (Part-Time)",
    "Total Notas/Descuentos ($)", "Detalle Notas",
    "Total Anticipos Tomados ($)", "EFECTIVO A PAGAR ($)", "REMANENTE (Pasa a Saldo Ant.)"
  ];
  const rows = [headers];
  if (payload.distribucion && payload.distribucion.length > 0) {
    payload.distribucion.forEach(s => {
      let diasTrabajadosStr = "N/A";
      if (s.TipoContrato === 'Part-Time' && diasPT[s.ID]) diasTrabajadosStr = diasPT[s.ID].join(", ");
      rows.push([
        s.ID || "", s.NombreCompleto || "", s.Area || "", s.TipoContrato || "",
        s.PuntosAntiguedad || 0, s.PuntosFinales || 0, s.PropinaAsignada || 0,
        s.DescuentoAusencia || 0, diasTrabajadosStr,
        s.TotalDescuentosPersonales || 0, s.DetalleNotas || "",
        s.Anticipos || 0,
        s.APagar !== undefined ? s.APagar : 0,
        s.Remanente !== undefined ? s.Remanente : s.SaldoFinal
      ]);
    });
  }
  reportSheet.getRange(1, 1, rows.length, headers.length).setValues(rows);

  const saldosSheet = ss.getSheetByName(HOJA_SALDOS);
  if (saldosSheet && saldosSheet.getLastRow() > 1) {
    saldosSheet.getRange(2, 1, saldosSheet.getLastRow() - 1, 4).clearContent();
  }
  if (payload.nuevosSaldosAnteriores && payload.nuevosSaldosAnteriores.length > 0) {
    const dataSaldos = payload.nuevosSaldosAnteriores.map(s => [s.id, s.nombre, Number(s.monto || 0), new Date()]);
    saldosSheet.getRange(2, 1, dataSaldos.length, 4).setValues(dataSaldos);
  }

  const antSheet = ss.getSheetByName(HOJA_ANTICIPOS);
  const histSheet = ss.getSheetByName(HOJA_ANTICIPOS_HISTORIAL);
  if (antSheet && antSheet.getLastRow() > 1) {
    const numRows = antSheet.getLastRow() - 1;
    const numCols = antSheet.getLastColumn();
    const antData = antSheet.getRange(2, 1, numRows, numCols).getValues();
    const fechaCierre = new Date();
    const archData = antData.map(r => [r[0], r[1], r[2], r[3], fechaCierre, r[5], r[6] || '', r[7] || '']);
    if (histSheet) histSheet.getRange(histSheet.getLastRow() + 1, 1, archData.length, archData[0].length).setValues(archData);
    antSheet.getRange(2, 1, numRows, numCols).clearContent();
  }

  const clearSheetContent = (name) => {
    const sh = ss.getSheetByName(name);
    if (sh && sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).clearContent();
  };
  clearSheetContent(HOJA_EXTRAS);
  clearSheetContent(HOJA_DIAS_PT);
  clearSheetContent(HOJA_SALDOS_CIERRE);

  const nSocios = payload.distribucion ? payload.distribucion.length : 0;
  const totalPagado = payload.distribucion ? payload.distribucion.reduce((s, x) => s + (Number(x.APagar) || 0), 0) : 0;

  registrarAuditoria(
    payload.responsable || 'Sistema',
    'Cierre de Mes',
    'Socios procesados: ' + nSocios + ' | Total pagado: $' + totalPagado.toLocaleString('es-CL') + ' | Hoja: ' + reportName,
    reportName
  );

  telegramEnviar(
    '🔒 <b>Cierre de Mes ejecutado</b>\n' +
    '📊 Socios procesados: ' + nSocios + '\n' +
    '💵 Total pagado: $' + totalPagado.toLocaleString('es-CL') + '\n' +
    '📁 Hoja generada: ' + reportName + '\n' +
    '🕐 ' + new Date().toLocaleString('es-CL')
  );
  return reportName;
}

// ==============================================================================
// FUNCIONES CRUD DE SOCIOS — con auditoría
// ==============================================================================
function addSocio(d, usuario) {
  const id = `SOC-${Date.now()}`;
  const s = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA_SOCIOS);
  s.appendRow([id, d.Nombre, d.Apellido, parseDateStrict(d.FechaIngreso), d.Area, d.TipoContrato]);

  registrarAuditoria(
    usuario || 'Desconocido',
    'Agregar Socio',
    'Nombre: ' + (d.Nombre||'') + ' ' + (d.Apellido||'') + ' | Contrato: ' + (d.TipoContrato||'') + ' | Área: ' + (d.Area||''),
    id
  );
  telegramEnviar(
    '🆕 <b>Nuevo socio registrado</b>\n' +
    '👤 ' + (d.Nombre || '') + ' ' + (d.Apellido || '') + '\n' +
    '📋 ' + (d.TipoContrato || '') + ' · ' + (d.Area || '') + '\n' +
    '📅 Inicio: ' + (d.FechaInicioPuntos || d.FechaIngreso || 'N/A')
  );
  return { ...d, ID: id };
}

function updateSocio(id, updates, usuario) {
  const s = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA_SOCIOS);
  const d = s.getDataRange().getValues();
  for (let i = 1; i < d.length; i++) {
    if (String(d[i][0]) === String(id)) {
      if (updates.Nombre)       s.getRange(i + 1, 2).setValue(updates.Nombre);
      if (updates.Apellido)     s.getRange(i + 1, 3).setValue(updates.Apellido);
      if (updates.FechaIngreso) s.getRange(i + 1, 4).setValue(parseDateStrict(updates.FechaIngreso));
      if (updates.Area)         s.getRange(i + 1, 5).setValue(updates.Area);
      if (updates.TipoContrato) s.getRange(i + 1, 6).setValue(updates.TipoContrato);

      registrarAuditoria(
        usuario || 'Desconocido',
        'Editar Socio',
        'ID: ' + id + ' | Cambios: ' + JSON.stringify(updates),
        id
      );
      break;
    }
  }
}

function deleteSocio(id, usuario) {
  const s = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA_SOCIOS);
  const d = s.getDataRange().getValues();
  for (let i = 1; i < d.length; i++) {
    if (String(d[i][0]) === String(id)) {
      const nombreCompleto = (d[i][1] || '') + ' ' + (d[i][2] || '');
      s.deleteRow(i + 1);
      registrarAuditoria(
        usuario || 'Desconocido',
        'Eliminar Socio',
        'Nombre: ' + nombreCompleto.trim() + ' | Área: ' + (d[i][4] || ''),
        id
      );
      break;
    }
  }
}

// ==============================================================================
// ANTICIPOS Y EXTRAS — con auditoría
// ==============================================================================
function registrarBatchAnticipos(lista, usuario) {
  const s = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA_ANTICIPOS);
  lista.forEach(item => {
    const uuid = item.uuid || Utilities.getUuid();
    s.appendRow([item.id, item.nombre, parseDateStrict(item.fecha), Number(item.monto), 'PENDIENTE', uuid, item.responsable || '', item.areaResponsable || '']);

    registrarAuditoria(
      item.responsable || usuario || 'Desconocido',
      'Registrar Anticipo',
      'Socio: ' + item.nombre + ' | Monto: $' + Number(item.monto).toLocaleString('es-CL') + ' | Fecha: ' + item.fecha,
      uuid
    );
    const resp = item.responsable ? ' · Resp: ' + item.responsable + (item.areaResponsable ? ' (' + item.areaResponsable + ')' : '') : '';
    telegramEnviar(
      '💰 <b>Anticipo registrado</b>\n' +
      '👤 ' + item.nombre + '\n' +
      '💵 $' + Number(item.monto).toLocaleString('es-CL') + '\n' +
      '📅 ' + item.fecha + resp
    );
  });
}

function registrarBatchExtras(lista, usuario) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA_EXTRAS);
  if (!lista.length) return;
  const newRows = lista.map(item => {
    const uuid = item.uuid || Utilities.getUuid();
    registrarAuditoria(
      item.responsable || usuario || 'Desconocido',
      'Registrar ' + (item.tipo || 'Extra'),
      'Socio: ' + item.nombre + ' | Detalle: ' + (item.detalle || item.tipo) + ' | Fecha: ' + item.fecha,
      uuid
    );
    return [item.id, item.nombre, parseDateStrict(item.fecha), item.tipo, Number(item.monto || 0), item.detalle, 'PENDIENTE', uuid];
  });
  sheet.getRange(sheet.getLastRow() + 1, 1, newRows.length, 8).setValues(newRows);

  const ausencias = lista.filter(item => item.tipo && item.tipo.toLowerCase().includes('ausencia'));
  if (ausencias.length > 0) {
    const grupos = {};
    ausencias.forEach(item => {
      const key = item.nombre + '|' + (item.detalle || item.tipo);
      if (!grupos[key]) grupos[key] = { nombre: item.nombre, detalle: item.detalle || item.tipo, fechas: [] };
      grupos[key].fechas.push(item.fecha);
    });
    Object.values(grupos).forEach(g => {
      const fechasOrdenadas = g.fechas.sort();
      if (fechasOrdenadas.length === 1) {
        telegramEnviar(
          '📅 <b>Ausencia registrada</b>\n' +
          '👤 ' + g.nombre + '\n' +
          '📋 ' + g.detalle + '\n' +
          '📅 ' + fechasOrdenadas[0]
        );
      } else {
        telegramEnviar(
          '🔴 <b>Ausencia múltiple registrada</b>\n' +
          '👤 ' + g.nombre + '\n' +
          '📋 ' + g.detalle + '\n' +
          '📅 Desde: ' + fechasOrdenadas[0] + '\n' +
          '📅 Hasta: ' + fechasOrdenadas[fechasOrdenadas.length - 1] + '\n' +
          '📆 Total: ' + fechasOrdenadas.length + ' días'
        );
      }
    });
  }
}

function actualizarAnticipo(uuid, fecha, monto, responsable, areaResponsable) {
  if (!uuid) return;
  const s = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA_ANTICIPOS);
  if (!s || s.getLastRow() <= 1) return;
  const data = s.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) {
    if (String(data[i][5]) === String(uuid)) {
      const montoAnterior = data[i][3];
      s.getRange(i + 1, 3).setValue(parseDateStrict(fecha));
      s.getRange(i + 1, 4).setValue(Number(monto));
      s.getRange(i + 1, 7).setValue(responsable || '');
      s.getRange(i + 1, 8).setValue(areaResponsable || '');

      registrarAuditoria(
        responsable || 'Desconocido',
        'Editar Anticipo',
        'Socio: ' + data[i][1] + ' | Monto anterior: $' + Number(montoAnterior).toLocaleString('es-CL') + ' → Nuevo: $' + Number(monto).toLocaleString('es-CL') + ' | Fecha: ' + fecha,
        uuid
      );
      return;
    }
  }
}

function reiniciarAnticipos(tabNombre, usuario) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sAnt = ss.getSheetByName(HOJA_ANTICIPOS);
  if (!sAnt || sAnt.getLastRow() <= 1) return;

  const numRows = sAnt.getLastRow() - 1;
  const numCols = sAnt.getLastColumn();
  const datos = sAnt.getRange(2, 1, numRows, numCols).getValues();
  const fechaArchivo = new Date();

  let tabRespaldo = ss.getSheetByName(tabNombre);
  if (!tabRespaldo) {
    tabRespaldo = ss.insertSheet(tabNombre);
    tabRespaldo.appendRow(['ID Socio', 'Nombre Completo', 'Fecha Anticipo', 'Monto', 'Estado', 'UUID', 'Responsable', 'AreaResponsable', 'FechaArchivo']);
  }
  const datosConFecha = datos.map(r => [...r.slice(0, numCols), fechaArchivo]);
  tabRespaldo.getRange(tabRespaldo.getLastRow() + 1, 1, datosConFecha.length, datosConFecha[0].length).setValues(datosConFecha);
  sAnt.getRange(2, 1, numRows, numCols).clearContent();

  registrarAuditoria(
    usuario || 'Desconocido',
    'Reiniciar Anticipos',
    'Registros archivados: ' + numRows + ' | Pestaña de respaldo: ' + tabNombre,
    tabNombre
  );
}

function reiniciarExtras(tabNombre, usuario) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sExt = ss.getSheetByName(HOJA_EXTRAS);
  if (!sExt || sExt.getLastRow() <= 1) return;
  const numRows = sExt.getLastRow() - 1;
  const numCols = sExt.getLastColumn();
  const datos = sExt.getRange(2, 1, numRows, numCols).getValues();
  const fechaArchivo = new Date();
  let tabRespaldo = ss.getSheetByName(tabNombre);
  if (!tabRespaldo) {
    tabRespaldo = ss.insertSheet(tabNombre);
    tabRespaldo.appendRow(['ID Socio', 'Nombre', 'Fecha', 'Tipo', 'Monto', 'Detalle/Nota', 'Estado', 'UUID', 'FechaArchivo']);
  }
  const datosConFecha = datos.map(r => [...r.slice(0, numCols), fechaArchivo]);
  tabRespaldo.getRange(tabRespaldo.getLastRow() + 1, 1, datosConFecha.length, datosConFecha[0].length).setValues(datosConFecha);
  sExt.getRange(2, 1, numRows, numCols).clearContent();
  registrarAuditoria(
    usuario || 'Desconocido',
    'Reiniciar Ausencias',
    'Registros archivados: ' + numRows + ' | Pestaña de respaldo: ' + tabNombre,
    tabNombre
  );
}

function getHistorialAnticiposSocio(idSocio, nombreSocio) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheets = ss.getSheets();
  const resultado = [];
  const idStr = String(idSocio || '').trim();
  const nomStr = String(nombreSocio || '').trim().toLowerCase();

  sheets.forEach(function(sheet) {
    const nombre = sheet.getName();
    if (!nombre.startsWith('Anticipos_')) return;
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return;
    const datos = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
    const registros = datos.filter(function(row) {
      const sheetId = String(row[0]).trim();
      const sheetNom = String(row[1]).trim().toLowerCase();
      if (idStr && sheetId === idStr) return true;
      if (nomStr && sheetNom.includes(nomStr)) return true;
      return false;
    }).map(function(row) {
      return {
        tab: nombre,
        idSocio: row[0],
        nombre: row[1],
        fecha: row[2] instanceof Date ? Utilities.formatDate(row[2], Session.getScriptTimeZone(), 'dd/MM/yyyy') : String(row[2]),
        monto: row[3],
        estado: row[4],
        responsable: row[6],
        areaResponsable: row[7]
      };
    });
    if (registros.length > 0) resultado.push({ tab: nombre, registros: registros });
  });

  resultado.sort(function(a, b) { return b.tab.localeCompare(a.tab); });
  return resultado;
}

// ==============================================================================
// NUEVO: historial completo de anticipos para la app móvil
// Busca en AnticiposGuardados (cierres mensuales) y en tabs Anticipos_*
// ==============================================================================
function getHistorialCompletoSocio(idSocio) {
  if (!idSocio) return [];
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tz = ss.getSpreadsheetTimeZone();
  const idStr = String(idSocio).trim();
  const resultado = {};

  // 1. Desde AnticiposGuardados (generado por procesarCierreMensual)
  const histSheet = ss.getSheetByName(HOJA_ANTICIPOS_HISTORIAL);
  if (histSheet && histSheet.getLastRow() > 1) {
    histSheet.getDataRange().getValues().slice(1).forEach(function(row) {
      if (String(row[0]).trim() !== idStr) return;
      const fc = row[4] instanceof Date
        ? Utilities.formatDate(row[4], tz, 'yyyy-MM')
        : String(row[4]).substring(0, 7);
      const key = 'Cierre ' + fc;
      if (!resultado[key]) resultado[key] = { periodo: key, registros: [] };
      resultado[key].registros.push({
        fecha: row[2] instanceof Date ? Utilities.formatDate(row[2], tz, 'dd/MM/yyyy') : String(row[2]),
        monto: Number(row[3]) || 0,
        responsable: row[6] || ''
      });
    });
  }

  // 2. Desde tabs Anticipos_* (generado por reiniciarAnticipos)
  ss.getSheets().forEach(function(sheet) {
    const nombre = sheet.getName();
    if (!nombre.startsWith('Anticipos_')) return;
    if (sheet.getLastRow() <= 1) return;
    const registros = sheet.getDataRange().getValues().slice(1)
      .filter(function(row) { return String(row[0]).trim() === idStr; })
      .map(function(row) {
        return {
          fecha: row[2] instanceof Date ? Utilities.formatDate(row[2], tz, 'dd/MM/yyyy') : String(row[2]),
          monto: Number(row[3]) || 0,
          responsable: row[6] || ''
        };
      });
    if (registros.length > 0) {
      const key = nombre.replace('Anticipos_', '');
      resultado[key] = { periodo: key, registros: registros };
    }
  });

  return Object.values(resultado).sort(function(a, b) {
    return b.periodo.localeCompare(a.periodo);
  });
}

function registrarSaldo(id, nombre, monto, usuario) {
  const s = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA_SALDOS);
  const data = s.getDataRange().getValues();
  const montoNum = Number(monto);
  let encontrado = false;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(id)) {
      const montoAnterior = data[i][2];
      s.getRange(i + 1, 3).setValue(montoNum);
      s.getRange(i + 1, 4).setValue(new Date());
      registrarAuditoria(
        usuario || 'Desconocido',
        'Actualizar Saldo Anterior',
        'Socio: ' + nombre + ' | Monto anterior: $' + Number(montoAnterior).toLocaleString('es-CL') + ' → Nuevo: $' + montoNum.toLocaleString('es-CL'),
        id
      );
      encontrado = true;
      break;
    }
  }
  if (!encontrado) {
    s.appendRow([id, nombre, montoNum, new Date()]);
    registrarAuditoria(
      usuario || 'Desconocido',
      'Registrar Saldo Anterior',
      'Socio: ' + nombre + ' | Monto: $' + montoNum.toLocaleString('es-CL'),
      id
    );
  }
}

// ==============================================================================
// FUNCIONES SECUNDARIAS
// ==============================================================================
function getSocios() {
  const s = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA_SOCIOS);
  if (!s || s.getLastRow() <= 1) return [];
  const tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
  const d = s.getDataRange().getValues();
  return d.slice(1).filter(r => r[0]).map(r => ({
    ID: r[0], Nombre: r[1], Apellido: r[2],
    FechaIngreso: r[3] ? Utilities.formatDate(new Date(r[3]), tz, "yyyy-MM-dd") : '',
    Area: r[4], TipoContrato: r[5],
    UltimaConexion: r[6] ? Utilities.formatDate(new Date(r[6]), tz, "yyyy-MM-dd HH:mm:ss") : null
  }));
}

function pingConexion(socioId) {
  if (!socioId) return;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tz = ss.getSpreadsheetTimeZone();
  const s = ss.getSheetByName(HOJA_SOCIOS);
  const d = s.getDataRange().getValues();
  const now = new Date();
  for (let i = 1; i < d.length; i++) {
    if (String(d[i][0]) === String(socioId)) {
      const prevPing = d[i][6] ? new Date(d[i][6]) : null;
      s.getRange(i + 1, 7).setValue(now);
      if (!prevPing || (now - prevPing) > 300000) {
        const hConex = ss.getSheetByName(HOJA_HISTORIAL_CONEXIONES);
        if (hConex) hConex.appendRow([d[i][0], d[i][1], d[i][4], now, 'LOGIN', '']);
        telegramEnviar(
          '🟢 <b>Conexion en sistema</b>\n' +
          '👤 ' + d[i][1] + ' ' + (d[i][2] || '') + '\n' +
          '📋 ' + (d[i][4] || '') + '\n' +
          '🪪 ID: ' + d[i][0] + '\n' +
          '🕐 ' + Utilities.formatDate(now, tz, 'HH:mm')
        );
      }
      return;
    }
  }
}

function logoutConexion(socioId) {
  if (!socioId) return;
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // Limpiar UltimaConexion para que el próximo login siempre notifique por Telegram
  const soc = ss.getSheetByName(HOJA_SOCIOS);
  if (soc) {
    const socData = soc.getDataRange().getValues();
    for (let j = 1; j < socData.length; j++) {
      if (String(socData[j][0]) === String(socioId)) {
        soc.getRange(j + 1, 7).setValue('');
        break;
      }
    }
  }

  const s = ss.getSheetByName(HOJA_HISTORIAL_CONEXIONES);
  if (!s) return;
  const d = s.getDataRange().getValues();
  const now = new Date();
  for (let i = d.length - 1; i >= 1; i--) {
    if (String(d[i][0]) === String(socioId) && d[i][4] === 'LOGIN' && !d[i][5]) {
      s.getRange(i + 1, 6).setValue(now);
      const ss2 = SpreadsheetApp.getActiveSpreadsheet();
      const soc2 = ss2.getSheetByName(HOJA_SOCIOS);
      const socData2 = soc2 ? soc2.getDataRange().getValues() : [];
      let nomLog = d[i][0]; let areaLog = '';
      for (let j = 1; j < socData2.length; j++) {
        if (String(socData2[j][0]) === String(socioId)) {
          nomLog = socData2[j][1] + ' ' + (socData2[j][2] || '');
          areaLog = socData2[j][4] || '';
          break;
        }
      }
      const entrada = d[i][3] ? new Date(d[i][3]) : null;
      const minutos = entrada ? Math.round((now - entrada) / 60000) : 0;
      const tiempoStr = minutos > 0 ? ' (' + minutos + ' min)' : '';
      telegramEnviar(
        '🔴 <b>Desconexion del sistema</b>\n' +
        '👤 ' + nomLog + '\n' +
        (areaLog ? '📋 ' + areaLog + '\n' : '') +
        '🪪 ID: ' + socioId + '\n' +
        '🕐 ' + Utilities.formatDate(now, ss2.getSpreadsheetTimeZone(), 'HH:mm') + tiempoStr
      );
      return;
    }
  }
}

function getHistorialConexiones(socioId) {
  if (!socioId) return [];
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tz = ss.getSpreadsheetTimeZone();
  const s = ss.getSheetByName(HOJA_HISTORIAL_CONEXIONES);
  if (!s || s.getLastRow() <= 1) return [];
  const d = s.getDataRange().getValues();
  return d.slice(1)
    .filter(r => String(r[0]) === String(socioId))
    .map(r => ({
      entrada: Utilities.formatDate(new Date(r[3]), tz, "yyyy-MM-dd HH:mm:ss"),
      salida: r[5] ? Utilities.formatDate(new Date(r[5]), tz, "yyyy-MM-dd HH:mm:ss") : null
    }))
    .reverse().slice(0, 30);
}

function archivarAnticiposSocio(socioId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sAnticipos = ss.getSheetByName(HOJA_ANTICIPOS);
  const sHistorial = ss.getSheetByName(HOJA_ANTICIPOS_HISTORIAL);
  if (!sAnticipos || sAnticipos.getLastRow() <= 1) return;
  const data = sAnticipos.getDataRange().getValues();
  const fechaCierre = new Date();
  for (let i = data.length - 1; i >= 1; i--) {
    if (String(data[i][0]) === String(socioId)) {
      sHistorial.appendRow([data[i][0], data[i][1], data[i][2], data[i][3], fechaCierre, data[i][5], data[i][6] || '', data[i][7] || '']);
      sAnticipos.deleteRow(i + 1);
    }
  }
}

function getDatosSocioIndividual(id) {
  if (!id) return { error: "ID faltante" };
  const tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const results = { anticipos: [], extras: [], saldoAnterior: 0, saldoCierre: 0, diasTrabajados: [] };

  const sAnt = ss.getSheetByName(HOJA_ANTICIPOS);
  if (sAnt && sAnt.getLastRow() > 1) {
    const d = sAnt.getDataRange().getValues();
    for (let i = 1; i < d.length; i++) {
      if (String(d[i][0]) === String(id))
        results.anticipos.push({ fecha: Utilities.formatDate(new Date(d[i][2]), tz, "yyyy-MM-dd"), cantidad: Number(d[i][3]), uuid: d[i][5], responsable: d[i][6] || '', areaResponsable: d[i][7] || '' });
    }
  }

  const sExt = ss.getSheetByName(HOJA_EXTRAS);
  if (sExt && sExt.getLastRow() > 1) {
    const d = sExt.getDataRange().getValues();
    for (let i = 1; i < d.length; i++) {
      if (String(d[i][0]) === String(id))
        results.extras.push({ fecha: Utilities.formatDate(new Date(d[i][2]), tz, "yyyy-MM-dd"), tipo: d[i][3], monto: Number(d[i][4]), detalle: d[i][5], uuid: d[i][7] });
    }
  }

  const sSal = ss.getSheetByName(HOJA_SALDOS);
  if (sSal && sSal.getLastRow() > 1) {
    const d = sSal.getDataRange().getValues();
    for (let i = 1; i < d.length; i++) { if (String(d[i][0]) === String(id)) { results.saldoAnterior = Number(d[i][2]); break; } }
  }

  const sCie = ss.getSheetByName(HOJA_SALDOS_CIERRE);
  if (sCie && sCie.getLastRow() > 1) {
    const d = sCie.getDataRange().getValues();
    for (let i = 1; i < d.length; i++) { if (String(d[i][0]) === String(id)) { results.saldoCierre = Number(d[i][2]); break; } }
  }

  return { ...results, saldoAnterior: results.saldoAnterior + results.saldoCierre };
}

function registrarCierreManual(id, nombre, monto) {
  const s = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA_SALDOS_CIERRE);
  const data = s.getDataRange().getValues();
  const montoNumerico = Number(String(monto).replace(/[^0-9.-]+/g,""));
  let encontrado = false;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(id)) {
      s.getRange(i + 1, 3).setValue(montoNumerico);
      s.getRange(i + 1, 4).setValue(new Date());
      encontrado = true; break;
    }
  }
  if (!encontrado) s.appendRow([id, nombre, montoNumerico, new Date()]);
}

function guardarDiasPT(id, nombre, diasArray) {
  const s = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA_DIAS_PT);
  const data = s.getDataRange().getValues();
  const json = JSON.stringify(diasArray);
  let f = false;
  for (let i = 1; i < data.length; i++) { if (String(data[i][0]) === String(id)) { s.getRange(i + 1, 3).setValue(json); f = true; break; } }
  if (!f) s.appendRow([id, nombre, json]);
}

// ==============================================================================
// GUARDAR BATCH DE DÍAS PARA MÚLTIPLES SOCIOS PART-TIME
// ==============================================================================
function guardarBatchDiasPartTime(payload) {
  const { socios, dias, usuario, geoLat, geoLng, deviceID, ip, userAgent } = payload;
  if (!socios || !Array.isArray(socios) || socios.length === 0) {
    return { status: 'error', message: 'No hay socios para procesar' };
  }
  if (!dias || !Array.isArray(dias)) {
    return { status: 'error', message: 'Días inválidos' };
  }

  const s = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA_DIAS_PT);
  const data = s.getDataRange().getValues();

  socios.forEach(socioInfo => {
    const id = socioInfo.id || socioInfo;
    const nombre = socioInfo.nombre || '';
    let found = false;

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(id)) {
        let existentes = [];
        try { existentes = JSON.parse(data[i][2] || '[]'); } catch(e) { existentes = []; }
        const merged = [...new Set([...existentes, ...dias])].sort();
        s.getRange(i + 1, 3).setValue(JSON.stringify(merged));
        found = true;
        break;
      }
    }

    if (!found) {
      s.appendRow([id, nombre, JSON.stringify([...new Set(dias)].sort())]);
    }
  });

  const detalleAuditoria = `Batch: Agregó ${dias.length} día(s) a ${socios.length} socio(s) Part-Time`;
  registrarAuditoria(
    usuario || 'Sistema',
    'Agregar Batch Días PT',
    detalleAuditoria,
    socios.map(s => (typeof s === 'object' ? s.id : s)).join(','),
    geoLat || '',
    geoLng || '',
    deviceID || '',
    ip || '',
    userAgent || ''
  );

  return {
    status: 'success',
    message: `Días agregados exitosamente a ${socios.length} socio(s)`,
    cantidad: socios.length
  };
}

function getChatMessages() {
  const s = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA_CHAT_SOCIAL);
  if (!s || s.getLastRow() <= 1) return [];
  const data = s.getDataRange().getValues();
  const tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
  return data.slice(1).map(r => ({
    uuid: r[0],
    fecha: Utilities.formatDate(new Date(r[1]), tz, "yyyy-MM-dd HH:mm:ss"),
    autor: r[2], socId: r[3], mensaje: r[4], nota: r[4], destinatario: r[5]
  }));
}

function addChatMessage(autor, mensaje, socId, destinatario) {
  const s = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA_CHAT_SOCIAL);
  s.appendRow([Utilities.getUuid(), new Date(), autor, socId, mensaje, destinatario || 'TODOS', 'ACTIVE']);
}

function deleteChatMessage(noteId) {
  const s = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA_CHAT_SOCIAL);
  const data = s.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) { if (String(data[i][0]) === String(noteId)) { s.deleteRow(i + 1); return true; } }
  return false;
}

function parseDateStrict(dateStr) {
  if (!dateStr) return new Date();
  const p = String(dateStr).split('T')[0].split('-');
  return p.length === 3 ? new Date(p[0], p[1] - 1, p[2], 12, 0, 0) : new Date(dateStr);
}

function getAllAnticiposDesdeSheets() {
  const s = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA_ANTICIPOS);
  if (!s || s.getLastRow() <= 1) return {};
  const d = s.getDataRange().getValues(); const res = {};
  const tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
  for (let i = 1; i < d.length; i++) {
    const id = d[i][0]; if (!res[id]) res[id] = [];
    res[id].push({ fecha: Utilities.formatDate(new Date(d[i][2]), tz, "yyyy-MM-dd"), cantidad: Number(d[i][3]), uuid: d[i][5], responsable: d[i][6] || '', areaResponsable: d[i][7] || '' });
  }
  return res;
}

function getAllExtrasDesdeSheets() {
  const s = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA_EXTRAS);
  if (!s || s.getLastRow() <= 1) return {};
  const d = s.getDataRange().getValues(); const res = {};
  const tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
  for (let i = 1; i < d.length; i++) {
    const id = d[i][0]; if (!res[id]) res[id] = [];
    res[id].push({ fecha: Utilities.formatDate(new Date(d[i][2]), tz, "yyyy-MM-dd"), tipo: d[i][3], monto: Number(d[i][4]), detalle: d[i][5], uuid: d[i][7] });
  }
  return res;
}

function getAllSaldosAnteriores() {
  const s = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA_SALDOS);
  if (!s || s.getLastRow() <= 1) return {};
  const d = s.getDataRange().getValues(); const res = {};
  for (let i = 1; i < d.length; i++) { if (d[i][0]) res[d[i][0]] = Number(d[i][2]); }
  return res;
}

function getAllSaldosCierre() {
  const s = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA_SALDOS_CIERRE);
  if (!s || s.getLastRow() <= 1) return {};
  const d = s.getDataRange().getValues(); const res = {};
  for (let i = 1; i < d.length; i++) { if (d[i][0]) res[d[i][0]] = Number(d[i][2]); }
  return res;
}

// ==============================================================================
// CREDENCIALES — PINs personales por responsable
// ==============================================================================
function getCredenciales() {
  const s = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA_CREDENCIALES);
  if (!s || s.getLastRow() <= 1) return [];
  const d = s.getDataRange().getValues();
  return d.slice(1).filter(r => r[0] && r[1] && r[2]).map(r => ({
    ini:  String(r[0]),
    area: String(r[1]),
    pin:  String(r[2])
  }));
}

function setCredencial(ini, area, pin) {
  if (!ini || !area || !pin) return;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const s  = ss.getSheetByName(HOJA_CREDENCIALES);
  if (!s) return;
  const d = s.getDataRange().getValues();
  for (let i = 1; i < d.length; i++) {
    if (String(d[i][0]) === String(ini) && String(d[i][1]) === String(area)) {
      s.getRange(i + 1, 3).setValue(String(pin));
      s.getRange(i + 1, 4).setValue(new Date());
      return;
    }
  }
  s.appendRow([ini, area, String(pin), new Date()]);
}

function deleteCredencial(ini, area) {
  if (!ini || !area) return;
  const s = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA_CREDENCIALES);
  if (!s || s.getLastRow() <= 1) return;
  const d = s.getDataRange().getValues();
  for (let i = d.length - 1; i >= 1; i--) {
    if (String(d[i][0]) === String(ini) && String(d[i][1]) === String(area)) {
      s.deleteRow(i + 1);
      return;
    }
  }
}

// ==============================================================================
// RETIROS DE ANTICIPOS
// ==============================================================================
function registrarRetiroAnticipo(firma, nombre, monto, billetes, responsable) {
  if (!firma) return;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let s = ss.getSheetByName(HOJA_RETIROS_ANTICIPOS);
  if (!s) { s = ss.insertSheet(HOJA_RETIROS_ANTICIPOS); s.appendRow(['Firma', 'Nombre', 'Monto', 'Billetes', 'FechaRegistro', 'Responsable']); }

  if (s.getLastRow() > 1) {
    const datos = s.getRange(2, 1, s.getLastRow() - 1, 1).getValues();
    for (let i = 0; i < datos.length; i++) {
      if (String(datos[i][0]) === String(firma)) return;
    }
  }
  const tz = ss.getSpreadsheetTimeZone();
  const ahora = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd'T'HH:mm:ss");
  s.appendRow([firma, nombre || '', monto || 0, JSON.stringify(billetes || {}), ahora, responsable || '']);
}

function getRetirosAnticipos() {
  const s = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA_RETIROS_ANTICIPOS);
  if (!s || s.getLastRow() <= 1) return {};
  const datos = s.getDataRange().getValues().slice(1);
  const resultado = {};
  datos.forEach(r => {
    const firma = String(r[0]);
    if (!firma) return;
    let billetes = {};
    try { billetes = JSON.parse(r[3] || '{}'); } catch(e) {}
    resultado[firma] = { nombre: r[1] || '', monto: parseFloat(r[2]) || 0, billetes, fecha: r[4] || '', responsable: r[5] || '' };
  });
  return resultado;
}

function getAuditoria() {
  const s = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA_AUDITORIA);
  if (!s || s.getLastRow() <= 1) return [];
  const tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
  const d = s.getDataRange().getValues();
  return d.slice(1).filter(r => r[0]).map(r => ({
    fecha:      r[0] ? Utilities.formatDate(new Date(r[0]), tz, "yyyy-MM-dd'T'HH:mm:ss") : '',
    usuario:    r[1] || '',
    accion:     r[2] || '',
    detalle:    r[3] || '',
    idAfectado: r[4] || '',
    geoLat:     r[5] || '',
    geoLng:     r[6] || '',
    deviceID:   r[7] || '',
    ip:         r[8] || '',
    userAgent:  r[9] || ''
  })).reverse();
}

function getAllDiasPartTime() {
  const s = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA_DIAS_PT);
  if (!s || s.getLastRow() <= 1) return {};
  const d = s.getDataRange().getValues(); const res = {};
  for (let i = 1; i < d.length; i++) {
    if (d[i][0]) {
      try { res[d[i][0]] = JSON.parse(d[i][2]); }
      catch(e) { res[d[i][0]] = []; }
    }
  }
  return res;
}

// ==============================================================================
// RECAUDACIÓN DE MATERIALES Y GASTOS
// ==============================================================================
function registrarMaterial(payload) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const s = ss.getSheetByName(HOJA_MATERIALES);
  const uuid = 'mat-' + new Date().getTime() + '-' + Math.random().toString(36).substr(2,5);
  s.appendRow([uuid, payload.fecha, payload.tipo, payload.monto, payload.nota || '', payload.responsable || '', payload.periodo, 'activo']);
  const accion = payload.tipo === 'Ingreso' ? 'Ingreso Material' : 'Gasto Material';
  const detalle = 'Fecha: ' + payload.fecha + ' | Monto: $' + payload.monto + (payload.nota ? ' | ' + payload.nota : '');
  registrarAuditoria(payload.responsable || 'Sistema', accion, detalle, uuid);
}

function borrarMaterial(uuid, responsable) {
  const s = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA_MATERIALES);
  if (!s || s.getLastRow() <= 1) return;
  const datos = s.getDataRange().getValues();
  for (let i = 1; i < datos.length; i++) {
    if (String(datos[i][0]) === String(uuid)) {
      s.getRange(i + 1, 8).setValue('borrado');
      registrarAuditoria(responsable || 'Sistema', 'Eliminar Material', 'UUID: ' + uuid, uuid);
      return;
    }
  }
}

function getAllMaterialesDesdeSheets() {
  const s = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA_MATERIALES);
  if (!s || s.getLastRow() <= 1) return [];
  return s.getDataRange().getValues().slice(1)
    .filter(r => r[7] !== 'borrado' && r[0])
    .map(r => ({ uuid: r[0], fecha: r[1] ? Utilities.formatDate(new Date(r[1]), SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone(), 'yyyy-MM-dd') : '', tipo: r[2], monto: parseFloat(r[3]) || 0, nota: r[4] || '', responsable: r[5] || '', periodo: r[6] ? Utilities.formatDate(new Date(r[6]), SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone(), 'yyyy-MM-dd') : '', estado: r[7] }));
}

// ==============================================================================
// ARCHIVAR CARPETA DE RECAUDACIÓN EN SHEETS
// ==============================================================================
function archivarCarpetaEnSheets(payload) {
  const ss  = SpreadsheetApp.getActiveSpreadsheet();
  const tz  = ss.getSpreadsheetTimeZone();
  const hoy = Utilities.formatDate(new Date(), tz, 'dd-MM-yyyy');

  let tabNombre = 'Carpeta_' + hoy;
  let sufijo = 0;
  while (ss.getSheetByName(tabNombre)) {
    sufijo++;
    tabNombre = 'Carpeta_' + hoy + '_' + sufijo;
  }

  const tab = ss.insertSheet(tabNombre);

  tab.appendRow(['Período', payload.rango || '', 'Archivado', new Date()]);
  tab.getRange(1, 1, 1, 4).setFontWeight('bold');
  tab.appendRow([]);

  const headers = ['Fecha', 'Tipo', 'Monto', 'Divisor'];
  tab.appendRow(headers);
  tab.getRange(3, 1, 1, headers.length).setFontWeight('bold').setBackground('#e2e8f0');

  const datos = payload.datos || [];
  if (datos.length > 0) {
    const filas = datos.map(r => [
      r.fecha || '',
      r.tipo  || '',
      parseFloat(r.monto) || 0,
      r.divisor || ''
    ]);
    tab.getRange(4, 1, filas.length, 4).setValues(filas);
  }

  tab.autoResizeColumns(1, 4);

  registrarAuditoria(
    payload.responsable || 'Sistema',
    'Archivar Carpeta',
    'Período: ' + (payload.rango || '') + ' | Registros: ' + datos.length + ' | Pestaña: ' + tabNombre,
    tabNombre
  );

  return tabNombre;
}
