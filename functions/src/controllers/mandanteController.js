const mandanteService = require("../services/mandanteService");

/**
 * Controlador HTTP para el recurso Mandante.
 */
class MandanteController {
  /**
   * Obtiene un mandante por su ID.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async getById(req, res, next) {
    try {
      const {id} = req.params;
      const mandante = await mandanteService.getMandanteById(id, req.user);
      res.status(200).json({data: mandante});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Lista mandantes, opcionalmente filtrados por estado.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async list(req, res, next) {
    try {
      const {estado} = req.query;
      const mandantes = await mandanteService.listarMandantes({estado});
      res.status(200).json({data: mandantes});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Crea un nuevo mandante.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async create(req, res, next) {
    try {
      const nuevoMandante = await mandanteService.crearMandante(req.body);
      res.status(201).json({
        message: "Mandante creado exitosamente.",
        data: nuevoMandante,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Actualiza un mandante existente.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async update(req, res, next) {
    try {
      const {id} = req.params;
      const mandanteActualizado = await mandanteService.actualizarMandante(
          id, req.body, req.user,
      );
      res.status(200).json({
        message: "Mandante actualizado exitosamente.",
        data: mandanteActualizado,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Desactiva (borrado lógico) un mandante.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async deactivate(req, res, next) {
    try {
      const {id} = req.params;
      const mandante = await mandanteService.desactivarMandante(id, req.user);
      res.status(200).json({
        message: "Mandante desactivado exitosamente.",
        data: mandante,
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new MandanteController();
