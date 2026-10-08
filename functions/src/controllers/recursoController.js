const recursoService = require("../services/recursoService");
const empresaRecursoService = require("../services/empresaRecursoService");

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
      const recurso = await recursoService.obtenerRecurso(id, req.user);
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
          {estado, empresaId}, req.user,
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
   * Historial de relaciones con Empresas visible para el actor.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async listarRelaciones(req, res, next) {
    try {
      const data = await empresaRecursoService.listarPorSujeto(
          req.params.id, req.user,
      );
      res.status(200).json({data});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Cambia la Empresa (finaliza la relación activa y crea la nueva). Si hay
   * asignaciones afectadas responde 409 CONFIRMACION_REQUERIDA hasta que
   * llegue `confirmado: true`.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async cambiarEmpresa(req, res, next) {
    try {
      const data = await empresaRecursoService.cambiarEmpresa(
          req.params.id, req.body, req.user,
      );
      res.status(200).json({
        message: "Empresa del recurso actualizada exitosamente.", data,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Termina la relación activa con su Empresa (sin crear otra).
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async terminarRelacion(req, res, next) {
    try {
      const data = await empresaRecursoService.terminarRelacion(
          req.params.id, req.body, req.user,
      );
      res.status(200).json({message: "Relación terminada.", data});
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
