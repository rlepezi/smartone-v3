const personaService = require("../services/personaService");
const derechosArcoService = require("../services/derechosArcoService");

/**
 * Controlador HTTP para el recurso Persona.
 */
class PersonaController {
  /**
   * Obtiene una persona por su ID.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async getById(req, res, next) {
    try {
      const {id} = req.params;
      const persona = await personaService.getPersonaById(id);
      res.status(200).json({data: persona});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Lista personas, opcionalmente filtradas por estado y/o empresa.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async list(req, res, next) {
    try {
      const {estado, empresaId} = req.query;
      const personas = await personaService.listarPersonas(
          {estado, empresaId},
      );
      res.status(200).json({data: personas});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Crea una nueva persona.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async create(req, res, next) {
    try {
      const nuevaPersona = await personaService.crearPersona(req.body);
      res.status(201).json({
        message: "Persona creada exitosamente.",
        data: nuevaPersona,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Actualiza una persona existente.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async update(req, res, next) {
    try {
      const {id} = req.params;
      const personaActualizada = await personaService.actualizarPersona(
          id, req.body,
      );
      res.status(200).json({
        message: "Persona actualizada exitosamente.",
        data: personaActualizada,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Desactiva una persona existente.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async deactivate(req, res, next) {
    try {
      const {id} = req.params;
      const persona = await personaService.desactivarPersona(id);
      res.status(200).json({
        message: "Persona desactivada exitosamente.",
        data: persona,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Calcula el resumen de una persona (asignaciones activas: rol y
   * proyecto).
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async resumen(req, res, next) {
    try {
      const {id} = req.params;
      const resumen = await personaService.obtenerResumen(id, req.user);
      res.status(200).json({data: resumen});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Cuántos documentos de identidad afectaría anonimizar a la persona.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async impactoAnonimizacion(req, res, next) {
    try {
      const data = await derechosArcoService.impactoAnonimizacion(
          req.params.id, req.user,
      );
      res.status(200).json({data});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Documentos de identidad de una persona anonimizada y su estado de
   * purga (solo superadmin).
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async documentosPurga(req, res, next) {
    try {
      const data = await derechosArcoService.listarDocumentosPurga(
          req.params.id, req.user,
      );
      res.status(200).json({data});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Anonimiza los datos personales de una persona (solo superadmin).
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async anonimizar(req, res, next) {
    try {
      const persona = await derechosArcoService.anonimizarPersona(
          req.params.id, req.user, req.body?.motivo,
      );
      res.status(200).json({
        message: "Datos personales anonimizados.", data: persona,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Lista los eventos de Bitácora relacionados a una persona.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async eventosRecientes(req, res, next) {
    try {
      const eventos = await personaService.obtenerEventos(
          req.params.id, req.user, {limit: req.query.limit},
      );
      res.status(200).json({data: eventos});
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new PersonaController();
