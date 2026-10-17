# Dos pantallas de Jose a la vez: A tiene un asiento elegido; B (otro dispositivo) lo vende primero con otro código.
import json, urllib.request
from playwright.sync_api import sync_playwright
B='http://127.0.0.1:4010'
def texto(monto, ref):
    t=f"""BAC
Le informamos que MARCO AVILA realizó una transferencia a la
cuenta bancaria Nº CR 1101 0200 0096
0658 1855 a nombre de JOSE RAFAEL
BOLAÑOS MORA.
Fecha
Monto
Referencia
30 septiembre 2026
₡{monto:,}.00
{ref}"""
    urllib.request.urlopen(urllib.request.Request('http://127.0.0.1:4011/__texto',data=t.encode(),method='POST'))
with sync_playwright() as p:
    b=p.chromium.launch()
    a=b.new_context(viewport={'width':1366,'height':900}).new_page()
    a.goto(B); a.fill('#loginUsuario','jose'); a.fill('#loginClave','clave-de-jose'); a.click('#btnEntrar'); a.wait_for_selector('#vVender:not([hidden])')
    a.click('#inNombre'); a.keyboard.type('Ana Mora Solis')
    a.locator('g[data-id="E-12"]').click(force=True)
    print('A eligió:', a.locator('g[data-id="E-12"]').get_attribute('class'))
    # B: un comprador sube su pago y Jose (otro dispositivo) vende E-12
    ctx2=b.new_context(); texto(11000,'777555333')
    img=open('test/capturas/comprobante-bac.jpg','rb')
    import base64
    cod=ctx2.request.post(B+'/api/pagos/registrar',data={'evento':'ballet','nombre':'Beto Soto Vega','cantidad':1,'imagenBase64':base64.b64encode(img.read()).decode()}).json()['codigo']
    print('login 2:',ctx2.request.post(B+'/api/login',data={'usuario':'jose','clave':'clave-de-jose'}).status)
    r=ctx2.request.post(B+'/api/vender',data={'evento':'ballet','codigo':cod,'comprador':'Beto Soto Vega','asientos':['E-12']}); print('B vende E-12 →',r.status)
    a.wait_for_selector('g[data-id="E-12"].vendido',timeout=9000)
    print('A después del sondeo:', a.locator('g[data-id="E-12"]').get_attribute('class'), '| aviso:', a.inner_text('.toast'))
    print('A seleccionados:', a.locator('#chipsSel .chip').count())
    a.wait_for_selector('.toast',state='detached')
    a.locator('g[data-id="E-12"]').click(force=True); print('toast al insistir:', a.inner_text('.toast'))
    b.close()
