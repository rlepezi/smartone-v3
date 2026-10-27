const {AI_CONFIG_ENCRYPTION_KEY} = require("../utils/secretosIA");
const Anthropic = require("@anthropic-ai/sdk");
const configuracionIARepository =
    require("../repositories/configuracionIARepository");
const revisionRequerimientoIARepository =
    require("../repositories/revisionRequerimientoIARepository");
const pruebaReglaIARepository =
    require("../repositories/pruebaReglaIARepository");
const {UMBRAL_CONFIANZA_POR_DEFECTO} = require("../reglasIA/resultado");
const procesamientoIARepository =
    require("../repositories/procesamientoIARepository");
const usuarioRepository = require("../repositories/usuarioRepository");
const bitacoraLogger = require("../utils/bitacoraLogger");
const {fechaSantiago} = require("../utils/fechaSantiago");
const {traducirErrorIA} = require("../utils/erroresIA");
const {esfuerzoPara} = require("../utils/modelosIA");
const {claveDesdeBase64, cifrar, descifrar} = require("../utils/cifrado");
const {faltanPrecios} = require("./costoService");
const AppError = require("../utils/AppError");

const PROVEEDOR = "anthropic";
const PREFIJO_API_KEY = "sk-ant-";
const TTL_CACHE_MS = 5 * 60 * 1000;
const MS_DIA = 24 * 60 * 60 * 1000;
const RE_MODELO = /^[a-z0-9][a-z0-9.-]{2,63}$/;
const MENSAJE_NO_CONFIGURADA = "La IA no está configurada. Un superadmin " +
    "debe ingresar la API key en Configuración → Inteligencia Artificial.";

// Sin modelos ni precios en el código: se configuran en Configuración →
// Inteligencia Artificial con los vigentes de Anthropic. Mientras falten,
// no se puede estimar ni iniciar una revisión.
const MENSAJE_SIN_PRECIOS = "Configura los precios del modelo en " +
    "Configuración → Inteligencia Artificial.";

// API key descifrada, por instancia de Functions.
let cache = null;

/**
 * Configuración de IA: API key cifrada (AES-256-GCM), modelo por defecto,
 * precios y límite de gasto mensual. La key nunca sale del backend.
 */
class AIConfigService {
  /**
   * Clave maestra de cifrado (AI_CONFIG_ENCRYPTION_KEY). La usan también
   * otros secretos guardados (client secret de SharePoint).
   * @return {Buffer} 32 bytes.
   */
  claveMaestra() {
    let valor = "";
    try {
      valor = AI_CONFIG_ENCRYPTION_KEY.value();
    } catch (error) {
      valor = "";
    }
    const clave = claveDesdeBase64(valor);
    if (!clave) {
      throw new AppError(500, "Falta la clave maestra " +
          "AI_CONFIG_ENCRYPTION_KEY (32 bytes en base64) en los secretos " +
          "de Functions.");
    }
    return clave;
  }

  /**
   * Cifra un texto con la clave maestra.
   * @param {string} texto Texto plano.
   * @return {{cifrado: string, iv: string, authTag: string}} Base64.
   */
  cifrarSecreto(texto) {
    return cifrar(texto, this.claveMaestra());
  }

  /**
   * Descifra un texto cifrado con cifrarSecreto.
   * @param {{cifrado: string, iv: string, authTag: string}} datos Base64.
   * @return {string} Texto plano.
   */
  descifrarSecreto(datos) {
    return descifrar(datos, this.claveMaestra());
  }

  /**
   * Cifra la API key con los nombres de campo de configuracionIA.
   * @param {string} texto API key.
   * @return {{apiKeyCifrada: string, iv: string, authTag: string}} Base64.
   */
  _cifrar(texto) {
    const {cifrado, iv, authTag} = this.cifrarSecreto(texto);
    return {apiKeyCifrada: cifrado, iv, authTag};
  }

  /**
   * Descifra la API key guardada.
   * @param {Object} config Configuración con apiKeyCifrada, iv y authTag.
   * @return {string} API key.
   */
  _descifrar(config) {
    return this.descifrarSecreto({
      cifrado: config.apiKeyCifrada, iv: config.iv, authTag: config.authTag,
    });
  }

