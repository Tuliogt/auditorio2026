// ============================================================
// Entradas · Espectáculo – Auditorio Nacional (JB Dance Academy)
//
// Dos caras:
//   · PÚBLICA  /pagar   cada comprador sube su comprobante de transferencia
//                       (nombre y apellidos, # de entradas, imagen) y recibe
//                       un CÓDIGO único. Nadie más que él lo conoce.
//   · PRIVADA  /        Jose (con login) elige asientos, escribe el código,
//                       el sistema valida el monto y recién ahí vende.
//
// Regla de oro: NUNCA se decide en este archivo si un asiento está
// libre ni si un código ya se usó. Lo decide la base de datos (claves
// únicas); aquí solo se traducen sus respuestas.
// ============================================================

import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parsearComprobante } from './src/parser.js';
import { verificarDestino } from './src/destino.js';
import {
  crearLimitador, ipCliente, detectarTipoImagen, textoLimpio, numeroLimpio, fechaLimpia,
  referenciaLimpia, iguales, firmarSesion, sesionValida, leerCookie,
} from './src/seguridad.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CARPETA_PUBLICA = path.join(__dirname, 'public');

const PUERTO = Number(process.env.PORT) || 3000;
const LIMITE_CUERPO = 6 * 1024 * 1024;
const LIMITE_IMAGEN = 4 * 1024 * 1024;
const CONFIAR_PROXY = process.env.CONFIAR_EN_PROXY !== 'false';
const DURACION_SESION = 12 * 60 * 60 * 1000;
const MODELO_RESPALDO = 'claude-haiku-4-5-20251001';

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const BUCKET = process.env.SUPABASE_BUCKET || 'comprobantes-entradas';
const VISION_URL = process.env.VISION_URL || 'https://vision.googleapis.com/v1/images:annotate';

const ADMIN_USUARIO = (process.env.ADMIN_USUARIO || 'jose').trim();
const ADMIN_CLAVE = process.env.ADMIN_CLAVE || '';
// Sin SESION_SECRETO se genera uno al arrancar: funciona, pero cada
// reinicio del servidor cierra la sesión de Jose.
const SESION_SECRETO = process.env.SESION_SECRETO || crypto.randomBytes(32).toString('hex');

// Todas las transferencias deben ir a esta cuenta, a nombre de Jose.
const CUENTA_DESTINO = (process.env.CUENTA_DESTINO || '').trim();
const TITULAR_DESTINO = (process.env.TITULAR_DESTINO || '').trim();
const BANCO_DESTINO = (process.env.BANCO_DESTINO || '').trim();
const FECHA_BORRADO = (process.env.FECHA_BORRADO || '').trim();

const limiteLogin = crearLimitador({ maximo: 8, ventanaMs: 10 * 60 * 1000 });
const limiteOcr = crearLimitador({ maximo: Number(process.env.LIMITE_REGISTROS) || 40, ventanaMs: 10 * 60 * 1000 });
const limiteConsulta = crearLimitador({ maximo: 15, ventanaMs: 10 * 60 * 1000 });
const limiteGeneral = crearLimitador({ maximo: 600, ventanaMs: 5 * 60 * 1000 });

const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.json': 'application/json; charset=utf-8',
};

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

