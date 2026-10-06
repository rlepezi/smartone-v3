// Nombre a mostrar de un Mandante: nombreFantasia si tiene valor (con
// trim), y si no, razonSocial. Espejo de
// frontend/src/utils/mandanteDisplay.js — no repetir la regla inline.
// Devuelve "" si no hay Mandante o no tiene ninguno de los dos campos.
export function getMandanteDisplayName(mandante) {
  const fantasia = typeof mandante?.nombreFantasia === "string" ?
    mandante.nombreFantasia.trim() : "";
  if (fantasia) return fantasia;
  return typeof mandante?.razonSocial === "string" ?
    mandante.razonSocial.trim() : "";
}
