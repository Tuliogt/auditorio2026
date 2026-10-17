// Pruebas de punta a punta del servidor: HTTP real → servidor → "Supabase" simulado
// que ejecuta las funciones contra el PostgreSQL REAL → y un Vision simulado.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import pg from 'pg';

const cfg = { host: '/var/lib/pg-entradas', port: 54329, user: 'postgres', database: 'entradas' };
const dbc = new pg.Client(cfg);
let visionTexto = '';
const almacen = new Map();
const llamadasVision = [];

// --- "Supabase": /rest/v1/rpc/<fn> con argumentos con nombre → Postgres real (como service_role)
const supabase = http.createServer(async (req, res) => {
  const chunks = []; for await (const c of req) chunks.push(c);
  const cuerpo = Buffer.concat(chunks);
  const u = new URL(req.url, 'http://x');
  const enviar = (st, obj) => { res.writeHead(st, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
  if (req.headers.apikey !== 'clave-servicio') return enviar(401, { message: 'Invalid API key' });
  let m;
  if ((m = u.pathname.match(/^\/rest\/v1\/rpc\/(\w+)$/))) {
    const args = JSON.parse(cuerpo.toString() || '{}');
    const claves = Object.keys(args);
    const ph = claves.map((k, i) => `${k} := $${i + 1}`).join(', ');
    try {
      const cli = new pg.Client(cfg); await cli.connect(); await cli.query('set role service_role');
      const r = await cli.query(`select ${m[1]}(${ph}) as r`, claves.map((k) => args[k]));
      await cli.end(); return enviar(200, r.rows[0].r);
    } catch (e) { return enviar(400, { message: e.message }); }
  }
  if ((m = u.pathname.match(/^\/storage\/v1\/object\/comprobantes-entradas\/(.+)$/))) {
    if (req.method === 'POST') { almacen.set(m[1], { tipo: req.headers['content-type'], datos: cuerpo }); return enviar(200, { Key: m[1] }); }
    if (req.method === 'GET') {
      const o = almacen.get(m[1]); if (!o) return enviar(404, {});
      res.writeHead(200, { 'content-type': o.tipo }); return res.end(o.datos);
    }
  }
  if (u.pathname === '/storage/v1/object/list/comprobantes-entradas') return enviar(200, [...almacen.keys()].map((name) => ({ name })));
  if (u.pathname === '/storage/v1/object/comprobantes-entradas' && req.method === 'DELETE') {
    for (const n of JSON.parse(cuerpo.toString()).prefixes) almacen.delete(n); return enviar(200, []);
  }
  enviar(404, { message: 'no existe ' + u.pathname });
});

// --- Vision simulado
const vision = http.createServer(async (req, res) => {
  const chunks = []; for await (const c of req) chunks.push(c);
  llamadasVision.push(JSON.parse(Buffer.concat(chunks).toString()));
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ responses: [{ fullTextAnnotation: { text: visionTexto } }] }));
});

let base, App;
const escuchar = (s) => new Promise((r) => s.listen(0, '127.0.0.1', () => r(s.address().port)));

before(async () => {
  await dbc.connect();
  const ps = await escuchar(supabase), pv = await escuchar(vision);
  Object.assign(process.env, {
    SUPABASE_URL: `http://127.0.0.1:${ps}`, SUPABASE_SERVICE_ROLE_KEY: 'clave-servicio',
    VISION_URL: `http://127.0.0.1:${pv}/v1/images:annotate`, GOOGLE_VISION_API_KEY: 'k',
    ADMIN_USUARIO: 'jose', ADMIN_CLAVE: 'clave-de-jose', SESION_SECRETO: 'secreto-de-prueba',
    CUENTA_DESTINO: 'CR11 0102 0000 9606 5818 55', TITULAR_DESTINO: 'Jose Rafael Bolaños Mora', BANCO_DESTINO: 'BAC', NO_ESCUCHAR: 'true', LIMITE_REGISTROS: '1000',
  });
  App = (await import('../server.js')).servidor;
  base = `http://127.0.0.1:${await escuchar(App)}`;
});
after(async () => { for (const s of [App, supabase, vision]) { s.close(); s.closeAllConnections?.(); } await dbc.end(); });

