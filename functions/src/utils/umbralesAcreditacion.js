const AppError = require("./AppError");

// Umbrales del nivel de acreditación por % de cumplimiento, configurables
// por Mandante (campo `umbralesAcreditacion` del Mandante). Desde
// `acreditada` es Acreditada, desde `aceptable` es Aceptable y bajo
// `aceptable` es Rechazada. Sin configurar (null) rigen los de defecto.
const UMBRALES_DEFECTO = {acreditada: 100, aceptable: 85};

/**
 * Valida y normaliza los umbrales enviados al editar un Mandante.
 * @param {?Object} valor {acreditada, aceptable} en % enteros, o null para
 *     volver a los de defecto.
 * @return {?{acreditada: number, aceptable: number}} Umbrales a guardar.
 */
const validarUmbralesAcreditacion = (valor) => {
  if (valor === null) return null;
  if (typeof valor !== "object" || Array.isArray(valor)) {
    throw new AppError(400, "Los umbrales de acreditación no son válidos.");
  }
  const acreditada = Number(valor.acreditada);
  const aceptable = Number(valor.aceptable);
  const esPct = (n) => Number.isInteger(n) && n >= 1 && n <= 100;
  if (!esPct(acreditada) || !esPct(aceptable)) {
    throw new AppError(400,
        "Los umbrales deben ser números enteros entre 1 y 100.");
  }
  if (aceptable >= acreditada) {
    throw new AppError(400,
        "El umbral de Aceptable debe ser menor que el de Acreditada.");
  }
  return {acreditada, aceptable};
};

module.exports = {UMBRALES_DEFECTO, validarUmbralesAcreditacion};
