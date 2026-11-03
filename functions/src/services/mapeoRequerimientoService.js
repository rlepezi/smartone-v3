const mapeoRequerimientoRepository =
    require("../repositories/mapeoRequerimientoRepository");
const plantillaEstructuraRepository =
    require("../repositories/plantillaEstructuraRepository");
const requerimientoRepository =
    require("../repositories/requerimientoRepository");
const usuarioRepository = require("../repositories/usuarioRepository");
const bitacoraLogger = require("../utils/bitacoraLogger");
const AppError = require("../utils/AppError");
const {
  nodosDe, NIVEL_POR_TIPO_ENTIDAD,
} = require("../utils/plantillaEstructura");
const {aFecha} = require("../utils/vencimientos");

// Leen el mapeo: superadmin, evaluador y los roles del Mandante (el suyo).
// Vincular / desvincular: solo superadmin.
const ROLES_LEEN = ["superadmin", "evaluador", "mandante_admin",
  "mandante_lector"];
const ROLES_MANDANTE = ["mandante_admin", "mandante_lector"];
const NIVEL_ETIQUETA = {empresa: "Empresa", persona: "Persona",
  maquinaria: "Maquinaria"};
const aISO = (v) => aFecha(v)?.toISOString() || null;

/**
 * Mapeo documental: vínculo N:N entre los nodos de la plantilla activa del
 * Mandante y sus requerimientos (colección mapeoRequerimientos, aparte de la
 * plantilla: vincular no crea una versión). Valida el nivel: secciones y
 * archivos sueltos → Empresa; documentos de entidad → Persona o Maquinaria.
 */
class MapeoRequerimientoService {
  /**
   * Mandante accesible (los roles del Mandante, solo el suyo).
   * @param {Object} actor Usuario autenticado.
   * @param {?string} mandanteId Mandante pedido.
   * @return {string} mandanteId.
   */
  _mandante(actor, mandanteId) {
    if (!ROLES_LEEN.includes(actor.rol)) {
      throw new AppError(403,
          "No tiene permisos para ver el mapeo documental.");
    }
    if (ROLES_MANDANTE.includes(actor.rol)) {
      if (mandanteId && mandanteId !== actor.mandanteId) {
        throw new AppError(403, "No tiene acceso a este Mandante.");
      }
      return actor.mandanteId;
    }
    if (!mandanteId) throw new AppError(400, "Falta el Mandante.");
    return mandanteId;
  }

  /**
   * Autor de un cambio.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<{uid: string, nombre: string}>} Autor.
   */
  async _autor(actor) {
    const u = await usuarioRepository.getById(actor.uid).catch(() => null);
    const nombre = u ? `${u.nombre || ""} ${u.apellido || ""}`.trim() : "";
    return {uid: actor.uid, nombre: nombre || actor.email || actor.uid};
  }

  /**
   * Forma pública de un vínculo.
   * @param {Object} v Vínculo.
   * @return {Object} Vínculo.
   */
  _publico(v) {
    return {id: v.id, mandanteId: v.mandanteId, plantillaId: v.plantillaId,
      nodoClave: v.nodoClave, requerimientoId: v.requerimientoId,
      nivel: v.nivel, estado: v.estado,
      motivoInactivo: v.motivoInactivo || null,
      createdAt: aISO(v.createdAt), updatedAt: aISO(v.updatedAt)};
  }

  /**
   * Vínculos del Mandante (todos los estados), para la tabla del mapeo.
   * @param {{mandanteId: ?string}} filtros Filtros.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object[]>} Vínculos.
   */
  async listar({mandanteId}, actor) {
    const id = this._mandante(actor, mandanteId);
    return (await mapeoRequerimientoRepository.list({mandanteId: id}))
        .map((v) => this._publico(v));
  }