let cookie = '';
async function api(ruta, { metodo = 'POST', cuerpo, sinCookie, tipo = 'application/json' } = {}) {
  const r = await fetch(base + ruta, {
    method: metodo,
    headers: { ...(metodo === 'POST' ? { 'content-type': tipo } : {}), ...(sinCookie || !cookie ? {} : { cookie }) },
    body: metodo === 'POST' ? (typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo ?? {})) : undefined,
  });
  const sc = r.headers.get('set-cookie'); if (sc && ruta === '/api/login') cookie = sc.split(';')[0];
  let j = null; try { j = await r.json(); } catch {}
  return { st: r.status, j, r };
}

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(200, 1)]).toString('base64');
let n = 0;
// Comprobante de transferencia BAC (formato real). ref de 9 dígitos.
function comprobante({ monto, cuenta = 'CR 1101 0200 0096\n0658 1855', titular = 'JOSE RAFAEL\nBOLAÑOS MORA', ref }) {
  ref = ref || String(400000000 + (++n));
  const m = Number(monto).toLocaleString('en-US');
  return `BAC
Notificación de transferencia
Hola,
Le informamos que MARCO TULIO AVILA
BARRERA realizó una transferencia a la
cuenta bancaria Nº ${cuenta} a nombre de ${titular}.
Fecha
Hora
Monto
Detalle
Referencia
30 septiembre 2026
10:26 AM
₡${m}.00
Entradas show
${ref}`;
}
async function vaciar() {
  await dbc.query('truncate pagos, venta_asientos, ventas, personas cascade'); almacen.clear(); llamadasVision.length = 0;
}


// --- helpers del flujo nuevo
const subir = (nombre, cantidad, extra = {}) => api('/api/pagos/registrar', { sinCookie: true, cuerpo: { evento: 'ballet', nombre, cantidad, imagenBase64: PNG, ...extra } });
async function pagoValido(nombre, cantidad, ref, evento = 'ballet') {
  visionTexto = comprobante({ monto: cantidad * 11000, ref });
  const r = await subir(nombre, cantidad, { evento }); assert.equal(r.st, 200, JSON.stringify(r.j)); return r.j.codigo;
}
const vender = (codigo, comprador, asientos, evento = 'ballet') => api('/api/vender', { cuerpo: { evento, codigo, comprador, asientos } });

test('lo público es solo /pagar, info, registrar y consultar; todo lo demás exige sesión', async () => {
  const info = await api('/api/info', { metodo: 'GET', sinCookie: true });
  assert.equal(info.st, 200); assert.deepEqual(info.j.eventos.map((e) => [e.id, e.nombre, e.precio]), [['ballet', 'Ballet', 11000], ['iconos', 'Espectáculo Íconos', 11000]]); assert.equal(info.j.titular, 'Jose Rafael Bolaños Mora');
  assert.match(info.j.cuenta, /CR11/);
  for (const [r, m] of [['/api/mapa', 'GET'], ['/api/pagos', 'GET'], ['/api/resumen', 'GET'], ['/api/personas', 'GET']]) {
    assert.equal((await api(r, { metodo: m })).st, 401, r);
  }
  for (const r of ['/api/pago/buscar', '/api/vender', '/api/rechazar', '/api/anular', '/api/cambiar', '/api/borrar-comprobantes', '/api/personas']) {
    assert.equal((await api(r, { cuerpo: {} })).st, 401, r);
  }
  assert.equal((await api('/api/comprobante/1_aaaaaaaaaaaaaaaa.jpg', { metodo: 'GET' })).st, 401);
  assert.equal((await api('/api/sesion', { metodo: 'GET' })).j.ok, false);
  // las rutas viejas ya no existen
  for (const r of ['/api/reservar', '/api/pagar', '/api/pagar-manual', '/api/cancelar', '/api/verificar']) {
    assert.ok([401, 404].includes((await api(r, { cuerpo: {} })).st), r);
  }
  const pag = await fetch(base + '/pagar'); assert.equal(pag.status, 200);
});

