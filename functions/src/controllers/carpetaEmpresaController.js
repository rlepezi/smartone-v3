const carpetaEmpresaService = require("../services/carpetaEmpresaService");

/**
 * Controlador HTTP de las Carpetas de empresa.
 */
class CarpetaEmpresaController {
  /**
   * Carpetas de empresa de un Mandante (o de una fuente).
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async listar(req, res, next) {
    try {
      const data = await carpetaEmpresaService.listar({
        mandanteId: req.query.mandanteId, fuenteId: req.query.fuenteId,
      }, req.user);
      res.status(200).json({data});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Verifica (sin escribir) si una carpeta puede usarse.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async verificar(req, res, next) {
    try {
      const data = await carpetaEmpresaService.verificar(req.body || {},
          req.user);
      res.status(200).json({data});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Find-or-create de la carpeta y vínculo con un expediente.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async vincular(req, res, next) {
    try {
      const data = await carpetaEmpresaService.vincular(req.body || {},
          req.user);
      res.status(200).json({data});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Carpeta del personal, de maquinarias y mapeo.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async actualizar(req, res, next) {
    try {
      const data = await carpetaEmpresaService.actualizar(req.params.id,
          req.body || {}, req.user);
      res.status(200).json({data});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Desvincula la carpeta de un expediente (la carpeta conserva su mapeo).
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async desvincular(req, res, next) {
    try {
      const data = await carpetaEmpresaService.desvincular(req.params.id,
          req.user);
      res.status(200).json({data});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Registra una carpeta de la fuente como Carpeta de empresa (sin proyecto).
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async registrar(req, res, next) {
    try {
      const data = await carpetaEmpresaService.registrar(req.body || {},
          req.user);
      res.status(200).json({data});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Requerimientos asignables de una carpeta y su total.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async requerimientos(req, res, next) {
    try {
      const data = await carpetaEmpresaService.requerimientosAsignables(
          req.params.id, req.user, req.query.entidad || "empresa");
      res.status(200).json({data});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Cobertura del mapeo por requerimiento en las carpetas del Mandante.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async cobertura(req, res, next) {
    try {
      const data = await carpetaEmpresaService.cobertura({
        mandanteId: req.query.mandanteId}, req.user);
      res.status(200).json({data});
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new CarpetaEmpresaController();
