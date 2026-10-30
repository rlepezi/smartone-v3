// Unicidad del nombre de un Requerimiento: dentro de un Mandante y un tipo
// de entidad no puede haber dos Requerimientos ACTIVOS con el mismo nombre,
// comparando sin mayúsculas ni tildes, con trim y espacios colapsados. Se
// garantiza con el índice `requerimientosNombre` (un documento por nombre
// tomado), escrito en la misma transacción que el Requerimiento. Lo usan
// requerimientoService y el script de migración.

const COLECCION_INDICE = "requerimientosNombre";

/**
 * Nombre normalizado para comparar.
 * @param {*} nombre Nombre del Requerimiento.
 * @return {string} Minúsculas, sin tildes, con trim y espacios colapsados.
 */
function normalizarNombre(nombre) {
  return String(nombre || "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .trim()
      .replace(/\s+/g, " ");
}

/**
 * ID del documento del índice: <mandanteId>|<tipoEntidad>|<nombre
 * normalizado>. La barra "/" no puede ir en un ID de Firestore: se
 * guarda como "%2F".
 * @param {string} mandanteId ID del Mandante.
 * @param {string} tipoEntidad "empresa" | "persona" | "recurso".
 * @param {*} nombre Nombre del Requerimiento.
 * @return {string} Clave del índice.
 */
function claveNombre(mandanteId, tipoEntidad, nombre) {
  const normalizado = normalizarNombre(nombre).replace(/\//g, "%2F");
  return `${mandanteId}|${tipoEntidad}|${normalizado}`;
}

module.exports = {COLECCION_INDICE, normalizarNombre, claveNombre};