test('login: clave mala rechazada, cookie HttpOnly + SameSite, y la cookie falsificada no sirve', async () => {
  assert.equal((await api('/api/login', { cuerpo: { usuario: 'jose', clave: 'x' } })).st, 401);
  const forja = await fetch(base + '/api/mapa', { headers: { cookie: 'sesion=' + (Date.now() + 1e9) + '.firmafalsa' } });
  assert.equal(forja.status, 401);
  const ok = await api('/api/login', { cuerpo: { usuario: 'Jose', clave: 'clave-de-jose' } });
  assert.equal(ok.st, 200);
  const sc = ok.r.headers.get('set-cookie'); assert.match(sc, /HttpOnly/); assert.match(sc, /SameSite=Strict/);
  assert.equal((await api('/api/sesion', { metodo: 'GET' })).j.ok, true);
});

test('un POST que no es JSON se rechaza (anti-CSRF)', async () => {
  assert.equal((await api('/api/vender', { cuerpo: 'codigo=x', tipo: 'application/x-www-form-urlencoded' })).st, 415);
  assert.equal((await api('/api/pagos/registrar', { sinCookie: true, cuerpo: 'x=1', tipo: 'text/plain' })).st, 415);
});

test('comprador: sube su transferencia (sin login) y recibe un código; la imagen se guarda', async () => {
  await vaciar();
  visionTexto = comprobante({ monto: 33000, ref: '406484461' });
  const r = await subir('Ana Mora Solís', 3);
  assert.equal(r.st, 200, JSON.stringify(r.j));
  assert.match(r.j.codigo, /^[AEIOU]{2}\d{3}$/); assert.equal(r.j.monto, 33000); assert.equal(r.j.cantidad, 3);
  assert.equal(r.j.pago_id, undefined);                                    // no se filtran ids internos
  assert.equal(almacen.size, 1);
  const lista = (await api('/api/pagos', { metodo: 'GET' })).j.pagos;
  assert.equal(lista[0].estado, 'pendiente'); assert.equal(lista[0].destino_ok, true); assert.equal(lista[0].referencia, '406484461');
  assert.equal(lista[0].destino_cuenta, 'CR11010200009606581855'); assert.equal(lista[0].banco, 'BAC');
  const img = await fetch(base + '/api/comprobante/' + lista[0].archivo, { headers: { cookie } });
  assert.equal(img.status, 200);
});

test('comprador: valida nombre y apellidos, cantidad e imagen', async () => {
  await vaciar(); visionTexto = comprobante({ monto: 11000 });
  assert.equal((await subir('Ana', 1)).st, 400);
  assert.equal((await subir('Ana Mora', 0)).st, 400);
  assert.equal((await subir('Ana Mora', 21)).st, 400);
  assert.equal((await subir('Ana Mora', 1, { imagenBase64: '' })).st, 400);
  assert.equal((await subir('Ana Mora', 1, { imagenBase64: Buffer.from('no soy una imagen, soy texto largo').toString('base64') })).st, 400);
});

test('comprador: monto que no cuadra con las entradas → rechazado, la referencia NO se gasta', async () => {
  await vaciar();
  visionTexto = comprobante({ monto: 11000, ref: '555000111' });
  const mal = await subir('Ana Mora', 2);
  assert.equal(mal.st, 422); assert.match(mal.j.error, /₡11,000/); assert.match(mal.j.error, /₡22,000/);
  assert.equal(almacen.size, 0);
  visionTexto = comprobante({ monto: 22000, ref: '555000111' });
  assert.equal((await subir('Ana Mora', 2)).st, 200);
});

