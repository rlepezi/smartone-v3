// Identificación de una Maquinaria: "patente" (vehículo con placa chilena) o
// "serie" (N° de serie o código interno, p. ej. una retroexcavadora sin
// placa). Las maquinarias anteriores a este campo no tienen tipo (null) y no
// se asume ninguno.
const TIPOS_IDENTIFICACION = ["patente", "serie"];

// Formatos de placa chilena, sin separadores: autos AA1111 (antiguo) y
// BBBB11 (actual); motos AA111 (antiguo) y BBB11 (actual).
const FORMATOS_PATENTE = [
  /^[A-Z]{2}\d{4}$/, /^[A-Z]{4}\d{2}$/, /^[A-Z]{2}\d{3}$/, /^[A-Z]{3}\d{2}$/,
];

/**
 * Patente sin espacios, puntos ni guiones y en mayúsculas ("bb-cc 12" ->
 * "BBCC12").
 * @param {string} valor Patente escrita por el usuario.
 * @return {string} Patente normalizada.
 */
const normalizarPatente = (valor) =>
  String(valor || "").toUpperCase().replace(/[\s.\-·]/g, "");

/**
 * @param {string} valor Patente ya normalizada.
 * @return {boolean} Si tiene formato de placa chilena.
 */
const esPatenteChilena = (valor) =>
  FORMATOS_PATENTE.some((re) => re.test(valor));

module.exports = {
  TIPOS_IDENTIFICACION, normalizarPatente, esPatenteChilena,
};
