// Pruebas del esquema contra un PostgreSQL REAL.
//   node --test test/db.test.mjs
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';

const cfg = { host: process.env.PGHOST || '/var/lib/pg-entradas', port: +(process.env.PGPORT || 54329),
              user: 'postgres', database: 'entradas' };
const abiertos = [];
async function sesion(rol = 'service_role') {
  const c = new pg.Client(cfg); await c.connect();
  if (rol) await c.query(`set role ${rol}`);
  abiertos.push(c); return c;
}
const rpc = async (c, fn, ...args) => {
  const ph = args.map((_, i) => `$${i + 1}`).join(',');
  const r = await c.query(`select ${fn}(${ph}) as r`, args);
  return r.rows[0].r;
};
let db;
before(async () => { db = await sesion(); });
after(async () => { for (const c of abiertos) await c.end().catch(() => {}); });
beforeEach(async () => {
  const su = new pg.Client(cfg); await su.connect();
  await su.query('truncate pagos, venta_asientos, ventas, personas cascade');
  await su.end();
});
const P = 11000;
let seq = 0;
const ref = () => `TRF${Date.now()}${++seq}`;
// registra un pago válido y devuelve su respuesta
const pagar = (nombre, cant, r = ref(), c = db, ev = 'ballet') =>
  rpc(c, 'registrar_comprobante', ev, nombre, cant, cant * P, r, 'comprobante', true, null, null, null, null, null, null);

test('hay 663 asientos, precio 11.000 y no hay estado apartado', async () => {
  assert.equal((await db.query('select count(*)::int n from asientos')).rows[0].n, 663);
  const m = await rpc(db, 'mapa_asientos', 'ballet');
  assert.equal(m.precio, 11000); assert.deepEqual(m.tomados, []);
  const t = await db.query(`select 1 from information_schema.columns where table_name='ventas' and column_name='expira_en'`);
  assert.equal(t.rowCount, 0);
});

test('registrar_comprobante: monto = cantidad × 11.000 da un código de 2 vocales + 3 dígitos', async () => {
  const r = await pagar('Ana Mora Solís', 3);
  assert.equal(r.ok, true); assert.match(r.codigo, /^[AEIOU]{2}\d{3}$/); assert.equal(r.monto, 33000);
});

test('registrar_comprobante: monto distinto al de las entradas se rechaza y NO gasta la referencia', async () => {
  const r1 = await rpc(db, 'registrar_comprobante', 'ballet', 'Ana Mora', 3, 22000, 'REF-UNICA-1', 'comprobante', true, null, null, null, null, null, null);
  assert.equal(r1.ok, false); assert.equal(r1.error, 'monto'); assert.equal(r1.esperado, 33000);
  const r2 = await rpc(db, 'registrar_comprobante', 'ballet', 'Ana Mora', 3, 33000, 'REF-UNICA-1', 'comprobante', true, null, null, null, null, null, null);
  assert.equal(r2.ok, true);
});

test('la misma referencia no se puede usar dos veces (ni con otra capitalización o símbolos)', async () => {
  assert.equal((await pagar('Ana Mora', 1, 'AB-12 3456')).ok, true);
  for (const r of ['ab123456', 'AB 123456', 'ab-12-3456']) {
    const x = await pagar('Otro Nombre', 1, r);
    assert.equal(x.ok, false); assert.equal(x.error, 'referencia_repetida');
  }
});

test('validaciones: nombre, cantidad, referencia corta, origen', async () => {
  assert.equal((await rpc(db, 'registrar_comprobante', 'ballet', 'A', 1, P, 'REF123456', 'comprobante', true, null, null, null, null, null, null)).error, 'nombre');
  assert.equal((await rpc(db, 'registrar_comprobante', 'ballet', 'Ana Mora', 0, 0, 'REF123456', 'comprobante', true, null, null, null, null, null, null)).error, 'cantidad');
  assert.equal((await rpc(db, 'registrar_comprobante', 'ballet', 'Ana Mora', 21, 21 * P, 'REF123456', 'comprobante', true, null, null, null, null, null, null)).error, 'cantidad');
  assert.equal((await rpc(db, 'registrar_comprobante', 'ballet', 'Ana Mora', 1, P, '123', 'comprobante', true, null, null, null, null, null, null)).error, 'referencia_invalida');
  assert.equal((await rpc(db, 'registrar_comprobante', 'ballet', 'Ana Mora', 1, P, 'REF123456', 'otro', true, null, null, null, null, null, null)).error, 'origen');
});

