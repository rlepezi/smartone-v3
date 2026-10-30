const Anthropic = require("@anthropic-ai/sdk");
const aiConfigService = require("./aiConfigService");
const {
  PROMPT_SISTEMA, ESQUEMA_DOCUMENTO,
} = require("../../config/iaExtraccion");
const {traducirErrorIA} = require("../utils/erroresIA");
const {esfuerzoPara} = require("../utils/modelosIA");

const MIMES_IMAGEN = ["image/jpeg", "image/png", "image/webp"];
const MIME_PDF = "application/pdf";
const MIMES_ACEPTADOS = [...MIMES_IMAGEN, MIME_PDF];
// Holgura sobre los ~500 tokens de la respuesta: los modelos 5.x piensan
// (thinking adaptativo) antes de responder, y ese pensamiento cuenta en
// max_tokens. Solo se cobra lo que se usa.
const MAX_TOKENS = 2048;
const TIMEOUT_MS = 60000;
// Reintentos del SDK con backoff exponencial ante 429, 529 y 5xx (no ante
// 401 ni otros 4xx).
const MAX_REINTENTOS = 2;

/**
 * Error de extracción ya traducido (el procesamiento queda en "error").
 */
class ErrorExtraccion extends Error {}

/**
 * Extracción de datos de un documento con la API de Anthropic. Agnóstico de
 * la fuente: recibe el contenido y su tipo MIME.
 */
class ExtraccionIAService {
  /**
   * Extrae los datos de un documento.
   * @param {{buffer: Buffer, mime: string, modelo: string}} entrada Archivo
   *     (imagen JPEG/PNG/WebP o PDF) y modelo.
   * @return {Promise<{datos: Object, tokensEntrada: number,
   *     tokensSalida: number, latenciaMs: number}>} Resultado.
   */
  async extraer({buffer, mime, modelo}) {
    if (!MIMES_ACEPTADOS.includes(mime)) {
      throw new ErrorExtraccion(`Formato no soportado: ${mime}.`);
    }
    const apiKey = await aiConfigService.obtenerApiKey();
    const cliente = new Anthropic({
      apiKey, maxRetries: MAX_REINTENTOS, timeout: TIMEOUT_MS,
    });
    const fuente = {type: "base64", media_type: mime,
      data: buffer.toString("base64")};
    const inicio = Date.now();
    let respuesta;
    try {
      respuesta = await cliente.messages.create({
        model: modelo,
        max_tokens: MAX_TOKENS,
        system: PROMPT_SISTEMA,
        messages: [{
          role: "user",
          content: [
            mime === MIME_PDF ?
              {type: "document", source: fuente} :
              {type: "image", source: fuente},
            {type: "text", text: "Extrae los datos de este documento."},
          ],
        }],
        output_config: {
          ...esfuerzoPara(modelo),
          format: {type: "json_schema", schema: ESQUEMA_DOCUMENTO},
        },
      });
    } catch (error) {
      throw new ErrorExtraccion(traducirErrorIA(error, modelo));
    }
    const latenciaMs = Date.now() - inicio;
    if (respuesta.stop_reason === "refusal") {
      throw new ErrorExtraccion("El modelo rechazó procesar el documento.");
    }
    if (respuesta.stop_reason === "max_tokens") {
      throw new ErrorExtraccion("La respuesta del modelo quedó incompleta.");
    }
    const bloque = respuesta.content.find((b) => b.type === "text");
    let datos;
    try {
      datos = JSON.parse(bloque?.text || "");
    } catch (error) {
      throw new ErrorExtraccion("La respuesta del modelo no es JSON válido.");
    }
    if (typeof datos.legibilidad === "number") {
      datos.legibilidad = Math.min(Math.max(datos.legibilidad, 0), 1);
    }
    return {
      datos,
      tokensEntrada: respuesta.usage?.input_tokens || 0,
      tokensSalida: respuesta.usage?.output_tokens || 0,
      latenciaMs,
    };
  }
}

module.exports = new ExtraccionIAService();
module.exports.ErrorExtraccion = ErrorExtraccion;
module.exports.MIMES_ACEPTADOS = MIMES_ACEPTADOS;
module.exports.MIME_PDF = MIME_PDF;
