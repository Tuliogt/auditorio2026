// ============================================================
// Entradas · Espectáculo – Auditorio Nacional
// Todo el texto que viene de la base de datos se inserta con
// textContent (nunca innerHTML), así un nombre raro no puede
// meter código en la página.
// ============================================================
'use strict';

const $ = (s, r = document) => r.querySelector(s);
const MAX_POR_VENTA = 20;

// ---------- utilidades ----------
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
const NS = 'http://www.w3.org/2000/svg';
function s(tag, attrs, ...hijos) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs || {})) if (v != null) e.setAttribute(k, v);
  for (const c of hijos.flat()) if (c != null) e.append(c.nodeType ? c : document.createTextNode(String(c)));
  return e;
}
const fmt = (n) => '₡' + String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const norm = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const vaciar = (el) => { while (el.firstChild) el.removeChild(el.firstChild); };
const plural = (n, a, b) => `${n} ${n === 1 ? a : b}`;
function fechaHora(iso) {
  if (!iso) return '—';
  const d = new Date(iso); if (isNaN(d)) return '—';
  return d.toLocaleString('es-CR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function guardar(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} }
function leer(k) { try { return localStorage.getItem(k); } catch { return null; } }

let toastTimer;
function toast(texto) {
  document.querySelectorAll('.toast').forEach((t) => t.remove());
  const t = h('div', { class: 'toast', role: 'status' }, texto);
  document.body.append(t); clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.remove(), 3600);
}
function aviso(host, tipo, texto) {
  vaciar(host); if (texto) host.append(h('div', { class: `aviso ${tipo}`, role: tipo === 'error' ? 'alert' : 'status' }, texto));
}

async function api(ruta, cuerpo) {
  const opts = cuerpo === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) };
  let r;
  try { r = await fetch(ruta, { ...opts, credentials: 'same-origin' }); }
  catch { return { st: 0, ok: false, j: { error: 'Sin conexión con el servidor. Revisa el internet e intenta de nuevo.' } }; }
  let j = null; try { j = await r.json(); } catch {}
  if (r.status === 401 && ruta !== '/api/login' && ruta !== '/api/sesion') irALogin('Tu sesión venció. Entra de nuevo.');
  return { st: r.status, ok: r.ok, j: j || {} };
}

