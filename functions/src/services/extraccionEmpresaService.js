const mandanteRepository = require("../repositories/mandanteRepository");
const aiConfigService = require("./aiConfigService");
const costoService = require("./costoService");
const modeloReglasIAService = require("./modeloReglasIAService");
const registroConsumoIAService = require("./registroConsumoIAService");
const requerimientoReglaIAService = require("./requerimientoReglaIAService");
const {validateRut, cleanRut} = require("../utils/rutValidator");
const AppError = require("../utils/AppError");

// Datos que la IA extrae de un documento de la empresa (Nueva Empresa desde
// carpeta). Solo PROPONE: nada se guarda hasta que el usuario confirma el
// formulario.
const CAMPOS = [
  {clave: "razonSocial", etiqueta: "Razón social de la empresa (persona " +
    "jurídica), tal como aparece", tipo: "texto"},
  {clave: "rut", etiqueta: "RUT de la empresa (persona jurídica), no el de " +
    "una persona", tipo: "rut"},
  {clave: "giro", etiqueta: "Giro o actividad económica", tipo: "texto"},
  {clave: "direccion", etiqueta: "Dirección de la empresa", tipo: "texto"},
];
const DOCUMENTO = "Documento de una empresa chilena (e-RUT, inicio de " +
  "actividades, escritura de constitución, certificado de mutualidad o F30)";

/**
 * Extracción con IA de los datos de una empresa desde un documento de su
 * carpeta (solo superadmin). Una sola llamada al modelo por documento, con el
 * consumo registrado en el Mandante (origen "extraccion_empresa").
 */
class ExtraccionEmpresaService {
  /**
   * Exige superadmin y un Mandante existente.
   * @param {Object} actor Usuario autenticado.
   * @param {*} mandanteId Mandante.
   * @return {Promise<string>} ID del Mandante.
   */
  async _exigir(actor, mandanteId) {
    if (actor?.rol !== "superadmin") {
      throw new AppError(403, "Solo un superadmin extrae datos con IA al " +
          "crear una empresa.");
    }
    const id = String(mandanteId || "");
    if (!id || !(await mandanteRepository.getById(id))) {
      throw new AppError(400, "Indique un Mandante válido.");
    }
    return id;
  }

  /**
   * Antes de extraer: si la conexión IA está activa y el costo estimado del
   * documento. No llama a la IA.
   * @param {Object} payload {mandanteId, archivos: [{mime, paginas?}]}.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<{conexionActiva: boolean, modelo: ?string,
   *     costoEstimadoUsd: ?number, faltanPrecios: boolean}>} Estimación.
   */
  async estimar(payload, actor) {
    await this._exigir(actor, payload?.mandanteId);
    const estado = await aiConfigService.estado();
    const params = await aiConfigService.obtenerParametros();
    const modelo = params.modeloPorDefecto;
    const faltan = costoService.faltanPrecios(params.preciosPorModelo, modelo);
    const archivos = (Array.isArray(payload?.archivos) ? payload.archivos : [])
        .slice(0, requerimientoReglaIAService.MAX_ARCHIVOS)
        .map((a) => ({mime: String(a?.mime || ""),
          paginas: Number.isInteger(a?.paginas) && a.paginas > 0 ?
            Math.min(a.paginas, 200) : undefined}));
    return {conexionActiva: Boolean(estado.configurada), modelo,
      faltanPrecios: faltan,
      costoEstimadoUsd: faltan || !archivos.length ? null :
        costoService.estimar(params.preciosPorModelo, modelo, archivos)};
  }

  /**
   * Extrae razón social, RUT, giro y dirección (cada uno con su confianza)
   * del documento. El RUT se valida con el DV.
   * @param {Object} payload {mandanteId, archivos: [{nombre, mime,
   *     contenidoBase64, parte}]}.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object>} {campos: {clave: {valor, confianza}},
   *     rutValido, modelo, costoEstimado}.
   */
  async extraer(payload, actor) {
    const mandanteId = await this._exigir(actor, payload?.mandanteId);
    const piezas = requerimientoReglaIAService._piezas(payload?.archivos);
    const params = await aiConfigService.obtenerParametros();
    const modelo = params.modeloPorDefecto;
    if (costoService.faltanPrecios(params.preciosPorModelo, modelo)) {
      throw new AppError(409, aiConfigService.MENSAJE_SIN_PRECIOS ||
          "Configura los precios del modelo.");
    }
    await aiConfigService.validarLimiteMensual();
    const precio = costoService.precioDe(params.preciosPorModelo, modelo);
    const consumo = (tokensEntrada, tokensSalida) =>
      registroConsumoIAService.registrar({mandanteId,
        origen: registroConsumoIAService.ORIGENES.EXTRACCION_EMPRESA, modelo,
        tokensEntrada, tokensSalida, precio, createdBy: actor.uid});
    let respuesta;
    try {
      respuesta = await modeloReglasIAService.evaluar({piezas,
        tipo: {nombre: DOCUMENTO}, campos: CAMPOS, interpretativas: [],
        modelo});
    } catch (error) {
      // Una respuesta inválida igual consumió tokens.
      if (error.tokens) {
        await consumo(error.tokens.tokensEntrada, error.tokens.tokensSalida);
      }
      throw error;
    }
    await consumo(respuesta.tokensEntrada, respuesta.tokensSalida);
    const campos = respuesta.camposExtraidos || {};
    const rut = campos.rut?.valor || null;
    return {
      campos,
      rutValido: Boolean(rut) && validateRut(cleanRut(rut)),
      modelo,
      costoEstimado: costoService.calcular(params.preciosPorModelo, modelo,
          respuesta.tokensEntrada, respuesta.tokensSalida),
    };
  }
}

module.exports = new ExtraccionEmpresaService();
module.exports.CAMPOS = CAMPOS;
