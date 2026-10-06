/**
 * Nombre a mostrar de un Mandante: nombreFantasia si tiene valor (con
 * trim), y si no, razonSocial. Única fuente de esta regla en el frontend
 * — no repetirla inline. Espejo en functions/src/utils/mandanteDisplay.js
 * y mobile/src/utils/mandanteDisplay.js.
 * Devuelve "" si no hay Mandante o no tiene ninguno de los dos campos,
 * para que cada pantalla decida su propio fallback (ej. el mandanteId).
 */
export const getMandanteDisplayName = (mandante) => {
  const fantasia = typeof mandante?.nombreFantasia === "string" ? mandante.nombreFantasia.trim() : "";
  if (fantasia) return fantasia;
  return typeof mandante?.razonSocial === "string" ? mandante.razonSocial.trim() : "";
};
