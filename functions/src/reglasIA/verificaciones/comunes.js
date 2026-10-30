const {normalizarRun, validarRun} = require("../../services/reglasService");
const {hoySantiago} = require("../../utils/vencimientos");

// Utilidades compartidas por las verificaciones determinísticas. Funciones
// PURAS. Regla común: si falta un dato o no se puede leer, el resultado es
// "no_determinable", nunca "no_cumple".

const RESULTADOS = ["cumple", "no_cumple", "no_determinable"];
const MS_DIA = 24 * 60 * 60 * 1000;

const cumple = (detalle) => ({resultado: "cumple", detalle});
const noCumple = (detalle) => ({resultado: "no_cumple", detalle});
const noDeterminable = (detalle) => ({resultado: "no_determinable", detalle});

/**
 * Valor de un campo extraído: acepta {valor, confianza} o el valor directo.
 * @param {Object} campos Campos extraídos.
 * @param {string} clave Clave del campo.
 * @return {*} Valor, o null si no hay.
 */
function valorDe(campos, clave) {
  const v = campos?.[clave];
  const valor = v && typeof v === "object" && "valor" in v ? v.valor : v;
  if (valor === undefined || valor === null) return null;
  if (typeof valor === "string" && !valor.trim()) return null;
  return valor;
}

/**
 * Fecha a "AAAA-MM-DD": acepta AAAA-MM-DD (con o sin hora), dd/mm/aaaa y
 * dd-mm-aaaa. null si no es una fecha válida.
 * @param {*} valor Fecha.
 * @return {?string} Fecha ISO.
 */
function aFechaIso(valor) {
  if (valor instanceof Date) {
    return isNaN(valor.getTime()) ? null : valor.toISOString().slice(0, 10);
  }
  const s = String(valor || "").trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  let y; let mes; let d;
  if (m) [, y, mes, d] = m;
  else {
    m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
    if (!m) return null;
    [, d, mes, y] = m;
  }
  const iso = `${y}-${String(mes).padStart(2, "0")}-${String(d)
      .padStart(2, "0")}`;
  const fecha = new Date(`${iso}T00:00:00Z`);
  return isNaN(fecha.getTime()) || fecha.toISOString().slice(0, 10) !== iso ?
    null : iso;
}

/**
 * Días entre dos fechas ISO (b - a).
 * @param {string} a Fecha ISO.
 * @param {string} b Fecha ISO.
 * @return {number} Días.
 */
const diasEntre = (a, b) =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) /
      MS_DIA);

/**
 * Suma días a una fecha ISO.
 * @param {string} iso Fecha.
 * @param {number} dias Días.
 * @return {string} Fecha ISO.
 */
const sumarDias = (iso, dias) => new Date(Date.parse(`${iso}T00:00:00Z`) +
    dias * MS_DIA).toISOString().slice(0, 10);

/**
 * "AAAA-MM-DD" → "dd/mm/aaaa" (para los detalles que ve el usuario).
 * @param {string} iso Fecha ISO.
 * @return {string} Fecha.
 */
const ddmmaaaa = (iso) => iso.split("-").reverse().join("/");

/**
 * Fecha de evaluación del contexto, o hoy en Santiago.
 * @param {Object} contexto Contexto.
 * @return {?string} Fecha ISO, o null si viene pero no es válida.
 */
function fechaEvaluacion(contexto) {
  if (contexto?.fechaEvaluacion === undefined ||
      contexto?.fechaEvaluacion === null || contexto?.fechaEvaluacion === "") {
    return hoySantiago();
  }
  return aFechaIso(contexto.fechaEvaluacion);
}

/**
 * RUT válido (dígito verificador) normalizado, o null.
 * @param {*} valor RUT en cualquier formato.
 * @return {?string} RUT normalizado.
 */
function rutValido(valor) {
  const r = normalizarRun(String(valor || ""));
  return r && validarRun(r) ? r : null;
}

/**
 * Minúsculas, sin tildes (ñ → n), solo letras, números y espacios.
 * @param {*} s Texto.
 * @return {string} Clave.
 */
const claveTexto = (s) => String(s || "").normalize("NFD")
    .replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, " ").trim();

/**
 * Patente para comparar: sin espacios, puntos ni guiones, en mayúsculas.
 * @param {*} s Patente.
 * @return {string} Patente.
 */
const normalizarPatente = (s) => String(s || "").replace(/[\s.\-_]/g, "")
    .toUpperCase();

module.exports = {
  RESULTADOS, cumple, noCumple, noDeterminable, valorDe, aFechaIso, diasEntre,
  sumarDias, ddmmaaaa, fechaEvaluacion, rutValido, claveTexto,
  normalizarPatente,
};