test('vender_asientos: con el código válido asigna los asientos y cierra el pago', async () => {
  const p = await pagar('Ana Mora Solís', 3);
  const v = await rpc(db, 'vender_asientos', 'ballet', p.codigo.toLowerCase(), 'Ana Mora Solís', ['A-3', 'a-4', ' B-1 ']);
  assert.equal(v.ok, true); assert.deepEqual(v.asientos, ['A-3', 'A-4', 'B-1']); assert.equal(v.total, 33000);
  const m = await rpc(db, 'mapa_asientos', 'ballet'); assert.equal(m.tomados.length, 3);
  assert.equal((await rpc(db, 'buscar_pago', p.codigo)).pago.estado, 'asignado');
  const c = await rpc(db, 'consultar_codigo', p.codigo);
  assert.equal(c.estado, 'asignado'); assert.deepEqual(c.asientos, ['A-3', 'A-4', 'B-1']);
});

test('vender_asientos: la cantidad de asientos debe coincidir con lo pagado', async () => {
  const p = await pagar('Ana Mora', 3);
  const a = await rpc(db, 'vender_asientos', 'ballet', p.codigo, 'Ana Mora', ['A-3', 'A-4']);
  assert.equal(a.ok, false); assert.equal(a.error, 'cantidad'); assert.equal(a.esperado, 3);
  const b = await rpc(db, 'vender_asientos', 'ballet', p.codigo, 'Ana Mora', ['A-3', 'A-4', 'A-5', 'A-6']);
  assert.equal(b.error, 'cantidad');
  assert.equal((await rpc(db, 'mapa_asientos', 'ballet')).tomados.length, 0);
  assert.equal((await rpc(db, 'buscar_pago', p.codigo)).pago.estado, 'pendiente');
});

test('vender_asientos: si el monto guardado no calza con los asientos, no vende (defensa en profundidad)', async () => {
  const p = await pagar('Ana Mora', 2);
  const su = new pg.Client(cfg); await su.connect();
  await su.query('update pagos set monto = 11000 where codigo=$1', [p.codigo]); await su.end();
  const r = await rpc(db, 'vender_asientos', 'ballet', p.codigo, 'Ana Mora', ['A-3', 'A-4']);
  assert.equal(r.ok, false); assert.equal(r.error, 'monto'); assert.equal(r.esperado, 22000);
});

test('un código se usa UNA sola vez', async () => {
  const p = await pagar('Ana Mora', 1);
  assert.equal((await rpc(db, 'vender_asientos', 'ballet', p.codigo, 'Ana Mora', ['A-3'])).ok, true);
  const r = await rpc(db, 'vender_asientos', 'ballet', p.codigo, 'Ana Mora', ['A-4']);
  assert.equal(r.ok, false); assert.equal(r.error, 'codigo_usado'); assert.deepEqual(r.asientos, ['A-3']);
  assert.equal((await rpc(db, 'mapa_asientos', 'ballet')).tomados.length, 1);
});

test('código inexistente, asiento inexistente, sin asientos', async () => {
  assert.equal((await rpc(db, 'vender_asientos', 'ballet', 'ZZ999', 'Ana Mora', ['A-3'])).error, 'codigo_no_existe');
  const p = await pagar('Ana Mora', 1);
  const r = await rpc(db, 'vender_asientos', 'ballet', p.codigo, 'Ana Mora', ['Z-99']);
  assert.equal(r.error, 'asiento_invalido'); assert.deepEqual(r.asientos, ['Z-99']);
  assert.equal((await rpc(db, 'vender_asientos', 'ballet', p.codigo, 'Ana Mora', [])).error, 'sin_asientos');
  assert.equal((await rpc(db, 'buscar_pago', 'ZZ999')).error, 'codigo_no_existe');
});

