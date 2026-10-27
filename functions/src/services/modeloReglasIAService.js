const Anthropic = require("@anthropic-ai/sdk");
const aiConfigService = require("./aiConfigService");
const {traducirErrorIA} = require("../utils/erroresIA");
const {esfuerzoPara} = require("../utils/modelosIA");
const {
  PROMPT_SISTEMA, esquemaRespuesta, textoPedido, validarRespuesta,
} = require("../reglasIA/prueba");
const AppError = require("../utils/AppError");

const MIME_PDF = "application/pdf";
// Campos + justificaciones, con holgura para el pensamiento adaptativo de
// los modelos 5.x (solo se cobra lo que se usa).
const MAX_TOKENS = 4096;
const TIMEOUT_MS = 90000;
const MAX_REINTENTOS_SDK = 2;
// Reintentos propios si la respuesta no valida (además del primer intento).
const REINTENTOS_RESPUESTA = 1;

/**
 * Llamada única al modelo para las reglas de revisión: extrae los campos del
 * tipo documental y juzga las reglas interpretativas, con todos los archivos
 * del mismo sujeto (anverso y reverso) en un solo mensaje. La API key se lee
 * solo aquí (Cloud Functions); nunca llega al navegador.
 */
class ModeloReglasIAService {
  /**
   * Evalúa los archivos.
   * @param {Object} entrada Datos.
   * @param {Array<{buffer: Buffer, mime: string}>} entrada.piezas Archivos
   *     (imagen JPEG/PNG/WebP o PDF).
   * @param {Object} entrada.tipo Tipo documental ({nombre}).
   * @param {Array<Object>} entrada.campos Campos del tipo.
   * @param {Array<Object>} entrada.interpretativas Reglas interpretativas.
   * @param {string} entrada.modelo ID del modelo.
   * @return {Promise<{camposExtraidos: Object, interpretativas: Array,
   *     tokensEntrada: number, tokensSalida: number, intentos: number,
   *     latenciaMs: number}>} Resultado validado.
   */
  async evaluar({piezas, tipo, campos, interpretativas, modelo}) {
    const apiKey = await aiConfigService.obtenerApiKey();
    const cliente = new Anthropic({
      apiKey, maxRetries: MAX_REINTENTOS_SDK, timeout: TIMEOUT_MS,
    });
    const contenido = [
      ...piezas.map((p) => {
        const source = {type: "base64", media_type: p.mime,
          data: p.buffer.toString("base64")};
        return p.mime === MIME_PDF ? {type: "document", source} :
          {type: "image", source};
      }),
      {type: "text", text: textoPedido(tipo, campos, interpretativas)},
    ];
    const pedido = {
      model: modelo,
      max_tokens: MAX_TOKENS,
      system: PROMPT_SISTEMA,
      messages: [{role: "user", content: contenido}],
      output_config: {
        ...esfuerzoPara(modelo),
        format: {type: "json_schema",
          schema: esquemaRespuesta(campos, interpretativas)},
      },
    };
    const inicio = Date.now();
    let tokensEntrada = 0;
    let tokensSalida = 0;
    let ultimoError = null;
    for (let intento = 1; intento <= 1 + REINTENTOS_RESPUESTA; intento++) {
      let respuesta;
      try {
        // eslint-disable-next-line no-await-in-loop
        respuesta = await cliente.messages.create(pedido);
      } catch (error) {
        throw new AppError(502, traducirErrorIA(error, modelo));
      }
      tokensEntrada += respuesta.usage?.input_tokens || 0;
      tokensSalida += respuesta.usage?.output_tokens || 0;
      if (respuesta.stop_reason === "refusal") {
        throw new AppError(422, "El modelo rechazó procesar el documento.");
      }
      let datos = null;
      try {
        datos = JSON.parse(respuesta.content
            .find((b) => b.type === "text")?.text || "");
      } catch (error) {
        datos = null;
      }
      const v = validarRespuesta(datos, campos, interpretativas);
      if (v.ok) {
        return {...v.valor, tokensEntrada, tokensSalida, intentos: intento,
          latenciaMs: Date.now() - inicio};
      }
      ultimoError = respuesta.stop_reason === "max_tokens" ?
        "La respuesta del modelo quedó incompleta." : v.error;
    }
    const error = new AppError(502, "La respuesta del modelo no es válida " +
        `tras reintentar: ${ultimoError}`);
    error.tokens = {tokensEntrada, tokensSalida};
    throw error;
  }
}

module.exports = new ModeloReglasIAService();
module.exports.MIME_PDF = MIME_PDF;
