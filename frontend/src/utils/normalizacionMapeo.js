// Normalización de nombres de carpetas y archivos para el mapeo documental
// (sugerencias, patrones y copia de mapeo). Funciones PURAS. La MISMA lógica
// vive en functions/src/utils/normalizacionMapeo.js; ambas se prueban con
// functions/test/fixtures/casosNormalizacionMapeo.json.

// Prefijos de orden: "1. ", "01 - ", "1.- ", "0.1. ", "17.B-", "2_".
const RE_PREFIJO =
    /^\s*\d+(?:[.,]\d+)*(?:\.[a-z](?=[-_.\s]))?\s*[.\-_)–]*\s*[-–]?\s*/i;
// Extensiones de documentos que se quitan del nombre de un archivo.
const RE_EXTENSION =
    /\.(pdf|docx?|xlsx?|xlsm|csv|pptx?|txt|jpe?g|png|webp|gif|zip|rar|msg)$/i;
const RE_FECHAS = [
  /\b\d{1,2}[-/.]\d{1,2}[-/.]\d{4}\b/g,
  /\b\d{4}[-/.]\d{1,2}[-/.]\d{1,2}\b/g,
];
const RE_ANIO = /^(19|20)\d{2}$/;
const STOPWORDS = new Set(["de", "del", "la", "el", "los", "las", "y", "en",
  "para", "por", "con", "si", "aplica", "solo"]);

/**
 * Sin tildes, en minúsculas ("ñ" → "n").
 * @param {*} s Texto.
 * @return {string} Texto.
 */
const plano = (s) => String(s || "").normalize("NFD")
    .replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Tokens de un texto ya plano: separadores a espacio y letras sueltas
 * seguidas unidas ("o d i" → "odi"; una letra sola, como "y", queda).
 * @param {string} s Texto plano.
 * @return {string[]} Tokens.
 */
function tokensDe(s) {
  const crudos = s.replace(/[^a-z0-9]+/g, " ").trim().split(" ")
      .filter(Boolean);
  const salida = [];
  let letras = [];
  const volcar = () => {
    if (letras.length > 1) salida.push(letras.join(""));
    else if (letras.length === 1) salida.push(letras[0]);
    letras = [];
  };
  crudos.forEach((t) => {
    if (/^[a-z]$/.test(t)) letras.push(t);
    else {
      volcar();
      salida.push(t);
    }
  });
  volcar();
  return salida;
}

/**
 * Nombre normalizado para el mapeo: sin extensión (archivos), sin prefijo de
 * orden, sin tildes y en minúsculas, separadores como espacio, letras sueltas
 * unidas y, según las opciones, sin el nombre de la persona o el
 * identificador del recurso y sin fechas.
 * @param {string} nombre Nombre de la carpeta o el archivo.
 * @param {{archivo: (boolean|undefined), nombrePersona: (string|undefined),
 *     identificadorRecurso: (string|undefined),
 *     quitarFechas: (boolean|undefined)}} [opciones] Opciones.
 * @return {string} Nombre normalizado.
 */
function normalizarNombreMapeo(nombre, opciones = {}) {
  let s = String(nombre || "").trim();
  if (opciones.archivo !== false) s = s.replace(RE_EXTENSION, "");
  s = s.replace(RE_PREFIJO, "");
  s = plano(s);
  if (opciones.quitarFechas) {
    RE_FECHAS.forEach((re) => {
      s = s.replace(re, " ");
    });
  }
  let tokens = tokensDe(s);
  const quitar = new Set([
    ...tokensDe(plano(opciones.nombrePersona || "")),
    ...tokensDe(plano(opciones.identificadorRecurso || "")),
  ]);
  if (quitar.size) tokens = tokens.filter((t) => !quitar.has(t));
  if (opciones.quitarFechas) tokens = tokens.filter((t) => !RE_ANIO.test(t));
  return tokens.join(" ");
}

/**
 * Tokens significativos (sin stopwords) de un nombre ya normalizado.
 * @param {string} normalizado Nombre normalizado.
 * @return {string[]} Tokens sin repetir.
 */
function tokensSignificativos(normalizado) {
  return [...new Set(String(normalizado || "").split(" ")
      .filter((t) => t && !STOPWORDS.has(t)))];
}

/**
 * Coeficiente de Dice sobre los tokens significativos de dos nombres ya
 * normalizados (0 si alguno queda vacío).
 * @param {string} a Nombre normalizado.
 * @param {string} b Nombre normalizado.
 * @return {number} Entre 0 y 1.
 */
function similitudTokens(a, b) {
  const ta = tokensSignificativos(a);
  const tb = new Set(tokensSignificativos(b));
  if (!ta.length || !tb.size) return 0;
  const comunes = ta.filter((t) => tb.has(t)).length;
  return (2 * comunes) / (ta.length + tb.size);
}

export {
  normalizarNombreMapeo, similitudTokens, tokensSignificativos, STOPWORDS,
};