test('comprador: el mismo comprobante no se puede subir dos veces', async () => {
  await vaciar();
  visionTexto = comprobante({ monto: 11000, ref: '777000222' });
  assert.equal((await subir('Ana Mora', 1)).st, 200);
  const rep = await subir('Otra Persona', 1);
  assert.equal(rep.st, 409); assert.match(rep.j.error, /ya fue registrado/);
  const rep2 = await subir('Otra Persona', 1, { manual: { referencia: '777-000-222', monto: 11000 } });
  assert.equal(rep2.st, 409);                                              // aunque lo escriban con guiones
  assert.equal(almacen.size, 1);
});

test('comprador: transferencia a otra cuenta / otra persona se rechaza y no consume nada', async () => {
  await vaciar();
  visionTexto = comprobante({ monto: 11000, cuenta: 'CR 0000 1111 2222 3333 4444', titular: 'OTRA PERSONA DISTINTA' });
  const x = await subir('Ana Mora', 1);
  assert.equal(x.st, 422); assert.match(x.j.error, /Jose Rafael Bolaños Mora/);
  // misma persona pero cuenta distinta → también ajena
  visionTexto = comprobante({ monto: 11000, cuenta: 'CR 1101 0200 0096\n0658 1856' });
  assert.equal((await subir('Ana Mora', 1)).st, 422);
  assert.equal((await dbc.query('select count(*)::int n from pagos')).rows[0].n, 0);
});

test('comprador: imagen ilegible ofrece el ingreso manual, que queda marcado "a mano"', async () => {
  await vaciar();
  visionTexto = 'foto de un gato\nmiau';
  const x = await subir('Ana Mora', 1);
  assert.equal(x.st, 422); assert.equal(x.j.puedeManual, true);
  const mal = await subir('Ana Mora', 1, { manual: { referencia: '123', monto: 11000 } });
  assert.equal(mal.st, 400);
  const ok = await subir('Ana Mora', 1, { manual: { referencia: 'MANUAL778899', monto: 11000 } });
  assert.equal(ok.st, 200);
  const p = (await api('/api/pagos', { metodo: 'GET' })).j.pagos[0];
  assert.equal(p.origen, 'manual'); assert.equal(p.destino_ok, false); assert.ok(p.archivo);   // la imagen sigue siendo obligatoria
  assert.equal((await subir('Ana Mora', 2, { manual: { referencia: 'OTRA778899', monto: 11000 } })).st, 422);   // monto ≠ entradas
});

test('consultar: el comprador ve el estado de su código; nada de la referencia ni de la imagen', async () => {
  await vaciar();
  const cod = await pagoValido('Ana Mora', 2);
  const c = await api('/api/consultar', { sinCookie: true, cuerpo: { codigo: cod.toLowerCase() } });
  assert.equal(c.st, 200); assert.equal(c.j.estado, 'pendiente'); assert.equal(c.j.cantidad, 2);
  assert.equal(c.j.referencia, undefined); assert.equal(c.j.archivo, undefined);
  assert.equal((await api('/api/consultar', { sinCookie: true, cuerpo: { codigo: 'ZZ999' } })).st, 404);
  assert.equal((await api('/api/consultar', { sinCookie: true, cuerpo: { codigo: '!!' } })).st, 400);
  await vender(cod, 'Ana Mora', ['A-3', 'A-4']);
  const d = await api('/api/consultar', { sinCookie: true, cuerpo: { codigo: cod } });
  assert.equal(d.j.estado, 'asignado'); assert.deepEqual(d.j.asientos, ['A-3', 'A-4']);
});