  /**
   * Configuración guardada, con los valores por defecto donde falten.
   * @return {Promise<Object>} Configuración.
   */
  async _config() {
    const guardada = await configuracionIARepository.get() || {};
    return {
      ...guardada,
      proveedor: PROVEEDOR,
      modeloPorDefecto: guardada.modeloPorDefecto || null,
      preciosPorModelo: guardada.preciosPorModelo || {},
      limiteGastoMensualUsd: guardada.limiteGastoMensualUsd ?? null,
    };
  }

  /**
   * API key vigente: la de configuracionIA/global si está activa; si no, el
   * respaldo ANTHROPIC_API_KEY del entorno. Se cachea 5 minutos.
   * Punto de extensión: recibir el mandanteId y buscar primero
   * configuracionIA/{mandanteId} (override por Mandante); no implementado.
   * @return {Promise<string>} API key.
   */
  async obtenerApiKey() {
    if (cache && cache.expira > Date.now()) return cache.apiKey;
    const config = await configuracionIARepository.get();
    let apiKey = null;
    if (config?.estado === "activa" && config.apiKeyCifrada) {
      apiKey = this._descifrar(config);
    } else if (process.env.ANTHROPIC_API_KEY) {
      apiKey = process.env.ANTHROPIC_API_KEY;
    }
    if (!apiKey) throw new AppError(409, MENSAJE_NO_CONFIGURADA);
    cache = {apiKey, expira: Date.now() + TTL_CACHE_MS};
    return apiKey;
  }

  /** Descarta la API key en caché (al guardar o desactivar). */
  invalidarCache() {
    cache = null;
  }

  /**
   * Nombre del usuario para "actualizada por".
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<{uid: string, nombre: string}>} Autor.
   */
  async _autor(actor) {
    const usuario = await usuarioRepository.getById(actor.uid)
        .catch(() => null);
    const nombre = usuario ?
        `${usuario.nombre || ""} ${usuario.apellido || ""}`.trim() : "";
    return {uid: actor.uid, nombre: nombre || actor.email || actor.uid};
  }

  /**
   * Configuración pública (sin la key ni sus datos de cifrado).
   * @return {Promise<Object>} Configuración pública.
   */
  async obtenerPublica() {
    const config = await this._config();
    const conKey = config.estado === "activa" && Boolean(config.apiKeyCifrada);
    return {
      configurada: conKey || Boolean(process.env.ANTHROPIC_API_KEY),
      apiKeyUltimos4: config.apiKeyUltimos4 || null,
      estado: config.estado || null,
      modeloPorDefecto: config.modeloPorDefecto,
      preciosPorModelo: config.preciosPorModelo,
      // El modelo por defecto tiene precios de entrada y salida > 0.
      preciosConfigurados: !faltanPrecios(config.preciosPorModelo,
          config.modeloPorDefecto),
      limiteGastoMensualUsd: config.limiteGastoMensualUsd,
      updatedAt: config.updatedAt || null,
      updatedBy: config.updatedBy || null,
    };
  }

  /**
   * Estado mínimo para quienes operan Revisiones IA (sin datos de la key).
   * @return {Promise<{configurada: boolean, modelo: string}>} Estado.
   */
  async estado() {
    const publica = await this.obtenerPublica();
    return {
      configurada: publica.configurada,
      modelo: publica.modeloPorDefecto,
      preciosConfigurados: publica.preciosConfigurados,
    };
  }

