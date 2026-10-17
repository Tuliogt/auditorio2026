# Prueba en navegador real (Chromium) de las dos pantallas, en escritorio y celular.
#   node test/demo-servidor.mjs &   (levanta app + Postgres de pruebas + Vision simulado)
#   python3 test/navegador.py
import sys, urllib.request
from playwright.sync_api import sync_playwright
BASE='http://127.0.0.1:4010'; OUT='test/capturas/'; IMG='test/capturas/comprobante-bac.jpg'
def texto(monto, ref):
    t=f"""BAC
Notificación de transferencia
Hola,
Le informamos que MARCO TULIO AVILA
BARRERA realizó una transferencia a la
cuenta bancaria Nº CR 1101 0200 0096
0658 1855 a nombre de JOSE RAFAEL
BOLAÑOS MORA.
Fecha
Hora
Monto
Detalle
Referencia
30 septiembre 2026
10:26 AM
₡{monto:,}.00
Entradas show
{ref}"""
    urllib.request.urlopen(urllib.request.Request('http://127.0.0.1:4011/__texto',data=t.encode(),method='POST'))
errores=[]
def vigilar(pg,nombre):
    pg.on('console',lambda m: errores.append((nombre,m.type,m.text)) if m.type in('error','warning') else None)
    pg.on('pageerror',lambda e: errores.append((nombre,'pageerror',str(e))))
