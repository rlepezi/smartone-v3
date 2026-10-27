// Resultado propuesto de una revisión por reglas. Función PURA: la IA solo
// propone; el evaluador siempre confirma.
//
// Orden de decisión:
//   1. Alguna regla bloqueante con no_cumple     → no_cumple
//   2. Algún no_determinable, o una interpretativa con
//      confianza bajo el umbral (0,7 por defecto) → revision_manual
//   3. Solo fallan reglas de advertencia         → cumple_con_observacion
//   4. Todo lo demás                             → cumple

const RESULTADOS_PROPUESTOS = [
  "cumple", "cumple_con_observacion", "revision_manual", "no_cumple",
];
const UMBRAL_CONFIANZA_POR_DEFECTO = 0.7;

/**
 * Calcula el resultado propuesto.
 * @param {Array<{tipo: string, severidad: string, resultado: string,
 *     confianza: (number|null|undefined), nombre: (string|undefined)}>}
 *     resultadosReglas Resultado de cada regla aplicada.
 * @param {{umbralConfianza: (number|undefined)}} opciones Opciones.
 * @return {{resultado: string, motivos: Array<string>}} Resultado y por qué.
 */
function calcularResultadoPropuesto(resultadosReglas, opciones = {}) {
  const umbral = typeof opciones.umbralConfianza === "number" ?
    opciones.umbralConfianza : UMBRAL_CONFIANZA_POR_DEFECTO;
  const reglas = Array.isArray(resultadosReglas) ? resultadosReglas : [];
  const nombre = (r) => r.nombre || r.reglaId || "regla";
  if (!reglas.length) {
    return {resultado: "revision_manual",
      motivos: ["No hay reglas activas que aplicar."]};
  }
  const bloqueantes = reglas.filter((r) => r.severidad === "bloqueante" &&
    r.resultado === "no_cumple");
  if (bloqueantes.length) {
    return {resultado: "no_cumple",
      motivos: bloqueantes.map((r) => `No cumple: ${nombre(r)}.`)};
  }
  const dudosas = reglas.filter((r) => r.resultado === "no_determinable" ||
    (r.tipo === "interpretativa" && !(Number(r.confianza) >= umbral)));
  if (dudosas.length) {
    return {resultado: "revision_manual", motivos: dudosas.map((r) =>
      (r.resultado === "no_determinable" ?
        `No determinable: ${nombre(r)}.` :
        `Confianza baja (${Number(r.confianza || 0).toFixed(2)}): ` +
        `${nombre(r)}.`))};
  }
  const advertencias = reglas.filter((r) => r.resultado === "no_cumple");
  if (advertencias.length) {
    return {resultado: "cumple_con_observacion",
      motivos: advertencias.map((r) => `Advertencia: ${nombre(r)}.`)};
  }
  return {resultado: "cumple", motivos: []};
}

module.exports = {
  RESULTADOS_PROPUESTOS, UMBRAL_CONFIANZA_POR_DEFECTO,
  calcularResultadoPropuesto,
};