test('Jose: buscar el código, validar monto y vender', async () => {
  await vaciar();
  const cod = await pagoValido('Ana Mora Solís', 2);
  const b = await api('/api/pago/buscar', { cuerpo: { codigo: cod } });
  assert.equal(b.st, 200); assert.equal(b.j.pago.monto, 22000); assert.equal(b.j.pago.estado, 'pendiente');
  assert.equal((await api('/api/pago/buscar', { cuerpo: { codigo: 'ZZ999' } })).st, 404);
  // cantidad distinta a lo pagado
  const x = await vender(cod, 'Ana Mora Solís', ['B-1']);
  assert.equal(x.st, 400); assert.match(x.j.error, /pago es por 2 entradas/);
  assert.equal((await vender(cod, 'Ana Mora Solís', ['<script>', 'B-2'])).st, 400);
  assert.equal((await vender(cod, 'Ana Mora Solís', ['Z-99', 'B-2'])).st, 400);
  const ok = await vender(cod, 'Ana Mora Solís', ['B-1', 'B-2']);
  assert.equal(ok.st, 200); assert.equal(ok.j.total, 22000);
  assert.deepEqual((await api('/api/mapa?evento=ballet', { metodo: 'GET' })).j.tomados.map((t) => t.a).sort(), ['B-1', 'B-2']);
  // el código ya no sirve
  const dup = await vender(cod, 'Ana Mora Solís', ['B-3', 'B-4']);
  assert.equal(dup.st, 409); assert.match(dup.j.error, /YA se usó/);
});

test('un asiento vendido no se vende otra vez; el segundo código sigue disponible', async () => {
  await vaciar();
  const c1 = await pagoValido('Ana Mora', 2), c2 = await pagoValido('Beto Soto', 2);
  assert.equal((await vender(c1, 'Ana Mora', ['C-1', 'C-2'])).st, 200);
  const b = await vender(c2, 'Beto Soto', ['C-2', 'C-3']);
  assert.equal(b.st, 409); assert.match(b.j.error, /C-2/);
  assert.equal((await vender(c2, 'Beto Soto', ['C-3', 'C-4'])).st, 200);
});

test('rechazar un pago que no aparece en el banco; anular una venta; cambiar asientos', async () => {
  await vaciar();
  const a = await pagoValido('Ana Mora', 1, '900000001');
  const pa = (await api('/api/pagos', { metodo: 'GET' })).j.pagos[0];
  assert.equal((await api('/api/rechazar', { cuerpo: { pago_id: pa.id, motivo: 'No llegó al banco' } })).st, 200);
  const v = await vender(a, 'Ana Mora', ['D-1']);
  assert.equal(v.st, 409); assert.match(v.j.error, /rechazado/);
  assert.equal((await api('/api/consultar', { sinCookie: true, cuerpo: { codigo: a } })).j.estado, 'rechazado');
  assert.equal((await api('/api/rechazar', { cuerpo: { pago_id: 'no-uuid' } })).st, 400);

  const b = await pagoValido('Beto Soto', 2, '900000002');
  const vb = (await vender(b, 'Beto Soto', ['H-2', 'H-3'])).j;
  assert.equal((await api('/api/cambiar', { cuerpo: { venta_id: vb.venta_id, asientos: ['H-5', 'H-6'] } })).st, 200);
  assert.deepEqual((await api('/api/mapa?evento=ballet', { metodo: 'GET' })).j.tomados.map((t) => t.a).sort(), ['H-5', 'H-6']);
  assert.equal((await api('/api/anular', { cuerpo: { venta_id: vb.venta_id, motivo: 'pago falso' } })).st, 200);
  assert.equal((await api('/api/mapa?evento=ballet', { metodo: 'GET' })).j.tomados.length, 0);
  // la referencia de la venta anulada sigue quemada
  visionTexto = comprobante({ monto: 22000, ref: '900000002' });
  assert.equal((await subir('Carla Rojas', 2)).st, 409);
});

