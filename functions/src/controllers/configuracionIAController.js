const aiConfigService = require("../services/aiConfigService");

/**
 * Controlador HTTP de Configuración → Inteligencia Artificial (solo
 * superadmin). Nunca devuelve la API key.
 */
class ConfiguracionIAController {
  /**
   * Configuración pública.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async obtener(req, res, next) {
    try {
      res.status(200).json({data: await aiConfigService.obtenerPublica()});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Guarda o reemplaza la API key.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async guardarApiKey(req, res, next) {
    try {
      const data = await aiConfigService.guardarApiKey(req.body?.apiKey,
          req.user);
      res.status(200).json({data});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Desactiva la API key.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async desactivar(req, res, next) {
    try {
      res.status(200).json({data: await aiConfigService.desactivar(req.user)});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Prueba la conexión con la API key vigente.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async probar(req, res, next) {
    try {
      res.status(200).json({data: await aiConfigService.probarConexion()});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Actualiza modelo por defecto, precios y límite mensual.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async actualizar(req, res, next) {
    try {
      const data = await aiConfigService.actualizarParametros(req.body || {},
          req.user);
      res.status(200).json({data});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Gasto acumulado del mes.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async gastoMes(req, res, next) {
    try {
      res.status(200).json({data: await aiConfigService.gastoMes()});
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new ConfiguracionIAController();
