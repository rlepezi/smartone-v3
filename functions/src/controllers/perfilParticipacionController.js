const perfilParticipacionService =
    require("../services/perfilParticipacionService");

/**
 * Controlador HTTP para el recurso Perfil de Participación.
 */
class PerfilParticipacionController {
  /**
   * Obtiene un perfil de participación por su ID.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async getById(req, res, next) {
    try {
      const {id} = req.params;
      const perfil = await perfilParticipacionService.getPerfilById(
          id, req.user,
      );
      res.status(200).json({data: perfil});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Lista perfiles de participación, opcionalmente filtrados por mandante
   * y/o estado.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async list(req, res, next) {
    try {
      const {mandanteId, estado} = req.query;
      const perfiles = await perfilParticipacionService.listarPerfiles(
          {mandanteId, estado}, req.user,
      );
      res.status(200).json({data: perfiles});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Crea un nuevo perfil de participación.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async create(req, res, next) {
    try {
      const nuevoPerfil = await perfilParticipacionService.crearPerfil(
          req.body, req.user,
      );
      res.status(201).json({
        message: "Perfil de participación creado exitosamente.",
        data: nuevoPerfil,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Actualiza un perfil de participación existente.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async update(req, res, next) {
    try {
      const {id} = req.params;
      const perfilActualizado = await perfilParticipacionService
          .actualizarPerfil(id, req.body, req.user);
      res.status(200).json({
        message: "Perfil de participación actualizado exitosamente.",
        data: perfilActualizado,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Obtiene el resumen de uso de un perfil de participación
   * (requerimientos vinculados, participaciones activas, expedientes
   * generados).
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async resumen(req, res, next) {
    try {
      const {id} = req.params;
      const resumen = await perfilParticipacionService.obtenerResumen(
          id, req.user,
      );
      res.status(200).json({data: resumen});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Requerimientos aplicables a un perfil (solo lectura).
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async requerimientos(req, res, next) {
    try {
      const data = await perfilParticipacionService
          .listarRequerimientosAplicables(req.params.id, req.user);
      res.status(200).json({data});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Lista los otros perfiles de participación del mismo Mandante que un
   * perfil dado, excluyéndolo. El mandanteId se resuelve desde el propio
   * perfil (nunca se confía en un valor enviado por el cliente).
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async otrosDelMandante(req, res, next) {
    try {
      const {id} = req.params;
      const perfil = await perfilParticipacionService.getPerfilById(
          id, req.user,
      );
      const otros = await perfilParticipacionService.listarOtrosDelMandante(
          perfil.mandanteId, id, req.user,
      );
      res.status(200).json({data: otros});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Desactiva un perfil de participación existente.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async deactivate(req, res, next) {
    try {
      const {id} = req.params;
      const perfil = await perfilParticipacionService.desactivarPerfil(
          id, req.user,
      );
      res.status(200).json({
        message: "Perfil de participación desactivado exitosamente.",
        data: perfil,
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new PerfilParticipacionController();
