const servicio = require("../services/ubicacionExpedienteService");

/**
 * Responde con el resultado de una operación del servicio.
 * @param {Function} operacion (req) => Promise.
 * @return {Function} Middleware Express.
 */
const responder = (operacion) => async (req, res, next) => {
  try {
    res.status(200).json({data: await operacion(req)});
  } catch (error) {
    next(error);
  }
};

// Controlador HTTP de la ubicación documental en el expediente (overrides
// por nodo y alias sugeridos).
module.exports = {
  config: responder((req) => servicio.config(req.params.expedienteId,
      req.user)),
  confirmarOverride: responder((req) => servicio.confirmarOverride(
      req.params.expedienteId, req.body || {}, req.user)),
  desactivarOverride: responder((req) => servicio.desactivarOverride(
      req.params.expedienteId, req.params.id, req.user)),
  sugerirAlias: responder((req) => servicio.sugerirAlias(req.body || {},
      req.user)),
  listarAliasSugeridos: responder((req) => servicio.listarAliasSugeridos(
      req.query, req.user)),
  resolverAliasSugerido: responder((req) => servicio.resolverAliasSugerido(
      req.params.id, (req.body || {}).decision, req.user)),
};
