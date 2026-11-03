const ubicacionExpedienteRepository =
    require("../repositories/ubicacionExpedienteRepository");
const aliasSugeridoRepository =
    require("../repositories/aliasSugeridoRepository");
const mapeoRequerimientoRepository =
    require("../repositories/mapeoRequerimientoRepository");
const plantillaEstructuraRepository =
    require("../repositories/plantillaEstructuraRepository");
const perfilRequerimientoRepository =
    require("../repositories/perfilRequerimientoRepository");
const usuarioRepository = require("../repositories/usuarioRepository");
const expedienteService = require("./expedienteService");
const plantillaEstructuraService = require("./plantillaEstructuraService");
const bitacoraLogger = require("../utils/bitacoraLogger");
const AppError = require("../utils/AppError");
const {nodosDe} = require("../utils/plantillaEstructura");
const {requerimientosDeExpediente} = require("../utils/resolverNodo");
const {aliasCubierto} = require("../utils/aliasNodo");
const {aFecha} = require("../utils/vencimientos");

const ROLES_LEEN = ["superadmin", "evaluador", "mandante_admin",
  "mandante_lector"];
// Confirmar una ubicación en un expediente y sugerir alias: superadmin y
// evaluador. Aprobar o rechazar alias: solo superadmin.
const ROLES_CONFIRMAN = ["superadmin", "evaluador"];
const ROLES_MANDANTE = ["mandante_admin", "mandante_lector"];
const aISO = (v) => aFecha(v)?.toISOString() || null;
const ultimo = (ruta) => String(ruta || "").split("/").filter(Boolean).pop() ||
  "";

/**
 * Ubicación documental en el expediente: configuración para el resolvedor
 * del navegador (nodos de la plantilla, vínculos y requerimientos del
 * perfil), excepciones confirmadas por nodo (ubicacionesExpediente) y alias
 * sugeridos desde el expediente (aliasSugeridos).
 */
class UbicacionExpedienteService {
  /**
   * Exige uno de los roles.
   * @param {Object} actor Usuario autenticado.
   * @param {string[]} roles Roles.
   * @param {string} accion Qué se intenta.
   */
  _exigirRol(actor, roles, accion) {
    if (!roles.includes(actor.rol)) {
      throw new AppError(403, `No tiene permisos para ${accion}.`);
    }
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
   * Configuración de ubicación de un expediente: nodos activos y
   * habilitados de la plantilla vigente, vínculos activos, requerimientos
   * del perfil, nodos aplicables por requerimiento y overrides activos.
   * @param {string} expedienteId Expediente.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object>} Configuración.
   */
  async config(expedienteId, actor) {
    this._exigirRol(actor, ROLES_LEEN, "ver la ubicación documental");
    const expediente = await expedienteService.getExpedienteById(
        String(expedienteId || ""), actor);
    const [plantilla, vinculos, perfilReqs, overrides] = await Promise.all([
      plantillaEstructuraRepository.getActiva(expediente.mandanteId),
      mapeoRequerimientoRepository.list({mandanteId: expediente.mandanteId,
        estado: "activo"}),
      expediente.perfilParticipacionId ? perfilRequerimientoRepository
          .getActivosByPerfil(expediente.perfilParticipacionId) : [],
      ubicacionExpedienteRepository.list({mandanteId: expediente.mandanteId,
        expedienteId: expediente.id, activo: true}),
    ]);
    const nodos = plantilla ? nodosDe(plantilla).filter((n) =>
      n.estado === "activo" && n.habilitado) : [];
    const requerimientosPerfil = [...new Set(perfilReqs.map((v) =>
      v.requerimientoId))];
    const aplicables = requerimientosDeExpediente({nodos, vinculos,
      requerimientosPerfil});
    return {
      expedienteId: expediente.id,
      plantilla: plantilla ? {id: plantilla.id, nombre: plantilla.nombre,
        version: plantilla.version || 1} : null,
      nodos,
      requerimientosPerfil,
      aplicables: Object.fromEntries([...aplicables.entries()].map(
          ([req, lista]) => [req, lista.map((n) => n.nodoClave)])),
      overrides: overrides.map((o) => ({id: o.id, nodoClave: o.nodoClave,
        sujeto: o.sujeto, rutaReal: o.rutaReal,
        confirmadoPor: o.confirmadoPor || null,
        confirmadoAt: aISO(o.confirmadoAt)})),
    };
  }

