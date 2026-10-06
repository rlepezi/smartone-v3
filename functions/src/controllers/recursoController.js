const recursoService = require("../services/recursoService");
const relacionRecursoService = require("../services/relacionRecursoService");

/**
 * Controlador HTTP para el recurso Recurso.
 */
class RecursoController {
  /**
   * Obtiene un recurso por su ID.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async getById(req, res, next) {
    try {
      const {id} = req.params;
      const recurso = await recursoService.getRecursoById(id);
      res.status(200).json({data: recurso});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Lista recursos, opcionalmente filtrados por estado y/o empresa.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async list(req, res, next) {
    try {
      const {estado, empresaId} = req.query;
      const recursos = await recursoService.listarRecursos(
          {estado, empresaId},
      );
      res.status(200).json({data: recursos});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Devuelve el catálogo de tipos disponibles (fijos + personalizados en
   * uso).
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async listarTipos(req, res, next) {
    try {
      const tipos = await recursoService.listarTiposDisponibles();
      res.status(200).json({data: tipos});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Crea un nuevo recurso.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async create(req, res, next) {
    try {
      const nuevoRecurso = await recursoService.crearRecurso(
          req.body, req.user,
      );
      res.status(201).json({
        message: "Recurso creado exitosamente.",
        data: nuevoRecurso,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Actualiza un recurso existente.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async update(req, res, next) {
    try {
      const {id} = req.params;
      const recursoActualizado = await recursoService.actualizarRecurso(
          id, req.body, req.user,
      );
      res.status(200).json({
        message: "Recurso actualizado exitosamente.",
        data: recursoActualizado,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Desactiva un recurso existente.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async deactivate(req, res, next) {
    try {
      const {id} = req.params;
      const recurso = await recursoService.desactivarRecurso(id, req.user);
      res.status(200).json({
        message: "Recurso desactivado exitosamente.",
        data: recurso,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Lista las RelacionesRecurso de un Recurso (historial completo con
   * cualquier Empresa).
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async listarRelaciones(req, res, next) {
    try {
      const {id} = req.params;
      const relaciones = await relacionRecursoService.listarPorRecurso(id);
      res.status(200).json({data: relaciones});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Cambia la Empresa activa de un Recurso (cierra la RelaciónRecurso
   * activa actual y crea una nueva, en una sola transacción).
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async cambiarEmpresa(req, res, next) {
    try {
      const {id} = req.params;
      const nuevaRelacion = await relacionRecursoService.cambiarEmpresa(
          id, req.body, req.user,
      );
      res.status(200).json({
        message: "Empresa del recurso actualizada exitosamente.",
        data: nuevaRelacion,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Lista los eventos de Bitácora relacionados a un recurso.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async eventosRecientes(req, res, next) {
    try {
      const eventos = await recursoService.obtenerEventos(
          req.params.id, req.user, {limit: req.query.limit},
      );
      res.status(200).json({data: eventos});
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new RecursoController();
