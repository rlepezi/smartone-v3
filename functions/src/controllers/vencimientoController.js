const vencimientoService = require("../services/vencimientoService");

/**
 * Controlador de vencimientos de documentos (Dashboard y detalle de
 * Expediente).
 */
class VencimientoController {
  /**
   * GET /vencimientos?mandanteId&estado=vencidos|proximos&limit&cursor.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async listar(req, res, next) {
    try {
      const data = await vencimientoService.listar(req.query, req.user);
      res.status(200).json({message: "Vencimientos.", data});
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /expedientes/:id/vencimientos?estado=vencidos|proximos|todos.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async delExpediente(req, res, next) {
    try {
      const data = await vencimientoService.delExpediente(
          req.params.id, req.query.estado, req.user,
      );
      res.status(200).json({message: "Vencimientos del expediente.", data});
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new VencimientoController();
