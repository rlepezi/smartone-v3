const crypto = require("crypto");
const AppError = require("../utils/AppError");

// Acceso a Microsoft Graph (SOLO lectura) con credenciales de aplicación
// (client credentials) de cada Mandante. Token por fetch directo al endpoint
// de Entra ID: Node trae fetch y el flujo app-only es un POST; msal-node no
// aporta nada aquí y sería una dependencia más.
//
// El client secret solo viaja en el cuerpo del POST del token: nunca se
// guarda en el cache (la clave usa un hash), ni en errores ni en logs.

const GRAPH = "https://graph.microsoft.com/v1.0";
const SCOPE = "https://graph.microsoft.com/.default";
// El token se renueva este margen antes de que expire.
const MARGEN_TOKEN_MS = 5 * 60 * 1000;
// Reintentos ante 429/503 (respetando Retry-After) y espera máxima por intento.
const MAX_REINTENTOS = 3;
const MAX_ESPERA_MS = 10 * 1000;

// Errores del endpoint de token (AADSTS) → mensaje accionable.
const ERRORES_TOKEN = [
  [/AADSTS7000215|AADSTS7000222/, "Credenciales inválidas: el client " +
    "secret no es válido o expiró. Cree uno nuevo en Entra ID."],
  [/AADSTS700016/, "El Client ID no corresponde a una aplicación " +
    "registrada en ese tenant."],
  [/AADSTS90002|AADSTS900023/, "El Tenant ID no existe o no es válido."],
];

/**
 * Cliente HTTP de Graph para un conjunto de credenciales.
 */
class GraphRepository {
  /**
   * Inicializa el cache de tokens (en memoria de la instancia).
   */
  constructor() {
    this.tokens = new Map();
    // Inyectables para los tests (sin llamadas reales ni esperas reales).
    // eslint-disable-next-line no-undef
    this.fetch = (...args) => fetch(...args);
    this.esperar = (ms) => new Promise((r) => setTimeout(r, ms));
  }

  /**
   * Clave del cache: tenant, app y un hash del secret (no el secret).
   * @param {Object} c {tenantId, clientId, clientSecret}.
   * @return {string} Clave.
   */
  _claveToken({tenantId, clientId, clientSecret}) {
    const huella = crypto.createHash("sha256").update(String(clientSecret))
        .digest("hex").slice(0, 16);
    return `${tenantId}|${clientId}|${huella}`;
  }

  /**
   * Token de aplicación (cacheado hasta poco antes de expirar).
   * @param {{tenantId: string, clientId: string, clientSecret: string}} c
   *     Credenciales.
   * @return {Promise<string>} Access token.
   */
  async token(c) {
    const clave = this._claveToken(c);
    const guardado = this.tokens.get(clave);
    if (guardado && guardado.expira - MARGEN_TOKEN_MS > Date.now()) {
      return guardado.valor;
    }
    let res;
    try {
      res = await this.fetch(`https://login.microsoftonline.com/` +
          `${encodeURIComponent(c.tenantId)}/oauth2/v2.0/token`, {
        method: "POST",
        headers: {"Content-Type": "application/x-www-form-urlencoded"},
        body: new URLSearchParams({
          grant_type: "client_credentials", client_id: c.clientId,
          client_secret: c.clientSecret, scope: SCOPE,
        }).toString(),
      });
    } catch (e) {
      throw new AppError(502, "No se pudo contactar a Microsoft Entra ID " +
          "(revise la conexión a internet del servidor).",
      {codigo: "SIN_CONEXION"});
    }
    const datos = await res.json().catch(() => ({}));
    if (!res.ok || !datos.access_token) {
      const texto = `${datos.error || ""} ${datos.error_description || ""}`;
      const mapeado = ERRORES_TOKEN.find(([re]) => re.test(texto));
      throw new AppError(401, mapeado ? mapeado[1] : "Credenciales " +
          "inválidas: revise el Tenant ID, el Client ID y el client secret.",
      {codigo: "CREDENCIALES_INVALIDAS"});
    }
    this.tokens.set(clave, {valor: datos.access_token,
      expira: Date.now() + Number(datos.expires_in || 3600) * 1000});
    return datos.access_token;
  }

  /**
   * Olvida el token de esas credenciales (p. ej. tras un 401 de Graph).
   * @param {Object} c Credenciales.
   */
  olvidarToken(c) {
    this.tokens.delete(this._claveToken(c));
  }

  /**
   * GET a Graph con reintentos ante 429/503 (Retry-After, acotados).
   * Devuelve la respuesta (para leer JSON o el flujo del contenido).
   * @param {string} token Access token.
   * @param {string} url URL absoluta o relativa a /v1.0.
   * @return {Promise<Response>} Respuesta (ok o con su status de error).
   */
  async get(token, url) {
    const destino = url.startsWith("https://") ? url : `${GRAPH}${url}`;
    for (let intento = 0; ; intento++) {
      let res;
      try {
        // eslint-disable-next-line no-await-in-loop
        res = await this.fetch(destino, {
          headers: {Authorization: `Bearer ${token}`},
        });
      } catch (e) {
        throw new AppError(502, "No se pudo contactar a Microsoft Graph.",
            {codigo: "SIN_CONEXION"});
      }
      if (![429, 503].includes(res.status)) return res;
      if (intento >= MAX_REINTENTOS) {
        throw new AppError(503, "SharePoint está limitando las solicitudes " +
            "(demasiadas a la vez). Intente nuevamente en unos minutos.",
        {codigo: "LIMITADO"});
      }
      const segundos = Number(res.headers?.get?.("Retry-After"));
      const espera = Number.isFinite(segundos) && segundos > 0 ?
        Math.min(segundos * 1000, MAX_ESPERA_MS) :
        Math.min(1000 * 2 ** intento, MAX_ESPERA_MS);
      // eslint-disable-next-line no-await-in-loop
      await this.esperar(espera);
    }
  }

  /**
   * GET que devuelve JSON, o un error con el status de Graph.
   * @param {string} token Access token.
   * @param {string} url URL.
   * @return {Promise<Object>} Cuerpo.
   */
  async getJson(token, url) {
    const res = await this.get(token, url);
    const datos = await res.json().catch(() => ({}));
    if (!res.ok) {
      const error = new Error(datos?.error?.code || `HTTP ${res.status}`);
      error.status = res.status;
      error.graphCodigo = datos?.error?.code || null;
      throw error;
    }
    return datos;
  }

  /**
   * Todas las páginas de una colección (@odata.nextLink), hasta `maximo`.
   * @param {string} token Access token.
   * @param {string} url Primera página.
   * @param {number} [maximo] Máximo de elementos.
   * @return {Promise<Object[]>} Elementos.
   */
  async getTodos(token, url, maximo = 5000) {
    const elementos = [];
    let siguiente = url;
    while (siguiente && elementos.length < maximo) {
      // eslint-disable-next-line no-await-in-loop
      const pagina = await this.getJson(token, siguiente);
      elementos.push(...(pagina.value || []));
      siguiente = pagina["@odata.nextLink"] || null;
    }
    return elementos.slice(0, maximo);
  }
}

module.exports = new GraphRepository();
module.exports.GraphRepository = GraphRepository;
module.exports.GRAPH = GRAPH;
