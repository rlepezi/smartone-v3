const {
  cumple, noCumple, noDeterminable, valorDe, rutValido, claveTexto,
  normalizarPatente,
} = require("./comunes");

// Verificaciones de identidad: RUT, nombre, patente y empresa empleadora.

/**
 * El RUT extraído coincide con el de la persona o empresa evaluada.
 * @param {Object} campos Campos extraídos ({rut}).
 * @param {Object} contexto {rut}.
 * @return {{resultado: string, detalle: string}} Resultado.
 */
function coincideRut(campos, contexto) {
  const leido = valorDe(campos, "rut");
  if (!leido) return noDeterminable("No se leyó el RUT del documento.");
  const extraido = rutValido(leido);
  if (!extraido) {
    return noDeterminable(`El RUT leído (${leido}) no es válido.`);
  }
  const esperado = rutValido(contexto?.rut);
  if (!esperado) return noDeterminable("Falta el RUT esperado.");
  return extraido === esperado ?
    cumple(`RUT ${extraido} coincide.`) :
    noCumple(`El documento dice ${extraido}; se esperaba ${esperado}.`);
}

const tokens = (s) => claveTexto(s).split(" ")
    .filter((t) => t.length >= 2 && !/^\d+$/.test(t));

/**
 * El nombre extraído coincide con el de la persona.
 *  - "estricta": iguales sin tildes, mayúsculas ni espacios extra.
 *  - "tokens": mismo criterio que el cruce de carpetas por nombre (tokens
 *    de 2+ letras, sin importar el orden): todos los tokens del nombre más
 *    corto están en el más largo (la cédula suele traer los dos nombres y
 *    apellidos; la ficha, a veces menos).
 * @param {Object} campos Campos extraídos ({nombre}).
 * @param {Object} contexto {nombre}.
 * @param {Object} parametros {tolerancia}.
 * @return {{resultado: string, detalle: string}} Resultado.
 */
function coincideNombre(campos, contexto, parametros) {
  const leido = valorDe(campos, "nombre");
  if (!leido) return noDeterminable("No se leyó el nombre del documento.");
  const esperado = String(contexto?.nombre || "").trim();
  if (!esperado) return noDeterminable("Falta el nombre esperado.");
  if (parametros?.tolerancia === "estricta") {
    return claveTexto(leido) === claveTexto(esperado) ?
      cumple("El nombre coincide.") :
      noCumple(`El documento dice "${leido}"; se esperaba "${esperado}".`);
  }
  const a = tokens(leido);
  const b = tokens(esperado);
  if (!a.length || !b.length) {
    return noDeterminable("El nombre no tiene palabras comparables.");
  }
  const [corto, largo] = a.length <= b.length ? [a, new Set(b)] :
    [b, new Set(a)];
  return corto.every((t) => largo.has(t)) ?
    cumple("El nombre coincide.") :
    noCumple(`El documento dice "${leido}"; se esperaba "${esperado}".`);
}

/**
 * La patente extraída coincide con la del recurso.
 * @param {Object} campos Campos extraídos ({patente}).
 * @param {Object} contexto {patente}.
 * @return {{resultado: string, detalle: string}} Resultado.
 */
function coincidePatente(campos, contexto) {
  const leida = normalizarPatente(valorDe(campos, "patente"));
  if (!leida) return noDeterminable("No se leyó la patente del documento.");
  const esperada = normalizarPatente(contexto?.patente);
  if (!esperada) return noDeterminable("Falta la patente esperada.");
  return leida === esperada ?
    cumple(`Patente ${leida} coincide.`) :
    noCumple(`El documento dice ${leida}; se esperaba ${esperada}.`);
}

/**
 * El RUT del empleador del documento coincide con la empresa del
 * expediente.
 * @param {Object} campos Campos extraídos ({rutEmpleador}).
 * @param {Object} contexto {rutEmpresa}.
 * @return {{resultado: string, detalle: string}} Resultado.
 */
function coincideEmpresa(campos, contexto) {
  const leido = valorDe(campos, "rutEmpleador");
  if (!leido) return noDeterminable("No se leyó el RUT del empleador.");
  const extraido = rutValido(leido);
  if (!extraido) {
    return noDeterminable(`El RUT del empleador (${leido}) no es válido.`);
  }
  const esperado = rutValido(contexto?.rutEmpresa);
  if (!esperado) return noDeterminable("Falta el RUT de la empresa.");
  return extraido === esperado ?
    cumple(`Empleador ${extraido} coincide con la empresa.`) :
    noCumple(`El empleador es ${extraido}; la empresa es ${esperado}.`);
}

module.exports = {coincideRut, coincideNombre, coincidePatente,
  coincideEmpresa};
