const reglaIARepository = require("../repositories/reglaIARepository");
const requerimientoReglaRepository =
    require("../repositories/requerimientoReglaRepository");
const usuarioRepository = require("../repositories/usuarioRepository");
const bitacoraLogger = require("../utils/bitacoraLogger");
const {aFecha} = require("../utils/vencimientos");
const {validarRegla, TIPOS_REGLA} = require("../reglasIA/reglas");
const {catalogo} = require("../reglasIA/verificaciones");
const {ENTIDADES} = require("../reglasIA/tiposDocumentales");
const AppError = require("../utils/AppError");
const requerimientoReglaIAService = require("./requerimientoReglaIAService");

const ESTADOS = ["activa", "inactiva"];
const aISO = (v) => aFecha(v)?.toISOString() || null;

/**
 * Biblioteca de reglas de revisión IA (solo superadmin): crear, editar (cada
 * edición es una versión nueva; la anterior queda en `versiones`), duplicar y
 * activar/desactivar. Nunca se borra. Todo cambio queda en la Bitácora.
 */
class ReglaIAService {
  /**
   * Exige superadmin (además de la ruta).
   * @param {Object} actor Usuario autenticado.
   */
  _exigirSuperadmin(actor) {
    if (actor?.rol !== "superadmin") {
      throw new AppError(403, "Solo un superadmin gestiona las reglas de " +
          "revisión IA.");
    }
  }

  /**
   * Nombre del actor para auditoría.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<string>} Nombre.
   */
  async _nombre(actor) {
    const u = await usuarioRepository.getById(actor.uid).catch(() => null);
    return u ? `${u.nombre || ""} ${u.apellido || ""}`.trim() :
      actor.email || actor.uid;
  }

  /**
   * Requerimientos que usan cada regla (vínculos activos).
   * @return {Promise<Map<string, number>>} reglaId → cantidad.
   */
  async _uso() {
    const vinculos = await requerimientoReglaRepository.listActivos();
    const porRegla = new Map();
    vinculos.forEach((v) => {
      if (!porRegla.has(v.reglaId)) porRegla.set(v.reglaId, new Set());
      porRegla.get(v.reglaId).add(v.requerimientoId);
    });
    return new Map([...porRegla].map(([id, s]) => [id, s.size]));
  }

  /**
   * Forma pública de una regla (fechas ISO y uso).
   * @param {Object} r Regla.
   * @param {number} uso Requerimientos que la usan.
   * @return {Object} Regla.
   */
  _publica(r, uso = 0) {
    return {...r, uso, createdAt: aISO(r.createdAt),
      updatedAt: aISO(r.updatedAt)};
  }

  /**
   * Regla existente (o 404).
   * @param {string} id ID.
   * @return {Promise<Object>} Regla.
   */
  async _existente(id) {
    const r = await reglaIARepository.getById(id);
    if (!r) throw new AppError(404, "Regla no encontrada.");
    return r;
  }

  /**
   * Biblioteca con filtros y uso.
   * @param {Object} filtros {tipo, entidad, estado, texto}.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object[]>} Reglas.
   */
  async listar(filtros, actor) {
    this._exigirSuperadmin(actor);
    const {tipo, entidad, estado} = filtros || {};
    if (tipo && !TIPOS_REGLA.includes(tipo)) {
      throw new AppError(400, "Tipo de regla no válido.");
    }
    if (entidad && !ENTIDADES.includes(entidad)) {
      throw new AppError(400, "Entidad no válida.");
    }
    if (estado && !ESTADOS.includes(estado)) {
      throw new AppError(400, "Estado no válido.");
    }
    const texto = String(filtros?.texto || "").trim().toLowerCase();
    const [reglas, uso] = await Promise.all([reglaIARepository.list(),
      this._uso()]);
    return reglas
        .filter((r) => (!tipo || r.tipo === tipo) &&
          (!entidad || (r.entidades || []).includes(entidad)) &&
          (!estado || r.estado === estado) &&
          (!texto || `${r.nombre} ${r.descripcion || ""}`.toLowerCase()
              .includes(texto)))
        .map((r) => this._publica(r, uso.get(r.id) || 0))
        .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  }

  /**
   * Catálogo de verificaciones determinísticas (con su esquema de
   * parámetros) para el formulario.
   * @param {Object} actor Usuario autenticado.
   * @return {Array<Object>} Verificaciones.
   */
  verificaciones(actor) {
    this._exigirSuperadmin(actor);
    return catalogo();
  }

  /**
   * Una regla con sus versiones anteriores.
   * @param {string} id ID.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object>} Regla con `versiones`.
   */
  async obtener(id, actor) {
    this._exigirSuperadmin(actor);
    const [r, uso, versiones] = await Promise.all([this._existente(id),
      this._uso(), reglaIARepository.listVersiones(id)]);
    return {...this._publica(r, uso.get(id) || 0),
      versiones: versiones.map((v) => ({...v, createdAt: aISO(v.createdAt),
        updatedAt: aISO(v.updatedAt), archivadaAt: aISO(v.archivadaAt)}))};
  }

