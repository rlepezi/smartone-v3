const expedienteService = require("./expedienteService");
const configRepository =
    require("../repositories/configRevisionExpedienteRepository");
const participacionPersonaRepository =
    require("../repositories/participacionPersonaRepository");
const participacionRecursoRepository =
    require("../repositories/participacionRecursoRepository");
const usuarioRepository = require("../repositories/usuarioRepository");
const bitacoraLogger = require("../utils/bitacoraLogger");
const {aFecha} = require("../utils/vencimientos");
const {
  validarRepositorio, validarMapeo, validarRutaRelativa,
} = require("../utils/repositorioDocumental");
const AppError = require("../utils/AppError");

const ROLES_EDITAN = ["superadmin", "evaluador", "mandante_admin"];
const MAPEO_VACIO = {carpetaPersonas: null, carpetaRecursos: null,
  requerimientos: {}};

/**
 * Repositorio documental de un Expediente (carpeta local o SharePoint) y su
 * mapeo de carpetas (personal, maquinarias, requerimientos). Se guarda en
 * configRevisionExpediente — la misma configuración que usa la pestaña
 * Revisiones IA — para que haya una sola fuente. La carpeta de cada persona
 * o recurso (carpetaRelativa) vive en su participación. El handle de una
 * carpeta local nunca llega acá: vive en el navegador (IndexedDB).
 */
class RepositorioDocumentalService {
  /**
   * Forma pública del repositorio (fechas ISO).
   * @param {?Object} repo Repositorio guardado.
   * @return {?Object} Repositorio o null.
   */
  _publico(repo) {
    if (!repo) return null;
    return {
      tipo: repo.tipo, etiqueta: repo.etiqueta, url: repo.url || null,
      mapeo: {...MAPEO_VACIO, ...(repo.mapeo || {}),
        requerimientos: {...(repo.mapeo?.requerimientos || {})}},
      updatedAt: aFecha(repo.updatedAt)?.toISOString() || null,
      updatedBy: repo.updatedBy || null,
      updatedByNombre: repo.updatedByNombre || null,
    };
  }

  /**
   * Expediente editable por el actor (o error).
   * @param {string} expedienteId ID del Expediente.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object>} Expediente.
   */
  async _editable(expedienteId, actor) {
    if (!ROLES_EDITAN.includes(actor.rol)) {
      throw new AppError(403, "No tiene permisos para configurar la " +
          "documentación del expediente.");
    }
    const expediente = await expedienteService.getExpedienteById(
        expedienteId, actor);
    if (expediente.estado === "cerrado") {
      throw new AppError(409, "El expediente está cerrado.");
    }
    return expediente;
  }

  /**
   * Nombre del actor para la auditoría.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<string>} Nombre.
   */
  async _nombreActor(actor) {
    const usuario = await usuarioRepository.getById(actor.uid)
        .catch(() => null);
    return usuario ?
      `${usuario.nombre || ""} ${usuario.apellido || ""}`.trim() :
      actor.email || actor.uid;
  }

  /**
   * Repositorio del Expediente y si el actor puede editarlo.
   * @param {string} expedienteId ID del Expediente.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object>} {repositorioDocumental, modoEstructura,
   *     puedeEditar}.
   */
  async obtener(expedienteId, actor) {
    const expediente = await expedienteService.getExpedienteById(
        expedienteId, actor);
    const config = await configRepository.get(expedienteId);
    return {
      repositorioDocumental: this._publico(config?.repositorioDocumental),
      modoEstructura: config?.modoEstructura || "plantilla",
      puedeEditar: ROLES_EDITAN.includes(actor.rol) &&
          expediente.estado !== "cerrado",
    };
  }

