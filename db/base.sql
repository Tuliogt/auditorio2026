-- ============================================================
--  ENTRADAS · Auditorio Nacional (JB Dance Academy)
--  Dos eventos el mismo día: Ballet y Espectáculo Íconos.
--  Pegar completo en Supabase → SQL Editor → Run.
--  Se puede ejecutar varias veces sin romper nada, y también sobre
--  la versión anterior (un solo evento): conserva lo que ya hay.
--
--  CÓMO FUNCIONA
--  1. Cada comprador elige el EVENTO, sube su comprobante de transferencia
--     y, si el monto coincide con (entradas × precio del evento), recibe un
--     CÓDIGO único (2 vocales + 3 dígitos).
--  2. Jose elige el evento y los asientos, escribe ese código y el sistema
--     valida que el pago sea de ESE evento y que el monto sea el de esos
--     asientos. Recién ahí el asiento se vende. Un asiento está libre o vendido.
--
--  REGLA DE ORO (anti-sobreventa):
--  venta_asientos tiene (evento, asiento) como PRIMARY KEY. Postgres NO
--  permite que un asiento esté en dos ventas DEL MISMO EVENTO, aunque dos
--  pantallas lo intenten en el mismo milisegundo. El mismo asiento sí
--  puede venderse una vez en cada evento (son funciones distintas).
-- ============================================================

-- ---------- Configuración ----------
create table if not exists config (
  clave text primary key,
  valor text not null
);
insert into config (clave, valor) values
  ('precio',        '11000'),   -- precio inicial de los eventos nuevos
  ('max_por_venta', '20')       -- máximo de asientos en una venta
on conflict (clave) do nothing;

create or replace function cfg_int(p_clave text) returns int
language sql stable set search_path = public as
$$ select valor::int from config where clave = p_clave $$;

-- ---------- Eventos ----------
create table if not exists eventos (
  id     text primary key check (id ~ '^[a-z0-9_-]{1,30}$'),
  nombre text not null check (length(nombre) between 2 and 80),
  precio int  not null check (precio > 0),   -- colones por asiento de ESTE evento
  orden  int  not null default 0
);
insert into eventos (id, nombre, precio, orden)
select v.id, v.nombre, cfg_int('precio'), v.orden
  from (values ('ballet', 'Ballet', 1), ('iconos', 'Espectáculo Íconos', 2)) as v(id, nombre, orden)
on conflict (id) do nothing;

-- ---------- Catálogo de asientos (los del plano) ----------
create table if not exists asientos (
  id   text primary key,           -- ej. 'A-3', 'AA-31', 'AAA-1'
  fila text not null,
  num  int  not null,
  zona text not null,
  unique (fila, num)
);

-- ---------- Pagos (los sube cada comprador) ----------
create table if not exists pagos (
  id                uuid primary key default gen_random_uuid(),
  evento_id         text references eventos (id),
  codigo            text not null,                 -- el código único que recibe el comprador
  nombre            text not null check (length(nombre) between 2 and 120),
  cantidad          int  not null check (cantidad > 0),
  monto             int  not null check (monto > 0),
  referencia        text not null,                 -- referencia de la transferencia, normalizada
  origen            text not null check (origen in ('comprobante','manual')),
  estado            text not null default 'pendiente' check (estado in ('pendiente','asignado','rechazado')),
  destino_ok        boolean not null default false, -- ¿el sistema comprobó que va a la cuenta correcta?
  banco             text,
  fecha_comprobante date,
  remitente         text,
  destino_cuenta    text,
  destino_titular   text,
  detalle           text,
  archivo           text,                          -- imagen en Storage (opcional)
  motivo            text,
  creado_en         timestamptz not null default now(),
  revisado_en       timestamptz
);
-- Un código de pago / una referencia NO se puede usar dos veces. Nunca (ni entre eventos).
create unique index if not exists pagos_referencia_unica on pagos (referencia);
create unique index if not exists pagos_codigo_unico on pagos (codigo);
create index if not exists pagos_estado_idx on pagos (estado);

