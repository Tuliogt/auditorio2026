# Entradas · Espectáculo – Auditorio Nacional (JB Dance Academy)

App para que **Jose** venda las entradas: fondo negro, plano interactivo del auditorio, ₡11,000 por asiento.

## Dos eventos el mismo día
**Ballet** y **Espectáculo Íconos** usan el mismo plano de 663 asientos, pero **cada evento vende por separado**: el asiento B-14 puede venderse una vez en Ballet y una vez en Íconos, nunca dos veces en el mismo.
- El comprador **elige el evento** en `/pagar` (obligatorio) y su código queda atado a ese evento. Si quiere ir a los dos, paga y sube un comprobante por cada uno.
- Jose **elige el evento** arriba en la pantalla de venta (se recuerda el último). Un código de Ballet no sirve para vender asientos de Íconos.
- En **Pagos** filtra por evento; el Excel trae la columna *Evento*.
Es **independiente** de la app de vestuarios (otra carpeta, otro repositorio, otro despliegue, otra base de datos).

## Cómo funciona

Hay dos páginas. **Quien paga nunca toca los asientos; quien asigna los asientos nunca sube pagos.**

### Cada comprador: `/pagar` (pública)
1. Elige el **evento** y **cuántas entradas** paga: la página le muestra el total exacto.
2. Hace la **transferencia** a la cuenta de Jose (la página muestra IBAN, titular y banco, con botón de copiar, si están configurados).
3. Escribe **nombre y apellidos** y sube la **captura del comprobante**.
4. El sistema lee **referencia y monto**, verifica que la transferencia sea **a la cuenta de Jose** y que el **monto sea exactamente** entradas × precio del evento.
   Si la lectura falla puede escribir referencia y monto a mano (la captura sigue siendo obligatoria; queda marcado *a mano* para que Jose lo compare con su banco).
5. Recibe un **código único** (2 vocales + 3 dígitos, ej. `AE472`). Se lo da a Jose. También puede consultar su estado con el código.

### Jose: `/` (con usuario y clave)
0. Elige el **evento** (Ballet o Espectáculo Íconos).
1. Escribe el **nombre** del comprador (autocompleta con la lista; si no está, escribe uno nuevo).
2. Elige los **asientos** en el plano. Puede ver **Todos**, **Resaltar libres** o **Solo libres** (se recuerda la última vista).
3. Toca **Confirmar**: aparece el monto (asientos × ₡11,000) y el espacio para el **código de pago**.
4. Escribe el código y toca **Validar**: ve a nombre de quién está el pago, referencia, banco, fecha y el comprobante, con revisiones en verde/rojo
   (código sin usar, entradas pagadas = asientos elegidos, monto = asientos × precio, cuenta destino correcta) y **compara con su banco**.
5. **Asignar asientos y cerrar venta**. El código queda gastado.
6. En **Pagos**: lista *Sin asignar / Asignados / Rechazados*, ver comprobante, **rechazar** un pago que no aparece en el banco, **anular** una venta,
   **cambiar asientos** y descargar el Excel (incluye la lista por asiento para la puerta).

No existe “apartado”: un asiento está **libre o vendido**. Nada se bloquea mientras alguien decide.

## Cómo se evita vender un asiento dos veces

* **No lo decide la pantalla: lo decide la base de datos.** La tabla `venta_asientos` tiene el asiento como *clave primaria*: Postgres no permite que un asiento esté en dos ventas, ni aunque dos pantallas lo intenten en el mismo milisegundo. El que llega segundo recibe “ya no está disponible” y su código sigue sin usar.
* Los asientos vendidos **no se pueden seleccionar** (la pantalla se actualiza sola cada 4 segundos, y al vender la base vuelve a verificar).
* **Un código no se usa dos veces** y **un comprobante no se registra dos veces**: la referencia es única (se compara sin importar mayúsculas, espacios o guiones).
  Si una venta se anula o un pago se rechaza, su referencia y su código quedan **bloqueados para siempre**.
* Si el monto no cuadra, el pago se rechaza **sin gastar** la referencia, y vuelve a validar el monto contra los asientos al vender.

## Lo que el sistema NO puede garantizar
* Una captura **falsificada** con la cuenta, el monto y una referencia nueva pasa la lectura automática. **La verificación real es que Jose vea el depósito en su banco** (por eso la pantalla le muestra referencia y monto para comparar).
* Si un comprador se equivoca de cantidad, su pago se rechaza al subirlo: debe corregir las entradas (o pagar la diferencia en otra transferencia).

