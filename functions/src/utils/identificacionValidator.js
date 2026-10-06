const {validateRut, cleanRut} = require("./rutValidator");
const AppError = require("./AppError");

const TIPOS_VALIDOS = ["RUT", "PASAPORTE"];

/**
 * Normaliza un país a un valor consistente (mayúsculas, sin espacios de
 * más) para que "Chile"/"CHILE"/" chile " generen la misma clave de
 * índice de unicidad — el valor mostrado al usuario (`identificacion.pais`)
 * no se normaliza, solo el usado para la clave.
 * @param {string} pais País a normalizar.
 * @return {string} País normalizado para la clave de índice.
 */
function normalizarPais(pais) {
  return (pais || "").trim().toUpperCase();
}

/**
 * Normaliza el número de identificación: solo alfanumérico en mayúsculas,
 * sin puntos/guiones/espacios — evita falsos duplicados o negativos por
 * formato. Para RUT reutiliza cleanRut (mismo criterio que ya usa el resto
 * del sistema, mantiene el dígito verificador).
 * @param {string} tipo "RUT" o "PASAPORTE".
 * @param {string} numero Número a normalizar.
 * @return {string} Número normalizado.
 */
function normalizarNumero(tipo, numero) {
  if (tipo === "RUT") return cleanRut(numero);
  return (numero || "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

/**
 * Valida y normaliza el objeto `identificacion` de una Persona
 * ({tipo, numero, pais}). RUT: formato + dígito verificador (misma
 * validación ya existente, sin duplicarla). PASAPORTE: solo presencia y
 * largo razonable — cada país tiene su propio formato de pasaporte, no
 * hay un dígito verificador universal que validar.
 * @param {{tipo: string, numero: string, pais: string}} identificacion
 *     Identificación a validar (tal como llega del cliente).
 * @return {{tipo: string, numero: string, pais: string}} Identificación
 *     normalizada, lista para guardar (numero limpio, pais recortado).
 */
function validarIdentificacion(identificacion) {
  if (!identificacion || typeof identificacion !== "object") {
    throw new AppError(400, "El campo 'identificacion' es obligatorio.");
  }
  const {tipo, numero, pais} = identificacion;

  if (!TIPOS_VALIDOS.includes(tipo)) {
    throw new AppError(
        400,
        "El tipo de identificación debe ser uno de: " +
        `${TIPOS_VALIDOS.join(", ")}.`,
    );
  }
  if (!pais || !pais.trim()) {
    throw new AppError(400, "El país es obligatorio.");
  }
  if (!numero || !numero.trim()) {
    throw new AppError(400, "El número de identificación es obligatorio.");
  }

  if (tipo === "RUT") {
    if (!validateRut(numero)) {
      throw new AppError(
          400, `El RUT proporcionado (${numero}) no es válido.`,
      );
    }
  } else if (numero.trim().length < 4 || numero.trim().length > 20) {
    throw new AppError(
        400,
        "El número de pasaporte debe tener entre 4 y 20 caracteres.",
    );
  }

  return {
    tipo,
    numero: normalizarNumero(tipo, numero),
    pais: pais.trim(),
  };
}

/**
 * Clave determinística del documento índice de unicidad
 * `personasIdentificacion/{clave}`.
 * @param {{tipo: string, numero: string, pais: string}}
 *     identificacionNormalizada Identificación ya normalizada (ver
 *     validarIdentificacion — `numero` ya viene limpio).
 * @return {string} Clave del documento índice.
 */
function claveIdentificacion({tipo, numero, pais}) {
  return `${tipo}_${normalizarPais(pais)}_${numero}`;
}

module.exports = {
  TIPOS_VALIDOS,
  normalizarPais,
  normalizarNumero,
  validarIdentificacion,
  claveIdentificacion,
};