  /**
   * Crea una regla (activa, versión 1).
   * @param {Object} payload Datos.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object>} Regla creada.
   */
  async crear(payload, actor) {
    this._exigirSuperadmin(actor);
    const v = validarRegla(payload);
    if (!v.ok) throw new AppError(400, v.error);
    const nombre = await this._nombre(actor);
    const creada = await reglaIARepository.create({...v.valor,
      estado: "activa", createdBy: actor.uid, createdByNombre: nombre,
      updatedBy: actor.uid, updatedByNombre: nombre});
    await bitacoraLogger.registrarEvento({
      mandanteId: null, entidad: "reglasIA", entidadId: creada.id,
      accion: "creada", actor,
      detalle: {nombre: creada.nombre, tipo: creada.tipo,
        verificacion: creada.verificacion},
    });
    return this._publica(creada);
  }

  /**
   * "Guardar para todos": nueva versión de la regla (la anterior queda en
   * `versiones`). Los requerimientos que la usan toman la versión vigente.
   * @param {string} id ID.
   * @param {Object} payload Datos.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object>} Regla actualizada.
   */
  async actualizar(id, payload, actor) {
    this._exigirSuperadmin(actor);
    const previa = await this._existente(id);
    const v = validarRegla(payload);
    if (!v.ok) throw new AppError(400, v.error);
    const nombre = await this._nombre(actor);
    const actualizada = await reglaIARepository.nuevaVersion(id, {...v.valor,
      updatedBy: actor.uid, updatedByNombre: nombre});
    const uso = (await this._uso()).get(id) || 0;
    // Los requerimientos que la usan deben probarse de nuevo.
    await requerimientoReglaIAService.registrarCambioDeRegla(id, actor, {
      reglaNombre: actualizada.nombre, versionNueva: actualizada.version});
    await bitacoraLogger.registrarEvento({
      mandanteId: null, entidad: "reglasIA", entidadId: id,
      accion: "nueva_version", actor,
      detalle: {nombre: actualizada.nombre, versionAnterior: previa.version,
        versionNueva: actualizada.version, requerimientosAfectados: uso},
    });
    return this._publica(actualizada, uso);
  }

  /**
   * "Duplicar": regla nueva con el sufijo "(copia)"; la original no cambia.
   * Si viene `payload`, la copia toma esos datos (editar sin afectar a los
   * requerimientos que usan la original).
   * @param {string} id ID de la original.
   * @param {?Object} payload Datos editados, o null para copiar tal cual.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object>} Regla nueva.
   */
  async duplicar(id, payload, actor) {
    this._exigirSuperadmin(actor);
    const original = await this._existente(id);
    const base = payload && Object.keys(payload).length ? payload : original;
    const v = validarRegla({...base,
      nombre: `${String(base.nombre || original.nombre).replace(/\s*\(copia\)$/,
          "")} (copia)`.slice(0, 120)});
    if (!v.ok) throw new AppError(400, v.error);
    const nombre = await this._nombre(actor);
    const copia = await reglaIARepository.create({...v.valor,
      estado: "activa", duplicadaDe: id, createdBy: actor.uid,
      createdByNombre: nombre, updatedBy: actor.uid, updatedByNombre: nombre});
    await bitacoraLogger.registrarEvento({
      mandanteId: null, entidad: "reglasIA", entidadId: copia.id,
      accion: "duplicada", actor,
      detalle: {nombre: copia.nombre, originalId: id,
        originalNombre: original.nombre},
    });
    return this._publica(copia);
  }

  /**
   * Activa o desactiva (solo cambia el estado; nunca se borra). Si está en
   * uso se permite igual y se informa cuántos requerimientos quedan con
   * alerta.
   * @param {string} id ID.
   * @param {string} estado "activa" | "inactiva".
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object>} Regla con `uso`.
   */
  async cambiarEstado(id, estado, actor) {
    this._exigirSuperadmin(actor);
    if (!ESTADOS.includes(estado)) {
      throw new AppError(400, "Estado no válido: use activa o inactiva.");
    }
    const previa = await this._existente(id);
    const uso = (await this._uso()).get(id) || 0;
    if (previa.estado === estado) return this._publica(previa, uso);
    const nombre = await this._nombre(actor);
    const actualizada = await reglaIARepository.update(id, {estado,
      updatedBy: actor.uid, updatedByNombre: nombre});
    await requerimientoReglaIAService.registrarCambioDeRegla(id, actor, {
      reglaNombre: previa.nombre, estadoRegla: estado});
    await bitacoraLogger.registrarEvento({
      mandanteId: null, entidad: "reglasIA", entidadId: id,
      accion: "transicion_estado", actor,
      detalle: {nombre: previa.nombre, estadoAnterior: previa.estado,
        estadoNuevo: estado, requerimientosAfectados: uso},
    });
    return this._publica(actualizada, uso);
  }
}

module.exports = new ReglaIAService();