// ---------- ventanas ----------
function ventana({ titulo, cuerpo, angosta = false }) {
  const cerrar = () => { velo.remove(); document.removeEventListener('keydown', esc); };
  const esc = (e) => { if (e.key === 'Escape') cerrar(); };
  const velo = h('div', { class: 'velo', onmousedown: (e) => { if (e.target === velo) cerrar(); } },
    h('div', { class: 'ventana' + (angosta ? ' angosta' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': titulo },
      h('div', { class: 'ventana-cab' }, h('h2', null, titulo), h('button', { class: 'btn chico', onclick: cerrar, 'aria-label': 'Cerrar' }, '✕')),
      cuerpo));
  document.addEventListener('keydown', esc);
  $('#modales').append(velo);
  return { cerrar, velo };
}

function preguntar({ titulo, texto, boton = 'Aceptar', peligro = false, campo = null }) {
  return new Promise((resolve) => {
    const entrada = campo ? h('input', { type: 'text', placeholder: campo, maxlength: 300 }) : null;
    let w;
    const fin = (v) => { w.cerrar(); resolve(v); };
    const cuerpo = h('div', null,
      h('p', { style: 'margin:0 0 14px;color:var(--suave)' }, texto),
      entrada,
      h('div', { class: 'fila-botones' },
        h('button', { class: 'btn ' + (peligro ? 'peligro' : 'primario'), onclick: () => fin(entrada ? entrada.value.trim() : true) }, boton),
        h('button', { class: 'btn', onclick: () => fin(null) }, 'Volver')));
    w = ventana({ titulo, cuerpo, angosta: true });
    w.velo.addEventListener('mousedown', (e) => { if (e.target === w.velo) resolve(null); });
    if (entrada) entrada.focus();
  });
}

// ============================================================
//  PLANO INTERACTIVO (SVG con zoom y arrastre)
// ============================================================
const VISTAS = [['todos', 'Todos'], ['resaltar', 'Resaltar libres'], ['libres', 'Solo libres']];
function crearMapa(host, plano, alTocar) {
  const V = plano.vista;
  const svg = s('svg', { class: 'plano', viewBox: `${V.x} ${V.y} ${V.w} ${V.h}`, role: 'group', 'aria-label': 'Plano de asientos del auditorio' });
  svg.style.setProperty('--ar', `${V.w} / ${V.h}`);   // en escritorio el plano llena el ANCHO y la página baja
  const gEt = s('g'); const gAs = s('g');
  svg.append(gEt, gAs);

  for (const [t, x, y, rot] of plano.etiquetas) {
    gEt.append(s('text', { class: 'fila', x, y, transform: rot ? `rotate(${rot} ${x} ${y})` : null }, t));
  }
  const asientos = new Map();
  for (const [id, x, y, rot, fila, num] of plano.asientos) {
    const titulo = s('title', null, `Fila ${fila} · Asiento ${num}`);
    const g = s('g', { class: 'a libre', 'data-id': id, transform: `translate(${x} ${y})${rot ? ` rotate(${rot})` : ''}` },
      titulo,
      s('rect', { x: -14.2, y: -14.2, width: 28.4, height: 28.4, rx: 6 }),
      s('text', { x: 0, y: 1 }, num),
      s('path', { class: 'cruz', d: 'M-7 -7L7 7M7 -7L-7 7' }));
    gAs.append(g);
    asientos.set(id, { g, titulo, fila, num, estado: 'libre' });
  }

  // --- barra de herramientas / leyenda
  const botonesZona = {}; const botonesVista = {};
  const movil = window.matchMedia('(max-width: 759px)').matches;   // en el celular se ofrecen zonas más cerradas
  const zonas = movil
    ? [['alta_i', 'A–N izq.'], ['alta_c', 'A–N centro'], ['alta_d', 'A–N der.'], ['baja_i', 'AA–II izq.'], ['baja_c', 'AA–II centro'], ['baja_d', 'AA–II der.'], ['izq', 'Lat. izq.'], ['der', 'Lat. der.'], ['todo', 'Todo']]
    : [['todo', 'Todo'], ['alta', 'Filas A–N'], ['baja', 'Filas AA–II'], ['izq', 'Lateral izq.'], ['der', 'Lateral der.']];
  const barra = h('div', { class: 'mapa-herramientas' },
    zonas.map(([k, t]) => (botonesZona[k] = h('button', { class: 'zona-btn', type: 'button', 'aria-pressed': 'false', onclick: () => irA(k) }, t))),
    h('span', { class: 'sep', 'aria-hidden': 'true' }),
    VISTAS.map(([k, t]) => (botonesVista[k] = h('button', { class: 'zona-btn vista-btn', type: 'button', 'aria-pressed': 'false', onclick: () => ponerVista(k) }, t))),
    h('div', { class: 'zoom-btns' },
      h('button', { class: 'zona-btn', type: 'button', 'aria-label': 'Acercar', onclick: () => zoomCentro(0.7) }, '+'),
      h('button', { class: 'zona-btn', type: 'button', 'aria-label': 'Alejar', onclick: () => zoomCentro(1 / 0.7) }, '−')));
  let elegidosTxt;
  const leyenda = h('div', { class: 'leyenda' },
    h('span', null, h('i', { class: 'l-libre' }), 'Libre'),
    h('span', null, h('i', { class: 'l-sel' }), 'Elegido'),
    h('span', null, h('i', { class: 'l-vendido' }), 'Vendido'),
    elegidosTxt = h('span', { class: 'elegidos-txt' }));
  host.append(barra, svg, leyenda);

  // --- cómo se ve el plano: todos los asientos, resaltando los libres, o solo los libres
  function ponerVista(k) {
    if (!VISTAS.some(([x]) => x === k)) k = 'todos';
    svg.classList.remove('vista-todos', 'vista-resaltar', 'vista-libres'); svg.classList.add('vista-' + k);
    for (const [x, b] of Object.entries(botonesVista)) b.setAttribute('aria-pressed', String(x === k));
    guardar('vistaMapa', k);
  }
  ponerVista(leer('vistaMapa') || 'todos');


  // --- vista (zoom / arrastre)
  let vb = { ...V }; let zonaActual = 'todo';
  const aplicar = () => svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
  function ajustarRect([zx, zy, zw, zh]) {
    const r = svg.getBoundingClientRect(); const asp = (r.width || 1000) / (r.height || 600);
    let w, hh;
    if (zw / zh > asp) { w = zw; hh = zw / asp; } else { hh = zh; w = zh * asp; }
    vb = { x: zx + zw / 2 - w / 2, y: zy + zh / 2 - hh / 2, w, h: hh };
    aplicar();
  }
  function irA(k) {
    zonaActual = k;
    for (const [z, b] of Object.entries(botonesZona)) b.setAttribute('aria-pressed', String(z === k));
    ajustarRect(plano.zonas[k]);
  }
  function zoomEn(factor, cx, cy) {
    const minW = 150, maxW = Math.max(V.w * 1.1, vb.w);
    const nw = Math.min(maxW, Math.max(minW, vb.w * factor)); const f = nw / vb.w;
    vb = { x: cx - (cx - vb.x) * f, y: cy - (cy - vb.y) * f, w: nw, h: vb.h * f };
    aplicar();
    for (const b of Object.values(botonesZona)) b.setAttribute('aria-pressed', 'false');
  }
  const zoomCentro = (f) => zoomEn(f, vb.x + vb.w / 2, vb.y + vb.h / 2);
  const aSvg = (px, py) => { const r = svg.getBoundingClientRect(); return [vb.x + ((px - r.left) / r.width) * vb.w, vb.y + ((py - r.top) / r.height) * vb.h]; };

  const punteros = new Map(); let mov = 0; let objetivo = null; let dist0 = 0;
  svg.addEventListener('pointerdown', (e) => {
    svg.setPointerCapture(e.pointerId);
    punteros.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (punteros.size === 1) { mov = 0; objetivo = e.target.closest ? e.target.closest('[data-id]') : null; }
    else { mov = 99; const [a, b] = [...punteros.values()]; dist0 = Math.hypot(a.x - b.x, a.y - b.y); }
  });
  svg.addEventListener('pointermove', (e) => {
    const p = punteros.get(e.pointerId); if (!p) return;
    const r = svg.getBoundingClientRect();
    if (punteros.size === 2) {
      punteros.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const [a, b] = [...punteros.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (dist0 > 0 && d > 0) { const [cx, cy] = aSvg((a.x + b.x) / 2, (a.y + b.y) / 2); zoomEn(dist0 / d, cx, cy); dist0 = d; }
      return;
    }
    const dx = e.clientX - p.x, dy = e.clientY - p.y; mov += Math.abs(dx) + Math.abs(dy);
    if (mov > 8) {
      vb.x -= dx * (vb.w / r.width); vb.y -= dy * (vb.h / r.height); aplicar();
      punteros.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
  });
  const soltar = (e) => {
    const eraUno = punteros.size === 1;
    punteros.delete(e.pointerId);
    if (e.type === 'pointerup' && eraUno && mov <= 8 && objetivo) alTocar(objetivo.getAttribute('data-id'));
    if (!punteros.size) objetivo = null;
  };
  svg.addEventListener('pointerup', soltar); svg.addEventListener('pointercancel', soltar);
  svg.addEventListener('wheel', (e) => { e.preventDefault(); const [cx, cy] = aSvg(e.clientX, e.clientY); zoomEn(Math.pow(1.0016, e.deltaY), cx, cy); }, { passive: false });
  new ResizeObserver(() => { if (svg.getBoundingClientRect().width) { if (zonaActual) ajustarRect(plano.zonas[zonaActual]); } }).observe(svg);

  const nombresEstado = { libre: 'Libre', sel: 'Elegido', mio: 'De esta venta', vendido: 'Vendido' };
  return {
    irA,
    pintar(fn) {
      const elegidos = [];
      for (const [id, a] of asientos) {
        const e = fn(id);
        if (e === 'sel') elegidos.push(id);
        if (e !== a.estado) {
          a.estado = e; a.g.setAttribute('class', 'a ' + e);
          a.titulo.textContent = `Fila ${a.fila} · Asiento ${a.num} — ${nombresEstado[e] || e}`;
        }
      }
      elegidosTxt.textContent = elegidos.length ? `Elegidos (${elegidos.length}): ${elegidos.sort((x, y) => x.localeCompare(y, 'es', { numeric: true })).join(', ')}` : '';
    },
  };
}

// ============================================================
//  ESTADO GENERAL
// ============================================================
const E = {
  plano: null, mapa: null, eventos: [], evento: null, filtroEvento: 'todos', precio: 0, sel: new Set(), tomados: new Map(), nombres: [],
  fase: 'elegir', pago: null, timerPoll: null, vista: 'vender',
  pagos: [], filtro: 'pendiente', busqueda: '', ocupado: false, ultimo: null,
};

function irALogin(mensaje) {
  detener();
  $('#barra').hidden = true; $('#vVender').hidden = true; $('#vPanel').hidden = true; $('#vLogin').hidden = false;
  aviso($('#loginError'), 'error', mensaje || '');
  setTimeout(() => $('#loginUsuario').focus(), 50);
}
function detener() { clearInterval(E.timerPoll); E.timerPoll = null; }

// ============================================================
//  LOGIN / ARRANQUE
// ============================================================
$('#formLogin').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const b = $('#btnEntrar'); b.disabled = true; b.textContent = 'Entrando…';
  const r = await api('/api/login', { usuario: $('#loginUsuario').value, clave: $('#loginClave').value });
  b.disabled = false; b.textContent = 'Entrar';
  if (!r.ok) return aviso($('#loginError'), 'error', r.j.error || 'No se pudo entrar.');
  $('#loginClave').value = ''; aviso($('#loginError'), 'error', '');
  arrancar();
});
$('#btnSalir').addEventListener('click', async () => { await api('/api/logout', {}); location.reload(); });

async function arrancar() {
  $('#vLogin').hidden = true; $('#barra').hidden = false;
  if (!E.plano) {
    try { E.plano = await (await fetch('/plano.json')).json(); }
    catch { return toast('No se pudo cargar el plano. Recarga la página.'); }
  }
  if (!E.mapa) {
    E.mapa = crearMapa($('#mapaCaja'), E.plano, tocarAsiento);
    E.mapa.irA(window.innerWidth < 760 ? 'alta_c' : 'todo');
  }
  if (!(await cargarEventos())) return;
  await Promise.all([cargarNombres(), refrescarMapa()]);
  mostrar('vender');
  actualizarPendientes();
}

async function boot() {
  const r = await api('/api/sesion');
  if (r.ok && r.j.ok) arrancar(); else irALogin('');
}

// ---------- pestañas ----------
$('#tabVender').addEventListener('click', () => mostrar('vender'));
$('#tabPanel').addEventListener('click', () => mostrar('panel'));
function mostrar(v) {
  E.vista = v;
  $('#vVender').hidden = v !== 'vender'; $('#vPanel').hidden = v !== 'panel';
  $('#tabVender').setAttribute('aria-selected', String(v === 'vender'));
  $('#tabPanel').setAttribute('aria-selected', String(v === 'panel'));
  clearInterval(E.timerPoll); E.timerPoll = null;
  if (v === 'vender') {
    refrescarMapa();
    E.timerPoll = setInterval(() => { if (!document.hidden) refrescarMapa(); }, 4000);
  } else { cargarPanel(); }
  window.scrollTo({ top: 0 });
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && E.vista === 'vender' && !$('#vVender').hidden) refrescarMapa(); });

