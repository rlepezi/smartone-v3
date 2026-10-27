// Calce de carpetas y archivos contra la plantilla de estructura de un
// Mandante (Revisiones IA). Funciones PURAS. La numeración de carpetas y
// archivos varía entre empresas (y se repite o se salta): el calce es por
// nombre y palabras clave; el número solo desempata.

const UMBRAL_CALCE = 0.6;
// Patente chilena: AAAA12 (nueva) o AA1234 (antigua), con o sin separador.
const RE_PATENTE =
    /(?<![A-Z0-9])([A-Z]{4}[\s.-]?\d{2}|[A-Z]{2}[\s.-]?\d{4})(?![A-Z0-9])/;
// Palabras que no aportan al calce.
const PALABRAS_VACIAS = new Set([
  "de", "del", "la", "el", "los", "las", "y", "e", "o", "en", "a", "al",
  "para", "por", "con", "sin",
]);

/**
 * Texto normalizado: sin tildes, minúsculas; _ - . ( ) y similares pasan a
 * espacio; espacios colapsados.
 * @param {?string} s Texto.
 * @return {string} Texto normalizado.
 */
function normalizarTexto(s) {
  return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
      .toLowerCase().replace(/[_\-.()[\]/,;:]+/g, " ")
      .replace(/\s+/g, " ").trim();
}

/**
 * Separa el prefijo numérico de un nombre ("1. TECNORED", "17.B-BOSCH_...",
 * "1.- CONTRATO", "8.-PSICO..."). El número debe ir seguido de un separador
 * (así "4x4 ..." no pierde el 4).
 * @param {?string} nombre Nombre de carpeta o archivo.
 * @return {{numero: ?string, resto: string}} Número (o null) y resto.
 */
function quitarPrefijoNumerico(nombre) {
  const texto = String(nombre || "");
  const m = texto.match(
      /^\s*(\d{1,3}(?:\.[a-z](?![a-z]))?)(?=[\s.\-_)])[\s.\-_)]*/i,
  );
  if (!m) return {numero: null, resto: texto.trim()};
  return {numero: m[1].toUpperCase(), resto: texto.slice(m[0].length).trim()};
}

const tokens = (s) => normalizarTexto(s).split(" ")
    .filter((t) => t && !PALABRAS_VACIAS.has(t));

/**
 * Puntaje de un texto contra los alias de una sección o documento: 0 si
 * contiene una palabra de exclusión; 1 si contiene un alias completo como
 * palabra o frase; si no, la mejor fracción de palabras de un alias que
 * aparecen en el texto.
 * @param {string} texto Nombre (ya sin prefijo numérico).
 * @param {string[]} alias Alias.
 * @param {string[]} [excluir] Palabras que descartan el calce.
 * @return {number} Puntaje de 0 a 1.
 */
function puntajeAlias(texto, alias, excluir = []) {
  const norm = ` ${normalizarTexto(texto)} `;
  const contiene = (frase) => {
    const f = normalizarTexto(frase);
    return Boolean(f) && norm.includes(` ${f} `);
  };
  if ((excluir || []).some(contiene)) return 0;
  if ((alias || []).some(contiene)) return 1;
  const propios = new Set(tokens(texto));
  let mejor = 0;
  (alias || []).forEach((a) => {
    const t = tokens(a);
    if (!t.length) return;
    const fraccion = t.filter((x) => propios.has(x)).length / t.length;
    if (fraccion > mejor) mejor = fraccion;
  });
  return mejor;
}

const aliasDe = (item) => [item.nombre, ...(item.alias || [])];

/**
 * Asigna carpetas a secciones (uno a uno, mayor puntaje primero, umbral
 * 0.6). A igual puntaje desempata el número sugerido de la sección.
 * @param {Array<{nombre: string}>} carpetas Carpetas hijas.
 * @param {Object[]} secciones Secciones de la plantilla.
 * @param {Object<string, ?string>} [manuales] nombreCarpeta → clave (o ""
 *     = no reconocida), corrección manual del usuario.
 * @return {Array<{carpeta: string, numero: ?string, seccionClave: ?string,
 *     similitud: number, metodo: ?string}>} Calce por carpeta.
 */
function calzarSecciones(carpetas, secciones, manuales = {}) {
  const pares = [];
  const resultado = new Map();
  const usadas = new Set();
  (carpetas || []).forEach((c) => {
    const {numero, resto} = quitarPrefijoNumerico(c.nombre);
    if (Object.prototype.hasOwnProperty.call(manuales, c.nombre)) {
      const clave = manuales[c.nombre] || null;
      resultado.set(c.nombre, {carpeta: c.nombre, numero, seccionClave: clave,
        similitud: clave ? 1 : 0, metodo: clave ? "manual" : null});
      if (clave) usadas.add(clave);
      return;
    }
    (secciones || []).forEach((s) => {
      const puntaje = puntajeAlias(resto, aliasDe(s));
      if (puntaje >= UMBRAL_CALCE) {
        const numeroCalza = Boolean(numero && s.numeroSugerido &&
            Number.parseInt(numero, 10) ===
                Number.parseInt(s.numeroSugerido, 10));
        pares.push({c, numero, s, puntaje, numeroCalza});
      }
    });
  });
  pares.sort((a, b) => b.puntaje - a.puntaje ||
      Number(b.numeroCalza) - Number(a.numeroCalza));
  pares.forEach((p) => {
    if (resultado.has(p.c.nombre) || usadas.has(p.s.clave)) return;
    // ¿Había otra sección libre con el mismo puntaje? Entonces decidió el
    // número.
    const empate = pares.some((q) => q !== p && q.c === p.c &&
        q.puntaje === p.puntaje && !usadas.has(q.s.clave));
    resultado.set(p.c.nombre, {
      carpeta: p.c.nombre, numero: p.numero, seccionClave: p.s.clave,
      similitud: Math.round(p.puntaje * 100) / 100,
      metodo: empate && p.numeroCalza ? "numero" : "alias",
    });
    usadas.add(p.s.clave);
  });
  return (carpetas || []).map((c) => resultado.get(c.nombre) || {
    carpeta: c.nombre, numero: quitarPrefijoNumerico(c.nombre).numero,
    seccionClave: null, similitud: 0, metodo: null,
  });
}