-- ---------- Ventas (Jose asigna asientos a un pago) ----------
create table if not exists ventas (
  id               uuid primary key default gen_random_uuid(),
  evento_id        text references eventos (id),
  pago_id          uuid not null references pagos (id),
  comprador        text not null check (length(comprador) between 2 and 120),
  cantidad         int  not null check (cantidad > 0),
  precio_unitario  int  not null check (precio_unitario > 0),
  total            int  not null check (total > 0),
  estado           text not null check (estado in ('pagada','anulada')),
  creada_en        timestamptz not null default now(),
  anulada_en       timestamptz,
  motivo_anulacion text
);
-- Un pago, una venta.
create unique index if not exists ventas_pago_unica on ventas (pago_id);

-- Un asiento solo puede estar en UNA venta de cada evento. Esta es la garantía.
create table if not exists venta_asientos (
  evento_id text not null references eventos (id),
  asiento   text not null references asientos (id),
  venta_id  uuid not null references ventas (id) on delete cascade,
  primary key (evento_id, asiento)
);
create index if not exists venta_asientos_venta_idx on venta_asientos (venta_id);

-- ---------- Migración desde la versión de un solo evento ----------
-- Lo que ya existía se asigna al primer evento (Ballet). Si no hay datos, no hace nada.
alter table pagos  add column if not exists evento_id text references eventos (id);
alter table ventas add column if not exists evento_id text references eventos (id);
alter table venta_asientos add column if not exists evento_id text references eventos (id);
update pagos  set evento_id = (select id from eventos order by orden limit 1) where evento_id is null;
update ventas set evento_id = (select id from eventos order by orden limit 1) where evento_id is null;
update venta_asientos va set evento_id = v.evento_id from ventas v where v.id = va.venta_id and va.evento_id is null;
alter table pagos  alter column evento_id set not null;
alter table ventas alter column evento_id set not null;
alter table venta_asientos alter column evento_id set not null;
do $$
begin
  -- la llave primaria vieja era solo (asiento); la nueva es (evento, asiento)
  if not exists (select 1 from pg_index i join pg_class c on c.oid = i.indrelid
                  where c.relname = 'venta_asientos' and i.indisprimary and i.indnatts = 2) then
    alter table venta_asientos drop constraint if exists venta_asientos_pkey;
    alter table venta_asientos add primary key (evento_id, asiento);
  end if;
end $$;
create index if not exists pagos_evento_idx on pagos (evento_id);

-- ---------- Nombres para el autocompletado ----------
create table if not exists personas (
  nombre    text not null check (length(nombre) between 2 and 120),
  creada_en timestamptz not null default now()
);
create unique index if not exists personas_nombre_unico on personas (lower(nombre));

-- ============================================================
--  Funciones. Devuelven jsonb {ok:true,...} o {ok:false,error:'...'}
-- ============================================================

-- Firmas de la versión anterior (para que no queden duplicadas y confundan al servidor)
drop function if exists registrar_comprobante(text, int, int, text, text, boolean, date, text, text, text, text, text);
drop function if exists vender_asientos(text, text, text[]);
drop function if exists mapa_asientos();
drop function if exists resumen();

-- Código del comprador: 2 vocales + 3 dígitos (ej. AE472).
create or replace function generar_codigo() returns text
language plpgsql set search_path = public as $$
declare c text; v text := 'AEIOU'; i int := 0;
begin
  loop
    c := substr(v, 1 + floor(random()*5)::int, 1) || substr(v, 1 + floor(random()*5)::int, 1)
         || lpad(floor(random()*1000)::int::text, 3, '0');
    exit when not exists (select 1 from pagos where codigo = c);
    i := i + 1;
    if i > 200 then raise exception 'sin_codigos_libres'; end if;
  end loop;
  return c;
end $$;

create or replace function info_publica() returns jsonb
language sql stable set search_path = public as
$$ select jsonb_build_object(
     'max_por_venta', cfg_int('max_por_venta'),
     'eventos', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'nombre', nombre, 'precio', precio) order by orden, id) from eventos), '[]'::jsonb)) $$;

