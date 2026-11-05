const {Readable} = require("stream");
const sharePointService = require("../services/sharePointService");

/**
 * Controlador HTTP del conector SharePoint (Microsoft Graph, solo lectura).
 * Ninguna respuesta incluye credenciales.
 */
class SharePointController {
  /**
   * Prueba la conexión paso a paso (datos del formulario o fuente guardada).
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async probarConexion(req, res, next) {
    try {
      const data = await sharePointService.probarConexion(req.body || {},
          req.user);
      res.status(200).json({data});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Carpetas y archivos de una carpeta de la fuente (o de su carpeta base).
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async listarHijos(req, res, next) {
    try {
      const data = await sharePointService.listarHijos({
        mandanteId: req.query.mandanteId || null,
        itemId: req.query.itemId || null,
      }, req.user);
      res.status(200).json({data});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Metadatos de un item.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async obtenerItem(req, res, next) {
    try {
      const data = await sharePointService.obtenerItem({
        mandanteId: req.query.mandanteId || null, itemId: req.params.itemId,
      }, req.user);
      res.status(200).json({data});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Contenido de un archivo, transmitido por el backend (formato=pdf: vista
   * previa de un documento de Office).
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async contenido(req, res, next) {
    try {
      const {respuesta, nombre, tipo} = await sharePointService.contenido({
        mandanteId: req.query.mandanteId || null, itemId: req.params.itemId,
        formato: req.query.formato || null,
      }, req.user);
      res.status(200);
      res.setHeader("Content-Type", tipo);
      res.setHeader("Content-Disposition",
          `inline; filename*=UTF-8''${encodeURIComponent(nombre)}`);
      res.setHeader("Cache-Control", "private, no-store");
      const largo = respuesta.headers?.get?.("Content-Length");
      if (largo) res.setHeader("Content-Length", largo);
      Readable.fromWeb(respuesta.body).on("error", next).pipe(res);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new SharePointController();
