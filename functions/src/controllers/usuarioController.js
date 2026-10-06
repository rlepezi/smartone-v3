const usuarioService = require("../services/usuarioService");

/**
 * Controlador HTTP para el recurso Usuario.
 */
class UsuarioController {
  /**
   * Obtiene un usuario por su UID.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async getById(req, res, next) {
    try {
      const {id} = req.params;
      const usuario = await usuarioService.getUsuarioById(id, req.user);
      res.status(200).json({data: usuario});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Lista usuarios, opcionalmente filtrados por mandante y/o estado.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async list(req, res, next) {
    try {
      const {mandanteId, estado} = req.query;
      const usuarios = await usuarioService.listarUsuarios(
          {mandanteId, estado}, req.user,
      );
      res.status(200).json({data: usuarios});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Crea un nuevo usuario.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async create(req, res, next) {
    try {
      const nuevoUsuario = await usuarioService.crearUsuario(
          req.body, req.user,
      );
      res.status(201).json({
        message: "Usuario creado exitosamente.",
        data: nuevoUsuario,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Actualiza un usuario existente.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async update(req, res, next) {
    try {
      const {id} = req.params;
      const usuarioActualizado = await usuarioService.actualizarUsuario(
          id, req.body, req.user,
      );
      res.status(200).json({
        message: "Usuario actualizado exitosamente.",
        data: usuarioActualizado,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Desactiva (borrado lógico + bloqueo de login) un usuario.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async deactivate(req, res, next) {
    try {
      const {id} = req.params;
      const usuario = await usuarioService.desactivarUsuario(id, req.user);
      res.status(200).json({
        message: "Usuario desactivado exitosamente.",
        data: usuario,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Reactiva un usuario previamente desactivado.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async reactivate(req, res, next) {
    try {
      const usuario = await usuarioService.reactivarUsuario(
          req.params.id, req.user,
      );
      res.status(200).json({
        message: "Usuario reactivado exitosamente.",
        data: usuario,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Envía un correo de restablecimiento de contraseña.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async resetPassword(req, res, next) {
    try {
      const resultado = await usuarioService.resetPassword(
          req.params.id, req.user,
      );
      res.status(200).json({
        message: "Correo de restablecimiento enviado.",
        data: resultado,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Revoca todas las sesiones abiertas de un usuario.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async revocarSesiones(req, res, next) {
    try {
      const resultado = await usuarioService.revocarSesiones(
          req.params.id, req.user,
      );
      res.status(200).json({
        message: "Sesiones revocadas exitosamente.",
        data: resultado,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Resumen agregado "Actividad hoy" para el listado.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async actividadHoy(req, res, next) {
    try {
      const datos = await usuarioService.obtenerResumenActividadHoy(req.user);
      res.status(200).json({data: datos});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Métricas agregadas de un usuario en un período.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async metricas(req, res, next) {
    try {
      const {desde, hasta} = req.query;
      const datos = await usuarioService.obtenerMetricas(
          req.params.id, {desde, hasta}, req.user,
      );
      res.status(200).json({data: datos});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Línea de tiempo de actividad de un usuario.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async actividad(req, res, next) {
    try {
      const {cursor, tipo} = req.query;
      const datos = await usuarioService.obtenerActividad(
          req.params.id, {cursor, tipo}, req.user,
      );
      res.status(200).json({data: datos});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Historial de sesiones de un usuario.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async sesiones(req, res, next) {
    try {
      const {cursor} = req.query;
      const datos = await usuarioService.obtenerSesiones(
          req.params.id, {cursor}, req.user,
      );
      res.status(200).json({data: datos});
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new UsuarioController();