// ============================================================
//  EVENTOS · Ballet / Espectáculo Íconos (mismos asientos, ventas independientes)
// ============================================================
async function cargarEventos() {
  const r = await api('/api/info');
  if (!r.ok || !(r.j.eventos || []).length) { aviso($('#avisoMapa'), 'error', (r.j && r.j.error) || 'No se pudieron cargar los eventos. Recarga la página.'); toast('No se pudieron cargar los eventos.'); return false; }
  E.eventos = r.j.eventos;
  const guardado = leer('evento');
  E.evento = E.eventos.find((e) => e.id === guardado) || E.eventos[0];
  E.precio = E.evento.precio;
  pintarEventos(); pintarFiltroEvento();
  return true;
}
function pintarEventos() {
  const host = $('#barraEventos'); vaciar(host);
  for (const ev of E.eventos) {
    const on = E.evento && E.evento.id === ev.id;
    host.append(h('button', { type: 'button', class: 'evento-op compacto' + (on ? ' on' : ''), role: 'radio', 'aria-checked': String(on), 'data-evento': ev.id, onclick: () => elegirEvento(ev.id) },
      h('span', { class: 'ev-nombre' }, ev.nombre), h('span', { class: 'ev-precio' }, fmt(ev.precio) + ' c/u')));
  }
}
function elegirEvento(id) {
  if (E.evento && E.evento.id === id) return;
  const ev = E.eventos.find((e) => e.id === id); if (!ev) return;
  const habia = E.sel.size > 0 || E.fase !== 'elegir';
  E.evento = ev; E.precio = ev.precio; guardar('evento', ev.id);
  E.sel.clear(); E.tomados = new Map(); E.pago = null; vaciar($('#resultadoCodigo'));
  pintarEventos();
  if (E.fase !== 'elegir') volverAElegir(); else actualizarSel();
  if (habia) toast(`Ahora vendes ${ev.nombre}. Se limpió la selección.`);
  refrescarMapa();
}
function pintarFiltroEvento() {
  const host = $('#filtroEvento'); vaciar(host);
  const opciones = [['todos', 'Todos los eventos'], ...E.eventos.map((e) => [e.id, e.nombre])];
  for (const [k, t] of opciones) host.append(h('button', { class: 'zona-btn', 'aria-pressed': String(E.filtroEvento === k), onclick: () => { E.filtroEvento = k; pintarFiltroEvento(); cargarPanel(); } }, t));
}

