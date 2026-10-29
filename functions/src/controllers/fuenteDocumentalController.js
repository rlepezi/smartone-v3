const fuenteDocumentalService = require("../services/fuenteDocumentalService");

/**
 * Controlador HTTP de Fuentes Documentales. Ninguna respuesta incluye el
 * client secret ni su versión cifrada.
 */
class FuenteDocumentalController {
  /**
   * Lista las fuentes de un Mandante.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async listar(req, res, next) {
    try {
      const data = await fuenteDocumentalService.listar(
          {mandanteId: req.query.mandanteId}, req.user);
      res.status(200).json({data});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Detalle de una fuente.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async obtener(req, res, next) {
    try {
      const data = await fuenteDocumentalService.obtener(req.params.id,
          req.user);
      res.status(200).json({data});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Crea una fuente.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async crear(req, res, next) {
    try {
      const data = await fuenteDocumentalService.crear(req.body || {},
          req.user);
      res.status(201).json({data});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Actualiza una fuente.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async actualizar(req, res, next) {
    try {
      const data = await fuenteDocumentalService.actualizar(req.params.id,
          req.body || {}, req.user);
      res.status(200).json({data});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Desactiva una fuente.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async desactivar(req, res, next) {
    try {
      const data = await fuenteDocumentalService.cambiarEstado(req.params.id,
          "inactiva", req.user);
      res.status(200).json({data});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Reactiva una fuente.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async reactivar(req, res, next) {
    try {
      const data = await fuenteDocumentalService.cambiarEstado(req.params.id,
          "activa", req.user);
      res.status(200).json({data});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Fuente activa de un Mandante (sin secretos), o null.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async activa(req, res, next) {
    try {
      const data = await fuenteDocumentalService.activa(req.query.mandanteId,
          req.user);
      res.status(200).json({data});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Registra o cambia la carpeta local del Mandante (solo superadmin).
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async guardarLocal(req, res, next) {
    try {
      const data = await fuenteDocumentalService.guardarLocal(
          req.params.mandanteId, req.body || {}, req.user);
      res.status(200).json({data});
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new FuenteDocumentalController();
