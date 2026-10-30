// Contadores de cumplimiento de un Expediente sobre sus instancias de
// Requerimiento (expedienteRequerimientos). Única definición de:
//  - el resumen {activas, cumple, noCumple, noAplica, pendiente} (una
//    instancia activa sin evaluar cuenta como "pendiente");
//  - el % de cumplimiento: cumple / (activas − noAplica), null si el
//    denominador es 0 (la interfaz muestra "—").

const CAMPO_POR_RESULTADO = {
  cumple: "cumple",
  no_cumple: "noCumple",
  no_aplica: "noAplica",
  pendiente: "pendiente",
};

const RESULTADOS = Object.keys(CAMPO_POR_RESULTADO);

/**
 * Resumen vacío.
 * @return {{activas: number, cumple: number, noCumple: number,
 *     noAplica: number, pendiente: number}} Contadores en 0.
 */
function resumenVacio() {
  return {activas: 0, cumple: 0, noCumple: 0, noAplica: 0, pendiente: 0};
}

/**
 * Campo del resumen que corresponde a un resultado.
 * @param {?string} resultado Resultado de la instancia.
 * @return {string} Campo del resumen ("pendiente" si no hay resultado).
 */
function campoDeResultado(resultado) {
  return CAMPO_POR_RESULTADO[resultado] || "pendiente";
}

/**
 * Clave del sujeto en `resumenSujetos` del Expediente.
 * @param {{tipoEntidad: string, personaId: ?string, recursoId: ?string}}
 *     instancia Instancia (o sujeto con la misma forma).
 * @return {string} "empresa", "persona_<id>" o "recurso_<id>".
 */
function claveSujeto(instancia) {
  if (instancia.tipoEntidad === "persona") {
    return `persona_${instancia.personaId}`;
  }
  if (instancia.tipoEntidad === "recurso") {
    return `recurso_${instancia.recursoId}`;
  }
  return "empresa";
}

/**
 * % de cumplimiento de un resumen.
 * @param {?Object} resumen Resumen de contadores.
 * @return {?number} Porcentaje entero, o null si no hay nada evaluable.
 */
function porcentajeCumplimiento(resumen) {
  if (!resumen) return null;
  const denominador = (resumen.activas || 0) - (resumen.noAplica || 0);
  if (denominador <= 0) return null;
  return Math.round(((resumen.cumple || 0) / denominador) * 100);
}

/**
 * Suma resúmenes (p. ej. varios Expedientes).
 * @param {Object[]} resumenes Resúmenes a sumar.
 * @return {Object} Resumen total.
 */
function sumarResumenes(resumenes) {
  const total = resumenVacio();
  (resumenes || []).forEach((r) => {
    if (!r) return;
    Object.keys(total).forEach((k) => {
      total[k] += r[k] || 0;
    });
  });
  return total;
}

/**
 * Recalcula resumen y resumenSujetos desde las instancias ACTIVAS.
 * @param {Object[]} instanciasActivas Instancias con estado "activo".
 * @return {{resumen: Object, resumenSujetos: Object<string, Object>}}
 *     Contadores completos.
 */
function resumirInstancias(instanciasActivas) {
  const resumen = resumenVacio();
  const resumenSujetos = {};
  instanciasActivas.forEach((i) => {
    const clave = claveSujeto(i);
    if (!resumenSujetos[clave]) resumenSujetos[clave] = resumenVacio();
    const campo = campoDeResultado(i.resultado);
    resumen.activas++;
    resumen[campo]++;
    resumenSujetos[clave].activas++;
    resumenSujetos[clave][campo]++;
  });
  return {resumen, resumenSujetos};
}

module.exports = {
  RESULTADOS, resumenVacio, campoDeResultado, claveSujeto,
  porcentajeCumplimiento, sumarResumenes, resumirInstancias,
};