// ============================================================
//  VENDER · 1 comprador → 2 asientos → 3 código de pago → 4 listo
// ============================================================
function nombreValido(t) { return String(t).trim().split(/\s+/).filter((p) => p.length >= 2).length >= 2; }

async function cargarNombres() {
  const r = await api('/api/personas'); if (r.ok) E.nombres = r.j.nombres || [];
}

// --- autocompletado de nombres (lista cargada o nombre nuevo)
const inNombre = $('#inNombre'); const caja = $('#sugerencias'); let indice = -1; let lista = [];
function mostrarSugerencias() {
  const q = norm(inNombre.value).trim(); vaciar(caja); indice = -1;
  const palabras = q.split(/\s+/).filter(Boolean);
  lista = q ? E.nombres.filter((n) => { const m = norm(n); return palabras.every((p) => m.includes(p)); }).slice(0, 8) : [];
  if (!lista.length) { caja.hidden = true; return; }
  for (const n of lista) {
    const i = norm(n).indexOf(q);
    const contenido = i >= 0 ? [n.slice(0, i), h('mark', null, n.slice(i, i + q.length)), n.slice(i + q.length)] : [n];
    caja.append(h('button', { type: 'button', role: 'option', onmousedown: (e) => { e.preventDefault(); elegirNombre(n); } }, contenido));
  }
  caja.hidden = false;
}
function elegirNombre(n) { inNombre.value = n; caja.hidden = true; ayudaNombre(); actualizarSel(); }
function ayudaNombre() {
  const v = inNombre.value.trim(); const el = $('#ayudaNombre');
  if (!v) el.textContent = 'Elige de la lista o escribe un nombre nuevo (nombre y apellidos).';
  else if (E.nombres.some((n) => norm(n) === norm(v))) el.textContent = '✓ Nombre de la lista.';
  else if (!nombreValido(v)) el.textContent = 'Faltan los apellidos: escribe nombre y apellidos.';
  else el.textContent = 'Nombre nuevo: se agrega a la lista al cerrar la venta.';
}
inNombre.addEventListener('input', () => { mostrarSugerencias(); ayudaNombre(); actualizarSel(); });
inNombre.addEventListener('focus', mostrarSugerencias);
inNombre.addEventListener('blur', () => setTimeout(() => { caja.hidden = true; }, 120));
inNombre.addEventListener('keydown', (e) => {
  const bs = [...caja.querySelectorAll('button')];
  if (!bs.length || caja.hidden) return;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault(); indice = (indice + (e.key === 'ArrowDown' ? 1 : -1) + bs.length) % bs.length;
    bs.forEach((b, i) => b.classList.toggle('activa', i === indice));
  } else if (e.key === 'Enter' && indice >= 0) { e.preventDefault(); elegirNombre(lista[indice]); }
  else if (e.key === 'Escape') caja.hidden = true;
});

// --- plano: solo hay libres y vendidos (no existe "apartado")
function estadoAsiento(id) {
  if (E.sel.has(id)) return 'sel';
  return E.tomados.has(id) ? 'vendido' : 'libre';
}
function pintar() { if (E.mapa) E.mapa.pintar(estadoAsiento); }

function tocarAsiento(id) {
  if (E.fase !== 'elegir') return;
  if (E.tomados.has(id)) return toast(`El asiento ${id} ya está vendido.`);
  if (E.sel.has(id)) E.sel.delete(id);
  else {
    if (E.sel.size >= MAX_POR_VENTA) return toast(`Máximo ${MAX_POR_VENTA} asientos por venta.`);
    E.sel.add(id);
  }
  actualizarSel();
}

function actualizarSel() {
  pintar();
  const ids = [...E.sel].sort(porAsiento);
  const cajaChips = $('#chipsSel'); vaciar(cajaChips);
  for (const id of ids) cajaChips.append(h('span', { class: 'chip rojo' }, id, h('button', { type: 'button', 'aria-label': `Quitar ${id}`, onclick: () => { E.sel.delete(id); actualizarSel(); } }, '×')));
  const p = $('#progreso'); vaciar(p);
  if (E.sel.size) p.append(h('b', null, plural(E.sel.size, 'asiento elegido', 'asientos elegidos')), ' · toca un asiento para quitarlo');
  else p.append('Toca los asientos en el plano para elegirlos.');
  $('#txtPrecio').textContent = fmt(E.precio); $('#txtTotal').textContent = fmt(E.precio * E.sel.size);
  $('#btnConfirmar').disabled = !(E.sel.size > 0 && nombreValido(inNombre.value));
}
const porAsiento = (a, b) => String(a).localeCompare(String(b), 'es', { numeric: true });
$('#btnLimpiar').addEventListener('click', () => { E.sel.clear(); actualizarSel(); });

