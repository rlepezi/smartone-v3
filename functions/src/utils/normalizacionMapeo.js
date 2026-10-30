// Normalización de nombres de carpetas y archivos para el mapeo documental
// (sugerencias, patrones y copia de mapeo). Funciones PURAS. La MISMA lógica
// vive en frontend/src/utils/normalizacionMapeo.js; ambas se prueban con
// test/fixtures/casosNormalizacionMapeo.json.

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

const NIVELES = ["baja", "media", "alta"];

/**
 * Coeficiente de Dice sobre coincidencias EXACTAS de dos conjuntos de
 * nombres normalizados (similitud entre carpetas por su primer nivel).
 * @param {string[]} a Nombres normalizados.
 * @param {string[]} b Nombres normalizados.
 * @return {number} Entre 0 y 1.
 */
function similitudConjuntos(a, b) {
  const sa = new Set((a || []).filter(Boolean));
  const sb = new Set((b || []).filter(Boolean));
  if (!sa.size || !sb.size) return 0;
  const comunes = [...sa].filter((x) => sb.has(x)).length;
  return (2 * comunes) / (sa.size + sb.size);
}

/**
 * Sugerencia de requerimiento para un nodo:
 *  - alta: coincide exacto con un patrón activo (gana el de más
 *    confirmaciones; empate = ambiguo, con candidatos);
 *  - media: parecido ≥ 0,8 a un patrón activo, o el nodo contiene todos los
 *    tokens significativos del nombre corto del requerimiento;
 *  - baja: comparte un token significativo de 4 o más letras con el nombre
 *    corto o el nombre.
 * Solo cuentan los requerimientos asignables. Si el requerimiento ya está
 * ubicado en la carpeta, la sugerencia baja un nivel.
 * @param {string} nodo Nombre normalizado del nodo.
 * @param {Object} contexto {patrones: [{patron, requerimientoId,
 *     vecesConfirmado}] activos del ámbito y objetivo, requerimientos: [{id,
 *     nombreCorto, nombre}], ubicados: string[] (ids ya ubicados)}.
 * @return {{nivel: ?string, requerimientoId: ?string, candidatos: string[],
 *     ambiguo: boolean}} Sugerencia.
 */
function sugerirRequerimiento(nodo, {patrones = [], requerimientos = [],
  ubicados = []} = {}) {
  const ninguna = {nivel: null, requerimientoId: null, candidatos: [],
    ambiguo: false};
  const tokensNodo = tokensSignificativos(nodo);
  if (!tokensNodo.length) return ninguna;
  const asignables = new Set(requerimientos.map((r) => r.id));
  const ubicado = new Set(ubicados);
  const bajar = (nivel, id) => (ubicado.has(id) ?
    NIVELES[NIVELES.indexOf(nivel) - 1] || null : nivel);
  const resultado = (nivel, id, extra = {}) => {
    const final = bajar(nivel, id);
    return final ? {nivel: final, requerimientoId: id, candidatos: [id],
      ambiguo: false, ...extra} : ninguna;
  };
  const activos = patrones.filter((p) => asignables.has(p.requerimientoId));
  // Alta: patrón exacto.
  const exactos = activos.filter((p) => p.patron === nodo);
  if (exactos.length) {
    const max = Math.max(...exactos.map((p) => p.vecesConfirmado || 0));
    const mejores = [...new Set(exactos.filter((p) =>
      (p.vecesConfirmado || 0) === max).map((p) => p.requerimientoId))];
    if (mejores.length > 1) {
      return {nivel: "alta", requerimientoId: null, candidatos: mejores,
        ambiguo: true};
    }
    return resultado("alta", mejores[0]);
  }
  // Media: patrón parecido o todos los tokens del nombre corto.
  const parecidos = activos
      .map((p) => ({p, s: similitudTokens(nodo, p.patron)}))
      .filter((x) => x.s >= 0.8)
      .sort((a, b) => b.s - a.s || (b.p.vecesConfirmado || 0) -
        (a.p.vecesConfirmado || 0));
  if (parecidos.length) {
    return resultado("media", parecidos[0].p.requerimientoId);
  }
  const porNombre = requerimientos.map((r) => {
    const corto = tokensSignificativos(normalizarNombreMapeo(
        r.nombreCorto || r.nombre, {archivo: false}));
    const largo = normalizarNombreMapeo(r.nombre || r.nombreCorto,
        {archivo: false});
    const s = Math.max(similitudTokens(nodo, corto.join(" ")),
        similitudTokens(nodo, largo));
    return {r, corto, s, largo: tokensSignificativos(largo)};
  });
  const completos = porNombre.filter((x) => x.corto.length &&
    x.corto.every((t) => tokensNodo.includes(t))).sort((a, b) => b.s - a.s);
  if (completos.length) return resultado("media", completos[0].r.id);
  // Baja: un token significativo largo en común.
  const comunes = porNombre.map((x) => ({...x, n: [...new Set([...x.corto,
    ...x.largo])].filter((t) => t.length >= 4 && tokensNodo.includes(t))
      .length})).filter((x) => x.n > 0)
      .sort((a, b) => b.n - a.n || b.s - a.s);
  if (comunes.length) return resultado("baja", comunes[0].r.id);
  return ninguna;
}

module.exports = {
  normalizarNombreMapeo, similitudTokens, tokensSignificativos, STOPWORDS,
  similitudConjuntos, sugerirRequerimiento,
};
