const revisionExpedienteService =
    require("../services/revisionExpedienteService");

/**
 * Controlador HTTP de Revisiones IA dentro de un Expediente.
 */
class RevisionExpedienteController {
  /**
   * Configuración y elegibilidad de los requerimientos.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async obtenerConfig(req, res, next) {
    try {
      const data = await revisionExpedienteService.obtenerConfig(
          req.params.id, req.user);
      res.status(200).json({data});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Guarda la configuración.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async guardarConfig(req, res, next) {
    try {
      const data = await revisionExpedienteService.guardarConfig(
          req.params.id, req.body || {}, req.user);
      res.status(200).json({data});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Matriz de estado sujeto × requerimiento.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async matriz(req, res, next) {
    try {
      const data = await revisionExpedienteService.matriz(
          req.params.id, req.user);
      res.status(200).json({data});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Propuestas de IA sin resolver, por instancia.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async propuestas(req, res, next) {
    try {
      const data = await revisionExpedienteService.propuestas(
          req.params.id, req.user);
      res.status(200).json({data});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Acepta en bloque las propuestas que cumplen.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async aceptarLote(req, res, next) {
    try {
      const data = await revisionExpedienteService.aceptarLote(
          req.params.id, (req.body || {}).resultadoIds, req.user);
      res.status(200).json({data});
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new RevisionExpedienteController();
