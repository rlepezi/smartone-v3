// Revisión en lote de un expediente: qué propuestas se pueden confirmar en
// bloque. Función PURA.

const {aFecha} = require("../utils/vencimientos");

// Motivos por los que una propuesta no se confirma en bloque.
const MOTIVOS_NO_CONFIRMABLE = {
  no_encontrada: "La propuesta no es de este expediente.",
  ya_resuelta: "La propuesta ya fue confirmada o descartada.",
  requisito_inactivo: "El requisito ya no está activo.",
  revision_manual: "Requiere revisión manual: la IA no propone resultado.",
  sin_fecha_vencimiento: "Cumple, pero falta la fecha de vencimiento " +
    "obligatoria: complétela en la planilla.",
  evaluado_despues: "El requisito se evaluó después de la propuesta.",
};

/**
 * Motivo por el que una revisión no se confirma en bloque, o null.
 * @param {?Object} revision Revisión IA (revisionesRequerimientoIA).
 * @param {string} expedienteId Expediente del lote.
 * @param {?Object} instancia Requisito activo de la revisión.
 * @param {?Object} vigente Evaluación vigente del requisito, si hay.
 * @return {?string} Clave de MOTIVOS_NO_CONFIRMABLE o null.
 */
function motivoNoConfirmable(revision, expedienteId, instancia, vigente) {
  if (!revision || revision.expedienteId !== expedienteId) {
    return "no_encontrada";
  }
  if (revision.estado !== "propuesta") return "ya_resuelta";
  if (!instancia) return "requisito_inactivo";
  const p = revision.propuestaEvaluacion || {};
  if (!p.resultado) return "revision_manual";
  if (p.resultado === "cumple" && instancia.requiereVencimiento &&
      !p.fechaVencimiento) {
    return "sin_fecha_vencimiento";
  }
  const ms = (v) => aFecha(v)?.getTime() || 0;
  if (vigente && ms(vigente.createdAt) > ms(revision.createdAt)) {
    return "evaluado_despues";
  }
  return null;
}

module.exports = {MOTIVOS_NO_CONFIRMABLE, motivoNoConfirmable};
