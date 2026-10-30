const tipoDocumentalService = require("../services/tipoDocumentalService");

/**
 * Controlador HTTP de Tipos Documentales (superadmin).
 */
class TipoDocumentalController {
  /**
   * Lista los tipos con métricas.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async listar(req, res, next) {
    try {
      res.status(200).json({data: await tipoDocumentalService.listar()});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Crea un tipo (para las reglas de revisión IA).
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async crear(req, res, next) {
    try {
      const data = await tipoDocumentalService.crear(req.body || {},
          req.user);
      res.status(201).json({data});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Edita un tipo.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async actualizar(req, res, next) {
    try {
      const data = await tipoDocumentalService.actualizar(req.params.id,
          req.body || {}, req.user);
      res.status(200).json({data});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Habilita o deshabilita un tipo.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async cambiarEstado(req, res, next) {
    try {
      const data = await tipoDocumentalService.cambiarEstado(req.params.id,
          req.body?.estado, req.user);
      res.status(200).json({data});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Tipos por normalizar.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async porNormalizar(req, res, next) {
    try {
      res.status(200).json({data: await tipoDocumentalService.porNormalizar()});
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new TipoDocumentalController();
