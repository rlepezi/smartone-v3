const evidenciaService = require("../services/evidenciaService");
const derechosArcoService = require("../services/derechosArcoService");

/**
 * Controlador HTTP para el recurso Evidencia.
 */
class EvidenciaController {
  /**
   * Lista evidencias. Si se indica `expedienteId`, devuelve solo las
   * activas de ese Expediente (usado por el detalle del Expediente);
   * si no, aplica el listado general filtrado por mandante/estado.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async list(req, res, next) {
    try {
      const {mandanteId, estado, expedienteId} = req.query;
      const evidencias = expedienteId ?
          await evidenciaService.listarActivasPorExpediente(
              expedienteId, req.user,
          ) :
          await evidenciaService.listarEvidencias(
              {mandanteId, estado}, req.user,
          );
      res.status(200).json({data: evidencias});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Obtiene una evidencia por su ID.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async getById(req, res, next) {
    try {
      const {id} = req.params;
      const evidencia = await evidenciaService.getEvidenciaById(
          id, req.user,
      );
      res.status(200).json({data: evidencia});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Crea una nueva evidencia.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async create(req, res, next) {
    try {
      const nuevaEvidencia = await evidenciaService.crearEvidencia(
          req.body, req.user,
      );
      res.status(201).json({
        message: "Evidencia creada exitosamente.",
        data: nuevaEvidencia,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Actualiza el estado de una evidencia existente.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async update(req, res, next) {
    try {
      const {id} = req.params;
      const evidenciaActualizada = await evidenciaService
          .actualizarEstadoEvidencia(id, req.body, req.user);
      res.status(200).json({
        message: "Evidencia actualizada exitosamente.",
        data: evidenciaActualizada,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Cancela la eliminación programada de una evidencia (solo superadmin,
   * con motivo).
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async cancelarPurga(req, res, next) {
    try {
      const data = await derechosArcoService.cancelarPurga(
          req.params.id, req.body?.motivo, req.user,
      );
      res.status(200).json({
        message: "Eliminación programada cancelada.", data,
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new EvidenciaController();
