const servicio = require("../services/revisionRequerimientoIAService");

/**
 * Responde con el resultado de una acción del servicio.
 * @param {Function} accion (req) => Promise<datos>.
 * @param {number} [status] Código HTTP de éxito.
 * @return {Function} Middleware Express.
 */
const responder = (accion, status = 200) => async (req, res, next) => {
  try {
    res.status(status).json({data: await accion(req)});
  } catch (error) {
    next(error);
  }
};

/**
 * Controlador HTTP de las revisiones IA por requerimiento.
 */
const revisionRequerimientoIAController = {
  estado: responder((req) => servicio.estado(req.params.id, req.user)),
  pautas: responder((req) => servicio.pautas(req.params.id, req.user)),
  listar: responder((req) => servicio.listar(req.params.id, req.query,
      req.user)),
  revisar: responder((req) => servicio.revisar(req.params.id,
      req.body || {}, req.user), 201),
  descartar: responder((req) => servicio.descartar(req.params.revisionId,
      req.user)),
};

module.exports = revisionRequerimientoIAController;
