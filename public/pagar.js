// Página pública: el comprador sube su comprobante y recibe su código.
'use strict';
const $ = (s) => document.querySelector(s);
function h(tag, attrs, ...hijos) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of hijos.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c)));
  return e;
}
const fmt = (n) => '₡' + String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const vaciar = (el) => { while (el.firstChild) el.removeChild(el.firstChild); };
const plural = (n, a, b) => `${n} ${n === 1 ? a : b}`;
function aviso(host, tipo, texto) { vaciar(host); if (texto) host.append(h('div', { class: `aviso ${tipo}`, role: tipo === 'error' ? 'alert' : 'status' }, texto)); }
function guardar(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} }
function leer(k) { try { return localStorage.getItem(k); } catch { return null; } }
let tt; function toast(t) { document.querySelectorAll('.toast').forEach((x) => x.remove()); const e = h('div', { class: 'toast', role: 'status' }, t); document.body.append(e); clearTimeout(tt); tt = setTimeout(() => e.remove(), 3200); }

async function api(ruta, cuerpo) {
  const opts = cuerpo === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) };
  let r;
  try { r = await fetch(ruta, opts); }
  catch { return { ok: false, st: 0, j: { error: 'Sin conexión. Revisa el internet e intenta de nuevo.' } }; }
  let j = null; try { j = await r.json(); } catch {}
  return { ok: r.ok, st: r.status, j: j || {} };
}

const E = { eventos: [], evento: null, cantidad: 1, max: 20, imagen: null, ocupado: false, ultimo: null };
const precioActual = () => (E.evento ? E.evento.precio : 0);

// ---------- datos de la cuenta ----------
async function cargarInfo() {
  const r = await api('/api/info');
  if (r.ok) { E.eventos = r.j.eventos || []; E.max = r.j.max_por_venta || E.max; }
  else if (r.j && r.j.error) E.errorEventos = r.j.error;
  pintarEventos();
  // La cuenta solo se muestra si está configurada; si no, no se muestra ningún aviso.
  const dl = $('#datosCuenta'); vaciar(dl);
  const fila = (k, v, copiar) => dl.append(h('div', null, h('dt', null, k), h('dd', null, h('span', { class: 'valor' }, v),
    copiar ? h('button', { type: 'button', class: 'btn chico', onclick: () => copiarTexto(copiar, k + ' copiado.') }, 'Copiar') : null)));
  if (r.ok && (r.j.cuenta || r.j.titular)) {
    if (r.j.titular) fila('A nombre de', r.j.titular);
    if (r.j.cuenta) fila('Cuenta IBAN', r.j.cuenta.replace(/\s+/g, '').replace(/(.{4})/g, '$1 ').trim(), r.j.cuenta.replace(/\s+/g, ''));
    if (r.j.banco) fila('Banco', r.j.banco);
  }
  dl.hidden = !dl.firstChild;
  poner(1);
}

// ---------- evento ----------
function pintarEventos() {
  const host = $('#listaEventos'); vaciar(host);
  if (!E.eventos.length) { host.append(h('div', { class: 'aviso error' }, (E.errorEventos || 'No se pudieron cargar los eventos. Recarga la página.'))); return; }
  for (const ev of E.eventos) {
    host.append(h('button', {
      type: 'button', class: 'evento-op' + (E.evento && E.evento.id === ev.id ? ' on' : ''), role: 'radio',
      'aria-checked': E.evento && E.evento.id === ev.id ? 'true' : 'false', 'data-evento': ev.id,
      onclick: () => elegirEvento(ev.id),
    }, h('span', { class: 'ev-nombre' }, ev.nombre), h('span', { class: 'ev-precio' }, fmt(ev.precio) + ' c/u')));
  }
}
function elegirEvento(id) {
  E.evento = E.eventos.find((x) => x.id === id) || null;
  pintarEventos(); poner(E.cantidad);
}
async function copiarTexto(t, ok) {
  try { await navigator.clipboard.writeText(t); toast(ok); }
  catch { const a = h('textarea', { style: 'position:fixed;opacity:0' }, t); document.body.append(a); a.select(); try { document.execCommand('copy'); toast(ok); } catch { toast('No se pudo copiar.'); } a.remove(); }
}

// ---------- cantidad / total ----------
function poner(n) {
  E.cantidad = Math.min(E.max, Math.max(1, n));
  $('#outCantidad').textContent = E.cantidad;
  $('#btnMenos').disabled = E.cantidad <= 1; $('#btnMas').disabled = E.cantidad >= E.max;
  $('#txtTotal').textContent = E.evento ? fmt(E.cantidad * precioActual()) : 'Elige el evento';
  validar();
}
$('#btnMenos').addEventListener('click', () => poner(E.cantidad - 1));
$('#btnMas').addEventListener('click', () => poner(E.cantidad + 1));

function nombreValido(t) { return String(t).trim().split(/\s+/).filter((p) => p.length >= 2).length >= 2; }
function validar() { $('#btnEnviar').disabled = !(E.evento && E.imagen && nombreValido($('#inNombre').value)) || E.ocupado; }
$('#inNombre').addEventListener('input', validar);

