const reporteService = require("../services/reporteService");
const reportePanelService = require("../services/reportePanelService");

/**
 * Controlador HTTP para el módulo Reportes. 100% de lectura — no hay
 * create/update/delete, se calcula en vivo sobre datos existentes.
 */
class ReporteController {
  /**
   * Genera el reporte de cumplimiento (resumen con KPIs).
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async resumen(req, res, next) {
    try {
      const {proyectoId, diasVencimiento} = req.query;
      const reporte = await reporteService.generarReporte(req.user, {
        proyectoId,
        diasVencimiento: diasVencimiento ? Number(diasVencimiento) : undefined,
      });
      res.status(200).json({data: reporte});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Panel de Reportes: todas las secciones con los filtros de la página.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async panel(req, res, next) {
    try {
      const {
        mandanteId, desde, hasta, proyectoId, perfilParticipacionId,
        empresaId,
      } = req.query;
      const panel = await reportePanelService.obtenerPanel(req.user, {
        mandanteId, desde, hasta, proyectoId, perfilParticipacionId,
        empresaId,
      });
      res.status(200).json({data: panel});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Obtiene el detalle operacional que explica uno de los KPIs.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async detalle(req, res, next) {
    try {
      const {tipo, proyectoId, diasVencimiento} = req.query;
      const detalle = await reporteService.obtenerDetalle(req.user, {
        tipo,
        proyectoId,
        diasVencimiento: diasVencimiento ? Number(diasVencimiento) : undefined,
      });
      res.status(200).json({data: detalle});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Lista las Empresas participantes de un Proyecto con su cumplimiento.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async participantesPorProyecto(req, res, next) {
    try {
      const participantes = await reporteService
          .obtenerParticipantesPorProyecto(req.params.proyectoId, req.user);
      res.status(200).json({data: participantes});
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new ReporteController();