  /**
   * Confirma la carpeta o el archivo real de un nodo en el expediente
   * (override). Si el nombre real no está en los alias del nodo, devuelve
   * la propuesta para "Sugerir como alias".
   * @param {string} expedienteId Expediente.
   * @param {Object} payload {nodoClave, sujeto ("empresa" | personaId |
   *     recursoId), rutaReal}.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<{override: Object, propuestaAlias: ?Object}>} Datos.
   */
  async confirmarOverride(expedienteId, payload, actor) {
    this._exigirRol(actor, ROLES_CONFIRMAN,
        "confirmar la ubicación de un documento");
    const expediente = await expedienteService.getExpedienteById(
        String(expedienteId || ""), actor);
    if (expediente.estado === "cerrado") {
      throw new AppError(409, "El expediente está cerrado.");
    }
    const p = payload || {};
    const rutaReal = String(p.rutaReal || "").split("/").map((x) => x.trim())
        .filter(Boolean);
    if (!rutaReal.length || rutaReal.some((x) => x === "." || x === "..")) {
      throw new AppError(400, "La ruta confirmada no es válida.");
    }
    const plantilla = await plantillaEstructuraRepository.getActiva(
        expediente.mandanteId);
    const nodo = plantilla ? nodosDe(plantilla).find((n) =>
      n.nodoClave === p.nodoClave && n.estado === "activo") : null;
    if (!nodo) throw new AppError(404, "El nodo no existe en la plantilla.");
    const sujeto = String(p.sujeto || "empresa");
    const autor = await this._autor(actor);
    const id = ubicacionExpedienteRepository.id(expediente.id, nodo.nodoClave,
        sujeto);
    const override = await ubicacionExpedienteRepository.guardar(id, {
      mandanteId: expediente.mandanteId, expedienteId: expediente.id,
      nodoClave: nodo.nodoClave, sujeto, rutaReal: rutaReal.join("/"),
      confirmadoPor: autor});
    await bitacoraLogger.registrarEvento({
      mandanteId: expediente.mandanteId, entidad: "expediente",
      entidadId: expediente.id, accion: "ubicacion_documental_confirmada",
      actor, detalle: {nodoClave: nodo.nodoClave, nodo: nodo.ruta, sujeto,
        rutaReal: rutaReal.join("/")},
    });
    const nombreReal = ultimo(rutaReal.join("/"));
    const archivo = nodo.tipoNodo !== "seccion" && /\.[a-z0-9]{2,5}$/i
        .test(nombreReal);
    const propuestaAlias = aliasCubierto(nodo, nombreReal, archivo) ? null : {
      nodoClave: nodo.nodoClave, nodo: nodo.ruta,
      alias: archivo ? nombreReal.replace(/\.[a-z0-9]{2,5}$/i, "") :
        nombreReal,
    };
    return {override: {...override, confirmadoAt: aISO(override.confirmadoAt),
      updatedAt: aISO(override.updatedAt)}, propuestaAlias};
  }

  /**
   * Desactiva un override (sin borrarlo).
   * @param {string} expedienteId Expediente.
   * @param {string} id Override.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object>} Override.
   */
  async desactivarOverride(expedienteId, id, actor) {
    this._exigirRol(actor, ROLES_CONFIRMAN,
        "quitar la ubicación de un documento");
    const expediente = await expedienteService.getExpedienteById(
        String(expedienteId || ""), actor);
    const o = await ubicacionExpedienteRepository.getById(String(id || ""));
    if (!o || o.expedienteId !== expediente.id) {
      throw new AppError(404, "Excepción de ubicación no encontrada.");
    }
    const r = await ubicacionExpedienteRepository.desactivar(o.id,
        await this._autor(actor));
    await bitacoraLogger.registrarEvento({
      mandanteId: expediente.mandanteId, entidad: "expediente",
      entidadId: expediente.id, accion: "ubicacion_documental_quitada", actor,
      detalle: {nodoClave: o.nodoClave, sujeto: o.sujeto},
    });
    return {...r, confirmadoAt: aISO(r?.confirmadoAt),
      updatedAt: aISO(r?.updatedAt)};
  }

