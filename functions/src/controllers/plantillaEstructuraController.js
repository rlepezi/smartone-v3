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

/**
 * Responde con el resultado de una operación del servicio.
 * @param {Function} operacion (req) => Promise.
 * @return {Function} Middleware Express.
 */
const responder = (operacion) => async (req, res, next) => {
  try {
    res.status(200).json({data: await operacion(req)});
  } catch (error) {
    next(error);
  }
};

const controlador = new PlantillaEstructuraController();
// Nodos de la plantilla activa del Mandante (mapeo y resolvedor).
controlador.nodos = responder((req) => plantillaEstructuraService.nodos(
    req.query.mandanteId, req.user));
// Duplica la plantilla hacia otro Mandante (sin plantilla activa).
controlador.duplicar = responder((req) => plantillaEstructuraService.duplicar(
    req.params.id, (req.body || {}).mandanteDestinoId, req.user));

module.exports = controlador;
