const proyectoService = require("../services/proyectoService");

/**
 * Controlador HTTP para el recurso Proyecto.
 */
class ProyectoController {
  /**
   * Obtiene un proyecto por su ID.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async getById(req, res, next) {
    try {
      const {id} = req.params;
      const proyecto = await proyectoService.getProyectoById(id, req.user);
      res.status(200).json({data: proyecto});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Lista proyectos, opcionalmente filtrados por mandante y/o estado.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async list(req, res, next) {
    try {
      const {mandanteId, estado, empresaId} = req.query;
      const proyectos = await proyectoService.listarProyectos(
          {mandanteId, estado, empresaId}, req.user,
      );
      res.status(200).json({data: proyectos});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Sugiere el siguiente código correlativo disponible para un Mandante.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async siguienteCodigo(req, res, next) {
    try {
      const {mandanteId} = req.query;
      const codigoSugerido = await proyectoService.sugerirSiguienteCodigo(
          req.user, mandanteId,
      );
      res.status(200).json({data: {codigoSugerido}});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Crea un nuevo proyecto.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async create(req, res, next) {
    try {
      const nuevoProyecto = await proyectoService.crearProyecto(
          req.body, req.user,
      );
      res.status(201).json({
        message: "Proyecto creado exitosamente.",
        data: nuevoProyecto,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Actualiza un proyecto existente.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async update(req, res, next) {
    try {
      const {id} = req.params;
      const proyectoActualizado = await proyectoService.actualizarProyecto(
          id, req.body, req.user,
      );
      res.status(200).json({
        message: "Proyecto actualizado exitosamente.",
        data: proyectoActualizado,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Archiva (transición terminal) un proyecto existente.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async archive(req, res, next) {
    try {
      const {id} = req.params;
      const proyecto = await proyectoService.archivarProyecto(id, req.user);
      res.status(200).json({
        message: "Proyecto archivado exitosamente.",
        data: proyecto,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Calcula el resumen de contadores (empresas, personas, recursos) de un
   * proyecto.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async resumen(req, res, next) {
    try {
      const {id} = req.params;
      const resumen = await proyectoService.obtenerResumen(id, req.user);
      res.status(200).json({data: resumen});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Lista los eventos de Bitácora relacionados a un proyecto (propios, de
   * sus Participaciones y de sus Expedientes).
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async eventosRecientes(req, res, next) {
    try {
      const {id} = req.params;
      const eventos = await proyectoService.obtenerEventos(
          id, req.user, {limit: req.query.limit},
      );
      res.status(200).json({data: eventos});
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new ProyectoController();
