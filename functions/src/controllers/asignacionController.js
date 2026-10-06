const asignacionService = require("../services/asignacionService");

/**
 * Controlador HTTP para el recurso Asignación.
 */
class AsignacionController {
  /**
   * Obtiene una asignación por su ID.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async getById(req, res, next) {
    try {
      const {id} = req.params;
      const asignacion = await asignacionService.getAsignacionById(
          id, req.user,
      );
      res.status(200).json({data: asignacion});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Lista asignaciones, opcionalmente filtradas. Cuando se combinan
   * `proyectoId` y `estado=activa`, delega en la búsqueda dedicada por
   * Proyecto (semántica correctamente acotada, sin perder el filtro por
   * proyectoId cuando el actor tiene alcance forzado por Mandante).
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async list(req, res, next) {
    try {
      const {mandanteId, estado, proyectoId, personaId, recursoId} =
          req.query;

      if (proyectoId && estado === "activa") {
        const activas = await asignacionService.listarActivasPorProyecto(
            proyectoId, req.user,
        );
        res.status(200).json({data: activas});
        return;
      }

      const asignaciones = await asignacionService.listarAsignaciones(
          {mandanteId, estado, proyectoId, personaId, recursoId}, req.user,
      );
      res.status(200).json({data: asignaciones});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Crea una nueva asignación.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async create(req, res, next) {
    try {
      const nuevaAsignacion = await asignacionService.crearAsignacion(
          req.body, req.user,
      );
      res.status(201).json({
        message: "Asignación creada exitosamente.",
        data: nuevaAsignacion,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Transiciona el estado de una asignación existente. Es la única
   * operación de escritura soportada vía PUT.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async update(req, res, next) {
    try {
      const {id} = req.params;
      const asignacion = await asignacionService.transicionarAsignacion(
          id, req.body, req.user,
      );
      res.status(200).json({
        message: "Asignación actualizada exitosamente.",
        data: asignacion,
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new AsignacionController();
