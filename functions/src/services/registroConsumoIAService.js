const consumoIARepository = require("../repositories/consumoIARepository");
const costoService = require("./costoService");

// Origen de cada llamada a la IA.
const ORIGENES = {
  REVISION_CARPETA: "revision_carpeta",
  PRUEBA_REGLAS: "prueba_reglas",
  REVISION_REQUERIMIENTO: "revision_requerimiento",
  // Revisión en lote de un expediente (mismo motor de reglas, varios
  // requisitos en una pasada).
  REVISION_LOTE: "revision_lote",
  PROBAR_CONEXION: "probar_conexion",
};

/**
 * Datos del registro de una llamada, con el precio del modelo congelado y
 * el costo calculado con ese precio. Función pura.
 * @param {Object} entrada Datos de la llamada (ver registrar).
 * @return {Object} Documento de consumosIA (sin createdAt).
 */
function armarRegistro({mandanteId = null, origen, expedienteId = null,
  requerimientoId = null, tipoDocumentalId = null,
  tipoDocumentalNombre = null, modelo, tokensEntrada = 0, tokensSalida = 0,
  precio = null, createdBy = null, fuente = null}) {
  const entrada = Number(precio?.entrada) || 0;
  const salida = Number(precio?.salida) || 0;
  const tEntrada = Number(tokensEntrada) || 0;
  const tSalida = Number(tokensSalida) || 0;
  return {
    mandanteId: mandanteId || null,
    origen,
    expedienteId: expedienteId || null,
    requerimientoId: requerimientoId || null,
    tipoDocumentalId: tipoDocumentalId || null,
    tipoDocumentalNombre: tipoDocumentalNombre || null,
    modelo: modelo || null,
    tokensEntrada: tEntrada,
    tokensSalida: tSalida,
    precioEntradaUsdMillon: entrada,
    precioSalidaUsdMillon: salida,
    costoUsd: costoService.calcular({[modelo]: {entrada, salida}}, modelo,
        tEntrada, tSalida),
    createdBy: createdBy || null,
    // Registro de origen (colección e ID), si la llamada dejó uno.
    fuente: fuente || null,
  };
}

/**
 * Registro del consumo de IA (colección consumosIA). Lo escribe siempre el
 * backend, en cada flujo que llama a la IA.
 */
class RegistroConsumoIAService {
  /**
   * Registra una llamada a la IA. Nunca lanza: la llamada ya se hizo (y se
   * pagó), así que un error al registrar no debe romper la operación del
   * usuario. Si falla, el registro de origen sigue existiendo y el script
   * backfillConsumosIA lo recupera.
   * @param {Object} entrada Datos.
   * @param {?string} entrada.mandanteId Mandante (null: interno).
   * @param {string} entrada.origen Uno de ORIGENES.
   * @param {?string} [entrada.expedienteId] Expediente.
   * @param {?string} [entrada.requerimientoId] Requerimiento.
   * @param {?string} [entrada.tipoDocumentalId] Tipo documental.
   * @param {?string} [entrada.tipoDocumentalNombre] Su nombre al momento.
   * @param {string} entrada.modelo Modelo usado.
   * @param {number} entrada.tokensEntrada Tokens de entrada.
   * @param {number} entrada.tokensSalida Tokens de salida.
   * @param {?{entrada: number, salida: number}} entrada.precio Precio
   *     vigente del modelo (USD por millón de tokens).
   * @param {?string} entrada.createdBy UID de quien la originó.
   * @param {?{coleccion: string, id: string}} [entrada.fuente] Registro de
   *     origen; con él, el ID del consumo es "<coleccion>_<id>".
   * @return {Promise<?string>} ID del registro, o null si falló.
   */
  async registrar(entrada) {
    const fuente = entrada.fuente || null;
    const id = fuente ? `${fuente.coleccion}_${fuente.id}` : null;
    try {
      return await consumoIARepository.crear(id, armarRegistro(entrada));
    } catch (error) {
      console.error("No se pudo registrar el consumo de IA " +
          `(${entrada.origen}${id ? `, ${id}` : ""}):`, error.message);
      return null;
    }
  }
}

module.exports = new RegistroConsumoIAService();
module.exports.ORIGENES = ORIGENES;
module.exports.armarRegistro = armarRegistro;