/**
 * Asigna cada archivo al documento esperado de mayor puntaje (umbral 0.6).
 * El número del archivo no se usa.
 * @param {Array<{nombre: string}>} archivos Archivos.
 * @param {Object[]} documentos Documentos esperados.
 * @return {{porDocumento: Object<string, Object[]>, noReconocidos:
 *     Object[], calces: Object[], advertencias: string[]}} Asignación.
 */
function calzarDocumentos(archivos, documentos) {
  const porDocumento = {};
  const noReconocidos = [];
  const calces = [];
  (archivos || []).forEach((archivo) => {
    const sinExtension = archivo.nombre.replace(/\.[^.]+$/, "");
    const {resto} = quitarPrefijoNumerico(sinExtension);
    let mejor = null;
    (documentos || []).forEach((d) => {
      const puntaje = puntajeAlias(resto, aliasDe(d), d.excluir);
      if (puntaje >= UMBRAL_CALCE && (!mejor || puntaje > mejor.puntaje)) {
        mejor = {d, puntaje};
      }
    });
    if (!mejor) {
      noReconocidos.push(archivo);
      calces.push({nombre: archivo.nombre, documentoClave: null,
        similitud: 0});
      return;
    }
    if (!porDocumento[mejor.d.clave]) porDocumento[mejor.d.clave] = [];
    porDocumento[mejor.d.clave].push(archivo);
    calces.push({nombre: archivo.nombre, documentoClave: mejor.d.clave,
      similitud: Math.round(mejor.puntaje * 100) / 100});
  });
  const advertencias = (documentos || [])
      .filter((d) => !d.multiple && (porDocumento[d.clave] || []).length > 1)
      .map((d) => `${d.nombre}: varios archivos para un documento único.`);
  return {porDocumento, noReconocidos, calces, advertencias};
}

/**
 * Fecha en el nombre de un archivo: dd-mm-aaaa, dd.mm.aaaa o dd/mm/aaaa (ISO
 * AAAA-MM-DD); si no, un año suelto (AAAA). null si no hay.
 * @param {?string} nombre Nombre del archivo.
 * @return {?string} Fecha ISO, año o null.
 */
function extraerFechaDeNombre(nombre) {
  const texto = String(nombre || "");
  const m = texto.match(/(?<!\d)(\d{2})[-./](\d{2})[-./](\d{4})(?!\d)/);
  if (m) {
    const [, d, mes, a] = m;
    const fecha = new Date(`${a}-${mes}-${d}T00:00:00Z`);
    if (!isNaN(fecha.getTime()) &&
        fecha.toISOString().slice(0, 10) === `${a}-${mes}-${d}`) {
      return `${a}-${mes}-${d}`;
    }
  }
  const anio = texto.match(/(?<!\d)((?:19|20)\d{2})(?!\d)/);
  return anio ? anio[1] : null;
}

/**
 * Nombre de empresa y texto de proyecto desde el nombre de su carpeta
 * ("17.B-BOSCH_Proyecto_Linea" → BOSCH / "Proyecto Linea").
 * @param {?string} nombreCarpeta Nombre de la carpeta.
 * @return {{nombreEmpresa: string, textoProyecto: ?string}} Partes.
 */
function extraerNombreEmpresa(nombreCarpeta) {
  const {resto} = quitarPrefijoNumerico(nombreCarpeta);
  const cortes = [/_proyecto/i, / \(/, /_/, / - /]
      .map((re) => resto.search(re)).filter((i) => i > 0);
  if (!cortes.length) return {nombreEmpresa: resto.trim(), textoProyecto: null};
  const corte = Math.min(...cortes);
  const proyecto = resto.slice(corte).replace(/^[\s_\-(]+/, "")
      .replace(/\)\s*$/, "").replace(/_/g, " ").replace(/\s+/g, " ").trim();
  return {
    nombreEmpresa: resto.slice(0, corte).trim(),
    textoProyecto: proyecto || null,
  };
}

/**
 * Patente chilena en un nombre (AA1234 o AAAA12, con o sin separadores).
 * @param {?string} nombre Nombre de la carpeta.
 * @return {?string} Patente sin separadores, en mayúsculas.
 */
function extraerPatente(nombre) {
  const m = String(nombre || "").toUpperCase().match(RE_PATENTE);
  return m ? m[1].replace(/[\s.-]/g, "") : null;
}

/**
 * Similitud entre dos nombres (0 a 1): fracción de palabras del más corto
 * presentes en el otro.
 * @param {?string} a Nombre.
 * @param {?string} b Nombre.
 * @return {number} Similitud.
 */
function similitudNombres(a, b) {
  const ta = tokens(a);
  const tb = new Set(tokens(b));
  if (!ta.length || !tb.size) return 0;
  const [corto, largo] = ta.length <= tb.size ?
      [ta, tb] : [[...tb], new Set(ta)];
  return Math.round((corto.filter((t) => largo.has(t)).length /
      corto.length) * 100) / 100;
}

module.exports = {
  UMBRAL_CALCE, normalizarTexto, quitarPrefijoNumerico, puntajeAlias,
  calzarSecciones, calzarDocumentos, extraerFechaDeNombre,
  extraerNombreEmpresa, extraerPatente, similitudNombres,
};