test('resumen: pendientes por verificar y recaudado', async () => {
  await vaciar();
  const a = await pagoValido('Ana Mora', 2), b = await pagoValido('Beto Soto', 1);
  await vender(a, 'Ana Mora', ['E-1', 'E-2']);
  const r = (await api('/api/resumen?evento=ballet', { metodo: 'GET' })).j;
  assert.equal(r.vendidos, 2); assert.equal(r.recaudado, 22000); assert.equal(r.pendientes, 1); assert.equal(r.pendientes_monto, 11000);
  assert.ok(b);
});

test('nombres: guardar lista, autocompletar y eliminar', async () => {
  await vaciar();
  const g = await api('/api/personas', { cuerpo: { nombres: 'María Pérez Solís\nJuan Mora Vega\nmaría pérez solís\n\nx' } });
  assert.equal(g.st, 200); assert.equal(g.j.nuevos, 2);
  assert.deepEqual((await api('/api/personas', { metodo: 'GET' })).j.nombres, ['Juan Mora Vega', 'María Pérez Solís']);
  await api('/api/personas/eliminar', { cuerpo: { nombre: 'juan mora vega' } });
  assert.deepEqual((await api('/api/personas', { metodo: 'GET' })).j.nombres, ['María Pérez Solís']);
});

test('CONCURRENCIA por HTTP: 25 ventas simultáneas por los mismos asientos → solo 1 gana', async () => {
  await vaciar();
  const codigos = [];
  for (let i = 0; i < 25; i++) codigos.push(await pagoValido(`Persona Número${i}`, 3));
  const res = await Promise.all(codigos.map((c, i) => vender(c, `Persona Número${i}`, ['J-1', 'J-2', 'J-3'])));
  assert.equal(res.filter((r) => r.st === 200).length, 1);
  assert.ok(res.filter((r) => r.st !== 200).every((r) => r.st === 409));
  assert.equal((await api('/api/mapa?evento=ballet', { metodo: 'GET' })).j.tomados.length, 3);
});

test('CONCURRENCIA por HTTP: el mismo comprobante subido 10 veces a la vez → un solo código', async () => {
  await vaciar();
  visionTexto = comprobante({ monto: 11000, ref: '123123123' });
  const res = await Promise.all(Array.from({ length: 10 }, (_, i) => subir(`Persona Numero${i}`, 1)));
  assert.equal(res.filter((r) => r.st === 200).length, 1);
  assert.equal((await dbc.query('select count(*)::int n from pagos')).rows[0].n, 1);
});

test('borrar comprobantes: vacía el almacén y limpia los nombres de archivo', async () => {
  await vaciar();
  await pagoValido('Ana Mora', 1);
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(almacen.size, 1);
  const b = await api('/api/borrar-comprobantes', { cuerpo: {} });
  assert.equal(b.st, 200); assert.equal(b.j.borrados, 1); assert.equal(almacen.size, 0);
  assert.equal((await api('/api/pagos', { metodo: 'GET' })).j.pagos[0].archivo, null);
});

test('rutas seguras: path traversal, nombre de comprobante raro, cabeceras', async () => {
  assert.equal((await api('/api/comprobante/..%2F..%2Fetc%2Fpasswd', { metodo: 'GET' })).st, 400);
  const t = await fetch(base + '/..%2F..%2Fserver.js'); assert.ok([403, 404].includes(t.status));
  const t2 = await fetch(base + '/../server.js'); assert.ok([403, 404].includes(t2.status));
  assert.equal((await fetch(base + '/health')).status, 200);
  const h = (await fetch(base + '/health')).headers;
  assert.equal(h.get('x-frame-options'), 'DENY'); assert.match(h.get('content-security-policy'), /default-src 'self'/);
});