function cabeceras(extra = {}) {
  return {
    'content-security-policy': CSP,
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'no-referrer',
    'permissions-policy': 'geolocation=(), microphone=(), payment=()',
    ...extra,
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ------------------------------------------------------------
// Rutas
// ------------------------------------------------------------
const POST = {
  // públicas
  '/api/pagos/registrar': manejarRegistrarPago,
  '/api/consultar': manejarConsultar,
  // Jose
  '/api/login': manejarLogin,
  '/api/logout': manejarLogout,
  '/api/pago/buscar': manejarBuscarPago,
  '/api/vender': manejarVender,
  '/api/rechazar': manejarRechazar,
  '/api/anular': manejarAnular,
  '/api/cambiar': manejarCambiar,
  '/api/personas': manejarGuardarPersonas,
  '/api/personas/eliminar': manejarEliminarPersona,
  '/api/borrar-comprobantes': manejarBorrarComprobantes,
};
const GET = {
  '/api/info': manejarInfo,
  '/api/sesion': manejarSesion,
  '/api/mapa': manejarMapa,
  '/api/pagos': manejarPagos,
  '/api/resumen': manejarResumen,
  '/api/personas': manejarPersonas,
};
// Lo único que se puede usar sin login
const PUBLICAS = new Set(['/api/login', '/api/logout', '/api/sesion', '/api/info', '/api/pagos/registrar', '/api/consultar']);

export const servidor = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const ruta = url.pathname;
    const ip = ipCliente(req, CONFIAR_PROXY);

    if (ruta === '/health') return json(res, { ok: true });

    if (ruta.startsWith('/api/')) {
      if (!limiteGeneral(ip).ok) return json(res, { error: 'Demasiadas peticiones. Espera un momento.' }, 429);

      const ctx = { req, res, url, ip };
      if (!PUBLICAS.has(ruta) && !haySesion(req)) return json(res, { error: 'Sesión vencida. Entra de nuevo.', sesion: false }, 401);

      if (ruta.startsWith('/api/comprobante/')) {
        if (req.method !== 'GET') return json(res, { error: 'Método no permitido.' }, 405);
        return await servirComprobante(ctx, decodeURIComponent(ruta.slice('/api/comprobante/'.length)));
      }
      if (req.method === 'GET' && GET[ruta]) return await GET[ruta](ctx);
      if (req.method === 'POST' && POST[ruta]) {
        // Las peticiones que cambian algo exigen JSON: un formulario de otra
        // página no puede mandarlo, así que no se puede forzar desde afuera.
        if (!String(req.headers['content-type'] || '').startsWith('application/json')) {
          return json(res, { error: 'Formato no permitido.' }, 415);
        }
        return await POST[ruta](ctx);
      }
      return json(res, { error: 'No existe.' }, ruta in GET || ruta in POST ? 405 : 404);
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, { error: 'Método no permitido.' }, 405);
    return await servirEstatico(ruta === '/' ? '/index.html' : ruta === '/pagar' ? '/pagar.html' : ruta, res);
  } catch (e) {
    console.error('Error no controlado:', e);
    if (!res.headersSent) json(res, { error: 'Error interno.' }, 500);
    else res.end();
  }
});

process.on('unhandledRejection', (r) => console.error('Promesa sin manejar:', r));
process.on('uncaughtException', (e) => console.error('Excepción no capturada:', e));

if (process.env.NO_ESCUCHAR !== 'true') {
  servidor.listen(PUERTO, '0.0.0.0', () => {
    console.log(`Entradas Auditorio escuchando en el puerto ${PUERTO}`);
    const faltan = [];
    if (!SUPABASE_URL) faltan.push('SUPABASE_URL');
    if (!SERVICE_KEY) faltan.push('SUPABASE_SERVICE_ROLE_KEY');
    if (!ADMIN_CLAVE) faltan.push('ADMIN_CLAVE');
    if (!process.env.GOOGLE_VISION_API_KEY) faltan.push('GOOGLE_VISION_API_KEY');
    if (faltan.length) console.warn('AVISO: faltan variables:', faltan.join(', '));
    if (!process.env.SESION_SECRETO) console.warn('AVISO: SESION_SECRETO vacío — la sesión se cierra en cada reinicio.');
    if (!CUENTA_DESTINO && !TITULAR_DESTINO) console.warn('AVISO: CUENTA_DESTINO y TITULAR_DESTINO vacíos — NO se valida a qué cuenta va el comprobante.');
    if (FECHA_BORRADO) {
      console.log(`Los comprobantes se borran automáticamente después del ${FECHA_BORRADO}.`);
      revisarVencimiento();
      setInterval(revisarVencimiento, 24 * 60 * 60 * 1000).unref();
    }
  });
}

// ------------------------------------------------------------
// Sesión
// ------------------------------------------------------------
function haySesion(req) {
  if (!ADMIN_CLAVE) return false;                       // sin clave configurada, nadie entra
  return sesionValida(leerCookie(req, 'sesion'), SESION_SECRETO, ADMIN_USUARIO);
}

function cookieSesion(req, valor, maxAgeSeg) {
  const seguro = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https';
  return `sesion=${encodeURIComponent(valor)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeg}${seguro ? '; Secure' : ''}`;
}

async function manejarSesion({ req, res }) {
  return json(res, { ok: haySesion(req), usuario: haySesion(req) ? ADMIN_USUARIO : null });
}