// ---------- imagen ----------
async function prepararImagen(file) {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error('El archivo debe ser una imagen JPG, PNG o WEBP.');
  let blob = file;
  if (file.size > 1.2 * 1024 * 1024) {
    const bmp = await createImageBitmap(file);
    const esc = Math.min(1, 2400 / Math.max(bmp.width, bmp.height));
    const cv = document.createElement('canvas'); cv.width = Math.round(bmp.width * esc); cv.height = Math.round(bmp.height * esc);
    cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
    blob = await new Promise((ok) => cv.toBlob(ok, 'image/jpeg', 0.9));
  }
  if (blob.size > 3.9 * 1024 * 1024) throw new Error('La imagen es demasiado grande.');
  const b64 = await new Promise((ok, mal) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result).split(',')[1]); fr.onerror = mal; fr.readAsDataURL(blob); });
  return { b64, url: URL.createObjectURL(blob) };
}
function limpiarImagen() { E.imagen = null; $('#inArchivo').value = ''; $('#vistaPrevia').hidden = true; $('#soltarTexto').hidden = false; validar(); }
$('#inArchivo').addEventListener('change', async (e) => {
  const f = e.target.files[0]; if (!f) return limpiarImagen();
  aviso($('#avisoForm'), 'error', '');
  try {
    const { b64, url } = await prepararImagen(f);
    E.imagen = b64; $('#imgPrevia').src = url; $('#nombreArchivo').textContent = f.name;
    $('#vistaPrevia').hidden = false; $('#soltarTexto').hidden = true; validar();
  } catch (err) { limpiarImagen(); aviso($('#avisoForm'), 'error', err.message || 'No se pudo leer el archivo.'); }
});

// ---------- enviar ----------
$('#formPago').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  if (E.ocupado) return;
  if (!E.evento) return aviso($('#avisoForm'), 'error', 'Elige para qué evento es el pago.');
  const nombre = $('#inNombre').value.trim().replace(/\s+/g, ' ');
  if (!nombreValido(nombre)) return aviso($('#avisoForm'), 'error', 'Escribe tu nombre y apellidos.');
  if (!E.imagen) return aviso($('#avisoForm'), 'error', 'Sube la captura del comprobante.');
  const cuerpo = { evento: E.evento.id, nombre, cantidad: E.cantidad, imagenBase64: E.imagen };
  if ($('#detManual').open && ($('#inRef').value.trim() || $('#inMonto').value.trim())) {
    const ref = $('#inRef').value.trim(); const monto = Number($('#inMonto').value.replace(/[^\d]/g, ''));
    if (ref.length < 6) return aviso($('#avisoForm'), 'error', 'Escribe la referencia completa (mínimo 6 caracteres).');
    if (!monto) return aviso($('#avisoForm'), 'error', 'Escribe el monto transferido.');
    cuerpo.manual = { referencia: ref, monto };
  }
  E.ocupado = true; const b = $('#btnEnviar'); b.disabled = true; b.textContent = 'Leyendo comprobante…'; aviso($('#avisoForm'), 'error', '');
  const r = await api('/api/pagos/registrar', cuerpo);
  E.ocupado = false; b.textContent = 'Enviar comprobante'; validar();
  if (!r.ok) {
    aviso($('#avisoForm'), 'error', r.j.error || 'No se pudo registrar el pago.');
    if (r.j.puedeManual) $('#detManual').open = true;
    return;
  }
  guardar('miCodigo', r.j.codigo);
  mostrarListo(r.j);
});

function mostrarListo(d) {
  E.ultimo = d;
  $('#vForm').hidden = true; $('#vListo').hidden = false;
  $('#exEvento').textContent = d.evento_nombre || ''; $('#exCodigo').textContent = d.codigo; $('#exNombre').textContent = d.nombre;
  $('#exDetalle').textContent = `${plural(d.cantidad, 'entrada', 'entradas')} · ${fmt(d.monto)}`;
  window.scrollTo({ top: 0 });
}
$('#btnCopiar').addEventListener('click', () => E.ultimo && copiarTexto(E.ultimo.codigo, 'Código copiado.'));
$('#btnOtro').addEventListener('click', () => {
  limpiarImagen(); $('#inRef').value = ''; $('#inMonto').value = ''; $('#detManual').open = false; E.evento = null; pintarEventos(); poner(1);
  $('#vListo').hidden = true; $('#vForm').hidden = false; window.scrollTo({ top: 0 });
});

// ---------- consultar ----------
$('#inCodigo').addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12); });
$('#formConsulta').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const host = $('#resConsulta'); vaciar(host);
  const codigo = $('#inCodigo').value.trim();
  if (codigo.length < 3) return aviso(host, 'error', 'Escribe tu código (2 letras y 3 números).');
  const r = await api('/api/consultar', { codigo });
  if (!r.ok) return aviso(host, 'error', r.j.error || 'No se pudo consultar.');
  const d = r.j;
  const estado = d.estado === 'asignado' ? h('span', { class: 'pildora verde' }, 'Asientos asignados')
    : d.estado === 'rechazado' ? h('span', { class: 'pildora roja' }, 'Pago rechazado')
      : h('span', { class: 'pildora ambar' }, 'Pendiente de verificación');
  host.append(h('div', { class: 'consulta-res' },
    h('div', { class: 'quien' }, d.nombre), h('div', { class: 'evento-tag' }, d.evento_nombre || ''), estado,
    h('div', { style: 'color:var(--suave);margin-top:6px' }, `${plural(d.cantidad, 'entrada', 'entradas')} · ${fmt(d.monto)}`),
    d.asientos && d.asientos.length ? h('div', { class: 'chips', style: 'margin-top:10px' }, d.asientos.map((a) => h('span', { class: 'chip rojo' }, a))) : null,
    d.estado === 'pendiente' ? h('p', { class: 'ayuda' }, 'Jose te asignará los asientos con tu código.') : null,
    d.estado === 'rechazado' ? h('p', { class: 'ayuda' }, 'Habla con Jose para aclarar tu pago.') : null));
});

$('#inNombre').value = '';
cargarInfo();
const previo = leer('miCodigo'); if (previo) $('#inCodigo').value = previo;