  /**
   * Guarda (o reemplaza) la API key, cifrada.
   * @param {string} apiKey API key.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object>} Configuración pública.
   */
  async guardarApiKey(apiKey, actor) {
    const valor = typeof apiKey === "string" ? apiKey.trim() : "";
    if (!valor.startsWith(PREFIJO_API_KEY) || valor.length < 20) {
      throw new AppError(400,
          `La API key debe empezar con "${PREFIJO_API_KEY}".`);
    }
    const previa = await configuracionIARepository.get();
    const config = await this._config();
    await configuracionIARepository.guardar({
      ...this._cifrar(valor),
      apiKeyUltimos4: valor.slice(-4),
      proveedor: PROVEEDOR,
      modeloPorDefecto: config.modeloPorDefecto,
      preciosPorModelo: config.preciosPorModelo,
      limiteGastoMensualUsd: config.limiteGastoMensualUsd,
      estado: "activa",
      updatedBy: await this._autor(actor),
    });
    this.invalidarCache();
    await bitacoraLogger.registrarEvento({
      mandanteId: null, entidad: "configuracionIA", entidadId: "global",
      accion: previa?.apiKeyCifrada ? "api_key_reemplazada" :
        "api_key_guardada",
      actor, detalle: {proveedor: PROVEEDOR},
    });
    return this.obtenerPublica();
  }

  /**
   * Desactiva la API key (cambio de estado; la key cifrada se conserva).
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object>} Configuración pública.
   */
  async desactivar(actor) {
    const previa = await configuracionIARepository.get();
    if (!previa?.apiKeyCifrada) {
      throw new AppError(409, "No hay una API key guardada.");
    }
    await configuracionIARepository.guardar({
      estado: "inactiva", updatedBy: await this._autor(actor),
    });
    this.invalidarCache();
    await bitacoraLogger.registrarEvento({
      mandanteId: null, entidad: "configuracionIA", entidadId: "global",
      accion: "api_key_desactivada", actor, detalle: {proveedor: PROVEEDOR},
    });
    return this.obtenerPublica();
  }

  /**
   * Actualiza modelo por defecto, precios por modelo y límite mensual.
   * @param {Object} payload {modeloPorDefecto, preciosPorModelo,
   *     limiteGastoMensualUsd}.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object>} Configuración pública.
   */
  async actualizarParametros(payload, actor) {
    const actual = await this._config();
    const precios = payload.preciosPorModelo ?? actual.preciosPorModelo;
    if (!precios || typeof precios !== "object" ||
        Object.keys(precios).length === 0) {
      throw new AppError(400, "Debe haber al menos un modelo con precios.");
    }
    const preciosLimpios = {};
    Object.entries(precios).forEach(([modelo, precio]) => {
      const id = String(modelo).trim();
      const entrada = Number(precio?.entrada);
      const salida = Number(precio?.salida);
      if (!RE_MODELO.test(id)) {
        throw new AppError(400, `Identificador de modelo inválido: "${id}".`);
      }
      if (preciosLimpios[id]) {
        throw new AppError(400, `El modelo "${id}" está repetido.`);
      }
      if (!(entrada > 0) || !(salida > 0)) {
        throw new AppError(400,
            `Precios inválidos para ${id}: deben ser números mayores que 0.`);
      }
      preciosLimpios[id] = {entrada, salida};
    });
    const modelo = String(payload.modeloPorDefecto ?? actual.modeloPorDefecto)
        .trim();
    if (!preciosLimpios[modelo]) {
      throw new AppError(400,
          "El modelo por defecto debe estar en la tabla de precios.");
    }
    let limite = payload.limiteGastoMensualUsd ?? null;
    if (limite === "") limite = null;
    if (limite !== null) {
      limite = Number(limite);
      if (!(limite >= 0)) {
        throw new AppError(400,
            "El límite de gasto mensual debe ser un número ≥ 0.");
      }
    }
    await configuracionIARepository.guardar({
      proveedor: PROVEEDOR,
      modeloPorDefecto: modelo,
      preciosPorModelo: preciosLimpios,
      limiteGastoMensualUsd: limite,
      updatedBy: await this._autor(actor),
    });
    await bitacoraLogger.registrarEvento({
      mandanteId: null, entidad: "configuracionIA", entidadId: "global",
      accion: "parametros_actualizados", actor,
      detalle: {modeloPorDefecto: modelo, limiteGastoMensualUsd: limite,
        modelos: Object.keys(preciosLimpios)},
    });
    return this.obtenerPublica();
  }

