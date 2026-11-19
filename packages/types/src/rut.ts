// ---------------------------------------------------------------------------
// RUT chileno: limpieza, dígito verificador (módulo 11) y formato.
// En la DB se guarda normalizado: "12345678-5" (sin puntos, DV en mayúscula).
// ---------------------------------------------------------------------------

/** Quita puntos, guion y espacios; deja dígitos + DV en mayúscula. */
function clean(rut: string): string {
  return rut.replace(/[^0-9kK]/g, '').toUpperCase();
}

/** Dígito verificador (módulo 11) del cuerpo del RUT (solo dígitos). */
export function rutCheckDigit(body: string): string {
  let sum = 0;
  let factor = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += Number(body[i]) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const dv = 11 - (sum % 11);
  return dv === 11 ? '0' : dv === 10 ? 'K' : String(dv);
}

/**
 * Valida un RUT en cualquier formato ("12.345.678-5", "123456785", "12345678-k").
 * Cuerpo de 7 u 8 dígitos (1.000.000 a 99.999.999) y DV correcto.
 */
export function isValidRut(rut: string): boolean {
  const c = clean(rut);
  if (!/^\d{7,8}[0-9K]$/.test(c)) return false;
  const body = c.slice(0, -1);
  if (/^0/.test(body)) return false;
  return rutCheckDigit(body) === c.slice(-1);
}

/** Forma canónica para guardar: "12345678-5". `null` si no es válido. */
export function normalizeRut(rut: string): string | null {
  if (!isValidRut(rut)) return null;
  const c = clean(rut);
  return `${c.slice(0, -1)}-${c.slice(-1)}`;
}

/** Para mostrar: "12.345.678-5". Si no es válido, devuelve el texto tal cual. */
export function formatRut(rut: string): string {
  const n = normalizeRut(rut);
  if (!n) return rut;
  const [body, dv] = n.split('-');
  return `${body.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}-${dv}`;
}

/**
 * Formatea mientras se escribe ("123456785" → "12.345.678-5"), sin validar.
 * Útil en el onChange de un input.
 */
export function formatRutInput(raw: string): string {
  const c = clean(raw).slice(0, 9);
  if (c.length <= 1) return c;
  const body = c.slice(0, -1);
  const dv = c.slice(-1);
  return `${body.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}-${dv}`;
}
