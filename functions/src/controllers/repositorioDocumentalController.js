const repositorioDocumentalService =
    require("../services/repositorioDocumentalService");

/**
 * Controlador HTTP del repositorio documental de un Expediente.
 */
class RepositorioDocumentalController {
  /**
   * Repositorio del Expediente.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async obtener(req, res, next) {
    try {
      const data = await repositorioDocumentalService.obtener(
          req.params.id, req.user);
      res.status(200).json({data});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Configura o quita el repositorio.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async actualizar(req, res, next) {
    try {
      const data = await repositorioDocumentalService.actualizar(
          req.params.id, req.body || {}, req.user);
      res.status(200).json({data});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Carpeta (ruta relativa) de una persona o recurso del Expediente.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async asignarCarpetaSujeto(req, res, next) {
    try {
      const data = await repositorioDocumentalService.asignarCarpetaSujeto(
          req.params.id, req.body || {}, req.user);
      res.status(200).json({data});
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new RepositorioDocumentalController();
