const {aFechaIso, valorDe} = require("./verificaciones/comunes");

// Propuesta para el formulario de evaluación a partir de una revisión por
// reglas. Función PURA. "Aplicar propuesta" solo la copia al formulario; el
// evaluador revisa y guarda como siempre.
//
//   cumple / cumple_con_observacion → SI (cumple)
//   no_cumple                       → NO (no_cumple)
//   revision_manual                 → sin marcar (el evaluador decide)
// La IA nunca propone N/A.

const MAX_OBSERVACIONES = 1000;
const ENCABEZADO = {
  cumple: "Revisión IA: cumple todas las reglas.",
  cumple_con_observacion: "Revisión IA: cumple, con observaciones.",
  no_cumple: "Revisión IA: no cumple.",
  revision_manual: "Revisión IA: requiere revisión manual.",
};
const RESULTADO_EVALUACION = {
  cumple: "cumple", cumple_con_observacion: "cumple", no_cumple: "no_cumple",
  revision_manual: null,
};

/**
 * Reglas que explican el resultado (las que fallan o quedaron en duda).
 * @param {string} resultado Resultado propuesto.
 * @param {Array<Object>} reglas Resultado por regla.
 * @param {number} umbral Confianza mínima de las interpretativas.
 * @return {Array<Object>} Reglas a mencionar.
 */
function reglasDelMotivo(resultado, reglas, umbral) {
  if (resultado === "no_cumple") {
    return reglas.filter((r) => r.severidad === "bloqueante" &&
      r.resultado === "no_cumple");
  }
  if (resultado === "revision_manual") {
    return reglas.filter((r) => r.resultado === "no_determinable" ||
      (r.tipo === "interpretativa" && !(Number(r.confianza) >= umbral)));
  }
  if (resultado === "cumple_con_observacion") {
    return reglas.filter((r) => r.resultado === "no_cumple");
  }
  return [];
}

/**
 * Propuesta de evaluación.
 * @param {Object} entrada Datos.
 * @param {{resultado: string}} entrada.resultadoPropuesto Resultado.
 * @param {Array<Object>} entrada.resultadosReglas Resultado por regla.
 * @param {Object} entrada.camposExtraidos Campos extraídos.
 * @param {boolean} entrada.requiereVencimiento Si el requisito pide fecha.
 * @param {number} [entrada.umbralConfianza] Umbral (0,7 por defecto).
 * @return {{resultado: ?string, observaciones: string,
 *     fechaVencimiento: ?string}} Propuesta (fecha en AAAA-MM-DD).
 */
function propuestaEvaluacion({resultadoPropuesto, resultadosReglas,
  camposExtraidos, requiereVencimiento, umbralConfianza = 0.7}) {
  const clave = resultadoPropuesto?.resultado;
  const resultado = RESULTADO_EVALUACION[clave] ?? null;
  const lineas = [ENCABEZADO[clave] || "Revisión IA."];
  reglasDelMotivo(clave, resultadosReglas || [], umbralConfianza)
      .forEach((r) => lineas.push(`- ${r.nombre}: ${r.detalle || ""}`.trim()));
  let observaciones = lineas.join("\n");
  if (observaciones.length > MAX_OBSERVACIONES) {
    observaciones = `${observaciones.slice(0, MAX_OBSERVACIONES - 1)}…`;
  }
  const fecha = requiereVencimiento && resultado === "cumple" ?
    aFechaIso(valorDe(camposExtraidos, "fechaVencimiento")) : null;
  return {resultado, observaciones, fechaVencimiento: fecha};
}

module.exports = {propuestaEvaluacion, MAX_OBSERVACIONES};
