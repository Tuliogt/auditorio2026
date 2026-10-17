// Levanta la app completa contra el Postgres de pruebas, con Vision y Storage simulados.
// Sirve para probar la pantalla en un navegador real:  node test/demo-servidor.mjs
import http from 'node:http';
import pg from 'pg';
const cfg = { host: '/var/lib/pg-entradas', port: 54329, user: 'postgres', database: 'entradas' };
const almacen = new Map(); let visionTexto = '';
const leerCuerpo = async (req) => { const c = []; for await (const x of req) c.push(x); return Buffer.concat(c); };

const supabase = http.createServer(async (req, res) => {
  const cuerpo = await leerCuerpo(req); const u = new URL(req.url, 'http://x');
  const env = (st, o) => { res.writeHead(st, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
  let m;
  if ((m = u.pathname.match(/^\/rest\/v1\/rpc\/(\w+)$/))) {
    const a = JSON.parse(cuerpo.toString() || '{}'), k = Object.keys(a);
    try {
      const c = new pg.Client(cfg); await c.connect(); await c.query('set role service_role');
      const r = await c.query(`select ${m[1]}(${k.map((x, i) => `${x} := $${i + 1}`).join(', ')}) as r`, k.map((x) => a[x]));
      await c.end(); return env(200, r.rows[0].r);
    } catch (e) { return env(400, { message: e.message }); }
  }
  if ((m = u.pathname.match(/^\/storage\/v1\/object\/comprobantes-entradas\/(.+)$/))) {
    if (req.method === 'POST') { almacen.set(m[1], { t: req.headers['content-type'], d: cuerpo }); return env(200, {}); }
    const o = almacen.get(m[1]); if (!o) return env(404, {}); res.writeHead(200, { 'content-type': o.t }); return res.end(o.d);
  }
  if (u.pathname === '/storage/v1/object/list/comprobantes-entradas') return env(200, [...almacen.keys()].map((name) => ({ name })));
  if (u.pathname === '/storage/v1/object/comprobantes-entradas') { for (const n of JSON.parse(cuerpo.toString()).prefixes) almacen.delete(n); return env(200, []); }
  env(404, {});
});
const vision = http.createServer(async (req, res) => {
  const cuerpo = await leerCuerpo(req);
  if (req.url.startsWith('/__texto')) { visionTexto = cuerpo.toString(); res.end('ok'); return; }
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ responses: [{ fullTextAnnotation: { text: visionTexto } }] }));
});
const escuchar = (s, p = 0) => new Promise((r) => s.listen(p, '127.0.0.1', () => r(s.address().port)));
const ps = await escuchar(supabase), pv = await escuchar(vision, 4011);
Object.assign(process.env, {
  SUPABASE_URL: `http://127.0.0.1:${ps}`, SUPABASE_SERVICE_ROLE_KEY: 'k', VISION_URL: `http://127.0.0.1:${pv}/v1/x`, GOOGLE_VISION_API_KEY: 'k',
  ADMIN_USUARIO: 'jose', ADMIN_CLAVE: 'clave-de-jose', SESION_SECRETO: 'demo', PORT: '4010',
  CUENTA_DESTINO: 'CR11 0102 0000 9606 5818 55', TITULAR_DESTINO: 'Jose Rafael Bolaños Mora', BANCO_DESTINO: 'BAC', LIMITE_REGISTROS: '1000',
});
await import('../server.js');
console.log('DEMO lista en http://127.0.0.1:4010  (vision en 4011)');
