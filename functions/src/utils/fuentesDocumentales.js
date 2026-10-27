const AppError = require("./AppError");

// Validaciones y forma pública de las Fuentes Documentales (SharePoint).
// Funciones puras, para probarlas aisladas.

const RE_GUID =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RE_SITE_URL =
    /^https:\/\/[a-z0-9-]+\.sharepoint\.com\/sites\/[^/?#\s]+\/?$/i;
const NOMBRE_MAX = 80;
const BIBLIOTECA_POR_DEFECTO = "Documentos";
// Campos que nunca salen del backend.
const CAMPOS_SECRETOS = ["secretCifrado", "iv", "authTag", "clientSecret"];

/**
 * Normaliza la carpeta base: sin "/" inicial, con "/" final ("" si vacía).
 * @param {?string} ruta Ruta ingresada ("/Acreditacion", "Acreditacion\\").
 * @return {string} Ruta normalizada ("Acreditacion/").
 */
function normalizarRutaBase(ruta) {
  const limpia = String(ruta || "").trim().replace(/\\/g, "/")
      .replace(/\/{2,}/g, "/").replace(/^\/+/, "").replace(/\/+$/, "");
  return limpia ? `${limpia}/` : "";
}

/**
 * Valida y normaliza los datos de una fuente SharePoint.
 * @param {Object} payload {nombre, tenantId, clientId, clientSecret,
 *     siteUrl, biblioteca, rutaBase}.
 * @param {{esNueva: boolean}} opciones Al crear, el secret es obligatorio.
 * @return {{nombre: string, config: Object, clientSecret: ?string}} Datos.
 */
function validarFuenteSharePoint(payload, {esNueva}) {
  const p = payload || {};
  const nombre = String(p.nombre || "").trim();
  if (!nombre) {
    throw new AppError(400, "El nombre de la fuente es obligatorio.");
  }
  if (nombre.length > NOMBRE_MAX) {
    throw new AppError(400,
        `El nombre no puede exceder ${NOMBRE_MAX} caracteres.`);
  }
  const tenantId = String(p.tenantId || "").trim();
  if (!RE_GUID.test(tenantId)) {
    throw new AppError(400, "El Tenant ID debe ser un GUID.");
  }
  const clientId = String(p.clientId || "").trim();
  if (!RE_GUID.test(clientId)) {
    throw new AppError(400, "El Client ID debe ser un GUID.");
  }
  const siteUrl = String(p.siteUrl || "").trim().replace(/\/+$/, "");
  if (!RE_SITE_URL.test(siteUrl)) {
    throw new AppError(400, "La URL del sitio debe tener la forma " +
        "https://<tenant>.sharepoint.com/sites/<sitio>.");
  }
  const biblioteca = String(p.biblioteca || "").trim() ||
      BIBLIOTECA_POR_DEFECTO;
  const clientSecret = String(p.clientSecret || "").trim() || null;
  if (esNueva && !clientSecret) {
    throw new AppError(400, "El client secret es obligatorio.");
  }
  return {
    nombre,
    config: {
      tenantId: tenantId.toLowerCase(),
      clientId: clientId.toLowerCase(),
      siteUrl,
      biblioteca,
      rutaBase: normalizarRutaBase(p.rutaBase),
    },
    clientSecret,
  };
}

/**
 * Fuente sin secretos (para cualquier respuesta).
 * @param {?Object} fuente Documento de fuentesDocumentales.
 * @return {?Object} Fuente pública.
 */
function aPublica(fuente) {
  if (!fuente) return null;
  const publica = {...fuente};
  CAMPOS_SECRETOS.forEach((campo) => {
    delete publica[campo];
  });
  return publica;
}

/**
 * Regla: una sola fuente activa por tipo y Mandante.
 * @param {Object[]} fuentes Fuentes del Mandante.
 * @param {string} tipo Tipo ("sharepoint").
 * @param {?string} [excluirId] Fuente que se está activando.
 * @return {boolean} true si ya hay otra activa.
 */
function hayOtraActiva(fuentes, tipo, excluirId = null) {
  return (fuentes || []).some((f) => f.tipo === tipo &&
      f.estado === "activa" && f.id !== excluirId);
}

module.exports = {
  RE_GUID, RE_SITE_URL, CAMPOS_SECRETOS, BIBLIOTECA_POR_DEFECTO,
  normalizarRutaBase, validarFuenteSharePoint, aPublica, hayOtraActiva,
};