test('un asiento vendido NO se puede vender otra vez, y el segundo código queda sin usar', async () => {
  const p1 = await pagar('Ana Mora', 2), p2 = await pagar('Luis Vega', 2);
  assert.equal((await rpc(db, 'vender_asientos', 'ballet', p1.codigo, 'Ana Mora', ['A-3', 'A-4'])).ok, true);
  const r = await rpc(db, 'vender_asientos', 'ballet', p2.codigo, 'Luis Vega', ['A-4', 'A-5']);
  assert.equal(r.ok, false); assert.equal(r.error, 'ocupados'); assert.deepEqual(r.asientos, ['A-4']);
  // todo o nada: A-5 NO quedó vendido y el pago sigue pendiente
  const m = await rpc(db, 'mapa_asientos', 'ballet'); assert.deepEqual(m.tomados.map(t => t.a).sort(), ['A-3', 'A-4']);
  assert.equal((await rpc(db, 'buscar_pago', p2.codigo)).pago.estado, 'pendiente');
  assert.equal((await rpc(db, 'vender_asientos', 'ballet', p2.codigo, 'Luis Vega', ['A-5', 'A-6'])).ok, true);
});

test('CARRERA: 30 ventas simultáneas por el mismo asiento → gana exactamente una', async () => {
  const pagos = [];
  for (let i = 0; i < 30; i++) pagos.push(await pagar(`Persona Numero${i}`, 1));
  const conns = []; for (let i = 0; i < 30; i++) conns.push(await sesion());
  const res = await Promise.all(pagos.map((p, i) => rpc(conns[i], 'vender_asientos', 'ballet', p.codigo, `Persona Numero${i}`, ['H-10'])));
  assert.equal(res.filter(r => r.ok).length, 1);
  assert.equal(res.filter(r => !r.ok && r.error === 'ocupados').length, 29);
  const n = await db.query(`select count(*)::int n from venta_asientos where asiento='H-10'`); assert.equal(n.rows[0].n, 1);
  // los 29 perdedores siguen pendientes, con su código intacto
  const pend = await db.query(`select count(*)::int n from pagos where estado='pendiente'`); assert.equal(pend.rows[0].n, 29);
});

test('CARRERA: 20 ventas con asientos cruzados en orden distinto (sin deadlock) nunca duplican asientos', async () => {
  const sets = [];
  for (let i = 0; i < 20; i++) {
    const s = ['C-5', 'C-6', 'C-7', 'C-8'].sort(() => Math.random() - 0.5);
    sets.push({ s, p: await pagar(`Cruce Numero${i}`, 4) });
  }
  const conns = []; for (let i = 0; i < 20; i++) conns.push(await sesion());
  const res = await Promise.all(sets.map((x, i) => rpc(conns[i], 'vender_asientos', 'ballet', x.p.codigo, `Cruce Numero${i}`, x.s)));
  assert.equal(res.filter(r => r.ok).length, 1);
  assert.equal((await db.query(`select count(*)::int n from venta_asientos`)).rows[0].n, 4);
});

test('CARRERA: el MISMO código usado desde 10 pantallas a la vez → se usa una vez', async () => {
  const p = await pagar('Ana Mora', 1);
  const conns = []; for (let i = 0; i < 10; i++) conns.push(await sesion());
  const res = await Promise.all(conns.map((c, i) => rpc(c, 'vender_asientos', 'ballet', p.codigo, 'Ana Mora', [`D-${i + 2}`])));
  assert.equal(res.filter(r => r.ok).length, 1);
  assert.equal((await db.query(`select count(*)::int n from venta_asientos`)).rows[0].n, 1);
});