async function refrescarMapa() {
  const pedido = E.evento.id;
  const r = await api('/api/mapa?evento=' + encodeURIComponent(pedido)); if (!r.ok) return;
  if (!E.evento || E.evento.id !== pedido) return;   // cambió de evento mientras llegaba la respuesta
  E.precio = r.j.precio || E.precio;
  E.tomados = new Map((r.j.tomados || []).map((t) => [t.a, t]));
  const perdidos = [...E.sel].filter((id) => E.tomados.has(id));
  for (const id of perdidos) E.sel.delete(id);
  if (perdidos.length) {
    toast(`Se vendió ${perdidos.join(', ')}. Elige otro asiento.`);
    if (E.fase === 'pago') volverAElegir();
  }
  actualizarSel();
}

// --- Confirmar → aparece el monto y el espacio para el código de pago
$('#btnConfirmar').addEventListener('click', () => {
  if (!E.sel.size || !nombreValido(inNombre.value)) return;
  E.fase = 'pago'; E.pago = null;
  const ids = [...E.sel].sort(porAsiento);
  $('#bloqueSeleccion').hidden = true; $('#bloqueExito').hidden = true; $('#bloquePago').hidden = false;
  $('#pgEvento').textContent = E.evento.nombre;
  $('#pgNombre').textContent = inNombre.value.trim().replace(/\s+/g, ' ');
  const c = $('#pgChips'); vaciar(c); for (const id of ids) c.append(h('span', { class: 'chip rojo' }, id));
  $('#pgMonto').textContent = fmt(E.precio * ids.length);
  $('#pgDetalle').textContent = `${plural(ids.length, 'asiento', 'asientos')} × ${fmt(E.precio)}`;
  $('#inCodigo').value = ''; vaciar($('#resultadoCodigo')); aviso($('#avisoPago'), 'error', '');
  window.scrollTo({ top: 0 }); setTimeout(() => $('#inCodigo').focus(), 50);
});
function volverAElegir() {
  E.fase = 'elegir'; E.pago = null;
  $('#bloquePago').hidden = true; $('#bloqueExito').hidden = true; $('#bloqueSeleccion').hidden = false;
  actualizarSel(); window.scrollTo({ top: 0 });
}
$('#btnVolver').addEventListener('click', volverAElegir);

// --- validar el código
const inCodigo = $('#inCodigo');
inCodigo.addEventListener('input', () => { inCodigo.value = inCodigo.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12); E.pago = null; vaciar($('#resultadoCodigo')); aviso($('#avisoPago'), 'error', ''); });
$('#formCodigo').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  if (E.ocupado) return;
  const codigo = inCodigo.value.trim();
  if (codigo.length < 3) return aviso($('#avisoPago'), 'error', 'Escribe el código de pago (2 letras y 3 números, por ejemplo AE472).');
  E.ocupado = true; const b = $('#btnValidar'); b.disabled = true; b.textContent = 'Validando…';
  const r = await api('/api/pago/buscar', { codigo });
  E.ocupado = false; b.disabled = false; b.textContent = 'Validar código';
  vaciar($('#resultadoCodigo'));
  if (!r.ok) return aviso($('#avisoPago'), 'error', r.j.error || 'No se pudo validar el código.');
  aviso($('#avisoPago'), 'error', '');
  E.pago = r.j.pago; mostrarResultado(r.j);
});

function comparteNombre(a, b) {
  const pa = new Set(norm(a).split(/\s+/).filter((w) => w.length >= 3));
  return norm(b).split(/\s+/).filter((w) => w.length >= 3 && pa.has(w)).length >= 1;
}

function mostrarResultado(d) {
  const p = d.pago; const n = E.sel.size; const esperado = n * E.precio;
  const comprador = inNombre.value.trim().replace(/\s+/g, ' ');
  const checks = [];
  const ck = (tipo, texto) => checks.push(h('li', { class: tipo }, h('i', { 'aria-hidden': 'true' }, tipo === 'ok' ? '✓' : tipo === 'mal' ? '✕' : '!'), h('span', null, texto)));
  let puede = true;

  if (p.estado === 'asignado') { ck('mal', `Este código YA se usó${d.venta ? ` para ${d.venta.asientos.join(', ')} (${d.venta.comprador})` : ''}. No se puede usar dos veces.`); puede = false; }
  else if (p.estado === 'rechazado') { ck('mal', `Este pago fue rechazado${p.motivo ? `: ${p.motivo}` : ''}.`); puede = false; }
  else ck('ok', 'Código válido y sin usar.');

  if (p.evento === E.evento.id) ck('ok', `El pago es para ${E.evento.nombre}.`);
  else { ck('mal', `Este pago es para ${p.evento_nombre}, pero estás vendiendo ${E.evento.nombre}. Cambia de evento arriba o usa otro código.`); puede = false; }

  if (p.cantidad === n) ck('ok', `Pagó ${plural(p.cantidad, 'entrada', 'entradas')} = ${plural(n, 'asiento elegido', 'asientos elegidos')}.`);
  else { ck('mal', `Pagó ${plural(p.cantidad, 'entrada', 'entradas')} pero elegiste ${plural(n, 'asiento', 'asientos')}. Ajusta la selección.`); puede = false; }

  if (p.monto === esperado) ck('ok', `Monto pagado ${fmt(p.monto)} = ${n} × ${fmt(E.precio)}.`);
  else { ck('mal', `El monto pagado es ${fmt(p.monto)} y ${plural(n, 'asiento', 'asientos')} × ${fmt(E.precio)} suman ${fmt(esperado)}.`); puede = false; }

  if (p.origen === 'comprobante' && p.destino_ok) ck('ok', 'El comprobante muestra una transferencia a la cuenta de Jose.');
  else ck('warn', 'El comprador escribió la referencia y el monto a mano (no se pudo leer el comprobante). Confirma el depósito en tu banco.');

  if (!comparteNombre(p.nombre, comprador)) ck('warn', `El pago está a nombre de ${p.nombre}; estás vendiendo a ${comprador}.`);

  const dato = (k, v) => v ? h('div', null, h('dt', null, k), h('dd', null, v)) : null;
  const acciones = [];
  if (p.archivo) acciones.push(h('button', { class: 'btn', type: 'button', onclick: () => verComprobante(p) }, 'Ver comprobante'));
  const btnVender = h('button', { class: 'btn primario', type: 'button', disabled: !puede, onclick: () => cerrarVenta(btnVender) }, 'Asignar asientos y cerrar venta');
  acciones.push(btnVender);

  $('#resultadoCodigo').append(h('div', { class: 'tarjeta verificacion' },
    h('h2', null, 'Verifica el pago'),
    h('span', { class: 'evento-tag' }, p.evento_nombre),
    h('p', { class: 'banco-aviso' }, 'Compara en tu banco: referencia ', h('b', null, p.referencia), ' por ', h('b', null, fmt(p.monto)), '.'),
    h('ul', { class: 'checks' }, checks),
    h('dl', null, dato('Pagó', p.nombre), dato('Referencia', p.referencia), dato('Banco', p.banco), dato('Fecha del comprobante', p.fecha),
      dato('Remitente', p.remitente), dato('Detalle', p.detalle), dato('Subido', fechaHora(p.creado_en))),
    h('div', { class: 'fila-botones' }, acciones)));
}