  /**
   * Sugiere un alias para un nodo desde un expediente. El superadmin lo
   * aprueba en el acto (se agrega al nodo); el evaluador lo deja pendiente.
   * @param {Object} payload {expedienteId, nodoClave, alias}.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object>} Sugerencia.
   */
  async sugerirAlias(payload, actor) {
    this._exigirRol(actor, ROLES_CONFIRMAN, "sugerir alias");
    const p = payload || {};
    const expediente = await expedienteService.getExpedienteById(
        String(p.expedienteId || ""), actor);
    const alias = String(p.alias || "").replace(/\s+/g, " ").trim()
        .slice(0, 120);
    if (!alias) throw new AppError(400, "Indique el alias.");
    const plantilla = await plantillaEstructuraRepository.getActiva(
        expediente.mandanteId);
    const nodo = plantilla ? nodosDe(plantilla).find((n) =>
      n.nodoClave === p.nodoClave && n.estado === "activo") : null;
    if (!nodo) throw new AppError(404, "El nodo no existe en la plantilla.");
    if (aliasCubierto(nodo, alias)) {
      throw new AppError(409, "El nodo ya reconoce ese nombre.");
    }
    const autor = await this._autor(actor);
    const directo = actor.rol === "superadmin";
    const sugerencia = await aliasSugeridoRepository.create({
      mandanteId: expediente.mandanteId, nodoClave: nodo.nodoClave, alias,
      sugeridoPor: autor, expedienteId: expediente.id,
      estado: directo ? "aprobado" : "pendiente",
      ...(directo ? {resueltoPor: autor} : {})});
    await bitacoraLogger.registrarEvento({
      mandanteId: expediente.mandanteId, entidad: "expediente",
      entidadId: expediente.id, accion: "alias_sugerido", actor,
      detalle: {nodoClave: nodo.nodoClave, nodo: nodo.ruta, alias,
        estado: sugerencia.estado},
    });
    if (directo) {
      await plantillaEstructuraService.agregarAlias(expediente.mandanteId,
          nodo.nodoClave, alias, actor);
    }
    return this._sugerenciaPublica(sugerencia);
  }

  /**
   * Forma pública de una sugerencia.
   * @param {Object} x Sugerencia.
   * @return {Object} Sugerencia.
   */
  _sugerenciaPublica(x) {
    return {id: x.id, mandanteId: x.mandanteId, nodoClave: x.nodoClave,
      alias: x.alias, sugeridoPor: x.sugeridoPor || null,
      expedienteId: x.expedienteId || null, estado: x.estado,
      createdAt: aISO(x.createdAt)};
  }

  /**
   * Alias sugeridos del Mandante (por estado).
   * @param {{mandanteId: ?string, estado: ?string}} filtros Filtros.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object[]>} Sugerencias.
   */
  async listarAliasSugeridos({mandanteId, estado}, actor) {
    this._exigirRol(actor, ROLES_LEEN, "ver los alias sugeridos");
    const id = ROLES_MANDANTE.includes(actor.rol) ? actor.mandanteId :
      mandanteId;
    if (!id) throw new AppError(400, "Falta el Mandante.");
    return (await aliasSugeridoRepository.list({mandanteId: id,
      estado: estado || null})).map((x) => this._sugerenciaPublica(x));
  }

  /**
   * Aprueba (agrega el alias al nodo) o rechaza un alias sugerido.
   * @param {string} id Sugerencia.
   * @param {string} decision "aprobado" | "rechazado".
   * @param {Object} actor Usuario autenticado (superadmin).
   * @return {Promise<Object>} Sugerencia.
   */
  async resolverAliasSugerido(id, decision, actor) {
    this._exigirRol(actor, ["superadmin"], "aprobar alias");
    if (!["aprobado", "rechazado"].includes(decision)) {
      throw new AppError(400, "Decisión no válida.");
    }
    const x = await aliasSugeridoRepository.getById(String(id || ""));
    if (!x) throw new AppError(404, "Sugerencia no encontrada.");
    if (x.estado !== "pendiente") {
      throw new AppError(409, "La sugerencia ya fue resuelta.");
    }
    if (decision === "aprobado") {
      await plantillaEstructuraService.agregarAlias(x.mandanteId, x.nodoClave,
          x.alias, actor);
    }
    const r = await aliasSugeridoRepository.resolver(x.id, decision,
        await this._autor(actor));
    await bitacoraLogger.registrarEvento({
      mandanteId: x.mandanteId, entidad: "plantillasEstructura",
      entidadId: x.nodoClave, accion: `alias_${decision}`, actor,
      detalle: {nodoClave: x.nodoClave, alias: x.alias,
        expedienteId: x.expedienteId || null},
    });
    return this._sugerenciaPublica(r);
  }
}

module.exports = new UbicacionExpedienteService();