test('CARRERA: la misma referencia subida 15 veces a la vez → un solo pago', async () => {
  const conns = []; for (let i = 0; i < 15; i++) conns.push(await sesion());
  const r = ref();
  const res = await Promise.all(conns.map((c, i) => pagar(`Duplicador Num${i}`, 1, r, c)));
  assert.equal(res.filter(x => x.ok).length, 1);
  assert.equal(res.filter(x => x.error === 'referencia_repetida').length, 14);
});

test('rechazar_pago: un pendiente se rechaza, no se puede vender, y su referencia queda quemada', async () => {
  const r0 = ref(); const p = await pagar('Ana Mora', 1, r0);
  const id = (await rpc(db, 'buscar_pago', p.codigo)).pago.id;
  assert.equal((await rpc(db, 'rechazar_pago', id, 'No aparece en el banco')).ok, true);
  const v = await rpc(db, 'vender_asientos', 'ballet', p.codigo, 'Ana Mora', ['A-3']);
  assert.equal(v.error, 'pago_rechazado'); assert.equal(v.motivo, 'No aparece en el banco');
  assert.equal((await pagar('Ana Mora', 1, r0)).error, 'referencia_repetida');
  assert.equal((await rpc(db, 'rechazar_pago', id)).error, 'no_rechazable');
});

test('anular_venta: libera los asientos, pero el código y la referencia no se reutilizan', async () => {
  const r0 = ref(); const p = await pagar('Ana Mora', 2, r0);
  const v = await rpc(db, 'vender_asientos', 'ballet', p.codigo, 'Ana Mora', ['A-3', 'A-4']);
  assert.equal((await rpc(db, 'anular_venta', v.venta_id, 'Error')).ok, true);
  assert.equal((await rpc(db, 'mapa_asientos', 'ballet')).tomados.length, 0);
  assert.equal((await rpc(db, 'vender_asientos', 'ballet', p.codigo, 'Ana Mora', ['A-3', 'A-4'])).ok, false);
  assert.equal((await pagar('Ana Mora', 2, r0)).error, 'referencia_repetida');
  assert.equal((await rpc(db, 'anular_venta', v.venta_id)).error, 'no_anulable');
  // los asientos liberados sí pueden venderse a otro pago
  const p2 = await pagar('Luis Vega', 2);
  assert.equal((await rpc(db, 'vender_asientos', 'ballet', p2.codigo, 'Luis Vega', ['A-3', 'A-4'])).ok, true);
});

test('cambiar_asientos: mismo número de asientos, todo o nada, sin pisar a otros', async () => {
  const p1 = await pagar('Ana Mora', 2), p2 = await pagar('Luis Vega', 1);
  const v1 = await rpc(db, 'vender_asientos', 'ballet', p1.codigo, 'Ana Mora', ['A-3', 'A-4']);
  await rpc(db, 'vender_asientos', 'ballet', p2.codigo, 'Luis Vega', ['B-5']);
  assert.equal((await rpc(db, 'cambiar_asientos', v1.venta_id, ['A-3'])).error, 'cantidad');
  const o = await rpc(db, 'cambiar_asientos', v1.venta_id, ['A-9', 'B-5']);
  assert.equal(o.error, 'ocupados'); assert.deepEqual(o.asientos, ['B-5']);
  assert.deepEqual((await rpc(db, 'mapa_asientos', 'ballet')).tomados.map(t => t.a).sort(), ['A-3', 'A-4', 'B-5']);
  assert.equal((await rpc(db, 'cambiar_asientos', v1.venta_id, ['A-4', 'A-9'])).ok, true);
  assert.deepEqual((await rpc(db, 'mapa_asientos', 'ballet')).tomados.map(t => t.a).sort(), ['A-4', 'A-9', 'B-5']);
});