  /**
   * Nodos vinculados (activos) a un requerimiento, con su ruta legible y su
   * estado en la plantilla. Sin actor: uso interno (reglas de revisión).
   * @param {Object} req Requerimiento ({id, mandanteId}).
   * @return {Promise<Array<Object>>} Nodos (nodosDe) con `vinculoId`.
   */
  async nodosDeRequerimiento(req) {
    if (!req?.mandanteId) return [];
    const [vinculos, plantilla] = await Promise.all([
      mapeoRequerimientoRepository.list({mandanteId: req.mandanteId,
        requerimientoId: req.id, estado: "activo"}),
      plantillaEstructuraRepository.getActiva(req.mandanteId),
    ]);
    if (!plantilla || !vinculos.length) return [];
    const nodos = new Map(nodosDe(plantilla).map((n) => [n.nodoClave, n]));
    return vinculos.filter((v) => nodos.has(v.nodoClave))
        .map((v) => ({...nodos.get(v.nodoClave), vinculoId: v.id}))
        .sort((a, b) => a.orden - b.orden);
  }

  /**
   * Ubicación de un requerimiento en el mapeo (Reglas de revisión, solo
   * lectura): sus nodos vinculados.
   * @param {string} requerimientoId Requerimiento.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<{requerimientoId: string, nodos: Object[]}>} Datos.
   */
  async porRequerimiento(requerimientoId, actor) {
    const req = await requerimientoRepository.getById(
        String(requerimientoId || ""));
    if (!req) throw new AppError(404, "Requerimiento no encontrado.");
    this._mandante(actor, req.mandanteId);
    const nodos = await this.nodosDeRequerimiento(req);
    return {requerimientoId: req.id, nodos: nodos.map((n) => ({
      nodoClave: n.nodoClave, tipoNodo: n.tipoNodo, ruta: n.ruta,
      nivel: n.nivel, estado: n.estado, habilitado: n.habilitado,
      alias: n.alias, multiple: n.multiple, datosSensibles: n.datosSensibles,
      tipoDocumentalCodigo: n.tipoDocumentalCodigo}))};
  }

  /**
   * Requerimiento y nodo validados para vincular o desvincular.
   * @param {Object} payload {mandanteId, nodoClave, requerimientoId}.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<{plantilla: Object, nodo: Object, req: Object}>} Datos.
   */
  async _validar(payload, actor) {
    if (actor.rol !== "superadmin") {
      throw new AppError(403, "Solo un superadmin puede editar el mapeo.");
    }
    const p = payload || {};
    const mandanteId = String(p.mandanteId || "");
    const plantilla = mandanteId ?
      await plantillaEstructuraRepository.getActiva(mandanteId) : null;
    if (!plantilla) {
      throw new AppError(404, "El Mandante no tiene plantilla activa.");
    }
    const nodo = nodosDe(plantilla).find((n) => n.nodoClave === p.nodoClave);
    if (!nodo) throw new AppError(404, "El nodo no existe en la plantilla.");
    const req = await requerimientoRepository.getById(
        String(p.requerimientoId || ""));
    if (!req || req.mandanteId !== mandanteId) {
      throw new AppError(404, "Requerimiento no encontrado en este Mandante.");
    }
    return {plantilla, nodo, req};
  }