async function cerrarVenta(btn) {
  if (E.ocupado || !E.pago) return; E.ocupado = true; btn.disabled = true; btn.textContent = 'Asignando…';
  const comprador = inNombre.value.trim().replace(/\s+/g, ' ');
  const r = await api('/api/vender', { evento: E.evento.id, codigo: E.pago.codigo, comprador, asientos: [...E.sel] });
  E.ocupado = false;
  if (!r.ok) {
    btn.textContent = 'Asignar asientos y cerrar venta';
    const j = r.j || {};
    if (j.codigoError === 'ocupados') {
      for (const id of (j.detalle && j.detalle.asientos) || []) E.sel.delete(id);
      await refrescarMapa(); volverAElegir();
      return aviso($('#avisoMapa'), 'error', j.error);
    }
    btn.disabled = false;
    return aviso($('#avisoPago'), 'error', j.error || 'No se pudo cerrar la venta.');
  }
  mostrarExito(r.j);
}

function mostrarExito(d) {
  E.fase = 'exito'; E.ultimo = d;
  $('#bloquePago').hidden = true; $('#bloqueExito').hidden = false;
  $('#exEvento').textContent = d.evento_nombre || ''; $('#exCodigo').textContent = d.codigo; $('#exNombre').textContent = d.comprador; $('#exTotal').textContent = fmt(d.total);
  const c = $('#exChips'); vaciar(c); for (const id of d.asientos) c.append(h('span', { class: 'chip rojo' }, id));
  E.sel.clear(); E.pago = null;
  cargarNombres(); refrescarMapa(); actualizarPendientes(); window.scrollTo({ top: 0 });
}

$('#btnCopiar').addEventListener('click', async () => {
  const u = E.ultimo; if (!u) return;
  const texto = `🎭 Espectáculo – Auditorio Nacional · JB Dance Academy\nEvento: ${u.evento_nombre}\nComprador: ${u.comprador}\nAsientos: ${u.asientos.join(', ')}\nTotal pagado: ${fmt(u.total)}\nCódigo: ${u.codigo}`;
  try { await navigator.clipboard.writeText(texto); toast('Mensaje copiado.'); }
  catch {
    const t = h('textarea', { style: 'position:fixed;opacity:0' }, texto); document.body.append(t); t.select();
    try { document.execCommand('copy'); toast('Mensaje copiado.'); } catch { toast('No se pudo copiar.'); } t.remove();
  }
});
$('#btnNueva').addEventListener('click', () => {
  inNombre.value = ''; ayudaNombre(); aviso($('#avisoMapa'), 'error', '');
  E.fase = 'elegir'; $('#bloqueExito').hidden = true; $('#bloqueSeleccion').hidden = false;
  actualizarSel(); window.scrollTo({ top: 0 });
});

// ============================================================
//  PANEL · pagos
// ============================================================
async function actualizarPendientes() {
  const r = await api('/api/resumen'); if (!r.ok) return;
  const b = $('#contadorPendientes'); b.hidden = !r.j.pendientes; b.textContent = r.j.pendientes;
}

async function cargarPanel() {
  const q = E.filtroEvento === 'todos' ? '' : '?evento=' + encodeURIComponent(E.filtroEvento);
  const [res, pag] = await Promise.all([api('/api/resumen' + q), api('/api/pagos')]);
  if (res.ok) pintarTiles(res.j);
  if (pag.ok) { E.pagos = pag.j.pagos || []; pintarFiltros(); pintarPagos(); }
  const n = await api('/api/personas'); if (n.ok) { E.nombres = n.j.nombres || []; pintarNombres(); }
  actualizarPendientes();
}

function pintarTiles(r) {
  const t = $('#tiles'); vaciar(t);
  const tile = (k, v, cls = '') => h('div', { class: 'tile ' + cls }, h('small', null, k), h('b', { class: 'num' }, v));
  t.append(
    tile('Vendidos', `${r.vendidos} / ${r.total}`), tile('Libres', r.libres),
    tile('Sin asignar', r.pendientes, r.pendientes ? 'alerta' : ''), tile('Recaudado', fmt(r.recaudado), 'dinero'));
}

