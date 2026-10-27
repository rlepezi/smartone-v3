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
   * Iniciar ejecución: aprobado → en_ejecucion.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async iniciarEjecucion(req, res, next) {
    try {
      const data = await expedienteService.iniciarEjecucion(
          req.params.id, req.user,
      );
      res.status(200).json({message: "Ejecución iniciada.", data});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Cerrar expediente ({motivo, detalle}).
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async cerrar(req, res, next) {
    try {
      const data = await expedienteService.cerrar(
          req.params.id, req.body, req.user,
      );
      res.status(200).json({message: "Expediente cerrado.", data});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Corrección: en_ejecucion → aprobado ({detalle}).
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async volverAAprobado(req, res, next) {
    try {
      const data = await expedienteService.volverAAprobado(
          req.params.id, req.body, req.user,
      );
      res.status(200).json({message: "Expediente devuelto a Aprobado.", data});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Corrección: reabre un expediente cerrado ({detalle}).
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async reabrir(req, res, next) {
    try {
      const data = await expedienteService.reabrir(
          req.params.id, req.body, req.user,
      );
      res.status(200).json({message: "Expediente reabierto.", data});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Historial de estados de un expediente.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async historialEstados(req, res, next) {
    try {
      const data = await expedienteService.historialEstados(
          req.params.id, req.user,
      );
      res.status(200).json({message: "Historial de estados.", data});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Instancias de Requerimiento de un expediente (opcionalmente de un
   * sujeto: ?personaId=, ?recursoId= o ?empresa=true; ?estado=activo por
   * defecto, "retirado" o "todos").
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async listarRequerimientos(req, res, next) {
    try {
      const {personaId, recursoId, empresa, estado} = req.query;
      const data = await expedienteService.listarRequerimientos(
          req.params.id,
          {personaId, recursoId, empresa: empresa === "true", estado},
          req.user,
      );
      res.status(200).json({data});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Reintenta la generación de instancias de un expediente "en_proceso".
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async reintentarGeneracion(req, res, next) {
    try {
      const data = await expedienteService.reintentarGeneracion(
          req.params.id, req.user,
      );
      res.status(200).json({message: "Generación completada.", data});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Recalcula los contadores de un expediente desde sus instancias.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async repararResumen(req, res, next) {
    try {
      const data = await expedienteService.repararResumen(
          req.params.id, req.user,
      );
      res.status(200).json({message: "Contadores recalculados.", data});
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
