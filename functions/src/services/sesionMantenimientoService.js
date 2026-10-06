const sesionRepository = require("../repositories/sesionRepository");
const sesionService = require("./sesionService");

const MINUTOS_TIMEOUT = 15;

/**
 * Mantenimiento periódico de Sesiones — scheduled function cada 15 min
 * (Fase B). Cierra por timeout las sesiones sin latido reciente.
 */
class SesionMantenimientoService {
  /**
   * Cierra toda sesión abierta cuyo último latido sea de hace más de
   * `MINUTOS_TIMEOUT` minutos, con `fin = ultimoLatido` (no "ahora": la
   * sesión se considera terminada en el momento del último latido real,
   * no en el momento en que corrió este job).
   * @return {Promise<number>} Cantidad de sesiones cerradas.
   */
  async cerrarAbandonadas() {
    const corte = new Date(Date.now() - MINUTOS_TIMEOUT * 60 * 1000);
    const abandonadas = await sesionRepository.getAbandonadasDesde(corte);
    await Promise.all(abandonadas.map((sesion) => {
      const ultimoLatidoDate = sesion.ultimoLatido?.toDate ?
          sesion.ultimoLatido.toDate() : new Date(sesion.ultimoLatido);
      return sesionService.cerrarInterna(sesion, "timeout", ultimoLatidoDate);
    }));
    return abandonadas.length;
  }
}

module.exports = new SesionMantenimientoService();
