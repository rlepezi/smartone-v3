const respaldoService = require("../services/respaldoService");

/**
 * Controlador HTTP del módulo de Respaldo y Restauración (solo superadmin).
 */
class RespaldoController {
  /**
   * Devuelve la configuración de respaldos.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async obtenerConfiguracion(req, res, next) {
    try {
      const data = await respaldoService.obtenerConfiguracion();
      res.status(200).json({data});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Actualiza la configuración de respaldos.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async actualizarConfiguracion(req, res, next) {
    try {
      const data = await respaldoService.actualizarConfiguracion(
          req.body, req.user,
      );
      res.status(200).json({data});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Verifica el acceso al bucket de destino.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async probarAcceso(req, res, next) {
    try {
      const data = await respaldoService.probarAcceso(
          req.body?.bucketDestino, req.user,
      );
      res.status(200).json({data});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Lista el historial de respaldos y restauraciones.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async listar(req, res, next) {
    try {
      const data = await respaldoService.listarHistorial(req.user);
      res.status(200).json({data});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Ejecuta un respaldo manual inmediato.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async ejecutar(req, res, next) {
    try {
      const data = await respaldoService.ejecutarManual(req.user);
      res.status(202).json({data});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Restaura la base de datos desde un respaldo (exige confirmación).
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async restaurar(req, res, next) {
    try {
      const data = await respaldoService.restaurar(
          req.params.id, req.body, req.user,
      );
      res.status(202).json({data});
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new RespaldoController();