with sync_playwright() as p:
    b=p.chromium.launch()
    for nombre,vp,movil in (('desk',{'width':1366,'height':900},False),('movil',{'width':390,'height':844},True)):
        ctx=b.new_context(viewport=vp,is_mobile=movil,has_touch=movil,device_scale_factor=2 if movil else 1)
        # ===== 1. COMPRADOR (público, sin login) =====
        EV=('ballet','Ballet') if not movil else ('iconos','Espectáculo Íconos')   # cada pantalla prueba un evento distinto
        if not movil:
            # sin cuenta configurada NO debe salir ningún aviso rojo
            sc=ctx.new_page(); sc.route('**/api/info',lambda r: r.fulfill(status=200,content_type='application/json',body='{"max_por_venta":20,"eventos":[{"id":"ballet","nombre":"Ballet","precio":11000},{"id":"iconos","nombre":"Espectáculo Íconos","precio":11000}],"cuenta":null,"titular":null,"banco":null}'))
            sc.goto(BASE+'/pagar'); sc.wait_for_selector('#listaEventos .evento-op')
            assert 'Todavía no hay una cuenta' not in sc.inner_text('body'), 'el aviso rojo debe haber desaparecido'
            assert sc.locator('#datosCuenta .aviso').count()==0
            sc.close()
        pub=ctx.new_page(); vigilar(pub,nombre+'-pub')
        pub.goto(BASE+'/pagar'); pub.wait_for_selector('#datosCuenta .valor')
        assert 'Todavía no hay una cuenta' not in pub.inner_text('body')
        assert pub.locator('#listaEventos .evento-op').count()==2
        assert [t.lower() for t in pub.locator('#listaEventos .ev-nombre').all_inner_texts()]==['ballet','espectáculo íconos']
        assert 'BOLAÑOS' in pub.inner_text('#datosCuenta').upper(), 'debe mostrar el titular'
        pub.screenshot(path=OUT+f'{nombre}-A1-pagar.png',full_page=True)
        assert pub.locator('#btnEnviar').is_disabled()
        pub.fill('#inNombre','Ana Mora Solís'); pub.click('#btnMas')
        assert pub.inner_text('#txtTotal')=='Elige el evento', pub.inner_text('#txtTotal')
        pub.set_input_files('#inArchivo',IMG); pub.wait_for_selector('#vistaPrevia:not([hidden])')
        assert pub.locator('#btnEnviar').is_disabled(), 'sin evento elegido no se puede enviar'
        pub.click(f'#listaEventos .evento-op[data-evento="{EV[0]}"]')
        assert pub.inner_text('#txtTotal')=='₡22,000', pub.inner_text('#txtTotal')
        assert not pub.locator('#btnEnviar').is_disabled()
        pub.screenshot(path=OUT+f'{nombre}-A2-pagar-lleno.png',full_page=True)
        # primero un monto que NO cuadra: debe rechazar y avisar
        texto(11000,'406484'+('461' if not movil else '462'))
        pub.click('#btnEnviar'); pub.wait_for_selector('#avisoForm .aviso.error')
        assert '22,000' in pub.inner_text('#avisoForm'), pub.inner_text('#avisoForm')
        pub.screenshot(path=OUT+f'{nombre}-A3-pagar-error.png',full_page=True)
        texto(22000,'406484'+('461' if not movil else '462'))
        pub.click('#btnEnviar'); pub.wait_for_selector('#vListo:not([hidden])')
        codigo=pub.inner_text('#exCodigo'); assert len(codigo)==5, codigo
        assert EV[1].lower() in pub.inner_text('#exEvento').lower(), pub.inner_text('#exEvento')
        pub.screenshot(path=OUT+f'{nombre}-A4-codigo.png',full_page=True)
        print(nombre,'código del comprador:',codigo)
        # consulta pública
        pub.click('#btnOtro'); pub.fill('#inCodigo',codigo); pub.click('#btnConsultar'); pub.wait_for_selector('.consulta-res')
        assert 'pendiente' in pub.inner_text('.consulta-res').lower()
        assert EV[1].lower() in pub.inner_text('.consulta-res').lower()
        assert pub.locator('#listaEventos .evento-op.on').count()==0, 'tras "Pagar otras entradas" hay que volver a elegir evento'
        pub.screenshot(path=OUT+f'{nombre}-A5-consulta.png',full_page=True)
        # nada de Jose es accesible desde la página pública
        r=pub.evaluate("fetch('/api/pagos').then(r=>r.status)"); assert r==401, r
        r=pub.evaluate("fetch('/api/mapa').then(r=>r.status)"); assert r==401, r
        pub.close()

        # ===== 2. JOSE =====
        pg=ctx.new_page(); vigilar(pg,nombre+'-jose')
        pg.goto(BASE); pg.wait_for_selector('#formLogin')
        pg.screenshot(path=OUT+f'{nombre}-B1-login.png')
        pg.fill('#loginUsuario','jose'); pg.fill('#loginClave','mala'); pg.click('#btnEntrar'); pg.wait_for_selector('#loginError .aviso')
        pg.fill('#loginClave','clave-de-jose'); pg.click('#btnEntrar'); pg.wait_for_selector('#vVender:not([hidden])')
        pg.wait_for_timeout(600)
        assert 'apartado' not in pg.inner_text('body').lower(), 'no debe existir "apartado"'
        assert pg.locator('input[type=file]').count()==0, 'Jose no sube comprobantes'
        pg.click(f'#barraEventos .evento-op[data-evento="{EV[0]}"]'); pg.wait_for_timeout(500)
        assert pg.get_attribute(f'#barraEventos .evento-op[data-evento="{EV[0]}"]','aria-checked')=='true'
        pg.screenshot(path=OUT+f'{nombre}-B2-inicio.png')
        # el comprador pendiente aparece en las sugerencias
        pg.click('#inNombre'); pg.keyboard.type('ana'); pg.wait_for_selector('#sugerencias button')
        pg.screenshot(path=OUT+f'{nombre}-B3-sugerencias.png')
        pg.click('#sugerencias button >> nth=0')
        seats=['B-14','B-15']   # los dos eventos usan los MISMOS asientos
        if movil: pg.click('button.zona-btn:has-text("A–N centro")')
        for s in seats:
            pg.locator(f'g[data-id="{s}"]').scroll_into_view_if_needed(); pg.locator(f'g[data-id="{s}"]').click(force=True)
        pg.wait_for_timeout(200)
        assert pg.inner_text('#txtTotal')=='₡22,000'
        # vistas del plano
        pg.click('button.vista-btn:has-text("Resaltar libres")'); pg.wait_for_timeout(150)
        pg.locator('#mapaCaja').screenshot(path=OUT+f'{nombre}-B4-resaltar.png')
        pg.click('button.vista-btn:has-text("Solo libres")'); pg.wait_for_timeout(150)
        pg.locator('#mapaCaja').screenshot(path=OUT+f'{nombre}-B5-solo-libres.png')
        pg.click('button.vista-btn:has-text("Todos")')
        assert not pg.locator('#btnConfirmar').is_disabled()
        pg.click('#btnConfirmar'); pg.wait_for_selector('#bloquePago:not([hidden])')
        assert pg.inner_text('#pgMonto')=='₡22,000'
        pg.screenshot(path=OUT+f'{nombre}-B6-codigo.png')
        # código malo, y luego el bueno
        pg.fill('#inCodigo','ZZ999'); pg.click('#btnValidar'); pg.wait_for_selector('#avisoPago .aviso.error')
        pg.fill('#inCodigo',codigo.lower()); pg.click('#btnValidar'); pg.wait_for_selector('.verificacion')
        assert pg.locator('.checks li.mal').count()==0, pg.inner_text('.checks')
        assert EV[1].lower() in pg.inner_text('.verificacion').lower()
        pg.screenshot(path=OUT+f'{nombre}-B7-verificacion.png',full_page=True)
        pg.click('#bloquePago >> text=Asignar asientos y cerrar venta'); pg.wait_for_selector('#bloqueExito:not([hidden])')
        assert EV[1].lower() in pg.inner_text('#exEvento').lower()
        pg.screenshot(path=OUT+f'{nombre}-B8-exito.png')
        # el asiento vendido no se puede tocar y "Solo libres" lo oculta
        pg.click('#btnNueva'); pg.wait_for_timeout(500)
        pg.click('button.vista-btn:has-text("Solo libres")')
        oculto=pg.evaluate(f"getComputedStyle(document.querySelector('g[data-id=\"{seats[0]}\"]')).display")
        assert oculto=='none', oculto
        pg.click('button.vista-btn:has-text("Todos")')
        # en el OTRO evento ese mismo asiento sigue libre; al volver, la selección se limpia
        otro='iconos' if EV[0]=='ballet' else 'ballet'
        pg.click(f'#barraEventos .evento-op[data-evento="{otro}"]'); pg.wait_for_timeout(500)
        o=pg.locator(f'g[data-id="{seats[0]}"]'); o.scroll_into_view_if_needed(); o.click(force=True)
        assert pg.locator('#chipsSel .chip').count()==(1 if nombre=='desk' else 0), 'asiento libre en el otro evento'
        if nombre=='desk':
            pg.screenshot(path=OUT+'desk-B10-otro-evento.png')
            pg.click(f'#barraEventos .evento-op[data-evento="{EV[0]}"]'); pg.wait_for_timeout(500)
            assert pg.locator('#chipsSel .chip').count()==0, 'al cambiar de evento se limpia la selección'
        else:
            pg.click(f'#barraEventos .evento-op[data-evento="{EV[0]}"]'); pg.wait_for_timeout(500)
        pg.wait_for_selector('.toast',state='detached')
        pg.locator(f'g[data-id="{seats[0]}"]').scroll_into_view_if_needed(); pg.locator(f'g[data-id="{seats[0]}"]').click(force=True)
        assert pg.locator('.toast').count()==1 and 'vendido' in pg.inner_text('.toast'), 'debe avisar que ya está vendido'
        assert pg.locator('#chipsSel .chip').count()==0, 'un asiento vendido no se puede elegir'
        pg.wait_for_selector('.toast',state='detached')   # el aviso tapa la parte baja del plano
        # el mismo código no sirve otra vez
        pg.fill('#inNombre','Ana Mora Solís'); libre=pg.locator(f'g[data-id="{seats[0].split("-")[0]}-16"]'); libre.scroll_into_view_if_needed(); libre.click(force=True)
        assert pg.locator('#chipsSel .chip').count()==1
        pg.click('#btnConfirmar'); pg.fill('#inCodigo',codigo); pg.click('#btnValidar'); pg.wait_for_selector('.verificacion .checks li.mal')
        assert pg.locator('#bloquePago >> text=Asignar asientos y cerrar venta').is_disabled()
        pg.screenshot(path=OUT+f'{nombre}-B9-codigo-usado.png',full_page=True)
        pg.click('#tabPanel'); pg.wait_for_selector('#filtros button'); pg.wait_for_timeout(300)
        pg.click('button.zona-btn:has-text("Asignados")'); pg.wait_for_selector('.venta .chip.rojo')
        pg.screenshot(path=OUT+f'{nombre}-B11-panel-todos.png',full_page=True)
        pg.click(f'#filtroEvento button:has-text("{EV[1]}")'); pg.wait_for_selector('.venta .chip.rojo'); pg.wait_for_timeout(300)
        tags=[t.lower() for t in pg.locator('.venta .evento-tag').all_inner_texts()]
        assert tags and all(t==EV[1].lower() for t in tags), tags
        pg.screenshot(path=OUT+f'{nombre}-B12-panel-evento.png',full_page=True)
        pg.close(); ctx.close()
    b.close()
bad=[e for e in errores if not ('fonts.g' in e[2] or 'Failed to load resource' in e[2] and ('401' in e[2] or '404' in e[2] or '409' in e[2] or '422' in e[2] or '400' in e[2]))]
print('Mensajes de consola inesperados:',bad if bad else 'ninguno')
print('NAVEGADOR OK')
