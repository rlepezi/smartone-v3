const fuenteDocumentalRepository =
    require("../repositories/fuenteDocumentalRepository");
const mandanteRepository = require("../repositories/mandanteRepository");
const usuarioRepository = require("../repositories/usuarioRepository");
const aiConfigService = require("./aiConfigService");
const bitacoraLogger = require("../utils/bitacoraLogger");
const AppError = require("../utils/AppError");
const {
  validarFuenteSharePoint, aPublica, hayOtraActiva,
} = require("../utils/fuentesDocumentales");

const TIPO_SHAREPOINT = "sharepoint";

/**
 * Fuentes Documentales por Mandante: hoy solo la configuración de SharePoint
 * (sin conexión real a Microsoft Graph todavía). El client secret se guarda
 * cifrado con la misma clave maestra que la API key de IA y nunca sale en
 * una respuesta. La carpeta local no se guarda en el backend (vive en el
 * navegador).
 */
class FuenteDocumentalService {
  /**
   * Mandante en el que el actor puede administrar fuentes: superadmin
   * cualquiera; mandante_admin, solo el suyo.
   * @param {Object} actor Usuario autenticado.
   * @param {?string} mandanteId Mandante pedido.
   * @return {Promise<string>} mandanteId validado.
   */
  async _mandante(actor, mandanteId) {
    const id = actor.rol === "mandante_admin" ? actor.mandanteId : mandanteId;
    if (!id) throw new AppError(400, "Falta el Mandante.");
    if (actor.rol === "mandante_admin" && mandanteId &&
        mandanteId !== actor.mandanteId) {
      throw new AppError(403, "No tiene acceso a este Mandante.");
    }
    if (!(await mandanteRepository.getById(id))) {
      throw new AppError(404, "Mandante no encontrado.");
    }
    return id;
  }

  /**
   * Fuente accesible por el actor (con secretos: solo uso interno).
   * @param {string} id ID de la fuente.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object>} Fuente.
   */
  async _cargar(id, actor) {
    const fuente = await fuenteDocumentalRepository.getById(id);
    if (!fuente || (actor.rol === "mandante_admin" &&
        fuente.mandanteId !== actor.mandanteId)) {
      throw new AppError(404, "Fuente documental no encontrada.");
    }
    return fuente;
  }

  /**
   * Autor de un cambio, para mostrar.
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
   * Bitácora (nunca con valores secretos).
   * @param {Object} fuente Fuente.
   * @param {string} accion Acción.
   * @param {Object} actor Usuario autenticado.
   * @param {Object} [detalle] Detalle.
   * @return {Promise<void>}
   */
  async _bitacora(fuente, accion, actor, detalle = {}) {
    await bitacoraLogger.registrarEvento({
      mandanteId: fuente.mandanteId, entidad: "fuentesDocumentales",
      entidadId: fuente.id, accion, actor,
      detalle: {tipo: fuente.tipo, nombre: fuente.nombre, ...detalle},
    });
  }

  /**
   * Lista las fuentes de un Mandante, sin secretos.
   * @param {{mandanteId: (string|undefined)}} filtros Filtros.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object[]>} Fuentes públicas.
   */
  async listar({mandanteId}, actor) {
    const id = await this._mandante(actor, mandanteId);
    return (await fuenteDocumentalRepository.list(id)).map(aPublica);
  }

  /**
   * Detalle sin secretos.
   * @param {string} id ID de la fuente.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object>} Fuente pública.
   */
  async obtener(id, actor) {
    return aPublica(await this._cargar(id, actor));
  }

  /**
   * Crea una fuente SharePoint (activa, sin probar). Una sola activa por
   * Mandante.
   * @param {Object} payload Datos del formulario.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object>} Fuente pública.
   */
  async crear(payload, actor) {
    const mandanteId = await this._mandante(actor, payload?.mandanteId);
    const {nombre, config, clientSecret} =
        validarFuenteSharePoint(payload, {esNueva: true});
    const existentes = await fuenteDocumentalRepository.list(mandanteId);
    if (hayOtraActiva(existentes, TIPO_SHAREPOINT)) {
      throw new AppError(409, "Este Mandante ya tiene una fuente SharePoint " +
          "activa. Desactívela antes de crear otra.");
    }
    const {cifrado, iv, authTag} = aiConfigService.cifrarSecreto(clientSecret);
    const autor = await this._autor(actor);
    const fuente = await fuenteDocumentalRepository.create({
      mandanteId,
      tipo: TIPO_SHAREPOINT,
      nombre,
      estado: "activa",
      estadoConexion: "no_probada",
      ultimoErrorConexion: null,
      config: {...config, siteId: null, driveId: null},
      secretCifrado: cifrado, iv, authTag,
      secretUltimos4: clientSecret.slice(-4),
      createdBy: autor,
      updatedBy: autor,
    });
    await this._bitacora(fuente, "creado", actor, {siteUrl: config.siteUrl});
    return aPublica(fuente);
  }

