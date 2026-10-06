const bitacoraService = require("../services/bitacoraService");

/**
 * Controlador HTTP para el recurso Bitácora. Solo lectura — no hay
 * create/update/delete expuestos, la escritura es exclusivamente interna.
 */
class BitacoraController {
  /**
   * Lista registros de bitácora, opcionalmente filtrados.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async list(req, res, next) {
    try {
      const {mandanteId, entidad, entidadId, limit} = req.query;
      const registros = await bitacoraService.listarBitacora(
          {mandanteId, entidad, entidadId, limit}, req.user,
      );
      res.status(200).json({data: registros});
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new BitacoraController();
