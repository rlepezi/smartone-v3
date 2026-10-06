/**
 * Limpia el RUT dejando solo dígitos y K
 */
export const cleanRut = (rut = "") => {
  return rut.replace(/[^0-9kK]/g, "").toUpperCase();
};

/**
 * Formatea un RUT para visualización: 761234567 -> 76.123.456-7
 */
export const formatRutDisplay = (rut = "") => {
  const cleaned = cleanRut(rut);
  if (!cleaned) return "";

  const cuerpo = cleaned.slice(0, -1);
  const dv = cleaned.slice(-1);

  if (cuerpo.length === 0) return dv;

  let cuerpoFormateado = "";
  let contador = 0;

  for (let i = cuerpo.length - 1; i >= 0; i--) {
    cuerpoFormateado = cuerpo.charAt(i) + cuerpoFormateado;
    contador++;
    if (contador === 3 && i !== 0) {
      cuerpoFormateado = "." + cuerpoFormateado;
      contador = 0;
    }
  }

  return `${cuerpoFormateado}-${dv}`;
};

/**
 * Valida el dígito verificador del RUT en frontend
 */
export const validateRut = (rut = "") => {
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
  let dvCalculado = "0";
  if (dvEsperado === 10) dvCalculado = "K";
  else if (dvEsperado < 10) dvCalculado = dvEsperado.toString();

  return dv === dvCalculado;
};