  /**
   * Vincula un requerimiento a un nodo (o reactiva el vínculo). Valida que
   * el nodo esté activo y el nivel sea compatible.
   * @param {Object} payload {mandanteId, nodoClave, requerimientoId}.
   * @param {Object} actor Usuario autenticado (superadmin).
   * @return {Promise<Object>} Vínculo.
   */
  async vincular(payload, actor) {
    const {plantilla, nodo, req} = await this._validar(payload, actor);
    if (nodo.estado !== "activo") {
      throw new AppError(409, "El nodo está retirado: reactívelo para " +
          "vincularle requerimientos.");
    }
    if (req.estado !== "activo") {
      throw new AppError(409, "El requerimiento no está activo.");
    }
    const nivelReq = NIVEL_POR_TIPO_ENTIDAD[req.tipoEntidad] || "empresa";
    if (nivelReq !== nodo.nivel) {
      throw new AppError(400, `«${nodo.ruta}» acepta requerimientos de nivel ` +
          `${NIVEL_ETIQUETA[nodo.nivel]}; «${req.nombreCorto || req.nombre}» ` +
          `es de nivel ${NIVEL_ETIQUETA[nivelReq]}.`);
    }
    const autor = await this._autor(actor);
    const vinculo = await mapeoRequerimientoRepository.activar({
      mandanteId: plantilla.mandanteId, plantillaId: plantilla.id,
      nodoClave: nodo.nodoClave, requerimientoId: req.id, nivel: nodo.nivel,
    }, autor);
    await bitacoraLogger.registrarEvento({
      mandanteId: plantilla.mandanteId, entidad: "plantillasEstructura",
      entidadId: plantilla.id, accion: "requerimiento_vinculado", actor,
      detalle: {nodoClave: nodo.nodoClave, nodo: nodo.ruta,
        requerimientoId: req.id, requerimiento: req.nombreCorto || req.nombre},
    });
    return this._publico(vinculo);
  }

  /**
   * Desvincula (estado inactivo, sin borrar).
   * @param {Object} payload {mandanteId, nodoClave, requerimientoId}.
   * @param {Object} actor Usuario autenticado (superadmin).
   * @return {Promise<Object>} Vínculo.
   */
  async desvincular(payload, actor) {
    const {plantilla, nodo, req} = await this._validar(payload, actor);
    const id = mapeoRequerimientoRepository.id(plantilla.mandanteId,
        nodo.nodoClave, req.id);
    const v = await mapeoRequerimientoRepository.getById(id);
    if (!v || v.estado !== "activo") {
      throw new AppError(404,
          "El requerimiento no está vinculado a este nodo.");
    }
    const autor = await this._autor(actor);
    await mapeoRequerimientoRepository.cambiarEstado([id], "inactivo",
        "desvinculado", autor);
    await bitacoraLogger.registrarEvento({
      mandanteId: plantilla.mandanteId, entidad: "plantillasEstructura",
      entidadId: plantilla.id, accion: "requerimiento_desvinculado", actor,
      detalle: {nodoClave: nodo.nodoClave, nodo: nodo.ruta,
        requerimientoId: req.id, requerimiento: req.nombreCorto || req.nombre},
    });
    return this._publico(await mapeoRequerimientoRepository.getById(id));
  }

  /**
   * Al retirar nodos, sus vínculos activos quedan inactivos (motivo
   * "nodo_retirado"); al reactivarlos vuelven los que se inactivaron así.
   * @param {string} mandanteId Mandante.
   * @param {string[]} retirados nodoClaves retirados.
   * @param {string[]} reactivados nodoClaves reactivados.
   * @param {Object} autor {uid, nombre}.
   * @return {Promise<{inactivados: number, reactivados: number}>} Conteo.
   */
  async alRetirarNodos(mandanteId, retirados, reactivados, autor) {
    if (!retirados.length && !reactivados.length) {
      return {inactivados: 0, reactivados: 0};
    }
    const todos = await mapeoRequerimientoRepository.list({mandanteId});
    const inactivar = todos.filter((v) => v.estado === "activo" &&
      retirados.includes(v.nodoClave)).map((v) => v.id);
    const reactivar = todos.filter((v) => v.estado === "inactivo" &&
      v.motivoInactivo === "nodo_retirado" &&
      reactivados.includes(v.nodoClave)).map((v) => v.id);
    if (inactivar.length) {
      await mapeoRequerimientoRepository.cambiarEstado(inactivar, "inactivo",
          "nodo_retirado", autor);
    }
    if (reactivar.length) {
      await mapeoRequerimientoRepository.cambiarEstado(reactivar, "activo",
          null, autor);
    }
    return {inactivados: inactivar.length, reactivados: reactivar.length};
  }
}

module.exports = new MapeoRequerimientoService();