test('listar_pagos y resumen cuadran', async () => {
  const p1 = await pagar('Ana Mora', 2), p2 = await pagar('Luis Vega', 1), p3 = await pagar('Rosa Cruz', 1);
  await rpc(db, 'vender_asientos', 'ballet', p1.codigo, 'Ana Mora', ['A-3', 'A-4']);
  await rpc(db, 'rechazar_pago', (await rpc(db, 'buscar_pago', p3.codigo)).pago.id, 'x');
  const l = await rpc(db, 'listar_pagos'); assert.equal(l.length, 3);
  assert.deepEqual(l.find(x => x.codigo === p1.codigo).venta.asientos, ['A-3', 'A-4']);
  const r = await rpc(db, 'resumen', 'ballet');
  assert.equal(r.vendidos, 2); assert.equal(r.libres, 661); assert.equal(r.recaudado, 22000);
  assert.equal(r.pendientes, 1); assert.equal(r.pendientes_monto, 11000); assert.equal(r.rechazados, 1);
});

test('consultar_codigo devuelve solo lo mínimo (sin referencia ni imagen)', async () => {
  const p = await pagar('Ana Mora', 1);
  const c = await rpc(db, 'consultar_codigo', p.codigo);
  assert.equal(c.estado, 'pendiente'); assert.equal(c.asientos, null);
  assert.equal(c.referencia, undefined); assert.equal(c.archivo, undefined);
  assert.equal((await rpc(db, 'consultar_codigo', 'XX000')).error, 'codigo_no_existe');
});

test('personas: lista, agrega, elimina; los pagos pendientes también aparecen', async () => {
  await rpc(db, 'guardar_personas', ['María Pérez Solís', 'maría pérez solís', 'Juan Mora Vega']);
  await pagar('Pendiente Nuevo Pago', 1);
  const l = await rpc(db, 'listar_personas'); assert.equal(l.length, 3);
  await rpc(db, 'eliminar_persona', 'JUAN MORA VEGA');
  assert.equal((await rpc(db, 'listar_personas')).length, 2);
});

test('adjuntar y quitar comprobantes', async () => {
  const p = await pagar('Ana Mora', 1); const id = (await rpc(db, 'buscar_pago', p.codigo)).pago.id;
  await rpc(db, 'adjuntar_comprobante', id, '123_abcdef0123456789.jpg');
  assert.equal((await rpc(db, 'buscar_pago', p.codigo)).pago.archivo, '123_abcdef0123456789.jpg');
  assert.equal((await rpc(db, 'quitar_comprobantes')).limpiados, 1);
  assert.equal((await rpc(db, 'buscar_pago', p.codigo)).pago.archivo, null);
});

test('seguridad: anon y authenticated no pueden leer tablas ni ejecutar funciones', async () => {
  for (const rol of ['anon', 'authenticated']) {
    const c = await sesion(rol);
    await assert.rejects(c.query('select * from pagos'), /permission denied/);
    await assert.rejects(c.query('select * from venta_asientos'), /permission denied/);
    await assert.rejects(c.query(`select vender_asientos('ballet','AA111','x y',array['A-3'])`), /permission denied/);
    await assert.rejects(c.query(`select consultar_codigo('AA111')`), /permission denied/);
  }
});

test('integridad directa: no se puede meter un asiento en dos ventas por SQL', async () => {
  const p1 = await pagar('Ana Mora', 1), p2 = await pagar('Luis Vega', 1);
  const v1 = await rpc(db, 'vender_asientos', 'ballet', p1.codigo, 'Ana Mora', ['A-3']);
  const id2 = (await rpc(db, 'buscar_pago', p2.codigo)).pago.id;
  const su = new pg.Client(cfg); await su.connect();
  const v2 = await su.query(`insert into ventas(evento_id,pago_id,comprador,cantidad,precio_unitario,total,estado) values ('ballet',$1,'x y',1,11000,11000,'pagada') returning id`, [id2]);
  await assert.rejects(su.query(`insert into venta_asientos(evento_id,asiento,venta_id) values ('ballet','A-3',$1)`, [v2.rows[0].id]), /duplicate key|violates unique/);
  await assert.rejects(su.query(`insert into ventas(evento_id,pago_id,comprador,cantidad,precio_unitario,total,estado) values ('ballet',$1,'x y',1,11000,11000,'pagada')`, [id2]), /duplicate key/);
  await su.end(); assert.ok(v1.ok);
});

