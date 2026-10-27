// Repositorio documental de un Expediente: dónde está su documentación
// (carpeta local o SharePoint) y el mapeo de sus subcarpetas (personal,
// maquinarias y, más adelante, la de cada requerimiento). Funciones PURAS
// de validación.

const TIPOS = ["local", "sharepoint"];
const MAX_ETIQUETA = 200;
const MAX_RUTA = 1000;
const MAX_REQUERIMIENTOS = 500;

/**
 * Valida una ruta relativa a la carpeta raíz: sin "..", sin ruta absoluta
 * ni letra de unidad. Normaliza separadores a "/" y quita "/" de los
 * extremos.
 * @param {*} valor Ruta recibida.
 * @return {{ok: boolean, error: ?string, valor: ?string}} Resultado; valor
 *     null si viene vacía.
 */
function validarRutaRelativa(valor) {
  if (valor === null || valor === undefined || valor === "") {
    return {ok: true, error: null, valor: null};
  }
  if (typeof valor !== "string") {
    return {ok: false, error: "La ruta debe ser texto.", valor: null};
  }
  const cruda = valor.trim();
  if (/^[a-zA-Z]:/.test(cruda) || cruda.startsWith("/") ||
      cruda.startsWith("\\")) {
    return {ok: false, error: "La ruta debe ser relativa a la carpeta " +
        "raíz del expediente.", valor: null};
  }
  const partes = cruda.replace(/\\/g, "/").split("/").map((p) => p.trim())
      .filter(Boolean);
  if (partes.some((p) => p === ".." || p === ".")) {
    return {ok: false, error: "La ruta no puede salir de la carpeta raíz.",
      valor: null};
  }
  const ruta = partes.join("/");
  if (ruta.length > MAX_RUTA) {
    return {ok: false, error: "La ruta es demasiado larga.", valor: null};
  }
  return {ok: true, error: null, valor: ruta || null};
}

/**
 * Valida el mapeo de carpetas.
 * @param {*} mapeo {carpetaPersonas, carpetaRecursos, requerimientos}.
 * @return {{ok: boolean, error: ?string, valor: ?Object}} Resultado.
 */
function validarMapeo(mapeo) {
  const error = (mensaje) => ({ok: false, error: mensaje, valor: null});
  const m = mapeo || {};
  if (typeof m !== "object" || Array.isArray(m)) {
    return error("El mapeo de carpetas no es válido.");
  }
  const salida = {carpetaPersonas: null, carpetaRecursos: null,
    requerimientos: {}};
  for (const campo of ["carpetaPersonas", "carpetaRecursos"]) {
    const r = validarRutaRelativa(m[campo]);
    if (!r.ok) return error(r.error);
    salida[campo] = r.valor;
  }
  const reqs = m.requerimientos || {};
  if (typeof reqs !== "object" || Array.isArray(reqs)) {
    return error("El mapeo de requerimientos no es válido.");
  }
  const entradas = Object.entries(reqs);
  if (entradas.length > MAX_REQUERIMIENTOS) {
    return error("Demasiados requerimientos en el mapeo.");
  }
  for (const [id, ruta] of entradas) {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) {
      return error("Identificador de requerimiento no válido.");
    }
    const r = validarRutaRelativa(ruta);
    if (!r.ok) return error(r.error);
    if (r.valor) salida.requerimientos[id] = r.valor;
  }
  return {ok: true, error: null, valor: salida};
}

/**
 * Valida y normaliza el repositorio recibido del cliente.
 *  - local: etiqueta = nombre de la carpeta (sin ruta); url siempre null.
 *  - sharepoint: url https cuyo host termina en ".sharepoint.com"; la
 *    etiqueta es opcional (por defecto, el último tramo de la ruta).
 *  - mapeo: opcional (ver validarMapeo); ausente = no viene.
 * @param {*} entrada {tipo, etiqueta, url, mapeo}.
 * @return {{ok: boolean, error: ?string, valor: ?Object}} Resultado; valor
 *     {tipo, etiqueta, url, mapeo?}.
 */
function validarRepositorio(entrada) {
  const error = (mensaje) => ({ok: false, error: mensaje, valor: null});
  const tipo = entrada?.tipo;
  if (!TIPOS.includes(tipo)) {
    return error("El tipo debe ser 'local' o 'sharepoint'.");
  }
  const etiqueta = typeof entrada.etiqueta === "string" ?
    entrada.etiqueta.trim() : "";
  if (etiqueta.length > MAX_ETIQUETA) {
    return error(`La etiqueta admite hasta ${MAX_ETIQUETA} caracteres.`);
  }
  let mapeo;
  if (entrada.mapeo !== undefined) {
    const m = validarMapeo(entrada.mapeo);
    if (!m.ok) return error(m.error);
    mapeo = m.valor;
  }
  const conMapeo = (valor) => ({ok: true, error: null,
    valor: mapeo ? {...valor, mapeo} : valor});
  if (tipo === "local") {
    if (entrada.url !== null && entrada.url !== undefined &&
        entrada.url !== "") {
      return error("Una carpeta local no lleva URL.");
    }
    if (!etiqueta || /[\\/:]/.test(etiqueta)) {
      return error("Indique solo el nombre de la carpeta, sin ruta.");
    }
    return conMapeo({tipo, etiqueta, url: null});
  }
  let url;
  try {
    url = new URL(String(entrada.url || "").trim());
  } catch (e) {
    return error("La URL de SharePoint no es válida.");
  }
  if (url.protocol !== "https:") {
    return error("La URL de SharePoint debe comenzar con https://.");
  }
  if (!url.hostname.toLowerCase().endsWith(".sharepoint.com")) {
    return error("La URL debe ser de un sitio *.sharepoint.com.");
  }
  const tramos = decodeURIComponent(url.pathname).split("/").filter(Boolean);
  return conMapeo({
    tipo, url: url.toString(),
    etiqueta: etiqueta || tramos[tramos.length - 1] || url.hostname,
  });
}

module.exports = {
  TIPOS_REPOSITORIO: TIPOS, validarRepositorio, validarMapeo,
  validarRutaRelativa,
};