const FILTROS = [['pendiente', 'Sin asignar'], ['asignado', 'Asignados'], ['rechazado', 'Rechazados'], ['todos', 'Todos']];
function pintarFiltros() {
  const f = $('#filtros'); vaciar(f);
  for (const [k, t] of FILTROS) f.append(h('button', { class: 'zona-btn', 'aria-pressed': String(E.filtro === k), onclick: () => { E.filtro = k; pintarFiltros(); pintarPagos(); } }, t));
  const q = h('input', { type: 'search', placeholder: 'Buscar nombre, código, referencia, asiento…', value: E.busqueda, 'aria-label': 'Buscar' });
  q.addEventListener('input', () => { E.busqueda = q.value; pintarPagos(); });
  f.append(q);
}

function coincide(p) {
  if (E.filtroEvento !== 'todos' && p.evento !== E.filtroEvento) return false;
  if (E.filtro !== 'todos' && p.estado !== E.filtro) return false;
  const q = norm(E.busqueda).trim(); if (!q) return true;
  const v = p.venta;
  return norm([p.nombre, p.codigo, p.referencia, v && v.comprador, v && v.asientos.join(' ')].join(' ')).includes(q);
}

function pintarPagos() {
  const host = $('#listaVentas'); vaciar(host);
  const lista = E.pagos.filter(coincide);
  if (!lista.length) { host.append(h('div', { class: 'vacio' }, E.pagos.length ? 'Nada coincide con el filtro.' : 'Todavía no hay pagos.')); return; }
  for (const p of lista) host.append(tarjetaPago(p));
}

function tarjetaPago(p) {
  const v = p.venta && p.venta.estado === 'pagada' ? p.venta : null;
  const pildora = p.estado === 'asignado' ? h('span', { class: 'pildora verde' }, 'Asignado')
    : p.estado === 'rechazado' ? h('span', { class: 'pildora roja' }, 'Rechazado')
      : h('span', { class: 'pildora ambar' }, 'Sin asignar');
  const dato = (k, val) => val ? h('div', null, h('dt', null, k), h('dd', null, val)) : null;
  const acciones = [];
  if (p.archivo) acciones.push(h('button', { class: 'btn chico', onclick: () => verComprobante(p) }, 'Ver comprobante'));
  if (p.estado === 'pendiente') acciones.push(h('button', { class: 'btn chico peligro', onclick: () => rechazar(p) }, 'Rechazar pago'));
  if (v) {
    acciones.push(h('button', { class: 'btn chico', onclick: () => cambiarAsientos(p) }, 'Cambiar asientos'));
    acciones.push(h('button', { class: 'btn chico peligro', onclick: () => anular(p) }, 'Anular venta'));
  }
  return h('article', { class: 'venta' + (p.estado === 'rechazado' ? ' anulada' : '') },
    h('div', { class: 'venta-cab' },
      h('div', null, h('div', { class: 'quien' }, p.nombre), h('span', { class: 'evento-tag chico' }, p.evento_nombre), pildora, h('span', { class: 'codigo-chico' }, p.codigo)),
      h('div', { class: 'monto num' }, fmt(p.monto))),
    v ? h('div', { class: 'chips' }, v.asientos.map((a) => h('span', { class: 'chip rojo' }, a))) : null,
    h('dl', null,
      dato('Entradas pagadas', String(p.cantidad)),
      dato('Asignado a', v && v.comprador),
      dato('Referencia', p.referencia),
      dato('Origen', p.origen === 'manual' ? 'Escrito a mano por el comprador — verificar en el banco' : (p.destino_ok ? 'Comprobante leído · cuenta destino correcta' : 'Comprobante leído')),
      dato('Banco', p.banco), dato('Fecha del comprobante', p.fecha), dato('Remitente', p.remitente), dato('Detalle', p.detalle),
      dato('Subido', fechaHora(p.creado_en)),
      dato('Motivo', p.estado === 'rechazado' ? p.motivo : null)),
    acciones.length ? h('div', { class: 'fila-botones', style: 'margin-top:12px' }, acciones) : null);
}

async function rechazar(p) {
  const motivo = await preguntar({ titulo: 'Rechazar pago', texto: `${p.nombre} · ${fmt(p.monto)} · ref. ${p.referencia}. El código queda inválido y la referencia no se podrá volver a subir.`, campo: 'Motivo (ej. no aparece en el banco)', boton: 'Rechazar pago', peligro: true });
  if (motivo === null) return;
  const r = await api('/api/rechazar', { pago_id: p.id, motivo });
  toast(r.ok ? 'Pago rechazado.' : (r.j.error || 'No se pudo rechazar.')); cargarPanel();
}
async function anular(p) {
  const v = p.venta;
  const motivo = await preguntar({ titulo: 'Anular venta', texto: `Se liberan los asientos de ${v.comprador} (${v.asientos.join(', ')}). El código de pago queda bloqueado y no se podrá volver a usar.`, campo: 'Motivo (opcional)', boton: 'Anular venta', peligro: true });
  if (motivo === null) return;
  const r = await api('/api/anular', { venta_id: v.id, motivo });
  toast(r.ok ? 'Venta anulada.' : (r.j.error || 'No se pudo anular.')); cargarPanel();
}

function verComprobante(p) {
  const img = h('img', { class: 'comprobante', alt: 'Comprobante de pago de ' + p.nombre, src: '/api/comprobante/' + encodeURIComponent(p.archivo) });
  const cuerpo = h('div', null, h('p', { style: 'margin:0 0 10px;color:var(--suave)' }, `${p.nombre} · ${fmt(p.monto)} · ref. ${p.referencia}`), img);
  img.addEventListener('error', () => { img.replaceWith(h('div', { class: 'aviso error' }, 'La imagen ya no está disponible.')); });
  ventana({ titulo: 'Comprobante', cuerpo });
}