async function manejarLogin({ req, res, ip }) {
  const permiso = limiteLogin(ip);
  if (!permiso.ok) {
    return json(res, { error: `Demasiados intentos. Espera ${Math.ceil(permiso.esperaSegundos / 60)} minutos.` }, 429);
  }
  if (!ADMIN_CLAVE) return json(res, { error: 'El servidor no tiene configurada la clave de acceso.' }, 500);

  const c = await leerJsonSeguro(req, res); if (!c) return;
  const okUsuario = iguales(String(c.usuario || '').trim().toLowerCase(), ADMIN_USUARIO.toLowerCase());
  const okClave = iguales(String(c.clave || ''), ADMIN_CLAVE);
  if (!(okUsuario && okClave)) {
    await new Promise((r) => setTimeout(r, 600));       // frena el ensayo y error
    return json(res, { error: 'Usuario o clave incorrectos.' }, 401);
  }
  const valor = firmarSesion(SESION_SECRETO, ADMIN_USUARIO, DURACION_SESION);
  res.writeHead(200, cabeceras({
    'content-type': 'application/json; charset=utf-8',
    'set-cookie': cookieSesion(req, valor, DURACION_SESION / 1000),
  }));
  res.end(JSON.stringify({ ok: true, usuario: ADMIN_USUARIO }));
}

async function manejarLogout({ req, res }) {
  res.writeHead(200, cabeceras({
    'content-type': 'application/json; charset=utf-8',
    'set-cookie': cookieSesion(req, '', 0),
  }));
  res.end(JSON.stringify({ ok: true }));
}

