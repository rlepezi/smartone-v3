const evaluacionService = require("../services/evaluacionService");

/**
 * Controlador HTTP para el recurso Evaluación.
 */
class EvaluacionController {
  /**
   * Lista evaluaciones. Si se indica `expedienteId`, devuelve las de ese
   * Expediente (vigentes por defecto; `incluirHistorial=true` trae
   * también las históricas). Si no se indica, devuelve todas las
   * evaluaciones VIGENTES alcanzables por el actor (vista agregada, p.
   * ej. para el Dashboard o la vista global "Evaluaciones"), con
   * filtros opcionales `proyectoId`/`empresaId`/`estado`.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async list(req, res, next) {
    try {
      const {
        expedienteId, incluirHistorial, proyectoId, empresaId, estado,
        personaId, recursoId, empresa,
      } = req.query;
      if (expedienteId) {
        const evaluaciones = await evaluacionService.listarPorExpediente(
            expedienteId, incluirHistorial === "true", req.user,
            {personaId, recursoId, empresa: empresa === "true"},
        );
        return res.status(200).json({data: evaluaciones});
      }
      const vigentes = await evaluacionService.listarGlobal(req.user, {
        proyectoId, empresaId, estado,
      });
      res.status(200).json({data: vigentes});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Crea una nueva versión de Evaluación.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async create(req, res, next) {
    try {
      const nuevaEvaluacion = await evaluacionService.crearEvaluacion(
          req.body, req.user,
      );
      res.status(201).json({
        message: "Evaluación creada exitosamente.",
        data: nuevaEvaluacion,
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new EvaluacionController();
