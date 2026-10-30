const plantillaEstructuraRepository =
    require("../repositories/plantillaEstructuraRepository");
const mandanteRepository = require("../repositories/mandanteRepository");
const usuarioRepository = require("../repositories/usuarioRepository");
const bitacoraLogger = require("../utils/bitacoraLogger");
const AppError = require("../utils/AppError");
const {validarPlantilla} = require("../utils/plantillaEstructura");
const {
  aplicarHabilitacion, cambiosMasivos, calcularAlcance, calcularEstadoEfectivo,
} = require("../utils/alcanceValidacion");
const tipoDocumentalRepository =
    require("../repositories/tipoDocumentalRepository");
const PLANTILLA_TRANSEMEL =
    require("../../config/plantillas/transemel-carpeta-arranque-v1.json");

// Roles que administran plantillas: superadmin (cualquier Mandante) y
// mandante_admin (el suyo). Leer la activa: también evaluador y
// mandante_lector (Nueva revisión, detalle).
const ROLES_ADMINISTRAN = ["superadmin", "mandante_admin"];
const ROLES_ALCANCE_FORZADO = ["mandante_admin", "mandante_lector"];

/**
 * Plantillas de Estructura de carpetas por Mandante (una activa). Describen
 * QUÉ se espera en la carpeta de arranque de cada empresa y CÓMO
 * reconocerlo (alias), no en qué número va.
 */
class PlantillaEstructuraService {
  /**
   * Mandante accesible por el actor.
   * @param {Object} actor Usuario autenticado.
   * @param {?string} mandanteId Mandante pedido.
   * @return {Promise<string>} mandanteId validado.
   */
  async _mandante(actor, mandanteId) {
    const id = ROLES_ALCANCE_FORZADO.includes(actor.rol) ?
        actor.mandanteId : mandanteId;
    if (!id) throw new AppError(400, "Falta el Mandante.");
    if (ROLES_ALCANCE_FORZADO.includes(actor.rol) && mandanteId &&
        mandanteId !== actor.mandanteId) {
      throw new AppError(403, "No tiene acceso a este Mandante.");
    }
    if (!(await mandanteRepository.getById(id))) {
      throw new AppError(404, "Mandante no encontrado.");
    }
    return id;
  }

  /**
   * Exige un rol que administra plantillas.
   * @param {Object} actor Usuario autenticado.
   */
  _exigirAdministra(actor) {
    if (!ROLES_ADMINISTRAN.includes(actor.rol)) {
      throw new AppError(403, "No puede administrar plantillas.");
    }
  }

  /**
   * Autor para mostrar.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<{uid: string, nombre: string}>} Autor.
   */
  async _autor(actor) {
    const u = await usuarioRepository.getById(actor.uid).catch(() => null);
    const nombre = u ? `${u.nombre || ""} ${u.apellido || ""}`.trim() : "";
    return {uid: actor.uid, nombre: nombre || actor.email || actor.uid};
  }

  /**
   * Plantilla activa de un Mandante (o null).
   * @param {?string} mandanteId Mandante.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<?Object>} Plantilla.
   */
  async obtenerActiva(mandanteId, actor) {
    const id = await this._mandante(actor, mandanteId);
    return plantillaEstructuraRepository.getActiva(id);
  }

  /**
   * Importa una plantilla (la de Transemel v1 incluida en el código, o un
   * JSON del usuario) como la activa del Mandante.
   * @param {{mandanteId: string, origen: string, plantilla: ?Object}} payload
   *     origen "transemel" | "json".
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object>} Plantilla creada.
   */
  async importar({mandanteId, origen, plantilla}, actor) {
    this._exigirAdministra(actor);
    const id = await this._mandante(actor, mandanteId);
    if (await plantillaEstructuraRepository.getActiva(id)) {
      throw new AppError(409, "Este Mandante ya tiene una plantilla activa. " +
          "Desactívela antes de importar otra.");
    }
    const fuente = origen === "transemel" ? PLANTILLA_TRANSEMEL : plantilla;
    if (!fuente) throw new AppError(400, "Falta la plantilla a importar.");
    const datos = validarPlantilla(fuente);
    const autor = await this._autor(actor);
    const creada = await plantillaEstructuraRepository.create({
      ...datos, mandanteId: id, version: 1, estado: "activa",
      createdBy: autor, updatedBy: autor,
    });
    await bitacoraLogger.registrarEvento({
      mandanteId: id, entidad: "plantillasEstructura", entidadId: creada.id,
      accion: "creado", actor,
      detalle: {nombre: datos.nombre, origen,
        secciones: datos.secciones.length},
    });
    return creada;
  }