-- 1) El comprador registra su pago. Valida evento, monto contra cantidad y que la referencia sea nueva.
create or replace function registrar_comprobante(
  p_evento text, p_nombre text, p_cantidad int, p_monto int, p_referencia text, p_origen text,
  p_destino_ok boolean default false, p_fecha date default null, p_remitente text default null,
  p_cuenta text default null, p_titular text default null, p_banco text default null, p_detalle text default null
) returns jsonb
language plpgsql set search_path = public as $$
declare
  v_nombre text := trim(regexp_replace(coalesce(p_nombre, ''), '\s+', ' ', 'g'));
  v_ref    text := upper(regexp_replace(coalesce(p_referencia, ''), '[^A-Za-z0-9]', '', 'g'));
  ev       eventos%rowtype;
  v_max    int  := cfg_int('max_por_venta');
  v_cod    text;
  v_const  text;
  v_id     uuid;
  i        int;
begin
  select * into ev from eventos where id = p_evento;
  if not found then return jsonb_build_object('ok', false, 'error', 'evento_invalido'); end if;
  if length(v_nombre) < 2 or length(v_nombre) > 120 then return jsonb_build_object('ok', false, 'error', 'nombre'); end if;
  if p_cantidad is null or p_cantidad < 1 or p_cantidad > v_max then
    return jsonb_build_object('ok', false, 'error', 'cantidad', 'maximo', v_max);
  end if;
  if length(v_ref) < 6 or length(v_ref) > 60 then return jsonb_build_object('ok', false, 'error', 'referencia_invalida'); end if;
  if p_origen not in ('comprobante', 'manual') then return jsonb_build_object('ok', false, 'error', 'origen'); end if;

  -- Monto contra cantidad de entradas × precio DEL EVENTO. Se revisa ANTES de gastar la referencia.
  if p_monto is distinct from p_cantidad * ev.precio then
    return jsonb_build_object('ok', false, 'error', 'monto', 'esperado', p_cantidad * ev.precio,
                              'recibido', p_monto, 'cantidad', p_cantidad, 'precio', ev.precio, 'evento', ev.nombre);
  end if;

  for i in 1..8 loop
    v_cod := generar_codigo();
    begin
      insert into pagos (evento_id, codigo, nombre, cantidad, monto, referencia, origen, destino_ok, banco,
                         fecha_comprobante, remitente, destino_cuenta, destino_titular, detalle)
      values (ev.id, v_cod, v_nombre, p_cantidad, p_monto, v_ref, p_origen, coalesce(p_destino_ok, false), p_banco,
              p_fecha, p_remitente, p_cuenta, p_titular, p_detalle)
      returning id into v_id;
      exit;
    exception when unique_violation then
      get stacked diagnostics v_const = constraint_name;
      if v_const = 'pagos_referencia_unica' then
        return jsonb_build_object('ok', false, 'error', 'referencia_repetida');
      end if;
      v_id := null;      -- chocó el código del comprador: se genera otro
    end;
  end loop;
  if v_id is null then return jsonb_build_object('ok', false, 'error', 'reintentar'); end if;

  return jsonb_build_object('ok', true, 'pago_id', v_id, 'codigo', v_cod, 'nombre', v_nombre,
                            'cantidad', p_cantidad, 'monto', p_monto, 'evento', ev.id, 'evento_nombre', ev.nombre);
end $$;

-- 2) Datos completos de un código (para Jose).
create or replace function buscar_pago(p_codigo text) returns jsonb
language plpgsql set search_path = public as $$
declare p pagos%rowtype; v ventas%rowtype; ev eventos%rowtype;
begin
  select * into p from pagos where codigo = upper(trim(coalesce(p_codigo, '')));
  if not found then return jsonb_build_object('ok', false, 'error', 'codigo_no_existe'); end if;
  select * into ev from eventos where id = p.evento_id;
  select * into v from ventas where pago_id = p.id and estado = 'pagada';
  return jsonb_build_object('ok', true,
    'pago', jsonb_build_object('id', p.id, 'codigo', p.codigo, 'nombre', p.nombre, 'cantidad', p.cantidad,
      'evento', ev.id, 'evento_nombre', ev.nombre,
      'monto', p.monto, 'referencia', p.referencia, 'origen', p.origen, 'estado', p.estado,
      'destino_ok', p.destino_ok, 'banco', p.banco, 'fecha', p.fecha_comprobante, 'remitente', p.remitente,
      'destino_cuenta', p.destino_cuenta, 'destino_titular', p.destino_titular, 'detalle', p.detalle,
      'archivo', p.archivo, 'motivo', p.motivo, 'creado_en', p.creado_en),
    'venta', case when v.id is null then null else jsonb_build_object('id', v.id, 'comprador', v.comprador,
      'total', v.total, 'asientos', (select to_jsonb(array_agg(asiento order by asiento)) from venta_asientos where venta_id = v.id)) end);
