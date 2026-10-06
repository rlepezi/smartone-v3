const relacionLaboralService = require("../services/relacionLaboralService");

/**
 * Controlador HTTP para el recurso RelaciónLaboral.
 */
class RelacionLaboralController {
  /**
   * Lista las relaciones laborales de una Persona (historial completo).
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async list(req, res, next) {
    try {
      const {personaId} = req.query;
      const relaciones = await relacionLaboralService.listarPorPersona(
          personaId,
      );
      res.status(200).json({data: relaciones});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Cambia la Empresa activa de una Persona (cierra la relación laboral
   * activa actual y crea una nueva, en una sola transacción).
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async cambiarEmpresa(req, res, next) {
    try {
      const {personaId} = req.params;
      const nuevaRelacion = await relacionLaboralService.cambiarEmpresa(
          personaId, req.body, req.user,
      );
      res.status(200).json({
        message: "Empresa de la persona actualizada exitosamente.",
        data: nuevaRelacion,
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new RelacionLaboralController();