// ============================================================
//  EVENTOS: Ballet y Espectáculo Íconos (mismos asientos, ventas separadas)
// ============================================================
test('hay dos eventos y la info pública los lista con su precio', async () => {
  const i = await rpc(db, 'info_publica');
  assert.deepEqual(i.eventos.map((e) => e.id), ['ballet', 'iconos']);
  assert.deepEqual(i.eventos.map((e) => e.nombre), ['Ballet', 'Espectáculo Íconos']);
  assert.ok(i.eventos.every((e) => e.precio === 11000));
});

test('evento inexistente o vacío: se rechaza al registrar, vender y ver el mapa', async () => {
  for (const ev of ['nada', '', null]) {
    assert.equal((await pagar('Ana Mora', 1, ref(), db, ev)).error, 'evento_invalido');
    assert.equal((await rpc(db, 'vender_asientos', ev, 'AA111', 'Ana Mora', ['A-3'])).error, 'evento_invalido');
    assert.equal((await rpc(db, 'mapa_asientos', ev)).error, 'evento_invalido');
  }
  assert.equal((await rpc(db, 'resumen', 'nada')).error, 'evento_invalido');
});

test('el MISMO asiento se puede vender una vez en cada evento, pero no dos veces en el mismo', async () => {
  const b1 = await pagar('Ana Mora', 2, ref(), db, 'ballet'), i1 = await pagar('Luis Vega', 2, ref(), db, 'iconos');
  assert.equal(b1.evento, 'ballet'); assert.equal(i1.evento_nombre, 'Espectáculo Íconos');
  assert.equal((await rpc(db, 'vender_asientos', 'ballet', b1.codigo, 'Ana Mora', ['A-3', 'A-4'])).ok, true);
  assert.equal((await rpc(db, 'vender_asientos', 'iconos', i1.codigo, 'Luis Vega', ['A-3', 'A-4'])).ok, true);
  // repetir en el mismo evento: bloqueado
  const b2 = await pagar('Rosa Cruz', 1, ref(), db, 'ballet'), i2 = await pagar('Rosa Cruz', 1, ref(), db, 'iconos');
  const x = await rpc(db, 'vender_asientos', 'ballet', b2.codigo, 'Rosa Cruz', ['A-3']);
  assert.equal(x.ok, false); assert.equal(x.error, 'ocupados');
  const y = await rpc(db, 'vender_asientos', 'iconos', i2.codigo, 'Rosa Cruz', ['A-4']);
  assert.equal(y.ok, false); assert.equal(y.error, 'ocupados');
  // y cada mapa muestra lo suyo
  assert.deepEqual((await rpc(db, 'mapa_asientos', 'ballet')).tomados.map((t) => t.a).sort(), ['A-3', 'A-4']);
  assert.deepEqual((await rpc(db, 'mapa_asientos', 'iconos')).tomados.map((t) => t.a).sort(), ['A-3', 'A-4']);
  // los asientos libres de un evento no se tocan por vender en el otro
  assert.equal((await rpc(db, 'vender_asientos', 'iconos', i2.codigo, 'Rosa Cruz', ['A-5'])).ok, true);
  assert.equal((await rpc(db, 'mapa_asientos', 'ballet')).tomados.length, 2);
  assert.equal((await rpc(db, 'mapa_asientos', 'iconos')).tomados.length, 3);
});

