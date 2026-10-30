// Nombres de Empresas (razón social y nombre de fantasía) y de Proyectos: se
// guardan siempre en MAYÚSCULAS (regla de presentación de toda la
// aplicación). Locale es-CL para que las tildes y la ñ se conviertan bien.

/**
 * Texto recortado y en mayúsculas.
 * @param {*} valor Texto recibido.
 * @return {*} El texto en mayúsculas, o el valor tal cual si no es texto.
 */
function aMayusculas(valor) {
  return typeof valor === "string" ?
    valor.trim().toLocaleUpperCase("es-CL") : valor;
}

module.exports = {aMayusculas};
