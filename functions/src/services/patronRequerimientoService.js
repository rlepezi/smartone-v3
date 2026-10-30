const patronRequerimientoRepository =
    require("../repositories/patronRequerimientoRepository");
const carpetaEmpresaRepository =
    require("../repositories/carpetaEmpresaRepository");
const carpetaEmpresaService = require("./carpetaEmpresaService");
const bitacoraLogger = require("../utils/bitacoraLogger");
const AppError = require("../utils/AppError");
const {normalizarNombreMapeo} = require("../utils/normalizacionMapeo");
const {
  AMBITOS, OBJETIVOS, agruparDeltas,
} = require("../utils/patronesMapeo");
const {aFecha} = require("../utils/vencimientos");

const ROLES = ["superadmin", "evaluador"];
const MAX_ITEMS = 200;
const aISO = (v) => aFecha(v)?.toISOString() || null;

/**
 * Patrones aprendidos del mapeo documental (por Mandante): listarlos,
 * confirmar o quitar los de los archivos de personas y maquinarias (que no
 * se guardan por persona: solo como patrón) y activarlos o desactivarlos.
 * Los patrones de Empresa y estructurales se aprenden al guardar el mapeo
 * de una carpeta (carpetaEmpresaService.actualizar). Solo superadmin y
 * evaluador.
 */
class PatronRequerimientoService {
  /**
   * Exige superadmin o evaluador.
   * @param {Object} actor Usuario autenticado.
   */
  _exigirRol(actor) {
    if (!ROLES.includes(actor.rol)) {
      throw new AppError(403, "No tiene permisos para el mapeo documental.");
    }
  }

  /**
   * Forma pública (fechas ISO).
   * @param {Object} p Patrón.
   * @return {Object} Patrón.
   */
  _publico(p) {
    return {...p, ultimaConfirmacionAt: aISO(p.ultimaConfirmacionAt),
      createdAt: aISO(p.createdAt), updatedAt: aISO(p.updatedAt)};
  }

  /**
   * Patrones de un Mandante, filtrados.
   * @param {Object} filtros {mandanteId, ambito, objetivo, requerimientoId,
   *     estado}.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object[]>} Patrones.
   */
  async listar(filtros, actor) {
    this._exigirRol(actor);
    const f = filtros || {};
    if (!f.mandanteId) throw new AppError(400, "Falta el Mandante.");
    if (f.ambito && !AMBITOS.includes(f.ambito)) {
      throw new AppError(400, "Ámbito no válido.");
    }
    if (f.objetivo && !OBJETIVOS.includes(f.objetivo)) {
      throw new AppError(400, "Objetivo no válido.");
    }
    const lista = await patronRequerimientoRepository.list({
      mandanteId: String(f.mandanteId), ambito: f.ambito || null,
      objetivo: f.objetivo || null, requerimientoId: f.requerimientoId || null,
      estado: f.estado || null});
    return lista.map((p) => this._publico(p));
  }

