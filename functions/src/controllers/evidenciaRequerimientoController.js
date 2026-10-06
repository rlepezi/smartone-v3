const evidenciaRequerimientoService =
    require("../services/evidenciaRequerimientoService");

/**
 * Controlador HTTP para el recurso Evidencia-Requerimiento.
 */
class EvidenciaRequerimientoController {
  /**
   * Lista los vínculos activos de un Expediente (`expedienteId` es
   * obligatorio como query param — esta tabla de vínculo no expone un
   * listado global paginado).
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async list(req, res, next) {
    try {
      const {expedienteId} = req.query;
      if (!expedienteId) {
        return res.status(400).json({
          error: "BadRequest",
          message: "El query param 'expedienteId' es requerido.",
        });
      }
      const vinculos = await evidenciaRequerimientoService
          .listarActivosPorExpediente(expedienteId, req.user);
      res.status(200).json({data: vinculos});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Obtiene un vínculo por su ID.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async getById(req, res, next) {
    try {
      const {id} = req.params;
      const vinculo = await evidenciaRequerimientoService.getVinculoById(
          id, req.user,
      );
      res.status(200).json({data: vinculo});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Crea un nuevo vínculo.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async create(req, res, next) {
    try {
      const nuevoVinculo = await evidenciaRequerimientoService.crearVinculo(
          req.body, req.user,
      );
      res.status(201).json({
        message: "Vínculo creado exitosamente.",
        data: nuevoVinculo,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Actualiza el estado de un vínculo existente.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async update(req, res, next) {
    try {
      const {id} = req.params;
      const vinculoActualizado = await evidenciaRequerimientoService
          .actualizarVinculo(id, req.body, req.user);
      res.status(200).json({
        message: "Vínculo actualizado exitosamente.",
        data: vinculoActualizado,
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new EvidenciaRequerimientoController();
