const {
  cumple, noCumple, noDeterminable, valorDe, aFechaIso, sumarDias, ddmmaaaa,
  fechaEvaluacion,
} = require("./comunes");

// Verificaciones de fechas: vigencia y antigüedad del documento.

/**
 * El documento está vigente a la fecha de evaluación (más un margen).
 * @param {Object} campos Campos extraídos ({fechaVencimiento}).
 * @param {Object} contexto {fechaEvaluacion} (por defecto, hoy).
 * @param {Object} parametros {diasMargen}.
 * @return {{resultado: string, detalle: string}} Resultado.
 */
function vigenteAFecha(campos, contexto, parametros) {
  const vence = aFechaIso(valorDe(campos, "fechaVencimiento"));
  if (!vence) return noDeterminable("No se leyó la fecha de vencimiento.");
  const evaluacion = fechaEvaluacion(contexto);
  if (!evaluacion) {
    return noDeterminable("La fecha de evaluación no es válida.");
  }
  const margen = Number(parametros?.diasMargen) || 0;
  const limite = sumarDias(evaluacion, margen);
  return vence >= limite ?
    cumple(`Vence el ${ddmmaaaa(vence)}.`) :
    noCumple(`Venció o vence el ${ddmmaaaa(vence)}` +
        (margen ? ` (se exigen ${margen} días de margen).` : "."));
}

/**
 * El documento está vigente hasta el término del proyecto.
 * @param {Object} campos Campos extraídos ({fechaVencimiento}).
 * @param {Object} contexto {fechaTerminoProyecto}.
 * @return {{resultado: string, detalle: string}} Resultado.
 */
function vigenteHastaFinProyecto(campos, contexto) {
  const vence = aFechaIso(valorDe(campos, "fechaVencimiento"));
  if (!vence) return noDeterminable("No se leyó la fecha de vencimiento.");
  const termino = aFechaIso(contexto?.fechaTerminoProyecto);
  if (!termino) {
    return noDeterminable("El proyecto no tiene fecha de término.");
  }
  return vence >= termino ?
    cumple(`Vence el ${ddmmaaaa(vence)}, después del término del proyecto ` +
        `(${ddmmaaaa(termino)}).`) :
    noCumple(`Vence el ${ddmmaaaa(vence)}, antes del término del proyecto ` +
        `(${ddmmaaaa(termino)}).`);
}

/**
 * El documento no tiene más de `diasMaximos` días de emitido.
 * @param {Object} campos Campos extraídos ({fechaEmision}).
 * @param {Object} contexto {fechaEvaluacion} (por defecto, hoy).
 * @param {Object} parametros {diasMaximos}.
 * @return {{resultado: string, detalle: string}} Resultado.
 */
function antiguedadMaxima(campos, contexto, parametros) {
  const emitido = aFechaIso(valorDe(campos, "fechaEmision"));
  if (!emitido) return noDeterminable("No se leyó la fecha de emisión.");
  const evaluacion = fechaEvaluacion(contexto);
  if (!evaluacion) {
    return noDeterminable("La fecha de evaluación no es válida.");
  }
  const dias = Number(parametros?.diasMaximos);
  if (!(dias >= 0)) return noDeterminable("Falta el máximo de días.");
  return emitido >= sumarDias(evaluacion, -dias) ?
    cumple(`Emitido el ${ddmmaaaa(emitido)}.`) :
    noCumple(`Emitido el ${ddmmaaaa(emitido)}: tiene más de ${dias} días.`);
}

module.exports = {vigenteAFecha, vigenteHastaFinProyecto, antiguedadMaxima};
