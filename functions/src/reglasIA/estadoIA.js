// Estado IA de un requerimiento (reglas de revisión). Funciones PURAS.
//
//   sin_reglas → en_definicion   automático al asignar tipo o primera regla
//   en_definicion → en_prueba    manual: tipo documental y ≥ 1 regla activa
//   en_prueba → habilitado       manual: una prueba posterior al último
//                                cambio de reglas o vínculos
//   cualquiera → en_definicion   manual, o automático si cambian las reglas
//                                estando habilitado
//
// Sin migración: un requerimiento sin `estadoIA` se lee "sin_reglas".

const ESTADOS_IA_REQUERIMIENTO = [
  "sin_reglas", "en_definicion", "en_prueba", "habilitado",
];
const AVISO_VUELVE_A_DEFINICION = "Al modificar las reglas, el " +
    "requerimiento vuelve a En definición y deberá probarse de nuevo";

/**
 * Estado IA leído (con default).
 * @param {Object} requerimiento Requerimiento.
 * @return {string} Estado.
 */
function estadoIADe(requerimiento) {
  const e = requerimiento?.estadoIA;
  return ESTADOS_IA_REQUERIMIENTO.includes(e) ? e : "sin_reglas";
}

/**
 * Estado tras un cambio de tipo, reglas o vínculos.
 * @param {string} actual Estado actual.
 * @return {{estado: string, aviso: ?string}} Nuevo estado y aviso.
 */
function estadoTrasCambio(actual) {
  if (actual === "sin_reglas") return {estado: "en_definicion", aviso: null};
  if (actual === "habilitado") {
    return {estado: "en_definicion", aviso: AVISO_VUELVE_A_DEFINICION};
  }
  return {estado: actual, aviso: null};
}

/**
 * Valida una transición manual.
 * @param {string} actual Estado actual.
 * @param {string} destino Estado pedido.
 * @param {{tieneTipo: boolean, reglasActivas: number,
 *     pruebaVigente: boolean}} condiciones Condiciones.
 * @return {?string} Mensaje de error, o null si procede.
 */
function errorTransicion(actual, destino, condiciones) {
  if (!ESTADOS_IA_REQUERIMIENTO.includes(destino)) {
    return `Estado IA no válido: ${destino}.`;
  }
  if (actual === destino) return "El requerimiento ya está en ese estado.";
  if (destino === "en_definicion") return null;
  if (destino === "en_prueba") {
    if (actual !== "en_definicion") {
      return "Solo se pasa a En prueba desde En definición.";
    }
    if (!condiciones.tieneTipo) return "Asigne primero un tipo documental.";
    if (!(condiciones.reglasActivas > 0)) {
      return "Agregue al menos una regla activa.";
    }
    return null;
  }
  if (destino === "habilitado") {
    if (actual !== "en_prueba") {
      return "Solo se habilita desde En prueba.";
    }
    if (!condiciones.pruebaVigente) {
      return "Pruebe las reglas al menos una vez después del último cambio.";
    }
    return null;
  }
  return "Un requerimiento no vuelve a Sin reglas.";
}

module.exports = {
  ESTADOS_IA_REQUERIMIENTO, AVISO_VUELVE_A_DEFINICION, estadoIADe,
  estadoTrasCambio, errorTransicion,
};
