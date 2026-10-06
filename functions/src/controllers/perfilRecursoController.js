const perfilRecursoService = require("../services/perfilRecursoService");

/**
 * Controlador HTTP para el recurso Perfil de Recurso.
 */
class PerfilRecursoController {
  /**
   * Obtiene un perfil de recurso por su ID.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async getById(req, res, next) {
    try {
      const {id} = req.params;
      const perfil = await perfilRecursoService.getPerfilById(id, req.user);
      res.status(200).json({data: perfil});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Lista perfiles de recurso, opcionalmente filtrados por mandante,
   * tipo y/o estado. Con `?incluirConteo=true` cada perfil trae
   * `cantidadRequerimientos`.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async list(req, res, next) {
    try {
      const {mandanteId, tipo, estado, incluirConteo} = req.query;
      const perfiles = await perfilRecursoService.listarPerfiles(
          {mandanteId, tipo, estado}, req.user,
          {incluirConteo: incluirConteo === "true"},
      );
      res.status(200).json({data: perfiles});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Crea un nuevo perfil de recurso.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async create(req, res, next) {
    try {
      const nuevoPerfil = await perfilRecursoService.crearPerfil(
          req.body, req.user,
      );
      res.status(201).json({
        message: "Perfil de recurso creado exitosamente.",
        data: nuevoPerfil,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Actualiza un perfil de recurso existente.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async update(req, res, next) {
    try {
      const {id} = req.params;
      const perfilActualizado = await perfilRecursoService.actualizarPerfil(
          id, req.body, req.user,
      );
      res.status(200).json({
        message: "Perfil de recurso actualizado exitosamente.",
        data: perfilActualizado,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Desactiva un perfil de recurso existente.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async deactivate(req, res, next) {
    try {
      const {id} = req.params;
      const perfil = await perfilRecursoService.desactivarPerfil(
          id, req.user,
      );
      res.status(200).json({
        message: "Perfil de recurso desactivado exitosamente.",
        data: perfil,
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new PerfilRecursoController();
