const fuenteDocumentalRepository =
    require("../repositories/fuenteDocumentalRepository");
const mandanteRepository = require("../repositories/mandanteRepository");
const usuarioRepository = require("../repositories/usuarioRepository");
const aiConfigService = require("./aiConfigService");
const bitacoraLogger = require("../utils/bitacoraLogger");
const AppError = require("../utils/AppError");
const carpetaEmpresaRepository =
    require("../repositories/carpetaEmpresaRepository");
const {
  validarFuenteSharePoint, validarFuenteLocal, aPublica, fuenteActiva,
} = require("../utils/fuentesDocumentales");

const TIPO_SHAREPOINT = "sharepoint";
const TIPO_LOCAL = "local";
// Quiénes consultan la fuente activa (para vincular Carpetas de empresa y
// leer la carpeta del expediente).
const ROLES_CONSULTAN = ["superadmin", "evaluador", "mandante_admin",
  "mandante_lector"];

/**
 * Mensaje cuando el Mandante ya tiene otra fuente activa.
 * @param {Object} activa Fuente activa.
 * @return {string} Mensaje.
 */
const mensajeOtraActiva = (activa) => "Este Mandante ya tiene una fuente " +
    "documental activa (" + (activa.tipo === TIPO_LOCAL ?
    `carpeta local «${activa.etiqueta}»` : `SharePoint «${activa.nombre}»`) +
    "). Solo puede haber una: desactívela antes.";

/**
 * Fuentes Documentales por Mandante: la raíz del árbol de carpetas (una
 * subcarpeta por empresa y proyecto). UNA sola fuente activa por Mandante:
 *  - SharePoint (superadmin y mandante_admin de su Mandante; sin conexión
 *    real a Microsoft Graph todavía). El client secret se guarda cifrado con
 *    la misma clave maestra que la API key de IA y nunca sale en una
 *    respuesta.
 *  - Carpeta local (solo superadmin): solo su nombre; el handle vive en el
 *    navegador (IndexedDB).
 * Con Carpetas de empresa activas la fuente no se cambia ni se desactiva
 * (el traslado lo resuelve la migración).
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
      detalle: {tipo: fuente.tipo,
        nombre: fuente.nombre || fuente.etiqueta || null, ...detalle},
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
    const activa = fuenteActiva(await fuenteDocumentalRepository.list(
        mandanteId));
    if (activa) {
      throw new AppError(409, mensajeOtraActiva(activa),
          {codigo: "OTRA_FUENTE_ACTIVA"});
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
    if (previa.tipo !== TIPO_SHAREPOINT) {
      throw new AppError(400, "La carpeta local se registra desde " +
          "\"Carpeta local\".");
    }
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
    this._exigirPermisoTipo(previa.tipo, actor);
    if (previa.estado === estado) return aPublica(previa);
    if (estado === "activa") {
      const activa = fuenteActiva(await fuenteDocumentalRepository.list(
          previa.mandanteId), id);
      if (activa) {
        throw new AppError(409, mensajeOtraActiva(activa),
            {codigo: "OTRA_FUENTE_ACTIVA"});
      }
    } else {
      await this._exigirSinCarpetas(previa);
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
   * La carpeta local la administra solo superadmin; SharePoint, también
   * mandante_admin (de su Mandante).
   * @param {string} tipo Tipo de la fuente.
   * @param {Object} actor Usuario autenticado.
   */
  _exigirPermisoTipo(tipo, actor) {
    if (tipo === TIPO_LOCAL && actor.rol !== "superadmin") {
      throw new AppError(403, "Solo un superadmin configura la carpeta " +
          "local del Mandante.");
    }
  }

  /**
   * Rechaza cambiar o desactivar una fuente con Carpetas de empresa
   * activas (el traslado lo resuelve la migración).
   * @param {Object} fuente Fuente.
   * @return {Promise<void>}
   */
  async _exigirSinCarpetas(fuente) {
    const n = await carpetaEmpresaRepository.contarActivasDeFuente(fuente.id);
    if (n > 0) {
      throw new AppError(409, `La fuente tiene ${n} ` +
          `${n === 1 ? "carpeta de empresa activa" :
            "carpetas de empresa activas"}: no se puede cambiar ni ` +
          "desactivar hasta trasladarlas (migración).",
      {codigo: "FUENTE_CON_CARPETAS", detalle: {carpetas: n}});
    }
  }

  /**
   * Registra (o cambia) la carpeta local como fuente activa del Mandante.
   * Solo superadmin. Con SharePoint activo se rechaza (la UI ofrece
   * desactivarlo, con confirmación); con Carpetas de empresa activas no se
   * cambia la carpeta.
   * @param {string} mandanteId Mandante.
   * @param {{etiqueta: string}} payload Nombre de la carpeta raíz.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object>} Fuente pública.
   */
  async guardarLocal(mandanteId, payload, actor) {
    this._exigirPermisoTipo(TIPO_LOCAL, actor);
    const id = await this._mandante(actor, mandanteId);
    const {etiqueta} = validarFuenteLocal(payload);
    const existentes = await fuenteDocumentalRepository.list(id);
    const activa = fuenteActiva(existentes);
    if (activa && activa.tipo !== TIPO_LOCAL) {
      throw new AppError(409, mensajeOtraActiva(activa),
          {codigo: "SHAREPOINT_ACTIVA", detalle: {fuenteId: activa.id}});
    }
    const autor = await this._autor(actor);
    if (activa) {
      if (activa.etiqueta === etiqueta) return aPublica(activa);
      await this._exigirSinCarpetas(activa);
      const fuente = await fuenteDocumentalRepository.update(activa.id,
          {etiqueta, updatedBy: autor});
      await this._bitacora(fuente, "actualizado", actor,
          {etiquetaAnterior: activa.etiqueta, etiqueta});
      return aPublica(fuente);
    }
    // Una local inactiva se reutiliza (sin duplicar documentos).
    const previa = existentes.find((f) => f.tipo === TIPO_LOCAL);
    const fuente = previa ?
      await fuenteDocumentalRepository.update(previa.id,
          {etiqueta, estado: "activa", updatedBy: autor}) :
      await fuenteDocumentalRepository.create({mandanteId: id,
        tipo: TIPO_LOCAL, etiqueta, url: null, estado: "activa",
        createdBy: autor, updatedBy: autor});
    await this._bitacora(fuente, previa ? "transicion_estado" : "creado",
        actor, previa ? {estadoAnterior: previa.estado, estadoNuevo: "activa",
          etiqueta} : {etiqueta});
    return aPublica(fuente);
  }

  /**
   * Fuente activa del Mandante (sin secretos), o null. Para vincular
   * Carpetas de empresa y leer la carpeta del expediente.
   * @param {?string} mandanteId Mandante.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<?Object>} Fuente pública.
   */
  async activa(mandanteId, actor) {
    if (!ROLES_CONSULTAN.includes(actor.rol)) {
      throw new AppError(403, "No tiene permisos para ver la fuente.");
    }
    const id = ["mandante_admin", "mandante_lector"].includes(actor.rol) ?
      actor.mandanteId : mandanteId;
    if (!id) throw new AppError(400, "Falta el Mandante.");
    if (mandanteId && id !== mandanteId) {
      throw new AppError(403, "No tiene acceso a este Mandante.");
    }
    return aPublica(fuenteActiva(await fuenteDocumentalRepository.list(id)));
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
