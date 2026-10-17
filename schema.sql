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


-- ---------- Asientos del plano (663) ----------
insert into asientos (id, fila, num, zona) values
  ('A-3','A',3,'alta'),
  ('A-4','A',4,'alta'),
  ('A-5','A',5,'alta'),
  ('A-6','A',6,'alta'),
  ('A-7','A',7,'alta'),
  ('A-8','A',8,'alta'),
  ('A-9','A',9,'alta'),
  ('A-10','A',10,'alta'),
  ('A-11','A',11,'alta'),
  ('A-12','A',12,'alta'),
  ('A-13','A',13,'alta'),
  ('A-14','A',14,'alta'),
  ('A-15','A',15,'alta'),
  ('A-16','A',16,'alta'),
  ('A-17','A',17,'alta'),
  ('A-18','A',18,'alta'),
  ('A-19','A',19,'alta'),
  ('A-20','A',20,'alta'),
  ('A-21','A',21,'alta'),
  ('A-22','A',22,'alta'),
  ('A-23','A',23,'alta'),
  ('A-24','A',24,'alta'),
  ('A-25','A',25,'alta'),
  ('A-26','A',26,'alta'),
  ('A-27','A',27,'alta'),
  ('A-28','A',28,'alta'),
  ('A-29','A',29,'alta'),
  ('B-1','B',1,'alta'),
  ('B-2','B',2,'alta'),
  ('B-3','B',3,'alta'),
  ('B-4','B',4,'alta'),
  ('B-5','B',5,'alta'),
  ('B-6','B',6,'alta'),
  ('B-7','B',7,'alta'),
  ('B-8','B',8,'alta'),
  ('B-9','B',9,'alta'),
  ('B-10','B',10,'alta'),
  ('B-11','B',11,'alta'),
  ('B-12','B',12,'alta'),
  ('B-13','B',13,'alta'),
  ('B-14','B',14,'alta'),
  ('B-15','B',15,'alta'),
  ('B-16','B',16,'alta'),
  ('B-17','B',17,'alta'),
  ('B-18','B',18,'alta'),
  ('B-19','B',19,'alta'),
  ('B-20','B',20,'alta'),
  ('B-21','B',21,'alta'),
  ('B-22','B',22,'alta'),
  ('B-23','B',23,'alta'),
  ('B-24','B',24,'alta'),
  ('B-25','B',25,'alta'),
  ('B-26','B',26,'alta'),
  ('B-27','B',27,'alta'),
  ('B-28','B',28,'alta'),
  ('B-29','B',29,'alta'),
  ('B-30','B',30,'alta'),
  ('B-31','B',31,'alta'),
  ('C-1','C',1,'alta'),
  ('C-2','C',2,'alta'),
  ('C-3','C',3,'alta'),
  ('C-4','C',4,'alta'),
  ('C-5','C',5,'alta'),
  ('C-6','C',6,'alta'),
  ('C-7','C',7,'alta'),
  ('C-8','C',8,'alta'),
  ('C-9','C',9,'alta'),
  ('C-10','C',10,'alta'),
  ('C-11','C',11,'alta'),
  ('C-12','C',12,'alta'),
  ('C-13','C',13,'alta'),
  ('C-14','C',14,'alta'),
  ('C-15','C',15,'alta'),
  ('C-16','C',16,'alta'),
  ('C-17','C',17,'alta'),
  ('C-18','C',18,'alta'),
  ('C-19','C',19,'alta'),
  ('C-20','C',20,'alta'),
  ('C-21','C',21,'alta'),
  ('C-22','C',22,'alta'),
  ('C-23','C',23,'alta'),
  ('C-24','C',24,'alta'),
  ('C-25','C',25,'alta'),
  ('C-26','C',26,'alta'),
  ('C-27','C',27,'alta'),
  ('C-28','C',28,'alta'),
  ('C-29','C',29,'alta'),
  ('C-30','C',30,'alta'),
  ('C-31','C',31,'alta'),
  ('D-1','D',1,'alta'),
  ('D-2','D',2,'alta'),
  ('D-3','D',3,'alta'),
  ('D-4','D',4,'alta'),
  ('D-5','D',5,'alta'),
  ('D-6','D',6,'alta'),
  ('D-7','D',7,'alta'),
  ('D-8','D',8,'alta'),
  ('D-9','D',9,'alta'),
  ('D-10','D',10,'alta'),
  ('D-11','D',11,'alta'),
  ('D-12','D',12,'alta'),
  ('D-13','D',13,'alta'),
  ('D-14','D',14,'alta'),
  ('D-15','D',15,'alta'),
  ('D-16','D',16,'alta'),
  ('D-17','D',17,'alta'),
  ('D-18','D',18,'alta'),
  ('D-19','D',19,'alta'),
  ('D-20','D',20,'alta'),
  ('D-21','D',21,'alta'),
  ('D-22','D',22,'alta'),
  ('D-23','D',23,'alta'),
  ('D-24','D',24,'alta'),
  ('D-25','D',25,'alta'),
  ('D-26','D',26,'alta'),
  ('D-27','D',27,'alta'),
  ('D-28','D',28,'alta'),
  ('D-29','D',29,'alta'),
  ('D-30','D',30,'alta'),
  ('D-31','D',31,'alta'),
  ('E-1','E',1,'alta'),
  ('E-2','E',2,'alta'),
  ('E-3','E',3,'alta'),
  ('E-4','E',4,'alta'),
  ('E-5','E',5,'alta'),
  ('E-6','E',6,'alta'),
  ('E-7','E',7,'alta'),
  ('E-8','E',8,'alta'),
  ('E-9','E',9,'alta'),
  ('E-10','E',10,'alta'),
  ('E-11','E',11,'alta'),
  ('E-12','E',12,'alta'),
  ('E-13','E',13,'alta'),
  ('E-14','E',14,'alta'),
  ('E-15','E',15,'alta'),
  ('E-16','E',16,'alta'),
  ('E-17','E',17,'alta'),
  ('E-18','E',18,'alta'),
  ('E-19','E',19,'alta'),
  ('E-20','E',20,'alta'),
  ('E-21','E',21,'alta'),
  ('E-22','E',22,'alta'),
  ('E-23','E',23,'alta'),
  ('E-24','E',24,'alta'),
  ('E-25','E',25,'alta'),
  ('E-26','E',26,'alta'),
  ('E-27','E',27,'alta'),
  ('E-28','E',28,'alta'),
  ('E-29','E',29,'alta'),
  ('E-30','E',30,'alta'),
  ('E-31','E',31,'alta'),
  ('F-1','F',1,'alta'),
  ('F-2','F',2,'alta'),
  ('F-3','F',3,'alta'),
  ('F-4','F',4,'alta'),
  ('F-5','F',5,'alta'),
  ('F-6','F',6,'alta'),
  ('F-7','F',7,'alta'),
  ('F-8','F',8,'alta'),
  ('F-9','F',9,'alta'),
  ('F-10','F',10,'alta'),
  ('F-11','F',11,'alta'),
  ('F-12','F',12,'alta'),
  ('F-13','F',13,'alta'),
  ('F-14','F',14,'alta'),
  ('F-15','F',15,'alta'),
  ('F-16','F',16,'alta'),
  ('F-17','F',17,'alta'),
  ('F-18','F',18,'alta'),
  ('F-19','F',19,'alta'),
  ('F-20','F',20,'alta'),
  ('F-21','F',21,'alta'),
  ('F-22','F',22,'alta'),
  ('F-23','F',23,'alta'),
  ('F-24','F',24,'alta'),
  ('F-25','F',25,'alta'),
  ('F-26','F',26,'alta'),
  ('F-27','F',27,'alta'),
  ('F-28','F',28,'alta'),
  ('F-29','F',29,'alta'),
  ('F-30','F',30,'alta'),
  ('F-31','F',31,'alta'),
  ('G-1','G',1,'alta'),
  ('G-2','G',2,'alta'),
  ('G-3','G',3,'alta'),
  ('G-4','G',4,'alta'),
  ('G-5','G',5,'alta'),
  ('G-6','G',6,'alta'),
  ('G-7','G',7,'alta'),
  ('G-8','G',8,'alta'),
  ('G-9','G',9,'alta'),
  ('G-10','G',10,'alta'),
  ('G-11','G',11,'alta'),
  ('G-12','G',12,'alta'),
  ('G-13','G',13,'alta'),
  ('G-14','G',14,'alta'),
  ('G-15','G',15,'alta'),
  ('G-16','G',16,'alta'),
  ('G-17','G',17,'alta'),
  ('G-18','G',18,'alta'),
  ('G-19','G',19,'alta'),
  ('G-20','G',20,'alta'),
  ('G-21','G',21,'alta'),
  ('G-22','G',22,'alta'),
  ('G-23','G',23,'alta'),
  ('G-24','G',24,'alta'),
  ('G-25','G',25,'alta'),
  ('G-26','G',26,'alta'),
  ('G-27','G',27,'alta'),
  ('G-28','G',28,'alta'),
  ('G-29','G',29,'alta'),
  ('G-30','G',30,'alta'),
  ('G-31','G',31,'alta'),
  ('H-1','H',1,'alta'),
  ('H-2','H',2,'alta'),
  ('H-3','H',3,'alta'),
  ('H-4','H',4,'alta'),
  ('H-5','H',5,'alta'),
  ('H-6','H',6,'alta'),
  ('H-7','H',7,'alta'),
  ('H-8','H',8,'alta'),
  ('H-9','H',9,'alta'),
  ('H-10','H',10,'alta'),
  ('H-11','H',11,'alta'),
  ('H-12','H',12,'alta'),
  ('H-13','H',13,'alta'),
  ('H-14','H',14,'alta'),
  ('H-15','H',15,'alta'),
  ('H-16','H',16,'alta'),
  ('H-17','H',17,'alta'),
  ('H-18','H',18,'alta'),
  ('H-19','H',19,'alta'),
  ('H-20','H',20,'alta'),
  ('H-21','H',21,'alta'),
  ('H-22','H',22,'alta'),
  ('H-23','H',23,'alta'),
  ('H-24','H',24,'alta'),
  ('H-25','H',25,'alta'),
  ('H-26','H',26,'alta'),
  ('H-27','H',27,'alta'),
  ('H-28','H',28,'alta'),
  ('H-29','H',29,'alta'),
  ('H-30','H',30,'alta'),
  ('H-31','H',31,'alta'),
  ('I-1','I',1,'alta'),
  ('I-2','I',2,'alta'),
  ('I-3','I',3,'alta'),
  ('I-4','I',4,'alta'),
  ('I-5','I',5,'alta'),
  ('I-6','I',6,'alta'),
  ('I-7','I',7,'alta'),
  ('I-8','I',8,'alta'),
  ('I-9','I',9,'alta'),
  ('I-10','I',10,'alta'),
  ('I-11','I',11,'alta'),
  ('I-12','I',12,'alta'),
  ('I-13','I',13,'alta'),
  ('I-14','I',14,'alta'),
  ('I-15','I',15,'alta'),
  ('I-16','I',16,'alta'),
  ('I-17','I',17,'alta'),
  ('I-18','I',18,'alta'),
  ('I-19','I',19,'alta'),
  ('I-20','I',20,'alta'),
  ('I-21','I',21,'alta'),
  ('I-22','I',22,'alta'),
  ('I-23','I',23,'alta'),
  ('I-24','I',24,'alta'),
  ('I-25','I',25,'alta'),
  ('I-26','I',26,'alta'),
  ('I-27','I',27,'alta'),
  ('I-28','I',28,'alta'),
  ('I-29','I',29,'alta'),
  ('I-30','I',30,'alta'),
  ('I-31','I',31,'alta'),
  ('J-1','J',1,'alta'),
  ('J-2','J',2,'alta'),
  ('J-3','J',3,'alta'),
  ('J-4','J',4,'alta'),
  ('J-5','J',5,'alta'),
  ('J-6','J',6,'alta'),
  ('J-7','J',7,'alta'),
  ('J-8','J',8,'alta'),
  ('J-9','J',9,'alta'),
  ('J-10','J',10,'alta'),
  ('J-11','J',11,'alta'),
  ('J-12','J',12,'alta'),
  ('J-13','J',13,'alta'),
  ('J-14','J',14,'alta'),
  ('J-15','J',15,'alta'),
  ('J-16','J',16,'alta'),
  ('J-17','J',17,'alta'),
  ('J-18','J',18,'alta'),
  ('J-19','J',19,'alta'),
  ('J-20','J',20,'alta'),
  ('J-21','J',21,'alta'),
  ('J-22','J',22,'alta'),
  ('J-23','J',23,'alta'),
  ('J-24','J',24,'alta'),
  ('J-25','J',25,'alta'),
  ('J-26','J',26,'alta'),
  ('J-27','J',27,'alta'),
  ('J-28','J',28,'alta'),
  ('J-29','J',29,'alta'),
  ('J-30','J',30,'alta'),
  ('J-31','J',31,'alta'),
  ('K-2','K',2,'alta'),
  ('K-3','K',3,'alta'),
  ('K-4','K',4,'alta'),
  ('K-5','K',5,'alta'),
  ('K-6','K',6,'alta'),
  ('K-7','K',7,'alta'),
  ('K-8','K',8,'alta'),
  ('K-9','K',9,'alta'),
  ('K-10','K',10,'alta'),
  ('K-11','K',11,'alta'),
  ('K-12','K',12,'alta'),
  ('K-13','K',13,'alta'),
  ('K-14','K',14,'alta'),
  ('K-15','K',15,'alta'),
  ('K-16','K',16,'alta'),
  ('K-17','K',17,'alta'),
  ('K-18','K',18,'alta'),
  ('K-19','K',19,'alta'),
  ('K-20','K',20,'alta'),
  ('K-21','K',21,'alta'),
  ('K-22','K',22,'alta'),
  ('K-23','K',23,'alta'),
  ('K-24','K',24,'alta'),
  ('K-25','K',25,'alta'),
  ('K-26','K',26,'alta'),
  ('K-27','K',27,'alta'),
  ('K-28','K',28,'alta'),
  ('K-29','K',29,'alta'),
  ('K-30','K',30,'alta'),
  ('L-2','L',2,'alta'),
  ('L-3','L',3,'alta'),
  ('L-4','L',4,'alta'),
  ('L-5','L',5,'alta'),
  ('L-6','L',6,'alta'),
  ('L-7','L',7,'alta'),
  ('L-8','L',8,'alta'),
  ('L-9','L',9,'alta'),
  ('L-10','L',10,'alta'),
  ('L-11','L',11,'alta'),
  ('L-12','L',12,'alta'),
  ('L-13','L',13,'alta'),
  ('L-14','L',14,'alta'),
  ('L-15','L',15,'alta'),
  ('L-16','L',16,'alta'),
  ('L-17','L',17,'alta'),
  ('L-18','L',18,'alta'),
  ('L-19','L',19,'alta'),
  ('L-20','L',20,'alta'),
  ('L-21','L',21,'alta'),
  ('L-22','L',22,'alta'),
  ('L-23','L',23,'alta'),
  ('L-24','L',24,'alta'),
  ('L-25','L',25,'alta'),
  ('L-26','L',26,'alta'),
  ('L-27','L',27,'alta'),
  ('L-28','L',28,'alta'),
  ('L-29','L',29,'alta'),
  ('L-30','L',30,'alta'),
  ('M-2','M',2,'alta'),
  ('M-3','M',3,'alta'),
  ('M-4','M',4,'alta'),
  ('M-5','M',5,'alta'),
  ('M-6','M',6,'alta'),
  ('M-7','M',7,'alta'),
  ('M-8','M',8,'alta'),
  ('M-9','M',9,'alta'),
  ('M-10','M',10,'alta'),
  ('M-11','M',11,'alta'),
  ('M-12','M',12,'alta'),
  ('M-13','M',13,'alta'),
  ('M-14','M',14,'alta'),
  ('M-15','M',15,'alta'),
  ('M-16','M',16,'alta'),
  ('M-17','M',17,'alta'),
  ('M-18','M',18,'alta'),
  ('M-19','M',19,'alta'),
  ('M-20','M',20,'alta'),
  ('M-21','M',21,'alta'),
  ('M-22','M',22,'alta'),
  ('M-23','M',23,'alta'),
  ('M-24','M',24,'alta'),
  ('M-25','M',25,'alta'),
  ('M-26','M',26,'alta'),
  ('M-27','M',27,'alta'),
  ('M-28','M',28,'alta'),
  ('M-29','M',29,'alta'),
  ('M-30','M',30,'alta'),
  ('N-2','N',2,'alta'),
  ('N-3','N',3,'alta'),
  ('N-4','N',4,'alta'),
  ('N-28','N',28,'alta'),
  ('N-29','N',29,'alta'),
  ('N-30','N',30,'alta'),
  ('AA-5','AA',5,'baja'),
  ('AA-6','AA',6,'baja'),
  ('AA-7','AA',7,'baja'),
  ('AA-8','AA',8,'baja'),
  ('AA-9','AA',9,'baja'),
  ('AA-10','AA',10,'baja'),
  ('AA-11','AA',11,'baja'),
  ('AA-12','AA',12,'baja'),
  ('AA-13','AA',13,'baja'),
  ('AA-14','AA',14,'baja'),
  ('AA-15','AA',15,'baja'),
  ('AA-16','AA',16,'baja'),
  ('AA-17','AA',17,'baja'),
  ('AA-18','AA',18,'baja'),
  ('AA-19','AA',19,'baja'),
  ('AA-20','AA',20,'baja'),
  ('AA-21','AA',21,'baja'),
  ('AA-22','AA',22,'baja'),
  ('AA-23','AA',23,'baja'),
  ('AA-24','AA',24,'baja'),
  ('AA-25','AA',25,'baja'),
  ('AA-26','AA',26,'baja'),
  ('AA-27','AA',27,'baja'),
  ('AA-28','AA',28,'baja'),
  ('AA-29','AA',29,'baja'),
  ('AA-30','AA',30,'baja'),
  ('BB-4','BB',4,'baja'),
  ('BB-5','BB',5,'baja'),
  ('BB-6','BB',6,'baja'),
  ('BB-7','BB',7,'baja'),
  ('BB-8','BB',8,'baja'),
  ('BB-9','BB',9,'baja'),
  ('BB-10','BB',10,'baja'),
  ('BB-11','BB',11,'baja'),
  ('BB-12','BB',12,'baja'),
  ('BB-13','BB',13,'baja'),
  ('BB-14','BB',14,'baja'),
  ('BB-15','BB',15,'baja'),
  ('BB-16','BB',16,'baja'),
  ('BB-17','BB',17,'baja'),
  ('BB-18','BB',18,'baja'),
  ('BB-19','BB',19,'baja'),
  ('BB-20','BB',20,'baja'),
  ('BB-21','BB',21,'baja'),
  ('BB-22','BB',22,'baja'),
  ('BB-23','BB',23,'baja'),
  ('BB-25','BB',25,'baja'),
  ('BB-26','BB',26,'baja'),
  ('BB-27','BB',27,'baja'),
  ('BB-28','BB',28,'baja'),
  ('BB-29','BB',29,'baja'),
  ('BB-30','BB',30,'baja'),
  ('BB-31','BB',31,'baja'),
  ('CC-2','CC',2,'baja'),
  ('CC-3','CC',3,'baja'),
  ('CC-4','CC',4,'baja'),
  ('CC-5','CC',5,'baja'),
  ('CC-6','CC',6,'baja'),
  ('CC-7','CC',7,'baja'),
  ('CC-8','CC',8,'baja'),
  ('CC-9','CC',9,'baja'),
  ('CC-10','CC',10,'baja'),
  ('CC-11','CC',11,'baja'),
  ('CC-12','CC',12,'baja'),
  ('CC-13','CC',13,'baja'),
  ('CC-14','CC',14,'baja'),
  ('CC-15','CC',15,'baja'),
  ('CC-16','CC',16,'baja'),
  ('CC-17','CC',17,'baja'),
  ('CC-18','CC',18,'baja'),
  ('CC-19','CC',19,'baja'),
  ('CC-20','CC',20,'baja'),
  ('CC-21','CC',21,'baja'),
  ('CC-22','CC',22,'baja'),
  ('CC-23','CC',23,'baja'),
  ('CC-25','CC',25,'baja'),
  ('CC-26','CC',26,'baja'),
  ('CC-27','CC',27,'baja'),
  ('CC-28','CC',28,'baja'),
  ('CC-29','CC',29,'baja'),
  ('CC-30','CC',30,'baja'),
  ('CC-31','CC',31,'baja'),
  ('CC-32','CC',32,'baja'),
  ('CC-33','CC',33,'baja'),
  ('DD-1','DD',1,'baja'),
  ('DD-2','DD',2,'baja'),
  ('DD-3','DD',3,'baja'),
  ('DD-4','DD',4,'baja'),
  ('DD-5','DD',5,'baja'),
  ('DD-6','DD',6,'baja'),
  ('DD-7','DD',7,'baja'),
  ('DD-8','DD',8,'baja'),
  ('DD-9','DD',9,'baja'),
  ('DD-10','DD',10,'baja'),
  ('DD-11','DD',11,'baja'),
  ('DD-12','DD',12,'baja'),
  ('DD-13','DD',13,'baja'),
  ('DD-14','DD',14,'baja'),
  ('DD-15','DD',15,'baja'),
  ('DD-16','DD',16,'baja'),
  ('DD-17','DD',17,'baja'),
  ('DD-18','DD',18,'baja'),
  ('DD-19','DD',19,'baja'),
  ('DD-20','DD',20,'baja'),
  ('DD-21','DD',21,'baja'),
  ('DD-22','DD',22,'baja'),
  ('DD-23','DD',23,'baja'),
  ('DD-25','DD',25,'baja'),
  ('DD-26','DD',26,'baja'),
  ('DD-27','DD',27,'baja'),
  ('DD-28','DD',28,'baja'),
  ('DD-29','DD',29,'baja'),
  ('DD-30','DD',30,'baja'),
  ('DD-31','DD',31,'baja'),
  ('DD-32','DD',32,'baja'),
  ('DD-33','DD',33,'baja'),
  ('DD-34','DD',34,'baja'),
  ('EE-1','EE',1,'baja'),
  ('EE-2','EE',2,'baja'),
  ('EE-3','EE',3,'baja'),
  ('EE-4','EE',4,'baja'),
  ('EE-5','EE',5,'baja'),
  ('EE-6','EE',6,'baja'),
  ('EE-7','EE',7,'baja'),
  ('EE-8','EE',8,'baja'),
  ('EE-9','EE',9,'baja'),
  ('EE-10','EE',10,'baja'),
  ('EE-11','EE',11,'baja'),
  ('EE-12','EE',12,'baja'),
  ('EE-13','EE',13,'baja'),
  ('EE-14','EE',14,'baja'),
  ('EE-15','EE',15,'baja'),
  ('EE-16','EE',16,'baja'),
  ('EE-17','EE',17,'baja'),
  ('EE-18','EE',18,'baja'),
  ('EE-19','EE',19,'baja'),
  ('EE-20','EE',20,'baja'),
  ('EE-21','EE',21,'baja'),
  ('EE-22','EE',22,'baja'),
  ('EE-23','EE',23,'baja'),
  ('EE-25','EE',25,'baja'),
  ('EE-26','EE',26,'baja'),
  ('EE-27','EE',27,'baja'),
  ('EE-28','EE',28,'baja'),
  ('EE-29','EE',29,'baja'),
  ('EE-30','EE',30,'baja'),
  ('EE-31','EE',31,'baja'),
  ('EE-32','EE',32,'baja'),
  ('EE-33','EE',33,'baja'),
  ('EE-34','EE',34,'baja'),
  ('FF-3','FF',3,'baja'),
  ('FF-4','FF',4,'baja'),
  ('FF-5','FF',5,'baja'),
  ('FF-6','FF',6,'baja'),
  ('FF-7','FF',7,'baja'),
  ('FF-8','FF',8,'baja'),
  ('FF-9','FF',9,'baja'),
  ('FF-13','FF',13,'baja'),
  ('FF-14','FF',14,'baja'),
  ('FF-15','FF',15,'baja'),
  ('FF-16','FF',16,'baja'),
  ('FF-17','FF',17,'baja'),
  ('FF-18','FF',18,'baja'),
  ('FF-19','FF',19,'baja'),
  ('FF-20','FF',20,'baja'),
  ('FF-21','FF',21,'baja'),
  ('FF-22','FF',22,'baja'),
  ('FF-27','FF',27,'baja'),
  ('FF-28','FF',28,'baja'),
  ('FF-29','FF',29,'baja'),
  ('FF-30','FF',30,'baja'),
  ('FF-31','FF',31,'baja'),
  ('FF-32','FF',32,'baja'),
  ('FF-33','FF',33,'baja'),
  ('GG-4','GG',4,'baja'),
  ('GG-5','GG',5,'baja'),
  ('GG-6','GG',6,'baja'),
  ('GG-7','GG',7,'baja'),
  ('GG-8','GG',8,'baja'),
  ('GG-9','GG',9,'baja'),
  ('GG-13','GG',13,'baja'),
  ('GG-14','GG',14,'baja'),
  ('GG-15','GG',15,'baja'),
  ('GG-16','GG',16,'baja'),
  ('GG-17','GG',17,'baja'),
  ('GG-18','GG',18,'baja'),
  ('GG-19','GG',19,'baja'),
  ('GG-20','GG',20,'baja'),
  ('GG-21','GG',21,'baja'),
  ('GG-22','GG',22,'baja'),
  ('GG-27','GG',27,'baja'),
  ('GG-28','GG',28,'baja'),
  ('GG-29','GG',29,'baja'),
  ('GG-30','GG',30,'baja'),
  ('GG-31','GG',31,'baja'),
  ('GG-32','GG',32,'baja'),
  ('HH-4','HH',4,'baja'),
  ('HH-5','HH',5,'baja'),
  ('HH-6','HH',6,'baja'),
  ('HH-7','HH',7,'baja'),
  ('HH-8','HH',8,'baja'),
  ('HH-14','HH',14,'baja'),
  ('HH-15','HH',15,'baja'),
  ('HH-16','HH',16,'baja'),
  ('HH-17','HH',17,'baja'),
  ('HH-18','HH',18,'baja'),
  ('HH-19','HH',19,'baja'),
  ('HH-20','HH',20,'baja'),
  ('HH-26','HH',26,'baja'),
  ('HH-27','HH',27,'baja'),
  ('HH-28','HH',28,'baja'),
  ('HH-29','HH',29,'baja'),
  ('HH-30','HH',30,'baja'),
  ('HH-31','HH',31,'baja'),
  ('II-4','II',4,'baja'),
  ('II-5','II',5,'baja'),
  ('II-6','II',6,'baja'),
  ('II-7','II',7,'baja'),
  ('II-8','II',8,'baja'),
  ('AAA-1','AAA',1,'lat-izq'),
  ('AAA-2','AAA',2,'lat-izq'),
  ('AAA-3','AAA',3,'lat-izq'),
  ('AAA-4','AAA',4,'lat-izq'),
  ('AAA-5','AAA',5,'lat-izq'),
  ('AAA-6','AAA',6,'lat-izq'),
  ('AAA-7','AAA',7,'lat-izq'),
  ('BBB-1','BBB',1,'lat-izq'),
  ('BBB-2','BBB',2,'lat-izq'),
  ('BBB-3','BBB',3,'lat-izq'),
  ('BBB-4','BBB',4,'lat-izq'),
  ('BBB-5','BBB',5,'lat-izq'),
  ('BBB-6','BBB',6,'lat-izq'),
  ('BBB-7','BBB',7,'lat-izq'),
  ('CCC-3','CCC',3,'lat-izq'),
  ('CCC-4','CCC',4,'lat-izq'),
  ('CCC-5','CCC',5,'lat-izq'),
  ('CCC-6','CCC',6,'lat-izq'),
  ('CCC-7','CCC',7,'lat-izq'),
  ('DDD-5','DDD',5,'lat-izq'),
  ('DDD-6','DDD',6,'lat-izq'),
  ('DDD-7','DDD',7,'lat-izq'),
  ('AA-31','AA',31,'lat-der'),
  ('AA-32','AA',32,'lat-der'),
  ('AA-33','AA',33,'lat-der'),
  ('AA-34','AA',34,'lat-der'),
  ('AA-35','AA',35,'lat-der'),
  ('AA-36','AA',36,'lat-der'),
  ('AA-37','AA',37,'lat-der'),
  ('BB-32','BB',32,'lat-der'),
  ('BB-33','BB',33,'lat-der'),
  ('BB-34','BB',34,'lat-der'),
  ('BB-35','BB',35,'lat-der'),
  ('BB-36','BB',36,'lat-der'),
  ('BB-37','BB',37,'lat-der'),
  ('BB-38','BB',38,'lat-der'),
  ('BB-39','BB',39,'lat-der'),
  ('CC-34','CC',34,'lat-der'),
  ('CC-35','CC',35,'lat-der'),
  ('CC-36','CC',36,'lat-der'),
  ('CC-37','CC',37,'lat-der'),
  ('CC-38','CC',38,'lat-der'),
  ('DD-35','DD',35,'lat-der'),
  ('DD-36','DD',36,'lat-der'),
  ('DD-37','DD',37,'lat-der')
on conflict (id) do nothing;

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
