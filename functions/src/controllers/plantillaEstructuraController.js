const plantillaEstructuraService =
    require("../services/plantillaEstructuraService");

/**
 * Controlador HTTP de Plantillas de Estructura de carpetas.
 */
class PlantillaEstructuraController {
  /**
   * Plantilla activa del Mandante (o null).
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async obtenerActiva(req, res, next) {
    try {
      const data = await plantillaEstructuraService.obtenerActiva(
          req.query.mandanteId, req.user);
      res.status(200).json({data});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Importa una plantilla (Transemel v1 o JSON).
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async importar(req, res, next) {
    try {
      const data = await plantillaEstructuraService.importar(req.body || {},
          req.user);
      res.status(201).json({data});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Guarda la plantilla editada (sube la versión).
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async actualizar(req, res, next) {
    try {
      const data = await plantillaEstructuraService.actualizar(req.params.id,
          req.body || {}, req.user);
      res.status(200).json({data});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Cambios de habilitación (una transacción, una versión).
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async habilitacion(req, res, next) {
    try {
      const data = await plantillaEstructuraService.habilitacion(
          req.params.id, req.body?.cambios, req.user);
      res.status(200).json({data});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Habilitación masiva.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async habilitacionMasiva(req, res, next) {
    try {
      const data = await plantillaEstructuraService.habilitacionMasiva(
          req.params.id, req.body || {}, req.user);
      res.status(200).json({data});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Alcance de validación.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async alcance(req, res, next) {
    try {
      const data = await plantillaEstructuraService.alcance(req.params.id,
          req.user);
      res.status(200).json({data});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Desactiva la plantilla.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async desactivar(req, res, next) {
    try {
      const data = await plantillaEstructuraService.desactivar(req.params.id,
          req.user);
      res.status(200).json({data});
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new PlantillaEstructuraController();
