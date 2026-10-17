// ============================================================
// ¿La transferencia fue a la cuenta de Jose?
//
// Todas deben ir a UNA misma cuenta, a nombre de Jose Bolaños.
// Esta función compara lo que se leyó del comprobante contra esa
// cuenta. No es infalible (una captura falsa con los datos correctos
// pasa); la comprobación real es que Jose vea el depósito en su banco.
// ============================================================

export function normalizarNombre(t) {
  return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
    .replace(/[^A-Z\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

// Al menos dos palabras (de 3+ letras) en común: nombre y un apellido.
export function comparteNombre(a, b) {
  const pa = new Set(String(a).split(' ').filter((w) => w.length >= 3));
  return String(b).split(' ').filter((w) => w.length >= 3 && pa.has(w)).length >= 2;
}

const digitos = (t) => String(t || '').replace(/\D/g, '');

// esperado = { cuenta: 'CR11 0102 …', titular: 'JOSE RAFAEL BOLAÑOS MORA' }
// Devuelve { estado: 'ok' | 'ajeno' | 'ilegible' | 'sin_configurar', por }
export function verificarDestino(campos, textoOcr, esperado) {
  const cuentaEsp = digitos(esperado?.cuenta);
  const titularEsp = normalizarNombre(esperado?.titular);
  if (!cuentaEsp && !titularEsp) return { estado: 'sin_configurar' };

  const leida = digitos(campos?.destino_cuenta);
  const titular = normalizarNombre(campos?.destino_titular);
  const nombreOk = titular && titularEsp ? comparteNombre(titular, titularEsp) : null;

  // 1. El número completo de la cuenta aparece en el comprobante
  if (cuentaEsp.length >= 18 && digitos(textoOcr).includes(cuentaEsp)) return { estado: 'ok', por: 'cuenta' };

  // 2. Se leyó una cuenta destino
  if (leida) {
    if (leida.length >= 18) return leida === cuentaEsp ? { estado: 'ok', por: 'cuenta' } : { estado: 'ajeno' };
    // enmascarada (****1855): los últimos dígitos deben coincidir, y el nombre si se leyó
    if (leida.length >= 3 && cuentaEsp) {
      if (!cuentaEsp.endsWith(leida)) return { estado: 'ajeno' };
      if (nombreOk === false) return { estado: 'ajeno' };
      return { estado: 'ok', por: 'cuenta parcial' };
    }
  }

  // 3. Sin cuenta legible: manda el nombre del titular
  if (titular) return nombreOk ? { estado: 'ok', por: 'titular' } : { estado: 'ajeno' };

  return { estado: 'ilegible' };
}