  /**
   * Confirma (+1) o quita (−1) patrones de archivos de personas o
   * maquinarias. El patrón lo calcula el backend desde el nombre del archivo
   * (sin el nombre de la persona o el identificador del recurso y sin
   * fechas). Todo en una transacción.
   * @param {Object} payload {carpetaEmpresaId, ambito: "persona" |
   *     "recurso", items: [{requerimientoId, nombreArchivo, nombreSujeto}]}.
   * @param {number} signo 1 confirmar, −1 quitar.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object[]>} Patrones aplicados.
   */
  async _cambiarArchivos(payload, signo, actor) {
    this._exigirRol(actor);
    const p = payload || {};
    if (!["persona", "recurso"].includes(p.ambito)) {
      throw new AppError(400, "Ámbito no válido: persona o recurso.");
    }
    const items = Array.isArray(p.items) ? p.items : [];
    if (!items.length || items.length > MAX_ITEMS) {
      throw new AppError(400, "Indique entre 1 y 200 archivos.");
    }
    const carpeta = await carpetaEmpresaRepository.getById(
        String(p.carpetaEmpresaId || ""));
    if (!carpeta) throw new AppError(404, "Carpeta de empresa no encontrada.");
    carpetaEmpresaService._mandante(actor, carpeta.mandanteId);
    const {requerimientos} = await carpetaEmpresaService._asignables(carpeta,
        p.ambito);
    const validos = new Set(requerimientos.map((r) => r.id));
    const deltas = items.map((it) => {
      const requerimientoId = String(it?.requerimientoId || "");
      if (!validos.has(requerimientoId)) {
        throw new AppError(400, "Solo se asignan requerimientos de " +
            (p.ambito === "persona" ? "Persona" : "Maquinaria") +
            " que aplican a esta carpeta.");
      }
      const patron = normalizarNombreMapeo(it?.nombreArchivo, {
        archivo: true, quitarFechas: true,
        ...(p.ambito === "persona" ? {nombrePersona: it?.nombreSujeto} :
          {identificadorRecurso: it?.nombreSujeto})});
      if (!patron) {
        throw new AppError(400, `«${it?.nombreArchivo}» no deja un nombre ` +
            "reconocible (solo trae el nombre de la persona o fechas).");
      }
      return {ambito: p.ambito, objetivo: "archivo", patron, requerimientoId,
        delta: signo};
    });
    const autor = await carpetaEmpresaService._autor(actor);
    const aplicados = await patronRequerimientoRepository.aplicar({
      deltas: agruparDeltas(carpeta.mandanteId, deltas), autor,
      carpetaEmpresaId: carpeta.id});
    await bitacoraLogger.registrarEvento({
      mandanteId: carpeta.mandanteId, entidad: "patronesRequerimiento",
      entidadId: carpeta.id, accion: signo > 0 ? "confirmado" : "quitado",
      actor, detalle: {ambito: p.ambito, patrones: aplicados.map((x) => ({
        patron: x.patron, requerimientoId: x.requerimientoId,
        delta: x.delta, vecesConfirmado: x.vecesConfirmado,
        estado: x.estado}))},
    });
    return aplicados;
  }

  /**
   * Confirma patrones de archivos de personas o maquinarias (+1).
   * @param {Object} payload Ver _cambiarArchivos.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object[]>} Patrones aplicados.
   */
  confirmarArchivos(payload, actor) {
    return this._cambiarArchivos(payload, 1, actor);
  }

  /**
   * Quita patrones de archivos de personas o maquinarias (−1; en cero
   * quedan inactivos).
   * @param {Object} payload Ver _cambiarArchivos.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object[]>} Patrones aplicados.
   */
  quitarArchivos(payload, actor) {
    return this._cambiarArchivos(payload, -1, actor);
  }

  /**
   * Activa o desactiva un patrón (gestión de patrones, Entrega 4).
   * @param {string} id Patrón.
   * @param {string} estado "activo" | "inactivo".
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object>} Patrón actualizado.
   */
  async cambiarEstado(id, estado, actor) {
    this._exigirRol(actor);
    if (!["activo", "inactivo"].includes(estado)) {
      throw new AppError(400, "Estado no válido.");
    }
    const patron = await patronRequerimientoRepository.getById(
        String(id || ""));
    if (!patron) throw new AppError(404, "Patrón no encontrado.");
    carpetaEmpresaService._mandante(actor, patron.mandanteId);
    if (patron.estado === estado) return this._publico(patron);
    const actualizado = await patronRequerimientoRepository.cambiarEstado(
        patron.id, estado, await carpetaEmpresaService._autor(actor));
    await bitacoraLogger.registrarEvento({
      mandanteId: patron.mandanteId, entidad: "patronesRequerimiento",
      entidadId: patron.id, accion: "transicion_estado", actor,
      detalle: {patron: patron.patron, requerimientoId: patron.requerimientoId,
        estadoAnterior: patron.estado, estadoNuevo: estado},
    });
    return this._publico(actualizado);
  }
}

module.exports = new PatronRequerimientoService();
