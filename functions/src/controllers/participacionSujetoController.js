/**
 * Controlador HTTP compartido por /participacion-personas y
 * /participacion-recursos. Recibe el servicio de la colección.
 */
class ParticipacionSujetoController {
  /**
   * @param {Object} service participacionPersonaService o
   *     participacionRecursoService.
   */
  constructor(service) {
    this.service = service;
    this.list = this.list.bind(this);
    this.getById = this.getById.bind(this);
    this.create = this.create.bind(this);
    this.update = this.update.bind(this);
  }

  /**
   * Lista documentos con filtros de igualdad de la query.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async list(req, res, next) {
    try {
      const {
        mandanteId, proyectoId, participacionId, empresaId, personaId,
        recursoId, perfilRecursoId, estado,
      } = req.query;
      const data = await this.service.listar({
        mandanteId, proyectoId, participacionId, empresaId, personaId,
        recursoId, perfilRecursoId, estado,
      }, req.user);
      res.status(200).json({data});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Obtiene un documento por ID.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async getById(req, res, next) {
    try {
      const data = await this.service.getById(req.params.id, req.user);
      res.status(200).json({data});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Asigna un sujeto a una Participación (uno o varios perfiles).
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async create(req, res, next) {
    try {
      const data = await this.service.crear(req.body, req.user);
      res.status(201).json({message: "Asignación creada exitosamente.", data});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Transiciona el estado de un documento (única escritura vía PUT).
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async update(req, res, next) {
    try {
      const data = await this.service.transicionar(
          req.params.id, req.body, req.user,
      );
      res.status(200).json({
        message: "Asignación actualizada exitosamente.", data,
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = ParticipacionSujetoController;
