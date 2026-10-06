const requerimientoRepository =
    require("../repositories/requerimientoRepository");
const perfilRequerimientoRepository =
    require("../repositories/perfilRequerimientoRepository");

/**
 * Motor de cálculo de Requerimientos aplicables a un Perfil de
 * Participación. Extraído de `expedienteService.crearExpediente` para
 * poder reutilizarlo sin duplicar la lógica (RN-032: el snapshot
 * resultante queda fijo para siempre en el Expediente que lo consuma —
 * salvo la sincronización explícita de Expedientes abiertos al editar
 * vínculos, ver expedienteService.sincronizarRequerimientosDePerfil).
 *
 * Forma de cada entrada del snapshot:
 *   {requerimientoId, nombre, nombreCorto, tipoEntidad,
 *    perfilRecursoIds: null | [ids], requiereVencimiento, orden}
 * - perfilRecursoIds null = aplica a todos los sujetos del tipo (siempre
 *   null para "empresa").
 * - Con varios vínculos del mismo Requerimiento, orden es el menor.
 */
class RequerimientoCalculoService {
  /**
   * Construye la entrada de snapshot de un Requerimiento a partir de sus
   * vínculos activos con un Perfil de Participación (función pura).
   * @param {Object} requerimiento Documento del Requerimiento (con `id`).
   * @param {Object[]} vinculos Vínculos activos de ese Requerimiento en el
   *     Perfil de Participación (al menos uno).
   * @return {Object} Entrada del snapshot.
   */
  construirEntrada(requerimiento, vinculos) {
    const tipoEntidad = requerimiento.tipoEntidad;
    const algunoTodos = vinculos.some((v) => !v.perfilRecursoId);
    const perfilRecursoIds = tipoEntidad === "empresa" || algunoTodos ?
      null :
      [...new Set(vinculos.map((v) => v.perfilRecursoId))].sort();
    const ordenes = vinculos
        .map((v) => v.orden)
        .filter((o) => typeof o === "number");
    return {
      requerimientoId: requerimiento.id,
      nombre: requerimiento.nombre,
      nombreCorto: requerimiento.nombreCorto || requerimiento.nombre,
      tipoEntidad,
      perfilRecursoIds,
      requiereVencimiento: Boolean(requerimiento.requiereVencimiento),
      orden: ordenes.length ? Math.min(...ordenes) : null,
    };
  }

  /**
   * Agrupa vínculos activos por Requerimiento y arma el snapshot, en el
   * orden en que aparece cada Requerimiento. Ignora vínculos de
   * Requerimientos que no estén en `requerimientosPorId` (inactivos).
   * @param {Object[]} vinculos Vínculos activos.
   * @param {Object<string, Object>} requerimientosPorId Requerimientos
   *     activos por ID.
   * @return {Object[]} Entradas del snapshot.
   */
  agruparEnSnapshot(vinculos, requerimientosPorId) {
    const porRequerimiento = new Map();
    vinculos.forEach((v) => {
      if (!requerimientosPorId[v.requerimientoId]) return;
      if (!porRequerimiento.has(v.requerimientoId)) {
        porRequerimiento.set(v.requerimientoId, []);
      }
      porRequerimiento.get(v.requerimientoId).push(v);
    });
    return [...porRequerimiento.entries()].map(([id, lista]) =>
      this.construirEntrada(requerimientosPorId[id], lista),
    );
  }

  /**
   * Calcula el snapshot de Requerimientos aplicables para un Perfil de
   * Participación, combinando el catálogo activo de Requerimientos con
   * los vínculos activos de Perfil-Requerimiento.
   * @param {string} perfilParticipacionId ID del Perfil de Participación.
   * @return {Promise<Array<Object>>} Snapshot de Requerimientos aplicables.
   */
  async calcularRequerimientosAplicables(perfilParticipacionId) {
    const [catalogoActivo, vinculosActivos] = await Promise.all([
      requerimientoRepository.list({estado: "activo"}),
      perfilRequerimientoRepository.getActivosByPerfil(perfilParticipacionId),
    ]);
    const requerimientosPorId = {};
    catalogoActivo.forEach((r) => {
      requerimientosPorId[r.id] = r;
    });
    return this.agruparEnSnapshot(vinculosActivos, requerimientosPorId);
  }
}

module.exports = new RequerimientoCalculoService();