test('un código de Ballet no se puede usar para vender asientos de Íconos (y viceversa)', async () => {
  const b = await pagar('Ana Mora', 1, ref(), db, 'ballet');
  const r = await rpc(db, 'vender_asientos', 'iconos', b.codigo, 'Ana Mora', ['A-3']);
  assert.equal(r.ok, false); assert.equal(r.error, 'evento_distinto');
  assert.equal(r.evento_pago, 'Ballet'); assert.equal(r.evento, 'Espectáculo Íconos');
  assert.equal((await rpc(db, 'mapa_asientos', 'iconos')).tomados.length, 0);
  assert.equal((await rpc(db, 'buscar_pago', b.codigo)).pago.estado, 'pendiente');   // sigue sin usar
  assert.equal((await rpc(db, 'vender_asientos', 'ballet', b.codigo, 'Ana Mora', ['A-3'])).ok, true);
  const i = await pagar('Luis Vega', 1, ref(), db, 'iconos');
  assert.equal((await rpc(db, 'vender_asientos', 'ballet', i.codigo, 'Luis Vega', ['A-9'])).error, 'evento_distinto');
});

test('el precio sale del evento: si Íconos cuesta distinto, el monto se calcula con ese precio', async () => {
  const su = new pg.Client(cfg); await su.connect();
  try {
    await su.query(`update eventos set precio = 15000 where id = 'iconos'`);
    const mal = await rpc(db, 'registrar_comprobante', 'iconos', 'Ana Mora', 2, 22000, ref(), 'comprobante', true, null, null, null, null, null, null);
    assert.equal(mal.error, 'monto'); assert.equal(mal.esperado, 30000);
    const bien = await rpc(db, 'registrar_comprobante', 'iconos', 'Ana Mora', 2, 30000, ref(), 'comprobante', true, null, null, null, null, null, null);
    assert.equal(bien.ok, true);
    const v = await rpc(db, 'vender_asientos', 'iconos', bien.codigo, 'Ana Mora', ['A-3', 'A-4']);
    assert.equal(v.ok, true); assert.equal(v.total, 30000);
    assert.equal((await rpc(db, 'mapa_asientos', 'iconos')).precio, 15000);
    assert.equal((await rpc(db, 'mapa_asientos', 'ballet')).precio, 11000);
  } finally { await su.query(`update eventos set precio = 11000 where id = 'iconos'`); await su.end(); }
});

test('resumen por evento y global; listar_pagos y consultar_codigo traen el evento', async () => {
  const b = await pagar('Ana Mora', 2, ref(), db, 'ballet'), i = await pagar('Luis Vega', 1, ref(), db, 'iconos');
  await pagar('Rosa Cruz', 1, ref(), db, 'iconos');
  await rpc(db, 'vender_asientos', 'ballet', b.codigo, 'Ana Mora', ['A-3', 'A-4']);
  await rpc(db, 'vender_asientos', 'iconos', i.codigo, 'Luis Vega', ['A-3']);
  const rb = await rpc(db, 'resumen', 'ballet'), ri = await rpc(db, 'resumen', 'iconos'), rt = await rpc(db, 'resumen');
  assert.deepEqual([rb.total, rb.vendidos, rb.recaudado, rb.pendientes], [663, 2, 22000, 0]);
  assert.deepEqual([ri.total, ri.vendidos, ri.recaudado, ri.pendientes], [663, 1, 11000, 1]);
  assert.deepEqual([rt.total, rt.vendidos, rt.recaudado, rt.pendientes, rt.libres], [1326, 3, 33000, 1, 1323]);
  const l = await rpc(db, 'listar_pagos');
  assert.deepEqual([...new Set(l.map((x) => x.evento_nombre))].sort(), ['Ballet', 'Espectáculo Íconos']);
  const c = await rpc(db, 'consultar_codigo', i.codigo);
  assert.equal(c.evento, 'iconos'); assert.equal(c.evento_nombre, 'Espectáculo Íconos');
});

