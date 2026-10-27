const expedienteRequerimientoService =
    require("../services/expedienteRequerimientoService");

/**
 * Controlador de las instancias de Requerimiento por sujeto
 * (expedienteRequerimientos), para las fichas de Empresa, Persona y
 * Maquinaria. Las de un Expediente puntual se leen en
 * GET /expedientes/:id/requerimientos.
 */
class ExpedienteRequerimientoController {
  /**
   * Lista instancias de un sujeto (?personaId=, ?recursoId= o
   * ?empresaId=; ?estado=activo por defecto o "todos").
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async list(req, res, next) {
    try {
      const {personaId, recursoId, empresaId, estado} = req.query;
      const data = await expedienteRequerimientoService.listarPorSujeto(
          {personaId, recursoId, empresaId, estado}, req.user,
      );
      res.status(200).json({data});
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new ExpedienteRequerimientoController();