// --- cambiar asientos de una venta vigente
async function cambiarAsientos(p) {
  const v = p.venta;
  const r = await api('/api/mapa?evento=' + encodeURIComponent(p.evento)); if (!r.ok) return toast('No se pudo cargar el plano.');
  const tomados = new Map((r.j.tomados || []).map((t) => [t.a, t]));
  const sel = new Set();
  const zona = h('div', { class: 'mapa-caja' });
  const chips = h('div', { class: 'chips' }); const msg = h('div'); const progreso = h('p', { class: 'progreso' });
  const btn = h('button', { class: 'btn primario', disabled: true }, 'Guardar cambio');
  const estado = (id) => {
    if (sel.has(id)) return 'sel';
    const t = tomados.get(id); if (!t) return 'libre';
    return t.v === v.id ? 'mio' : 'vendido';
  };
  let mapa;
  const refrescar = () => {
    mapa.pintar(estado); vaciar(chips);
    for (const id of [...sel].sort(porAsiento)) chips.append(h('span', { class: 'chip rojo' }, id));
    vaciar(progreso); progreso.append(`Actuales: ${v.asientos.join(', ')} · elige `, h('b', null, plural(p.cantidad, 'asiento nuevo', 'asientos nuevos')), ` (${sel.size}/${p.cantidad})`);
    btn.disabled = sel.size !== p.cantidad;
  };
  const w = ventana({ titulo: `Cambiar asientos · ${v.comprador} · ${p.evento_nombre}`, cuerpo: h('div', null, progreso, zona, chips, msg, h('div', { class: 'fila-botones' }, btn)) });
  mapa = crearMapa(zona, E.plano, (id) => {
    const t = tomados.get(id);
    if (t && t.v !== v.id) return toast(`El asiento ${id} no está disponible.`);
    if (sel.has(id)) sel.delete(id);
    else if (sel.size >= p.cantidad) return toast(`Solo ${plural(p.cantidad, 'asiento', 'asientos')}.`);
    else sel.add(id);
    refrescar();
  });
  mapa.irA(window.innerWidth < 760 ? 'alta_c' : 'todo'); refrescar();
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    const res = await api('/api/cambiar', { venta_id: v.id, asientos: [...sel] });
    if (!res.ok) { aviso(msg, 'error', res.j.error || 'No se pudo cambiar.'); btn.disabled = false; return; }
    w.cerrar(); toast('Asientos cambiados.'); cargarPanel();
  });
}

// --- nombres
function pintarNombres() {
  const c = $('#nombresGuardados'); vaciar(c);
  if (!E.nombres.length) { c.append(h('span', { style: 'color:var(--tenue);font-size:14px' }, 'Todavía no hay nombres guardados.')); return; }
  for (const n of E.nombres) c.append(h('span', { class: 'chip' }, n, h('button', { 'aria-label': 'Quitar ' + n, onclick: async () => { await api('/api/personas/eliminar', { nombre: n }); cargarPanel(); } }, '×')));
}
$('#btnGuardarNombres').addEventListener('click', async () => {
  const texto = $('#txtNombres').value; if (!texto.trim()) return;
  const r = await api('/api/personas', { nombres: texto });
  if (!r.ok) return aviso($('#avisoNombres'), 'error', r.j.error || 'No se pudo guardar.');
  aviso($('#avisoNombres'), 'ok', `Listo: ${plural(r.j.nuevos, 'nombre nuevo agregado', 'nombres nuevos agregados')}.`);
  $('#txtNombres').value = ''; cargarPanel();
});

// --- Excel y borrado de imágenes
$('#btnExcel').addEventListener('click', () => {
  if (typeof XLSX === 'undefined') return toast('No se cargó el generador de Excel.');
  const hoja1 = [['Evento', 'Código', 'Pagó', 'Entradas', 'Monto (₡)', 'Estado', 'Asignado a', 'Asientos', 'Referencia', 'Fecha comprobante', 'Banco', 'Origen', 'Cuenta destino verificada', 'Subido', 'Motivo']];
  const hoja2 = [['Evento', 'Asiento', 'Comprador', 'Código']];
  for (const p of E.pagos.slice().reverse()) {
    const v = p.venta && p.venta.estado === 'pagada' ? p.venta : null;
    hoja1.push([p.evento_nombre, p.codigo, p.nombre, p.cantidad, p.monto, p.estado === 'asignado' ? 'Asignado' : p.estado === 'rechazado' ? 'Rechazado' : 'Sin asignar',
      v ? v.comprador : '', v ? v.asientos.join(', ') : '', p.referencia, p.fecha || '', p.banco || '', p.origen === 'manual' ? 'A mano' : 'Comprobante', p.destino_ok ? 'Sí' : 'No', fechaHora(p.creado_en), p.motivo || '']);
    if (v) for (const a of v.asientos) hoja2.push([p.evento_nombre, a, v.comprador, p.codigo]);
  }
  const cab2 = hoja2.shift();
  hoja2.sort((a, b) => String(a[0]).localeCompare(String(b[0]), 'es') || String(a[1]).localeCompare(String(b[1]), 'es', { numeric: true }));
  hoja2.unshift(cab2);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(hoja1), 'Pagos');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(hoja2), 'Por asiento');
  XLSX.writeFile(wb, 'entradas-auditorio.xlsx');
});
$('#btnBorrarImg').addEventListener('click', async () => {
  const si = await preguntar({ titulo: 'Borrar comprobantes', texto: 'Se borran todas las imágenes de comprobantes. Los pagos y las ventas NO se tocan. No se puede deshacer.', boton: 'Borrar imágenes', peligro: true });
  if (!si) return;
  const r = await api('/api/borrar-comprobantes', {});
  toast(r.ok ? `Imágenes borradas: ${r.j.borrados}.` : (r.j.error || 'No se pudo borrar.')); cargarPanel();
});

// ---------- inicio ----------
ayudaNombre();
boot();