  /**
   * Parámetros de modelo y precios vigentes (para extracción y costos).
   * `umbralConfianzaReglas`: bajo esta confianza una regla interpretativa
   * va a revisión manual (configuracionIA/global; 0,7 si no está).
   * @return {Promise<{modeloPorDefecto: string, preciosPorModelo: Object,
   *     limiteGastoMensualUsd: ?number, umbralConfianzaReglas: number}>}
   *     Parámetros.
   */
  async obtenerParametros() {
    const config = await this._config();
    const umbral = Number(config.umbralConfianzaReglas);
    return {
      modeloPorDefecto: config.modeloPorDefecto,
      preciosPorModelo: config.preciosPorModelo,
      limiteGastoMensualUsd: config.limiteGastoMensualUsd,
      umbralConfianzaReglas: umbral > 0 && umbral <= 1 ? umbral :
        UMBRAL_CONFIANZA_POR_DEFECTO,
    };
  }

  /**
   * Prueba la conexión con la key vigente: una petición mínima (máx. 10
   * tokens de salida) al modelo por defecto.
   * @return {Promise<{ok: boolean, modelo: string, mensaje: string}>}
   *     Resultado.
   */
  async probarConexion() {
    const apiKey = await this.obtenerApiKey();
    const {modeloPorDefecto: modelo} = await this.obtenerParametros();
    if (!modelo) {
      return {ok: false, modelo: null,
        mensaje: "Configura el modelo por defecto y sus precios."};
    }
    const cliente = new Anthropic({apiKey, maxRetries: 0, timeout: 30000});
    try {
      await cliente.messages.create({
        model: modelo, max_tokens: 10,
        messages: [{role: "user", content: "Responde solo: OK"}],
        output_config: esfuerzoPara(modelo),
      });
      return {ok: true, modelo, mensaje: `Conexión correcta con ${modelo}.`};
    } catch (error) {
      return {ok: false, modelo, mensaje: traducirErrorIA(error, modelo)};
    }
  }

  /**
   * Gasto acumulado del mes actual (America/Santiago), en USD.
   * @return {Promise<{mes: string, gastoUsd: number}>} Mes (AAAA-MM) y gasto.
   */
  async gastoMes() {
    const mes = fechaSantiago().slice(0, 7);
    // Un día de margen hacia atrás (zona horaria); el corte exacto es por
    // la fecha en Santiago.
    const desde = new Date(Date.parse(`${mes}-01T00:00:00Z`) - MS_DIA);
    // Procesamientos de carpetas + pruebas de reglas ("Probar reglas") +
    // revisiones por requerimiento ("Revisar con IA").
    const [procesamientos, pruebas, revisiones] = await Promise.all([
      procesamientoIARepository.listCostosDesde(desde),
      pruebaReglaIARepository.listCostosDesde(desde),
      revisionRequerimientoIARepository.listCostosDesde(desde),
    ]);
    const costos = [...procesamientos,
      ...[...pruebas, ...revisiones].map((p) => ({createdAt: p.createdAt,
        costoUsd: p.costoEstimado}))];
    const gasto = costos
        .filter((c) => c.createdAt &&
            fechaSantiago(c.createdAt.toDate()).startsWith(mes))
        .reduce((suma, c) => suma + (c.costoUsd || 0), 0);
    return {mes, gastoUsd: Math.round(gasto * 10000) / 10000};
  }

  /**
   * Rechaza si el gasto del mes ya alcanzó el límite configurado.
   * @return {Promise<void>}
   */
  async validarLimiteMensual() {
    const {limiteGastoMensualUsd: limite} = await this.obtenerParametros();
    if (limite === null || limite === undefined) return;
    const {gastoUsd} = await this.gastoMes();
    if (gastoUsd >= limite) {
      throw new AppError(409, `Se alcanzó el límite de gasto mensual de IA ` +
          `(US$${limite.toFixed(2)}; gastado US$${gastoUsd.toFixed(2)}). ` +
          "Un superadmin puede ampliarlo en Configuración → Inteligencia " +
          "Artificial.");
    }
  }
}

module.exports = new AIConfigService();
module.exports.MENSAJE_NO_CONFIGURADA = MENSAJE_NO_CONFIGURADA;
module.exports.MENSAJE_SIN_PRECIOS = MENSAJE_SIN_PRECIOS;