## Puesta en marcha

### 1. Supabase (proyecto nuevo)
1. Crea un proyecto **nuevo** (no uses el de vestuarios). Si ya tienes 2 en el plan gratis, pausa o elimina uno que no uses.
2. *SQL Editor* → pega **todo** `schema.sql` → *Run*. Se puede ejecutar varias veces sin problema. Carga los 663 asientos del plano.
3. *Storage* → *New bucket* → nombre `comprobantes-entradas` → **privado** (sin “Public bucket”).
4. *Project Settings → API*: copia la **URL** y la clave **secret** (`sb_secret_…`).

### 2. Variables (en Coolify) — ver `.env.example`
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_USUARIO`, `ADMIN_CLAVE`, `SESION_SECRETO`, `GOOGLE_VISION_API_KEY`,
`CUENTA_DESTINO`, `TITULAR_DESTINO`, `BANCO_DESTINO`, y opcionalmente `FECHA_BORRADO`.

> Si no pones `CUENTA_DESTINO` y `TITULAR_DESTINO`, la app **no valida a qué cuenta fue la transferencia** y la página de pago no mostrará la cuenta. Ponlos.

### 3. GitHub + Coolify
```bash
git init
git add .
git commit -m "Entradas Auditorio Nacional"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/entradas-auditorio.git
git push -u origin main
```
En Coolify: *New Resource → Public/Private Repository* → este repo → Build Pack **Dockerfile** → puerto **3000** →
dominio (ej. `https://entradas.tudominio.com`) → variables → *Deploy*.

## Actualizar desde la versión de un solo evento
1. Reemplaza los archivos del proyecto por los nuevos.
2. En Supabase → SQL Editor pega **todo** `schema.sql` y *Run*. Es seguro sobre la base ya existente: crea los eventos, pasa lo vendido hasta ahora a **Ballet** y no borra nada.
3. Reinicia el servidor y recarga la página con Ctrl+F5.

## Clave de Jose
Jose la cambia solo, desde la página: botón **Clave** (arriba, junto a *Salir*) → clave actual, clave nueva (mínimo 10 caracteres) y repetirla.
- La clave nueva se guarda **cifrada** (scrypt) en la base de datos y manda sobre la variable `ADMIN_CLAVE`, que queda como clave inicial.
- Al cambiarla se cierran todas las demás sesiones abiertas; la de quien la cambió sigue.
- **Si Jose la olvida:** en Supabase → SQL Editor ejecuta `delete from config where clave = 'admin_clave_hash';` y entra otra vez con la clave que tenga `ADMIN_CLAVE` en Coolify.
- Hay que ejecutar `schema.sql` de nuevo en Supabase para que exista esta función (es seguro repetirlo).

## Cambiar precio, nombres de eventos o máximo por venta
En Supabase → SQL Editor:
```sql
update eventos set precio = 12000 where id = 'iconos';            -- colones por asiento, por evento
update eventos set nombre = 'Ballet Clásico' where id = 'ballet'; -- nombre que se muestra
update config set valor = '20'    where clave = 'max_por_venta';  -- asientos por venta
```
(El máximo de la pantalla es 20; si lo subes, hay que ajustar el selector.)

## Pruebas
```bash
npm install              # solo para las pruebas (pg)
npm test                 # necesita un PostgreSQL local con schema.sql aplicado (ver test/db.test.mjs)
node src/parser.test.mjs # lector de comprobantes (BAC transferencia real, SINPE, BCR)
```
La batería incluye: ventas simultáneas peleando por los mismos asientos, el mismo código desde 10 pantallas, el mismo comprobante subido 15 veces a la vez, monto incorrecto,
rechazo, anulación, cambio de asientos y permisos (anon/authenticated no pueden leer ni ejecutar nada).

## Archivos
```
server.js            servidor (login, API, OCR); no decide disponibilidad, solo traduce a la base de datos
schema.sql           tablas + funciones + 663 asientos + permisos (pegar en Supabase)
public/              pantallas: index.html + app.js (Jose), pagar.html + pagar.js (compradores), styles.css, plano.json, logo
src/parser.js        lector de comprobantes (transferencias a cuenta, SINPE)
src/destino.js       ¿la transferencia fue a la cuenta de Jose?
tools/               cómo se generó el plano a partir de la imagen
test/                pruebas (base de datos, servidor, navegador)
```