end $$;

-- 3) Consulta pública del comprador: solo lo mínimo.
create or replace function consultar_codigo(p_codigo text) returns jsonb
language plpgsql set search_path = public as $$
declare p pagos%rowtype; ev eventos%rowtype;
begin
  select * into p from pagos where codigo = upper(trim(coalesce(p_codigo, '')));
  if not found then return jsonb_build_object('ok', false, 'error', 'codigo_no_existe'); end if;
  select * into ev from eventos where id = p.evento_id;
  return jsonb_build_object('ok', true, 'nombre', p.nombre, 'cantidad', p.cantidad, 'monto', p.monto,
    'evento', ev.id, 'evento_nombre', ev.nombre,
    'estado', p.estado, 'creado_en', p.creado_en,
    'asientos', case when p.estado = 'asignado' then
       (select to_jsonb(array_agg(va.asiento order by va.asiento)) from ventas v join venta_asientos va on va.venta_id = v.id
         where v.pago_id = p.id and v.estado = 'pagada') else null end);
end $$;

-- 4) Jose asigna asientos de UN evento a un código. Todo o nada.
--    Valida: el código existe y no se usó, es de ESTE evento, la cantidad de asientos y el MONTO pagado.
create or replace function vender_asientos(p_evento text, p_codigo text, p_comprador text, p_asientos text[]) returns jsonb
language plpgsql set search_path = public as $$
declare
  v_nombre text := trim(regexp_replace(coalesce(p_comprador, ''), '\s+', ' ', 'g'));
  v_max    int := cfg_int('max_por_venta');
  v_precio int;
  v_ids    text[]; v_malos text[]; v_ocup text[];
  n int; k int;
  ev eventos%rowtype; evp eventos%rowtype;
  p pagos%rowtype; vv ventas%rowtype;
  v_venta uuid;
