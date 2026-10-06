const bitacoraRepository = require("../repositories/bitacoraRepository");

// Roles cuyo acceso queda siempre acotado a su propio mandanteId (mismo
// criterio que el resto de módulos). evaluador NO está acá: lee sin
// restricción de mandante, igual que en todos los demás módulos.
const ROLES_ALCANCE_FORZADO = ["mandante_admin", "mandante_lector"];

/**
 * Reglas de negocio para el recurso Bitácora (auditoría/trazabilidad,
 * RN-104/RN-120/RN-121). Es de solo lectura desde la API pública — la
 * escritura es exclusivamente interna vía
 * functions/src/utils/bitacoraLogger.js.
 */
class BitacoraService {
  /**
   * Lista registros de bitácora, respetando el alcance del actor.
   *
   * Soporta dos modos de consulta, mutuamente excluyentes:
   *   - `entidad` + `entidadId`: historial completo de una entidad
   *     puntual. Como la consulta al repositorio no filtra por
   *     mandanteId (evita requerir un índice compuesto de 4 campos), el
   *     scope para mandante_admin/mandante_lector se aplica ACÁ, en
   *     memoria, después de traer los resultados — nunca se exponen
   *     registros de una entidad de otro Mandante.
   *   - `mandanteId` (opcional): actividad reciente, acotada por
   *     `limit`. Para los roles con alcance forzado, el mandanteId
   *     solicitado se IGNORA y se reemplaza siempre por el propio del
   *     actor.
   * @param {{mandanteId: (string|undefined), entidad: (string|undefined),
   *     entidadId: (string|undefined), limit: (string|number|undefined)}}
   *     filtros Filtros de búsqueda.
   * @param {Object} actor Usuario autenticado que ejecuta la acción.
   * @return {Promise<Object[]>} Lista de registros visibles para el
   *     actor.
   */
  async listarBitacora(filtros, actor) {
    const {entidad, entidadId, limit} = filtros;
    const alcanceForzado = ROLES_ALCANCE_FORZADO.includes(actor.rol);

    if (entidad && entidadId) {
      const registros = await bitacoraRepository.list({
        entidad, entidadId, limit,
      });
      if (alcanceForzado) {
        return registros.filter((r) => r.mandanteId === actor.mandanteId);
      }
      return registros;
    }

    const mandanteId = alcanceForzado ? actor.mandanteId : filtros.mandanteId;
    return await bitacoraRepository.list({mandanteId, limit});
  }

  /**
   * Eventos de varias entidades relacionadas (p. ej. un Proyecto o una
   * Empresa junto a sus Participaciones/Asignaciones/Expedientes),
   * combinados y ordenados por fecha descendente, respetando el alcance
   * del actor. Único mecanismo usado por el detalle de Proyecto y el de
   * Empresa.
   * @param {{entidad: string, entidadId: string}[]} referencias Pares
   *     entidad/entidadId a consultar.
   * @param {Object} actor Usuario autenticado que ejecuta la acción.
   * @param {{limit: (string|number|undefined)}} [opciones] Máximo de
   *     eventos (por defecto 15, tope 500).
   * @return {Promise<Object[]>} Eventos visibles para el actor.
   */
  async listarPorReferencias(referencias, actor, {limit} = {}) {
    const limite = Math.min(Math.max(Number(limit) || 15, 1), 500);
    const eventos = await bitacoraRepository.listPorReferencias(
        referencias, {limit: limite},
    );
    if (ROLES_ALCANCE_FORZADO.includes(actor.rol)) {
      return eventos.filter((e) => e.mandanteId === actor.mandanteId);
    }
    return eventos;
  }
}

module.exports = new BitacoraService();
