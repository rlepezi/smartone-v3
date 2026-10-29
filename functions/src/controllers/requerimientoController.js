const requerimientoService = require("../services/requerimientoService");

/**
 * Controlador HTTP para el recurso Requerimiento.
 */
class RequerimientoController {
  /**
   * Obtiene un requerimiento por su ID, con su aplicabilidad.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async getById(req, res, next) {
    try {
      const requerimiento = await requerimientoService.getRequerimientoById(
          req.params.id, req.user,
      );
      res.status(200).json({data: requerimiento});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Lista los requerimientos de un Mandante (`mandanteId` obligatorio
   * para los roles transversales), con su aplicabilidad.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async list(req, res, next) {
    try {
      const {mandanteId, estado, tipoEntidad} = req.query;
      const requerimientos = await requerimientoService.listarRequerimientos(
          {mandanteId, estado, tipoEntidad}, req.user,
      );
      res.status(200).json({data: requerimientos});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Opciones de ubicación en la plantilla de estructura (selector del
   * formulario de Requerimiento).
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async ubicacionesPlantilla(req, res, next) {
    try {
      const {mandanteId, tipoEntidad} = req.query;
      const data = await requerimientoService.opcionesUbicacionPlantilla(
          {mandanteId, tipoEntidad}, req.user);
      res.status(200).json({data});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Crea un requerimiento junto con su aplicabilidad (una transacción).
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async create(req, res, next) {
    try {
      const nuevoRequerimiento = await requerimientoService.crearRequerimiento(
          req.body, req.user,
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
   * Edita un requerimiento y su aplicabilidad (una transacción).
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async update(req, res, next) {
    try {
      const requerimientoActualizado =
          await requerimientoService.actualizarRequerimiento(
              req.params.id, req.body, req.user,
          );
      res.status(200).json({
        message: "Requerimiento actualizado exitosamente.",
        data: requerimientoActualizado,
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new RequerimientoController();