begin
  select * into ev from eventos where id = p_evento;
  if not found then return jsonb_build_object('ok', false, 'error', 'evento_invalido'); end if;
  if length(v_nombre) < 2 or length(v_nombre) > 120 then return jsonb_build_object('ok', false, 'error', 'nombre'); end if;

  select array_agg(a order by a) into v_ids
    from (select distinct upper(trim(x)) a from unnest(coalesce(p_asientos, '{}')) x) s where a <> '';
  n := coalesce(cardinality(v_ids), 0);
  if n = 0 then return jsonb_build_object('ok', false, 'error', 'sin_asientos'); end if;
  if n > v_max then return jsonb_build_object('ok', false, 'error', 'demasiados', 'maximo', v_max); end if;

  select array_agg(a order by a) into v_malos from unnest(v_ids) a where not exists (select 1 from asientos s where s.id = a);
  if v_malos is not null then
    return jsonb_build_object('ok', false, 'error', 'asiento_invalido', 'asientos', to_jsonb(v_malos));
  end if;

  select * into p from pagos where codigo = upper(trim(coalesce(p_codigo, ''))) for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'codigo_no_existe'); end if;
  if p.estado = 'asignado' then
    select * into vv from ventas where pago_id = p.id and estado = 'pagada';
    return jsonb_build_object('ok', false, 'error', 'codigo_usado', 'comprador', vv.comprador,
      'asientos', (select to_jsonb(array_agg(asiento order by asiento)) from venta_asientos where venta_id = vv.id));
  end if;
  if p.estado = 'rechazado' then return jsonb_build_object('ok', false, 'error', 'pago_rechazado', 'motivo', p.motivo); end if;

  -- El pago es de un evento; las entradas no se pueden vender en el otro.
  if p.evento_id <> ev.id then
    select * into evp from eventos where id = p.evento_id;
    return jsonb_build_object('ok', false, 'error', 'evento_distinto', 'evento_pago', evp.nombre, 'evento', ev.nombre);
  end if;

  if n <> p.cantidad then
    return jsonb_build_object('ok', false, 'error', 'cantidad', 'esperado', p.cantidad, 'recibido', n);
  end if;
  -- El monto pagado contra la cantidad de asientos × precio del evento
  v_precio := ev.precio;
  if p.monto <> n * v_precio then
    return jsonb_build_object('ok', false, 'error', 'monto', 'esperado', n * v_precio, 'recibido', p.monto,
                              'cantidad', n, 'precio', v_precio);
  end if;

  begin
    insert into ventas (evento_id, pago_id, comprador, cantidad, precio_unitario, total, estado)
    values (ev.id, p.id, v_nombre, n, v_precio, n * v_precio, 'pagada') returning id into v_venta;

    -- En orden, para que dos ventas simultáneas no se bloqueen entre sí.
    insert into venta_asientos (evento_id, asiento, venta_id)
    select ev.id, a, v_venta from unnest(v_ids) a order by a on conflict (evento_id, asiento) do nothing;

    select count(*) into k from venta_asientos where venta_id = v_venta;
    if k < n then raise exception 'ocupados'; end if;

    update pagos set estado = 'asignado', revisado_en = now() where id = p.id;
  exception
    when raise_exception or deadlock_detected then
      select array_agg(asiento order by asiento) into v_ocup from venta_asientos where evento_id = ev.id and asiento = any (v_ids);
      return jsonb_build_object('ok', false, 'error', 'ocupados', 'asientos', to_jsonb(coalesce(v_ocup, '{}')));
  end;

  insert into personas (nombre) values (v_nombre) on conflict do nothing;
  return jsonb_build_object('ok', true, 'venta_id', v_venta, 'codigo', p.codigo, 'comprador', v_nombre,
    'evento', ev.id, 'evento_nombre', ev.nombre,
    'asientos', to_jsonb(v_ids), 'cantidad', n, 'total', n * v_precio);
end $$;

-- 5) Rechazar un pago que todavía no se asignó (no aparece en el banco, etc.). La referencia queda quemada.
create or replace function rechazar_pago(p_pago uuid, p_motivo text default null) returns jsonb
language plpgsql set search_path = public as $$
begin
  update pagos set estado = 'rechazado', motivo = left(coalesce(p_motivo, ''), 300), revisado_en = now()
   where id = p_pago and estado = 'pendiente';
  if not found then return jsonb_build_object('ok', false, 'error', 'no_rechazable'); end if;
  return jsonb_build_object('ok', true);
end $$;

-- 6) Anular una venta: libera los asientos. El código de pago queda "quemado" para siempre.
create or replace function anular_venta(p_venta uuid, p_motivo text default null) returns jsonb
language plpgsql set search_path = public as $$
declare v ventas%rowtype;
begin
  select * into v from ventas where id = p_venta for update;
  if not found or v.estado <> 'pagada' then return jsonb_build_object('ok', false, 'error', 'no_anulable'); end if;
  update ventas set estado = 'anulada', anulada_en = now(), motivo_anulacion = left(coalesce(p_motivo, ''), 300) where id = v.id;
  delete from venta_asientos where venta_id = v.id;
  update pagos set estado = 'rechazado', motivo = left(coalesce(p_motivo, 'Venta anulada'), 300), revisado_en = now() where id = v.pago_id;
  return jsonb_build_object('ok', true);
end $$;