// ============================================================
//  EVENTOS en el servidor
// ============================================================
test('eventos: el pago exige elegir evento, y el código queda atado a ese evento', async () => {
  await vaciar();
  visionTexto = comprobante({ monto: 11000, ref: '500000001' });
  for (const evento of [undefined, '', 'nada', 'BALLET ', '../x']) {
    const cuerpo = { nombre: 'Ana Mora', cantidad: 1, imagenBase64: PNG }; if (evento !== undefined) cuerpo.evento = evento;
    const r = await api('/api/pagos/registrar', { sinCookie: true, cuerpo });
    if (evento === 'BALLET ') assert.equal(r.st, 200, 'el id se normaliza (mayúsculas/espacios)');
    else assert.equal(r.st, 400, String(evento));
  }
  const ic = await pagoValido('Luis Vega', 1, '500000002', 'iconos');
  const c = await api('/api/consultar', { sinCookie: true, cuerpo: { codigo: ic } });
  assert.equal(c.j.evento, 'iconos'); assert.equal(c.j.evento_nombre, 'Espectáculo Íconos');
  const b = await api('/api/pago/buscar', { cuerpo: { codigo: ic } });
  assert.equal(b.j.pago.evento_nombre, 'Espectáculo Íconos');
});

test('eventos: el comprador recibe el nombre del evento al registrar; evento_distinto da un mensaje claro', async () => {
  await vaciar();
  visionTexto = comprobante({ monto: 22000, ref: '500000003' });
  const r = await subir('Ana Mora', 2, { evento: 'iconos' });
  assert.equal(r.st, 200); assert.equal(r.j.evento_nombre, 'Espectáculo Íconos'); assert.equal(r.j.pago_id, undefined);
  const x = await vender(r.j.codigo, 'Ana Mora', ['A-3', 'A-4'], 'ballet');
  assert.equal(x.st, 409); assert.equal(x.j.codigoError, 'evento_distinto');
  assert.match(x.j.error, /Espectáculo Íconos/); assert.match(x.j.error, /Ballet/);
  assert.equal((await vender(r.j.codigo, 'Ana Mora', ['A-3', 'A-4'], 'iconos')).st, 200);
});

test('eventos: mismo asiento en ambos eventos; mapa y resumen por evento; falta de evento da 400', async () => {
  await vaciar();
  const b = await pagoValido('Ana Mora', 1, '500000004', 'ballet'), i = await pagoValido('Luis Vega', 1, '500000005', 'iconos');
  assert.equal((await vender(b, 'Ana Mora', ['M-5'], 'ballet')).st, 200);
  assert.equal((await vender(i, 'Luis Vega', ['M-5'], 'iconos')).st, 200);
  const mb = (await api('/api/mapa?evento=ballet', { metodo: 'GET' })).j, mi = (await api('/api/mapa?evento=iconos', { metodo: 'GET' })).j;
  assert.deepEqual([mb.evento, mb.tomados.length, mi.evento, mi.tomados.length], ['ballet', 1, 'iconos', 1]);
  assert.equal((await api('/api/mapa', { metodo: 'GET' })).st, 400);
  assert.equal((await api('/api/mapa?evento=nada', { metodo: 'GET' })).st, 400);
  assert.equal((await api('/api/mapa?evento=zz9', { metodo: 'GET' })).st, 400);
  const todo = (await api('/api/resumen', { metodo: 'GET' })).j;
  assert.deepEqual([todo.total, todo.vendidos, todo.recaudado], [1326, 2, 22000]);
  assert.equal((await api('/api/resumen?evento=iconos', { metodo: 'GET' })).j.vendidos, 1);
  assert.equal((await api('/api/vender', { cuerpo: { codigo: b, comprador: 'Ana Mora', asientos: ['M-6'] } })).st, 400);
});

test('consultar: el límite frena el ensayo de códigos', async () => {
  let ultimo;
  for (let i = 0; i < 20; i++) ultimo = await api('/api/consultar', { sinCookie: true, cuerpo: { codigo: 'ZZ' + String(100 + i) } });
  assert.equal(ultimo.st, 429);
});

test('el logout cierra la sesión', async () => {
  await api('/api/logout', { cuerpo: {} });
  cookie = '';
  assert.equal((await api('/api/mapa?evento=ballet', { metodo: 'GET' })).st, 401);
});

