import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verificarDestino } from '../src/destino.js';
import { parsearComprobante } from '../src/parser.js';

const ESP = { cuenta: 'CR11 0102 0000 9606 5818 55', titular: 'JOSE RAFAEL BOLAÑOS MORA' };
const TXT = `BAC\nLe informamos que MARCO AVILA realizó una transferencia a la\ncuenta bancaria Nº CR 1101 0200 0096\n0658 1855 a nombre de JOSE RAFAEL\nBOLAÑOS MORA.\nFecha\nMonto\nReferencia\n30 septiembre 2026\n₡31,000.00\n406484461`;
const v = (t, e = ESP) => verificarDestino(parsearComprobante(t).campos, t, e);

test('la cuenta correcta pasa', () => assert.deepEqual(v(TXT), { estado: 'ok', por: 'cuenta' }));
test('otra cuenta (aunque el nombre sea el de Jose) NO pasa', () => {
  const t = TXT.replace('0658 1855', '0658 1856');
  assert.equal(v(t).estado, 'ajeno');
});
test('otra cuenta y otro nombre NO pasa', () => {
  const t = TXT.replace('JOSE RAFAEL\nBOLAÑOS MORA', 'ESTEBAN JAVIER\nBARBOZA RIVERA').replace('0658 1855', '9999 8888');
  assert.equal(v(t).estado, 'ajeno');
});
test('sin cuenta legible, el nombre del titular decide', () => {
  const t = 'Transferencia exitosa\nBeneficiario\nJOSE RAFAEL BOLAÑOS MORA\nMonto\n₡11,000\nReferencia\n123456789';
  assert.equal(v(t).estado, 'ok');
  assert.equal(v(t.replace('JOSE RAFAEL BOLAÑOS MORA', 'PEDRO PEREZ SOTO')).estado, 'ajeno');
});
test('cuenta enmascarada: últimos dígitos + nombre', () => {
  const ok = verificarDestino({ destino_cuenta: '****1855', destino_titular: 'JOSE BOLAÑOS MORA' }, '', ESP);
  assert.equal(ok.estado, 'ok');
  assert.equal(verificarDestino({ destino_cuenta: '****1856', destino_titular: null }, '', ESP).estado, 'ajeno');
});
test('imagen sin destino legible → ilegible; sin configurar → sin_configurar', () => {
  assert.equal(verificarDestino({}, 'Monto ₡11,000', ESP).estado, 'ilegible');
  assert.equal(verificarDestino({}, 'x', {}).estado, 'sin_configurar');
});