-- 7) Cambiar los asientos de una venta (misma cantidad, mismo evento). Todo o nada.
create or replace function cambiar_asientos(p_venta uuid, p_asientos text[]) returns jsonb
language plpgsql set search_path = public as $$
declare v ventas%rowtype; v_ids text[]; v_malos text[]; v_ocup text[]; k int;
begin
  select * into v from ventas where id = p_venta for update;
  if not found or v.estado <> 'pagada' then return jsonb_build_object('ok', false, 'error', 'no_modificable'); end if;
  select array_agg(a order by a) into v_ids
    from (select distinct upper(trim(x)) a from unnest(coalesce(p_asientos, '{}')) x) s where a <> '';
  if coalesce(cardinality(v_ids), 0) <> v.cantidad then
    return jsonb_build_object('ok', false, 'error', 'cantidad', 'esperado', v.cantidad, 'recibido', coalesce(cardinality(v_ids), 0));
  end if;
  select array_agg(a order by a) into v_malos from unnest(v_ids) a where not exists (select 1 from asientos s where s.id = a);
  if v_malos is not null then return jsonb_build_object('ok', false, 'error', 'asiento_invalido', 'asientos', to_jsonb(v_malos)); end if;
  begin
    delete from venta_asientos where venta_id = v.id;
    insert into venta_asientos (evento_id, asiento, venta_id) select v.evento_id, a, v.id from unnest(v_ids) a order by a
      on conflict (evento_id, asiento) do nothing;
    select count(*) into k from venta_asientos where venta_id = v.id;
    if k < v.cantidad then raise exception 'ocupados'; end if;
  exception
    when raise_exception or deadlock_detected then
      select array_agg(asiento order by asiento) into v_ocup from venta_asientos
       where evento_id = v.evento_id and asiento = any (v_ids) and venta_id <> v.id;
      return jsonb_build_object('ok', false, 'error', 'ocupados', 'asientos', to_jsonb(coalesce(v_ocup, '{}')));
  end;
  return jsonb_build_object('ok', true, 'asientos', to_jsonb(v_ids));
end $$;

-- 8) Mapa de UN evento: asientos vendidos.
create or replace function mapa_asientos(p_evento text) returns jsonb
language plpgsql stable set search_path = public as $$
declare ev eventos%rowtype;
begin
  select * into ev from eventos where id = p_evento;
  if not found then return jsonb_build_object('ok', false, 'error', 'evento_invalido'); end if;
  return jsonb_build_object('ok', true, 'evento', ev.id, 'evento_nombre', ev.nombre, 'precio', ev.precio,
     'tomados', coalesce((select jsonb_agg(jsonb_build_object('a', asiento, 'v', venta_id)) from venta_asientos where evento_id = ev.id), '[]'::jsonb));
end $$;

-- 9) Listado de pagos para el panel (con su venta, si ya se asignó).
create or replace function listar_pagos() returns jsonb
language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(x order by (x->>'creado_en') desc), '[]'::jsonb) from (
    select jsonb_build_object(
      'id', p.id, 'codigo', p.codigo, 'nombre', p.nombre, 'cantidad', p.cantidad, 'monto', p.monto,
      'evento', p.evento_id, 'evento_nombre', (select nombre from eventos where id = p.evento_id),
      'referencia', p.referencia, 'origen', p.origen, 'estado', p.estado, 'destino_ok', p.destino_ok,
      'banco', p.banco, 'fecha', p.fecha_comprobante, 'remitente', p.remitente,
      'destino_cuenta', p.destino_cuenta, 'destino_titular', p.destino_titular, 'detalle', p.detalle,
      'archivo', p.archivo, 'motivo', p.motivo, 'creado_en', p.creado_en, 'revisado_en', p.revisado_en,
      'venta', (select jsonb_build_object('id', v.id, 'comprador', v.comprador, 'estado', v.estado, 'motivo', v.motivo_anulacion,
                  'asientos', coalesce((select to_jsonb(array_agg(asiento order by asiento)) from venta_asientos where venta_id = v.id), '[]'::jsonb))
                from ventas v where v.pago_id = p.id order by v.creada_en desc limit 1)
    ) x from pagos p) t
$$;