  /**
   * Configura el repositorio ({tipo, etiqueta, url, mapeo?}), lo quita
   * ({tipo: null}) o actualiza solo el mapeo ({mapeo}, sin tipo). Sin
   * mapeo en el payload se conserva el que había. Con carpeta local también
   * deja su nombre como carpeta de la revisión IA. Registra en la Bitácora
   * el valor anterior y el nuevo.
   * @param {string} expedienteId ID del Expediente.
   * @param {Object} payload Datos.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object>} Igual que obtener.
   */
  async actualizar(expedienteId, payload, actor) {
    const expediente = await this._editable(expedienteId, actor);
    const previa = await configRepository.get(expedienteId);
    const anterior = previa?.repositorioDocumental || null;
    const p = payload || {};
    const quitar = p.tipo === null;
    const soloMapeo = p.tipo === undefined && p.mapeo !== undefined;
    let valor = null;
    if (soloMapeo) {
      if (!anterior) {
        throw new AppError(409, "Primero vincule la carpeta del expediente.");
      }
      const m = validarMapeo(p.mapeo);
      if (!m.ok) throw new AppError(400, m.error);
      valor = {tipo: anterior.tipo, etiqueta: anterior.etiqueta,
        url: anterior.url || null, mapeo: m.valor};
    } else if (!quitar) {
      const r = validarRepositorio(p);
      if (!r.ok) throw new AppError(400, r.error);
      valor = {...r.valor, mapeo: r.valor.mapeo || anterior?.mapeo ||
        MAPEO_VACIO};
    }
    const nombre = await this._nombreActor(actor);
    const repositorioDocumental = valor ? {...valor, updatedAt: new Date(),
      updatedBy: actor.uid, updatedByNombre: nombre} : null;
    await configRepository.guardar(expedienteId, {
      mandanteId: expediente.mandanteId,
      repositorioDocumental,
      // Revisiones IA usa el nombre de la carpeta local.
      ...(valor?.tipo === "local" ? {fuente: "carpeta_local",
        carpetaNombre: valor.etiqueta} : {}),
      ...(quitar && anterior?.tipo === "local" ? {carpetaNombre: null} : {}),
      updatedBy: actor.uid, updatedByNombre: nombre,
    });
    const resumen = (r) => (r ? {tipo: r.tipo, etiqueta: r.etiqueta,
      url: r.url || null, mapeo: r.mapeo || null} : null);
    await bitacoraLogger.registrarEvento({
      mandanteId: expediente.mandanteId,
      entidad: "expediente",
      entidadId: expedienteId,
      accion: "repositorio_documental_actualizado",
      actor,
      detalle: {anterior: resumen(anterior), nuevo: resumen(valor)},
    });
    return this.obtener(expedienteId, actor);
  }

  /**
   * Carpeta de una persona o recurso del Expediente (ruta relativa a la
   * raíz), guardada en sus documentos de participación activos. null la
   * quita. Registra en la Bitácora el valor anterior y el nuevo.
   * @param {string} expedienteId ID del Expediente.
   * @param {{tipo: string, sujetoId: string, carpetaRelativa: ?string}}
   *     payload tipo "persona" | "recurso".
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<{tipo: string, sujetoId: string,
   *     carpetaRelativa: ?string}>} Valor guardado.
   */
  async asignarCarpetaSujeto(expedienteId, payload, actor) {
    const expediente = await this._editable(expedienteId, actor);
    const {tipo, sujetoId} = payload || {};
    if (!["persona", "recurso"].includes(tipo) || !sujetoId) {
      throw new AppError(400, "Indique la persona o el recurso.");
    }
    const r = validarRutaRelativa(payload.carpetaRelativa);
    if (!r.ok) throw new AppError(400, r.error);
    const repo = tipo === "persona" ? participacionPersonaRepository :
      participacionRecursoRepository;
    const campo = tipo === "persona" ? "personaId" : "recursoId";
    const docs = await repo.list({participacionId: expediente.participacionId,
      [campo]: String(sujetoId), estado: "activa"});
    if (!docs.length) {
      throw new AppError(404, `${tipo === "persona" ? "La persona" :
        "El recurso"} no está asignado a este expediente.`);
    }
    const anterior = docs.find((d) => d.carpetaRelativa)?.carpetaRelativa ||
        null;
    await Promise.all(docs.map((d) => repo.update(d.id,
        {carpetaRelativa: r.valor})));
    await bitacoraLogger.registrarEvento({
      mandanteId: expediente.mandanteId,
      entidad: "expediente",
      entidadId: expedienteId,
      accion: "carpeta_sujeto_actualizada",
      actor,
      detalle: {tipo, sujetoId: String(sujetoId), anterior, nuevo: r.valor},
    });
    return {tipo, sujetoId: String(sujetoId), carpetaRelativa: r.valor};
  }
}

module.exports = new RepositorioDocumentalService();
module.exports.ROLES_EDITAN = ROLES_EDITAN;