// ------------------------------------------------------------
// Base de datos: todo pasa por funciones (RPC) que decide Postgres
// ------------------------------------------------------------
async function rpc(fn, args = {}) {
  if (!SUPABASE_URL || !SERVICE_KEY) throw new Error('Base de datos sin configurar');
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}` },
    body: JSON.stringify(args),
  });
  const texto = await r.text();
  if (!r.ok) throw new Error(`rpc ${fn} → ${r.status} ${texto.slice(0, 300)}`);
  return texto ? JSON.parse(texto) : null;
}

const EVENTO_ID = /^[a-z0-9_-]{1,30}$/;
function eventoLimpio(v) {
  const e = String(v || '').trim().toLowerCase();
  return EVENTO_ID.test(e) ? e : null;
}

const colones = (n) => '₡' + Number(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');

// Traduce {ok:false,error:'...'} de la base de datos a un mensaje.
// `quien` cambia el tono: el comprador ve instrucciones; Jose ve el dato crudo.
function mensajeError(r, quien = 'jose') {
  const n = (k, uno, otros) => (k === 1 ? uno : otros);
  switch (r.error) {
    case 'evento_invalido': return ['Elige el evento.', 400];
    case 'evento_distinto':
      return quien === 'comprador'
        ? [`Este código es para ${r.evento_pago}.`, 409]
        : [`Ese código es de ${r.evento_pago}, pero estás vendiendo asientos de ${r.evento}. Cambia de evento arriba, o usa el código correcto.`, 409];
    case 'nombre': return ['Escribe el nombre y apellidos.', 400];
    case 'sin_asientos': return ['Selecciona al menos un asiento.', 400];
    case 'demasiados': return [`Máximo ${r.maximo} asientos por venta.`, 400];
    case 'asiento_invalido': return [`Asiento inexistente en el plano: ${(r.asientos || []).join(', ')}.`, 400];
    case 'ocupados': return [`Estos asientos ya no están disponibles: ${(r.asientos || []).join(', ')}. El plano se actualizó; elige otros.`, 409];
    case 'monto':
      return quien === 'comprador'
        ? [`El monto del comprobante (${colones(r.recibido)}) no coincide con ${r.cantidad} entrada${n(r.cantidad, '', 's')}: ${r.cantidad} × ${colones(r.precio)} = ${colones(r.esperado)}. Revisa cuántas entradas estás pagando.`, 422]
        : [`El monto no cuadra: el pago es de ${colones(r.recibido)} y ${r.cantidad} asiento${n(r.cantidad, '', 's')} × ${colones(r.precio)} suman ${colones(r.esperado)}.`, 422];
    case 'referencia_repetida': return ['Este comprobante ya fue registrado. Cada transferencia se puede usar una sola vez.', 409];
    case 'referencia_invalida': return ['El número de referencia no es válido (mínimo 6 letras o números).', 400];
    case 'origen': return ['Datos inválidos.', 400];
    case 'codigo_no_existe': return ['Ese código no existe. Revisa que esté bien escrito.', 404];
    case 'codigo_usado': return [`Ese código YA se usó${r.comprador ? ` (${r.comprador})` : ''}${(r.asientos || []).length ? ` para los asientos ${r.asientos.join(', ')}` : ''}. No se puede usar dos veces.`, 409];
    case 'pago_rechazado': return [`Ese pago fue rechazado${r.motivo ? `: ${r.motivo}` : ''}. No se pueden vender asientos con él.`, 409];
    case 'no_rechazable': return ['Ese pago ya no se puede rechazar.', 409];
    case 'no_anulable': return ['Esa venta ya no se puede anular.', 409];
    case 'no_modificable': return ['Solo se pueden cambiar los asientos de una venta vigente.', 409];
    case 'cantidad':
      if (r.esperado != null) return [`El pago es por ${r.esperado} entrada${n(r.esperado, '', 's')}: debes elegir exactamente ${r.esperado} asiento${n(r.esperado, '', 's')} (elegiste ${r.recibido}).`, 400];
      return [`La cantidad de entradas debe estar entre 1 y ${r.maximo}.`, 400];
    case 'reintentar': return ['Hubo un choque momentáneo. Intenta de nuevo.', 409];
    default: return ['No se pudo completar la operación.', 400];
  }
}

// Envía la respuesta de una función de la base de datos
function responderRpc(res, r, extra = {}, quien = 'jose') {
  if (r && r.ok) return json(res, { ...r, ...extra });
  const [mensaje, estado] = mensajeError(r || {}, quien);
  return json(res, { ok: false, error: mensaje, codigoError: r && r.error, detalle: r, ...extra }, estado);
}

async function conBase(res, fn) {
  try { return await fn(); }
  catch (e) {
    console.error('Base de datos:', e.message);
    if (!res.headersSent) json(res, { error: 'No se pudo hablar con la base de datos. Intenta de nuevo.' }, 502);
  }
}

// ------------------------------------------------------------
// Mapa, resumen, listados (Jose)
// ------------------------------------------------------------
async function manejarMapa({ res, url }) {
  const evento = eventoLimpio(url.searchParams.get('evento'));
  if (!evento) return json(res, { error: 'Elige el evento.' }, 400);
  return conBase(res, async () => {
    const r = await rpc('mapa_asientos', { p_evento: evento });
    return r && r.ok ? json(res, r) : responderRpc(res, r);
  });
}
async function manejarResumen({ res, url }) {
  const q = url.searchParams.get('evento');
  const evento = q ? eventoLimpio(q) : null;
  if (q && !evento) return json(res, { error: 'Evento inválido.' }, 400);
  return conBase(res, async () => {
    const r = await rpc('resumen', { p_evento: evento });
    return r && r.ok ? json(res, r) : responderRpc(res, r);
  });
}
async function manejarPagos({ res }) {
  return conBase(res, async () => json(res, { pagos: await rpc('listar_pagos') }));
}
async function manejarPersonas({ res }) {
  return conBase(res, async () => json(res, { nombres: await rpc('listar_personas') }));
}

async function manejarGuardarPersonas({ req, res }) {
  const c = await leerJsonSeguro(req, res); if (!c) return;
  const nombres = (Array.isArray(c.nombres) ? c.nombres : String(c.nombres || '').split(/\r?\n|;/))
    .map((n) => textoLimpio(n, 120)).filter(Boolean).slice(0, 2000);
  return conBase(res, async () => json(res, await rpc('guardar_personas', { p_nombres: nombres })));
}
async function manejarEliminarPersona({ req, res }) {
  const c = await leerJsonSeguro(req, res); if (!c) return;
  const nombre = textoLimpio(c.nombre, 120);
  if (!nombre) return json(res, { error: 'Falta el nombre.' }, 400);
  return conBase(res, async () => json(res, await rpc('eliminar_persona', { p_nombre: nombre })));
}

// ------------------------------------------------------------
// PÚBLICO · el comprador sube su comprobante y recibe su código
// ------------------------------------------------------------
async function manejarInfo({ res }) {
  return conBase(res, async () => {
    const i = await rpc('info_publica');
    if (!i || !Array.isArray(i.eventos) || !i.eventos.length) {
      console.error('info_publica no devuelve eventos: falta ejecutar el schema.sql nuevo en Supabase (SQL Editor).');
      return json(res, { error: 'Falta actualizar la base de datos (ejecutar schema.sql en Supabase).' }, 503);
    }
    return json(res, { ...i, cuenta: CUENTA_DESTINO || null, titular: TITULAR_DESTINO || null, banco: BANCO_DESTINO || null });
  });
}

const CODIGO = /^[A-Z0-9]{3,12}$/;
function codigoLimpio(v) {
  const c = String(v || '').trim().toUpperCase().replace(/[\s-]/g, '');
  return CODIGO.test(c) ? c : null;
}

async function manejarConsultar({ req, res, ip }) {
  const permiso = limiteConsulta(ip);
  if (!permiso.ok) return json(res, { error: `Demasiadas consultas. Espera ${Math.ceil(permiso.esperaSegundos / 60)} minutos.` }, 429);
  const c = await leerJsonSeguro(req, res); if (!c) return;
  const codigo = codigoLimpio(c.codigo);
  if (!codigo) return json(res, { error: 'Escribe tu código (2 letras y 3 números, por ejemplo AE472).' }, 400);
  return conBase(res, async () => responderRpc(res, await rpc('consultar_codigo', { p_codigo: codigo }), {}, 'comprador'));
}

function nombreCompleto(v) {
  const nombre = textoLimpio(v, 120);
  if (!nombre || nombre.split(' ').filter((p) => p.length >= 2).length < 2) return null;
  return nombre;
}

async function manejarRegistrarPago({ req, res, ip }) {
  const permiso = limiteOcr(ip);
  if (!permiso.ok) return json(res, { error: `Demasiados intentos. Espera ${Math.ceil(permiso.esperaSegundos / 60)} minutos.` }, 429);

  const c = await leerJsonSeguro(req, res); if (!c) return;
  const evento = eventoLimpio(c.evento);
  if (!evento) return json(res, { error: 'Elige para qué evento es el pago.' }, 400);
  const nombre = nombreCompleto(c.nombre);
  if (!nombre) return json(res, { error: 'Escribe tu nombre y apellidos.' }, 400);
  const cantidad = Number(c.cantidad);
  if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > 20) return json(res, { error: 'Indica cuántas entradas estás pagando (de 1 a 20).' }, 400);

  const imagen = Buffer.from(String(c.imagenBase64 || ''), 'base64');
  if (imagen.length === 0) return json(res, { error: 'Sube la captura del comprobante de la transferencia.' }, 400);
  if (imagen.length > LIMITE_IMAGEN) return json(res, { error: 'La imagen es demasiado grande (máximo 4 MB).' }, 413);
  const tipoImagen = detectarTipoImagen(imagen);
  if (!tipoImagen) return json(res, { error: 'El archivo no es una imagen (JPG, PNG o WEBP).' }, 400);

  let origen, referencia, monto, campos = {}, banco = null, destinoOk = false;

  if (c.manual && typeof c.manual === 'object') {
    // La lectura automática falló: el comprador escribe la referencia y el monto.
    // Queda marcado "leído a mano" para que Jose lo compare con su banco.
    origen = 'manual';
    referencia = referenciaLimpia(c.manual.referencia);
    monto = numeroLimpio(c.manual.monto, { min: 1, max: 100000000 });
    if (!referencia) return json(res, { error: 'Escribe el número de referencia completo (mínimo 6 caracteres).' }, 400);
    if (monto == null || !Number.isInteger(monto)) return json(res, { error: 'Escribe el monto de la transferencia, en colones y sin centavos.' }, 400);
  } else {
    if (!process.env.GOOGLE_VISION_API_KEY) return json(res, { error: 'El servidor no tiene configurado el lector de comprobantes.' }, 500);
    let textoOcr;
    try {
      textoOcr = await leerConVision(imagen.toString('base64'), process.env.GOOGLE_VISION_API_KEY);
    } catch (e) {
      console.error('Vision:', e.message);
      return json(res, { error: 'No se pudo leer la imagen. Intenta de nuevo en un momento.' }, 502);
    }
    if (process.env.DEBUG_OCR === 'true') console.log('--- TEXTO OCR ---\n' + textoOcr + '\n--- FIN ---');
    if (!textoOcr || !textoOcr.trim()) return json(res, { error: 'No se detectó texto en la imagen. Sube una captura más clara.', puedeManual: true }, 422);

    const leido = parsearComprobante(textoOcr);
    campos = leido.campos; banco = leido.banco;
    if ((!campos.referencia || campos.monto == null) && process.env.ANTHROPIC_API_KEY) {
      const r = await rescatarConClaude(textoOcr, process.env.ANTHROPIC_API_KEY);
      if (r) for (const k of Object.keys(campos)) if (campos[k] == null && r[k] != null) campos[k] = r[k];
    }

    // ¿La transferencia fue a la cuenta de Jose?
    const dest = verificarDestino(campos, textoOcr, { cuenta: CUENTA_DESTINO, titular: TITULAR_DESTINO });
    if (dest.estado === 'ajeno') {
      return json(res, { error: `Este comprobante no es una transferencia a la cuenta de ${TITULAR_DESTINO || 'Jose Bolaños'}. Solo se aceptan transferencias a esa cuenta.` }, 422);
    }
    if (dest.estado === 'ilegible') {
      return json(res, { error: 'No pude leer a qué cuenta se hizo la transferencia. Sube la captura completa del comprobante, o escribe la referencia y el monto a mano.', puedeManual: true }, 422);
    }
    destinoOk = dest.estado === 'ok';
    origen = 'comprobante';

    referencia = referenciaLimpia(campos.referencia);
    monto = numeroLimpio(campos.monto);
    if (!referencia) return json(res, { error: 'No pude leer el número de referencia. Sube una captura donde se vea completo, o escríbelo a mano.', puedeManual: true }, 422);
    if (monto == null || monto <= 0) return json(res, { error: 'No pude leer el monto del comprobante. Sube una captura más clara, o escríbelo a mano.', puedeManual: true }, 422);
    if (!Number.isInteger(monto)) return json(res, { error: `El monto leído (${monto}) no es un número entero de colones. Revisa la captura.`, puedeManual: true }, 422);
  }

  return conBase(res, async () => {
    const r = await rpc('registrar_comprobante', {
      p_evento: evento, p_nombre: nombre, p_cantidad: cantidad, p_monto: monto, p_referencia: referencia, p_origen: origen,
      p_destino_ok: destinoOk, p_fecha: fechaLimpia(campos.fecha), p_remitente: textoLimpio(campos.remitente, 150),
      p_cuenta: textoLimpio(campos.destino_cuenta, 60), p_titular: textoLimpio(campos.destino_titular, 150),
      p_banco: textoLimpio(banco, 40), p_detalle: textoLimpio(campos.detalle, 300),
    });
    if (!r || !r.ok) return responderRpc(res, r, { leido: { referencia, monto } }, 'comprador');

    // La imagen se guarda DESPUÉS de aceptar el pago. Si la subida falla el pago ya
    // quedó registrado: perder el pago sería peor que perder la imagen.
    try {
      const archivo = await subirImagen(imagen, tipoImagen);
      await rpc('adjuntar_comprobante', { p_pago: r.pago_id, p_archivo: archivo });
    } catch (e) {
      console.error('No se pudo guardar la imagen:', e.message);
    }
    // El comprador solo recibe lo suyo (nada de ids internos).
    return json(res, { ok: true, codigo: r.codigo, nombre: r.nombre, cantidad: r.cantidad, monto: r.monto, evento: r.evento, evento_nombre: r.evento_nombre, verificado_automatico: destinoOk });
  });
}

// ------------------------------------------------------------
// JOSE · validar código, vender, rechazar, anular, cambiar
// ------------------------------------------------------------
function listaAsientos(v) {
  if (!Array.isArray(v)) return null;
  const ids = v.map((x) => String(x).trim().toUpperCase());
  if (ids.some((x) => !/^[A-Z]{1,3}-\d{1,3}$/.test(x))) return null;
  return ids.slice(0, 100);
}

async function manejarBuscarPago({ req, res }) {
  const c = await leerJsonSeguro(req, res); if (!c) return;
  const codigo = codigoLimpio(c.codigo);
  if (!codigo) return json(res, { error: 'Escribe el código completo (2 letras y 3 números, por ejemplo AE472).' }, 400);
  return conBase(res, async () => responderRpc(res, await rpc('buscar_pago', { p_codigo: codigo })));
}

async function manejarVender({ req, res }) {
  const c = await leerJsonSeguro(req, res); if (!c) return;
  const evento = eventoLimpio(c.evento);
  if (!evento) return json(res, { error: 'Elige el evento.' }, 400);
  const codigo = codigoLimpio(c.codigo);
  if (!codigo) return json(res, { error: 'Escribe el código de pago.' }, 400);
  const comprador = textoLimpio(c.comprador, 120);
  if (!comprador || comprador.length < 2) return json(res, { error: 'Escribe el nombre del comprador.' }, 400);
  const asientos = listaAsientos(c.asientos);
  if (!asientos || !asientos.length) return json(res, { error: 'Selecciona al menos un asiento.' }, 400);
  return conBase(res, async () => responderRpc(res, await rpc('vender_asientos', { p_evento: evento, p_codigo: codigo, p_comprador: comprador, p_asientos: asientos })));
}

async function manejarRechazar({ req, res }) {
  const c = await leerJsonSeguro(req, res); if (!c) return;
  if (!UUID.test(String(c.pago_id || ''))) return json(res, { error: 'Pago inválido.' }, 400);
  return conBase(res, async () => responderRpc(res, await rpc('rechazar_pago', { p_pago: c.pago_id, p_motivo: textoLimpio(c.motivo, 300) || '' })));
}
async function manejarAnular({ req, res }) {
  const c = await leerJsonSeguro(req, res); if (!c) return;
  if (!UUID.test(String(c.venta_id || ''))) return json(res, { error: 'Venta inválida.' }, 400);
  return conBase(res, async () => responderRpc(res, await rpc('anular_venta', { p_venta: c.venta_id, p_motivo: textoLimpio(c.motivo, 300) || '' })));
}
async function manejarCambiar({ req, res }) {
  const c = await leerJsonSeguro(req, res); if (!c) return;
  if (!UUID.test(String(c.venta_id || ''))) return json(res, { error: 'Venta inválida.' }, 400);
  const asientos = listaAsientos(c.asientos);
  if (!asientos || !asientos.length) return json(res, { error: 'Selecciona los asientos nuevos.' }, 400);
  return conBase(res, async () => responderRpc(res, await rpc('cambiar_asientos', { p_venta: c.venta_id, p_asientos: asientos })));
}

// ------------------------------------------------------------
// Comprobantes (Storage privado; solo se ven con sesión)
// ------------------------------------------------------------
async function subirImagen(buffer, tipo) {
  const ext = tipo === 'image/png' ? 'png' : tipo === 'image/webp' ? 'webp' : 'jpg';
  const nombre = `${Date.now()}_${crypto.randomBytes(8).toString('hex')}.${ext}`;
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${nombre}`, {
    method: 'POST',
    headers: { 'content-type': tipo, apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}` },
    body: buffer,
  });
  if (!r.ok) throw new Error((await r.text()).slice(0, 200));
  return nombre;
}

async function servirComprobante({ res }, archivo) {
  if (!/^\d+_[0-9a-f]{16}\.(jpg|png|webp)$/.test(archivo)) return json(res, { error: 'Ruta inválida.' }, 400);
  let objeto;
  try {
    objeto = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${archivo}`, {
      headers: { apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}` },
    });
  } catch { return json(res, { error: 'No disponible.' }, 502); }
  if (!objeto.ok) return json(res, { error: 'El comprobante ya no está disponible.' }, 404);
  const datos = Buffer.from(await objeto.arrayBuffer());
  res.writeHead(200, cabeceras({
    'content-type': objeto.headers.get('content-type') || 'image/jpeg',
    'cache-control': 'private, max-age=300',
  }));
  res.end(datos);
}

async function manejarBorrarComprobantes({ res }) {
  try {
    const n = await borrarTodosLosComprobantes();
    return json(res, { ok: true, borrados: n });
  } catch (e) {
    console.error('Borrado de comprobantes:', e.message);
    return json(res, { error: 'No se pudieron borrar los comprobantes.' }, 502);
  }
}

async function borrarTodosLosComprobantes() {
  let total = 0;
  const h = { 'content-type': 'application/json', apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}` };
  for (let vuelta = 0; vuelta < 50; vuelta++) {
    const lista = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${BUCKET}`, {
      method: 'POST', headers: h, body: JSON.stringify({ prefix: '', limit: 100, offset: 0 }),
    });
    if (!lista.ok) throw new Error(await lista.text());
    const nombres = ((await lista.json()) || []).map((a) => a.name).filter(Boolean);
    if (!nombres.length) break;
    const b = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}`, {
      method: 'DELETE', headers: h, body: JSON.stringify({ prefixes: nombres }),
    });
    if (!b.ok) throw new Error(await b.text());
    total += nombres.length;
  }
  await rpc('quitar_comprobantes').catch(() => {});
  return total;
}

