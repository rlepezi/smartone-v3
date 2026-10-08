const expedienteService = require("../services/expedienteService");

/**
 * Controlador HTTP para el recurso Expediente.
 */
class ExpedienteController {
  /**
   * Obtiene un expediente por su ID.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async getById(req, res, next) {
    try {
      const {id} = req.params;
      const expediente = await expedienteService.getExpedienteById(
          id, req.user,
      );
      res.status(200).json({data: expediente});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Lista expedientes, opcionalmente filtrados por estado. Con
   * `?incluirConteo=true` cada expediente trae `cantidadPersonas` y
   * `cantidadMaquinarias` (personas y maquinarias activas).
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async list(req, res, next) {
    try {
      const {mandanteId, estado, incluirConteo} = req.query;
      const expedientes = await expedienteService.listarExpedientes(
          {mandanteId, estado}, req.user,
          {incluirConteo: incluirConteo === "true"},
      );
      res.status(200).json({data: expedientes});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Crea un nuevo expediente a partir de una Participación activa.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async create(req, res, next) {
    try {
      const nuevoExpediente = await expedienteService.crearExpediente(
          req.body, req.user,
      );
      res.status(201).json({
        message: "Expediente creado exitosamente.",
        data: nuevoExpediente,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Eventos recientes de Bitácora de un expediente y su participación.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async eventosRecientes(req, res, next) {
    try {
      const eventos = await expedienteService.obtenerEventos(
          req.params.id, req.user, {limit: req.query.limit},
      );
      res.status(200).json({data: eventos});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Transiciona el estado de un expediente existente.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async transicionar(req, res, next) {
    try {
      const {id} = req.params;
      const expediente = await expedienteService.transicionarEstado(
          id, req.body, req.user,
      );
      res.status(200).json({
        message: "Expediente transicionado exitosamente.",
        data: expediente,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Agrega un Requerimiento adicional a un expediente existente.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async agregarRequerimiento(req, res, next) {
    try {
      const {id} = req.params;
      const expediente = await expedienteService.agregarRequerimiento(
          id, req.body.requerimientoId, req.user,
      );
      res.status(200).json({
        message: "Requerimiento agregado exitosamente.",
        data: expediente,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Quita un Requerimiento de un expediente existente.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async quitarRequerimiento(req, res, next) {
    try {
      const {id, requerimientoId} = req.params;
      const expediente = await expedienteService.quitarRequerimiento(
          id, requerimientoId, req.user,
      );
      res.status(200).json({
        message: "Requerimiento quitado exitosamente.",
        data: expediente,
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new ExpedienteController();
