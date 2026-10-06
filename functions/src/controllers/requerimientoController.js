const requerimientoService = require("../services/requerimientoService");

/**
 * Controlador HTTP para el recurso Requerimiento.
 */
class RequerimientoController {
  /**
   * Obtiene un requerimiento por su ID.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async getById(req, res, next) {
    try {
      const {id} = req.params;
      const requerimiento = await requerimientoService.getRequerimientoById(
          id,
      );
      res.status(200).json({data: requerimiento});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Lista requerimientos, opcionalmente filtrados por estado y/o tipo de
   * entidad.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async list(req, res, next) {
    try {
      const {estado, tipoEntidad} = req.query;
      const requerimientos = await requerimientoService.listarRequerimientos(
          {estado, tipoEntidad},
      );
      res.status(200).json({data: requerimientos});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Uso de los Requerimientos por Mandante (requerimientoId -> mandanteIds).
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async uso(req, res, next) {
    try {
      const data = await requerimientoService.obtenerUsoPorMandante(req.user);
      res.status(200).json({data});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Crea un nuevo requerimiento.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async create(req, res, next) {
    try {
      const nuevoRequerimiento = await requerimientoService.crearRequerimiento(
          req.body,
      );
      res.status(201).json({
        message: "Requerimiento creado exitosamente.",
        data: nuevoRequerimiento,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Actualiza un requerimiento existente.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async update(req, res, next) {
    try {
      const {id} = req.params;
      const requerimientoActualizado =
          await requerimientoService.actualizarRequerimiento(id, req.body);
      res.status(200).json({
        message: "Requerimiento actualizado exitosamente.",
        data: requerimientoActualizado,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Desactiva un requerimiento existente.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async deactivate(req, res, next) {
    try {
      const {id} = req.params;
      const requerimiento = await requerimientoService.desactivarRequerimiento(
          id,
      );
      res.status(200).json({
        message: "Requerimiento desactivado exitosamente.",
        data: requerimiento,
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new RequerimientoController();