  /**
   * Actualiza una fuente. Sin clientSecret se conserva el anterior. Si
   * cambian los datos de conexión, vuelve a "no_probada".
   * @param {string} id ID de la fuente.
   * @param {Object} payload Datos del formulario.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object>} Fuente pública.
   */
  async actualizar(id, payload, actor) {
    const previa = await this._cargar(id, actor);
    const {nombre, config, clientSecret} =
        validarFuenteSharePoint(payload, {esNueva: false});
    const camposConexion = ["tenantId", "clientId", "siteUrl", "biblioteca",
      "rutaBase"];
    const cambiados = camposConexion.filter((c) =>
      config[c] !== previa.config?.[c]);
    const cambios = {
      nombre,
      config: {...previa.config, ...config},
      updatedBy: await this._autor(actor),
    };
    if (clientSecret) {
      const {cifrado, iv, authTag} =
          aiConfigService.cifrarSecreto(clientSecret);
      Object.assign(cambios, {secretCifrado: cifrado, iv, authTag,
        secretUltimos4: clientSecret.slice(-4)});
    }
    if (cambiados.length || clientSecret) {
      Object.assign(cambios, {estadoConexion: "no_probada",
        ultimoErrorConexion: null,
        config: {...cambios.config, siteId: null, driveId: null}});
    }
    const fuente = await fuenteDocumentalRepository.update(id, cambios);
    await this._bitacora(fuente, "actualizado", actor, {
      camposModificados: [
        ...(nombre !== previa.nombre ? ["nombre"] : []), ...cambiados,
      ],
      secretReemplazado: Boolean(clientSecret),
    });
    return aPublica(fuente);
  }

  /**
   * Cambia el estado de una fuente (activa / inactiva).
   * @param {string} id ID de la fuente.
   * @param {string} estado "activa" | "inactiva".
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object>} Fuente pública.
   */
  async cambiarEstado(id, estado, actor) {
    const previa = await this._cargar(id, actor);
    if (previa.estado === estado) return aPublica(previa);
    if (estado === "activa") {
      const existentes = await fuenteDocumentalRepository.list(
          previa.mandanteId);
      if (hayOtraActiva(existentes, previa.tipo, id)) {
        throw new AppError(409, "Este Mandante ya tiene otra fuente " +
            "SharePoint activa. Desactívela antes de reactivar esta.");
      }
    }
    const fuente = await fuenteDocumentalRepository.update(id, {
      estado, updatedBy: await this._autor(actor),
    });
    await this._bitacora(fuente, "transicion_estado", actor, {
      estadoAnterior: previa.estado, estadoNuevo: estado,
    });
    return aPublica(fuente);
  }

  /**
   * Credenciales descifradas, SOLO para uso interno del backend (el futuro
   * SharePointProvider). Nunca se devuelven en una respuesta HTTP.
   * @param {string} fuenteId ID de la fuente.
   * @return {Promise<{config: Object, clientSecret: string}>} Credenciales.
   */
  async obtenerCredenciales(fuenteId) {
    const fuente = await fuenteDocumentalRepository.getById(fuenteId);
    if (!fuente) throw new AppError(404, "Fuente documental no encontrada.");
    return {
      config: fuente.config,
      clientSecret: aiConfigService.descifrarSecreto({
        cifrado: fuente.secretCifrado, iv: fuente.iv,
        authTag: fuente.authTag,
      }),
    };
  }

  /**
   * Estado de la fuente SharePoint activa de un Mandante, para el selector
   * de fuente de Nueva revisión.
   * @param {string} mandanteId Mandante.
   * @return {Promise<?{nombre: string, estadoConexion: string}>} Estado.
   */
  async sharePointActiva(mandanteId) {
    const fuente = (await fuenteDocumentalRepository.list(mandanteId))
        .find((f) => f.tipo === TIPO_SHAREPOINT && f.estado === "activa");
    return fuente ?
      {nombre: fuente.nombre, estadoConexion: fuente.estadoConexion} : null;
  }
}

module.exports = new FuenteDocumentalService();
