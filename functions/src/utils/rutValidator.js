/**
 * Limpia el RUT dejando solo dígitos y K mayúscula sin puntos ni guion.
 * Ej: "76.123.456-7" -> "761234567"
 * @param {string} rut RUT a limpiar.
 * @return {string} RUT limpio.
 */
const cleanRut = (rut) => {
  if (typeof rut !== "string") return "";
  return rut.replace(/[^0-9kK]/g, "").toUpperCase();
};

/**
 * Valida formato y dígito verificador del RUT chileno.
 * @param {string} rut RUT a validar.
 * @return {boolean} true si el RUT es válido.
 */
const validateRut = (rut) => {
  const cleaned = cleanRut(rut);
  if (cleaned.length < 8 || cleaned.length > 9) return false;

  const cuerpo = cleaned.slice(0, -1);
  const dv = cleaned.slice(-1);

  let suma = 0;
  let multiplo = 2;

  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += multiplo * parseInt(cuerpo.charAt(i), 10);
    multiplo = multiplo < 7 ? multiplo + 1 : 2;
  }

  const dvEsperado = 11 - (suma % 11);
  let dvCalculado = "";
  if (dvEsperado === 11) dvCalculado = "0";
  else if (dvEsperado === 10) dvCalculado = "K";
  else dvCalculado = dvEsperado.toString();

  return dv === dvCalculado;
};

module.exports = {
  cleanRut,
  validateRut,
};
