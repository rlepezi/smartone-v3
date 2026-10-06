const participacionService = require("../services/participacionService");

/**
 * Controlador HTTP para el recurso Participación.
 */
class ParticipacionController {
  /**
   * Obtiene una participación por su ID.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async getById(req, res, next) {
    try {
      const {id} = req.params;
      const participacion = await participacionService.getParticipacionById(
          id, req.user,
      );
      res.status(200).json({data: participacion});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Eventos recientes de Bitácora de una participación y sus expedientes.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async eventosRecientes(req, res, next) {
    try {
      const eventos = await participacionService.obtenerEventos(
          req.params.id, req.user, {limit: req.query.limit},
      );
      res.status(200).json({data: eventos});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Lista participaciones, opcionalmente filtradas.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async list(req, res, next) {
    try {
      const {mandanteId, estado, proyectoId, empresaId} = req.query;
      const participaciones = await participacionService.listarParticipaciones(
          {mandanteId, estado, proyectoId, empresaId}, req.user,
      );
      res.status(200).json({data: participaciones});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Crea una nueva participación.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async create(req, res, next) {
    try {
      const nuevaParticipacion = await participacionService.crearParticipacion(
          req.body, req.user,
      );
      res.status(201).json({
        message: "Participación creada exitosamente.",
        data: nuevaParticipacion,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Transiciona el estado de una participación existente. Es la única
   * operación de escritura soportada vía PUT.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async update(req, res, next) {
    try {
      const {id} = req.params;
      const participacion =
          await participacionService.transicionarParticipacion(
              id, req.body, req.user,
          );
      res.status(200).json({
        message: "Participación actualizada exitosamente.",
        data: participacion,
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new ParticipacionController();