async function revisarVencimiento() {
  if (!FECHA_BORRADO || !SUPABASE_URL || !SERVICE_KEY) return;
  if (new Date().toISOString().slice(0, 10) <= FECHA_BORRADO) return;
  try {
    const n = await borrarTodosLosComprobantes();
    if (n) console.log(`Comprobantes borrados por vencimiento (${FECHA_BORRADO}): ${n}`);
  } catch (e) { console.error('Borrado automático falló:', e.message); }
}

// ------------------------------------------------------------
// Google Vision y respaldo opcional
// ------------------------------------------------------------
async function leerConVision(imagenBase64, apiKey) {
  const r = await fetch(VISION_URL + '?key=' + encodeURIComponent(apiKey), {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ requests: [{
      image: { content: imagenBase64 }, features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
      imageContext: { languageHints: ['es'] },
    }] }),
  });
  const data = await r.json().catch(() => null);
  if (!r.ok) throw new Error((data?.error?.message) || `error ${r.status}`);
  const x = data?.responses?.[0];
  if (x?.error?.message) throw new Error(x.error.message);
  return x?.fullTextAnnotation?.text || x?.textAnnotations?.[0]?.description || '';
}

async function rescatarConClaude(textoOcr, apiKey) {
  const instruccion = `Texto extraído por OCR de un comprobante de transferencia bancaria de Costa Rica. Devuelve ÚNICAMENTE un JSON válido:
{"fecha": "YYYY-MM-DD o null", "remitente": "nombre o null", "monto": numero_o_null, "detalle": "motivo o null", "referencia": "numero de referencia o null"}
Copia los números EXACTAMENTE. No inventes: si falta un dato, null. No confundas la comisión con el monto.
"""
${textoOcr.slice(0, 4000)}
"""`;
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODELO_RESPALDO, max_tokens: 500, messages: [{ role: 'user', content: instruccion }] }),
    });
    if (!r.ok) return null;
    const bloque = ((await r.json()).content || []).find((b) => b.type === 'text');
    if (!bloque) return null;
    const obj = JSON.parse(bloque.text.replace(/```json|```/g, '').trim());
    if (obj.referencia) {   // el modelo no puede inventar una referencia que no esté en el OCR
      const d = String(obj.referencia).replace(/\D/g, '');
      if (d.length < 6 || !textoOcr.replace(/\D/g, '').includes(d)) obj.referencia = null;
    }
    if (obj.monto != null) { const n = Number(obj.monto); obj.monto = Number.isFinite(n) && n > 0 ? n : null; }
    return obj;
  } catch { return null; }
}

