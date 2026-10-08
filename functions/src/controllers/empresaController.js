const empresaService = require("../services/empresaService");

/**
 * Controlador HTTP para el recurso Empresa.
 */
class EmpresaController {
  /**
   * Obtiene una empresa por su ID.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async getById(req, res, next) {
    try {
      const {id} = req.params;
      const empresa = await empresaService.getEmpresaById(id, req.user);
      res.status(200).json({data: empresa});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Lista empresas, opcionalmente filtradas por estado.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async list(req, res, next) {
    try {
      const {estado, mandanteId} = req.query;
      const empresas = await empresaService.listarEmpresas(
          {estado, mandanteId}, req.user,
      );
      res.status(200).json({data: empresas});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Crea una nueva empresa.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async create(req, res, next) {
    try {
      const nuevaEmpresa =
          await empresaService.crearEmpresa(req.body, req.user);
      res.status(201).json({
        message: "Empresa creada exitosamente.",
        data: nuevaEmpresa,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Actualiza una empresa existente.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async update(req, res, next) {
    try {
      const {id} = req.params;
      const empresaActualizada = await empresaService.actualizarEmpresa(
          id, req.body, req.user,
      );
      res.status(200).json({
        message: "Empresa actualizada exitosamente.",
        data: empresaActualizada,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Desactiva una empresa existente.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async deactivate(req, res, next) {
    try {
      const {id} = req.params;
      const empresa = await empresaService.desactivarEmpresa(id, req.user);
      res.status(200).json({
        message: "Empresa desactivada exitosamente.",
        data: empresa,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Calcula el resumen de contadores (personas, recursos, proyectos) de
   * una empresa.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async resumen(req, res, next) {
    try {
      const {id} = req.params;
      const resumen = await empresaService.obtenerResumen(id, req.user);
      res.status(200).json({data: resumen});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Lista los eventos de Bitácora relacionados a una empresa.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async eventosRecientes(req, res, next) {
    try {
      const eventos = await empresaService.obtenerEventos(
          req.params.id, req.user, {limit: req.query.limit},
      );
      res.status(200).json({data: eventos});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Mandantes asociados a la Empresa (empresaMandantes).
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async listarMandantes(req, res, next) {
    try {
      const data = await empresaService.listarMandantes(
          req.params.id, req.user,
      );
      res.status(200).json({data});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Asocia la Empresa a un Mandante (o reactiva la asociación).
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async asociarMandante(req, res, next) {
    try {
      const data = await empresaService.asociarMandante(
          req.params.id, req.body?.mandanteId, req.user,
      );
      res.status(200).json({message: "Empresa asociada al Mandante.", data});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Desasocia la Empresa de un Mandante (queda inactivo).
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async desasociarMandante(req, res, next) {
    try {
      const data = await empresaService.desasociarMandante(
          req.params.id, req.params.mandanteId, req.user,
      );
      res.status(200).json({
        message: "Empresa desasociada del Mandante.", data,
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new EmpresaController();
