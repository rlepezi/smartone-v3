// Nombre a mostrar de un Mandante: nombreFantasia si tiene valor (con
// trim), y si no, razonSocial. Espejo manual de
// frontend/src/utils/mandanteDisplay.js (mismo criterio de "espejo" que
// dateFormat.js) — no repetir la regla inline.

/**
 * Devuelve el nombre a mostrar de un Mandante.
 * @param {?Object} mandante Mandante (o null).
 * @return {string} nombreFantasia con trim si no está vacío; si no,
 *     razonSocial; "" si no hay ninguno.
 */
function getMandanteDisplayName(mandante) {
  const fantasia = typeof mandante?.nombreFantasia === "string" ?
      mandante.nombreFantasia.trim() : "";
  if (fantasia) return fantasia;
  return typeof mandante?.razonSocial === "string" ?
      mandante.razonSocial.trim() : "";
}

module.exports = {getMandanteDisplayName};