// ------------------------------------------------------------
// Utilidades
// ------------------------------------------------------------
async function servirEstatico(archivo, res) {
  const destino = path.join(CARPETA_PUBLICA, path.normalize(archivo));
  if (destino !== CARPETA_PUBLICA && !destino.startsWith(CARPETA_PUBLICA + path.sep)) {
    res.writeHead(403, cabeceras()).end('Prohibido'); return;
  }
  try {
    const contenido = await fs.readFile(destino);
    res.writeHead(200, cabeceras({
      'content-type': TIPOS[path.extname(destino)] || 'application/octet-stream',
      'cache-control': archivo.startsWith('/vendor/') || archivo === '/logo.png' ? 'public, max-age=86400' : 'no-cache',
    }));
    res.end(contenido);
  } catch {
    res.writeHead(404, cabeceras({ 'content-type': 'text/html; charset=utf-8' }));
    res.end('<p>Página no encontrada.</p>');
  }
}

function leerJson(req) {
  return new Promise((resolve, reject) => {
    const trozos = []; let tamano = 0;
    req.on('data', (t) => {
      tamano += t.length;
      if (tamano > LIMITE_CUERPO) { reject(new Error('El envío es demasiado grande.')); req.destroy(); return; }
      trozos.push(t);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(trozos).toString('utf8') || '{}')); }
      catch { reject(new Error('Datos inválidos.')); }
    });
    req.on('error', reject);
  });
}

// Lee el JSON o responde el error y devuelve null
async function leerJsonSeguro(req, res) {
  try {
    const c = await leerJson(req);
    if (c && typeof c === 'object' && !Array.isArray(c)) return c;
    json(res, { error: 'Datos inválidos.' }, 400);
  } catch (e) {
    json(res, { error: String(e.message || e) }, /grande/.test(String(e.message)) ? 413 : 400);
  }
  return null;
}

function json(res, obj, estado = 200) {
  res.writeHead(estado, cabeceras({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }));
  res.end(JSON.stringify(obj));
}
