const sesionService = require("../services/sesionService");

/**
 * Controlador HTTP para el recurso Sesión (telemetría de accesos).
 */
class SesionController {
  /**
   * Crea una sesión nueva.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async iniciar(req, res, next) {
    try {
      const {plataforma} = req.body;
      const userAgent = req.headers["user-agent"] || null;
      const resultado = await sesionService.iniciar(
          req.user, {plataforma, userAgent},
      );
      res.status(201).json({data: resultado});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Actualiza el latido de una sesión propia.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async latido(req, res, next) {
    try {
      await sesionService.latido(req.params.id, req.user);
      res.status(200).json({data: {ok: true}});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Cierra una sesión propia (logout).
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async cerrar(req, res, next) {
    try {
      const sesion = await sesionService.cerrarPropia(req.params.id, req.user);
      res.status(200).json({data: sesion});
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new SesionController();