test('anular y cambiar asientos actúan sobre el evento de la venta, sin tocar el otro', async () => {
  const b = await pagar('Ana Mora', 2, ref(), db, 'ballet'), i = await pagar('Luis Vega', 2, ref(), db, 'iconos');
  const vb = await rpc(db, 'vender_asientos', 'ballet', b.codigo, 'Ana Mora', ['A-3', 'A-4']);
  const vi = await rpc(db, 'vender_asientos', 'iconos', i.codigo, 'Luis Vega', ['A-3', 'A-4']);
  // cambiar en Ballet a asientos ocupados en Íconos: permitido (son otro evento)
  const c = await rpc(db, 'cambiar_asientos', vb.venta_id, ['A-4', 'B-5']);
  assert.equal(c.ok, true);
  assert.deepEqual((await rpc(db, 'mapa_asientos', 'iconos')).tomados.map((t) => t.a).sort(), ['A-3', 'A-4']);
  assert.deepEqual((await rpc(db, 'mapa_asientos', 'ballet')).tomados.map((t) => t.a).sort(), ['A-4', 'B-5']);
  // cambiar en Íconos a un asiento que Ballet tiene: permitido; a uno de su propio evento ocupado: no
  const dentro = await rpc(db, 'cambiar_asientos', vi.venta_id, ['A-3', 'B-5']);
  assert.equal(dentro.ok, true);
  // anular Ballet libera solo Ballet
  assert.equal((await rpc(db, 'anular_venta', vb.venta_id, 'x')).ok, true);
  assert.equal((await rpc(db, 'mapa_asientos', 'ballet')).tomados.length, 0);
  assert.equal((await rpc(db, 'mapa_asientos', 'iconos')).tomados.length, 2);
});

test('carrera entre eventos: 10 pantallas piden el mismo asiento, 5 en cada evento → 1 gana por evento', async () => {
  const conns = await Promise.all(Array.from({ length: 10 }, () => sesion()));
  const pagos = [];
  for (let k = 0; k < 10; k++) pagos.push(await pagar(`Persona Numero${k}`, 1, ref(), db, k % 2 ? 'iconos' : 'ballet'));
  const res = await Promise.all(pagos.map((p, k) => rpc(conns[k], 'vender_asientos', k % 2 ? 'iconos' : 'ballet', p.codigo, `Persona Numero${k}`, ['K-10'])));
  const ok = res.filter((r) => r.ok);
  assert.equal(ok.length, 2);
  assert.deepEqual(ok.map((r) => r.evento).sort(), ['ballet', 'iconos']);
  assert.equal((await rpc(db, 'mapa_asientos', 'ballet')).tomados.length, 1);
  assert.equal((await rpc(db, 'mapa_asientos', 'iconos')).tomados.length, 1);
});

test('integridad directa: la llave es (evento, asiento) — repetir en el mismo evento falla, en otro no', async () => {
  const p1 = await pagar('Ana Mora', 1), p2 = await pagar('Luis Vega', 1, ref(), db, 'iconos'), p3 = await pagar('Rosa Cruz', 1);
  await rpc(db, 'vender_asientos', 'ballet', p1.codigo, 'Ana Mora', ['A-3']);
  const su = new pg.Client(cfg); await su.connect();
  const id = async (p) => (await rpc(db, 'buscar_pago', p.codigo)).pago.id;
  const nv = async (ev, p) => (await su.query(`insert into ventas(evento_id,pago_id,comprador,cantidad,precio_unitario,total,estado) values ($1,$2,'x y',1,11000,11000,'pagada') returning id`, [ev, await id(p)])).rows[0].id;
  const v2 = await nv('iconos', p2), v3 = await nv('ballet', p3);
  await su.query(`insert into venta_asientos(evento_id,asiento,venta_id) values ('iconos','A-3',$1)`, [v2]);   // otro evento: sí
  await assert.rejects(su.query(`insert into venta_asientos(evento_id,asiento,venta_id) values ('ballet','A-3',$1)`, [v3]), /duplicate key|violates unique/);
  await assert.rejects(su.query(`insert into venta_asientos(asiento,venta_id) values ('Z-1',$1)`, [v3]), /null value|violates/);
  await su.end();
});