-- 10) Resumen del panel. Sin evento: suma de todos. Con evento: solo ese.
create or replace function resumen(p_evento text default null) returns jsonb
language plpgsql stable set search_path = public as $$
declare v_total int; v_vend int; v_eventos int;
begin
  if p_evento is not null and not exists (select 1 from eventos where id = p_evento) then
    return jsonb_build_object('ok', false, 'error', 'evento_invalido');
  end if;
  select count(*) into v_eventos from eventos where p_evento is null or id = p_evento;
  select count(*) * v_eventos into v_total from asientos;
  select count(*) into v_vend from venta_asientos where p_evento is null or evento_id = p_evento;
  return jsonb_build_object(
    'ok', true, 'evento', p_evento, 'total', v_total, 'vendidos', v_vend, 'libres', v_total - v_vend,
    'recaudado', coalesce((select sum(total) from ventas where estado = 'pagada' and (p_evento is null or evento_id = p_evento)), 0),
    'ventas', (select count(*) from ventas where estado = 'pagada' and (p_evento is null or evento_id = p_evento)),
    'pendientes', (select count(*) from pagos where estado = 'pendiente' and (p_evento is null or evento_id = p_evento)),
    'pendientes_monto', coalesce((select sum(monto) from pagos where estado = 'pendiente' and (p_evento is null or evento_id = p_evento)), 0),
    'rechazados', (select count(*) from pagos where estado = 'rechazado' and (p_evento is null or evento_id = p_evento)));
end $$;

-- 11) Nombres para el autocompletado: la lista cargada + quienes ya subieron un pago sin asignar.
create or replace function listar_personas() returns jsonb
language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(n order by lower(n)), '[]'::jsonb) from (
    select distinct on (lower(nombre)) nombre n from (
      select nombre from personas
      union all
      select nombre from pagos where estado = 'pendiente') u
    order by lower(nombre), nombre) d
$$;

create or replace function guardar_personas(p_nombres text[]) returns jsonb
language plpgsql set search_path = public as $$
declare n int;
begin
  with nuevos as (
    insert into personas (nombre)
    select distinct on (lower(t)) t
      from (select trim(regexp_replace(x, '\s+', ' ', 'g')) t from unnest(coalesce(p_nombres, '{}')) x) s
     where length(t) between 2 and 120
    on conflict do nothing returning 1)
  select count(*) into n from nuevos;
  return jsonb_build_object('ok', true, 'nuevos', n);
end $$;

create or replace function eliminar_persona(p_nombre text) returns jsonb
language plpgsql set search_path = public as $$
begin
  delete from personas where lower(nombre) = lower(trim(p_nombre));
  return jsonb_build_object('ok', true);
end $$;

-- 12) Imagen del comprobante (en Storage; aquí solo el nombre del archivo).
create or replace function adjuntar_comprobante(p_pago uuid, p_archivo text) returns jsonb
language plpgsql set search_path = public as $$
begin
  update pagos set archivo = left(p_archivo, 120) where id = p_pago;
  return jsonb_build_object('ok', found);
end $$;

create or replace function quitar_comprobantes() returns jsonb
language plpgsql set search_path = public as $$
declare n int;
begin
  update pagos set archivo = null where archivo is not null;
  get diagnostics n = row_count;
  return jsonb_build_object('ok', true, 'limpiados', n);
end $$;

-- ============================================================
--  Seguridad: nada es público. Solo el servidor (service_role) entra.
-- ============================================================
alter table config         enable row level security;
alter table eventos        enable row level security;
alter table asientos       enable row level security;
alter table pagos          enable row level security;
alter table ventas         enable row level security;
alter table venta_asientos enable row level security;
alter table personas       enable row level security;

revoke all on config, eventos, asientos, pagos, ventas, venta_asientos, personas from anon, authenticated;
grant select, insert, update, delete on config, eventos, asientos, pagos, ventas, venta_asientos, personas to service_role;

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as firma
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('cfg_int','generar_codigo','info_publica','registrar_comprobante','buscar_pago','consultar_codigo',
                         'vender_asientos','rechazar_pago','anular_venta','cambiar_asientos','mapa_asientos','listar_pagos',
                         'resumen','listar_personas','guardar_personas','eliminar_persona','adjuntar_comprobante','quitar_comprobantes')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.firma);
    execute format('grant execute on function %s to service_role', f.firma);
  end loop;
end $$;