  /**
   * Guarda la plantilla editada: valida todo y sube la versión.
   * @param {string} plantillaId ID.
   * @param {Object} cambios Plantilla completa (nombre, profundidad,
   *     secciones).
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object>} Plantilla actualizada.
   */
  async actualizar(plantillaId, cambios, actor) {
    this._exigirAdministra(actor);
    const previa = await this._cargar(plantillaId, actor);
    if (previa.estado !== "activa") {
      throw new AppError(409, "La plantilla está inactiva.");
    }
    const datos = validarPlantilla(cambios);
    const actualizada = await plantillaEstructuraRepository.update(
        plantillaId, {...datos, version: (previa.version || 1) + 1,
          updatedBy: await this._autor(actor)},
    );
    await bitacoraLogger.registrarEvento({
      mandanteId: previa.mandanteId, entidad: "plantillasEstructura",
      entidadId: plantillaId, accion: "actualizado", actor,
      detalle: {version: actualizada.version,
        secciones: datos.secciones.length},
    });
    return actualizada;
  }

  /**
   * Aplica cambios de habilitación (secciones, archivos sueltos y
   * documentos) en UNA transacción, con un solo incremento de versión.
   * @param {string} plantillaId ID.
   * @param {Object[]} cambios [{nivel, seccionClave, elementoClave?,
   *     habilitado}].
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<{plantilla: Object, estadoEfectivo: Object,
   *     alcance: Object}>} Resultado.
   */
  async habilitacion(plantillaId, cambios, actor) {
    this._exigirAdministra(actor);
    const previa = await this._cargar(plantillaId, actor);
    const autor = await this._autor(actor);
    let aplicados = [];
    const plantilla = await plantillaEstructuraRepository
        .actualizarEnTransaccion(plantillaId, (actual) => {
          if (!actual || actual.estado !== "activa") {
            throw new AppError(409, "La plantilla no está activa.");
          }
          const r = aplicarHabilitacion(actual.secciones, cambios);
          aplicados = r.aplicados;
          return {secciones: r.secciones, version: (actual.version || 1) + 1,
            updatedBy: autor};
        });
    await bitacoraLogger.registrarEvento({
      mandanteId: previa.mandanteId, entidad: "plantillasEstructura",
      entidadId: plantillaId, accion: "habilitacion_actualizada", actor,
      detalle: {
        version: plantilla.version,
        cambios: aplicados.map((c) => ({
          elemento: c.nivel === "seccion" ? "seccion" :
            c.nivel === "archivoSeccion" ? "archivo_suelto" : "documento",
          seccionClave: c.seccionClave, elementoClave: c.elementoClave || null,
          anterior: c.anterior, nuevo: c.habilitado,
        })),
      },
    });
    return this._conAlcance(plantilla);
  }

  /**
   * Acción masiva: habilitar o deshabilitar toda la plantilla o una sección
   * con todos sus hijos.
   * @param {string} plantillaId ID.
   * @param {{accion: string, seccionClave: (string|undefined)}} payload
   *     Acción.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object>} Como habilitacion.
   */
  async habilitacionMasiva(plantillaId, {accion, seccionClave}, actor) {
    const plantilla = await this._cargar(plantillaId, actor);
    return this.habilitacion(plantillaId,
        cambiosMasivos(plantilla.secciones, accion, seccionClave || null),
        actor);
  }

  /**
   * Alcance de validación de una plantilla.
   * @param {string} plantillaId ID.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object>} Alcance.
   */
  async alcance(plantillaId, actor) {
    const plantilla = await this._cargar(plantillaId, actor);
    return calcularAlcance(plantilla, await tipoDocumentalRepository.list());
  }

  /**
   * Plantilla con su estado efectivo y su alcance.
   * @param {Object} plantilla Plantilla.
   * @return {Promise<Object>} {plantilla, estadoEfectivo, alcance}.
   */
  async _conAlcance(plantilla) {
    return {
      plantilla,
      estadoEfectivo: calcularEstadoEfectivo(plantilla),
      alcance: calcularAlcance(plantilla,
          await tipoDocumentalRepository.list()),
    };
  }

  /**
   * Desactiva una plantilla (cambio de estado).
   * @param {string} plantillaId ID.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object>} Plantilla.
   */
  async desactivar(plantillaId, actor) {
    this._exigirAdministra(actor);
    const previa = await this._cargar(plantillaId, actor);
    if (previa.estado === "inactiva") return previa;
    const actualizada = await plantillaEstructuraRepository.update(
        plantillaId, {estado: "inactiva",
          updatedBy: await this._autor(actor)},
    );
    await bitacoraLogger.registrarEvento({
      mandanteId: previa.mandanteId, entidad: "plantillasEstructura",
      entidadId: plantillaId, accion: "transicion_estado", actor,
      detalle: {estadoAnterior: "activa", estadoNuevo: "inactiva"},
    });
    return actualizada;
  }

  /**
   * Plantilla accesible por el actor.
   * @param {string} plantillaId ID.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object>} Plantilla.
   */
  async _cargar(plantillaId, actor) {
    const plantilla = await plantillaEstructuraRepository.getById(plantillaId);
    if (!plantilla || (ROLES_ALCANCE_FORZADO.includes(actor.rol) &&
        plantilla.mandanteId !== actor.mandanteId)) {
      throw new AppError(404, "Plantilla no encontrada.");
    }
    return plantilla;
  }
}

module.exports = new PlantillaEstructuraService();
