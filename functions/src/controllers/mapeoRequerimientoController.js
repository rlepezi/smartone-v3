const servicio = require("../services/mapeoRequerimientoService");

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

// Controlador HTTP del mapeo documental (nodo de la plantilla ↔
// requerimiento).
module.exports = {
  listar: responder((req) => servicio.listar(req.query, req.user)),
  porRequerimiento: responder((req) => servicio.porRequerimiento(
      req.params.requerimientoId, req.user)),
  vincular: responder((req) => servicio.vincular(req.body || {}, req.user)),
  desvincular: responder((req) => servicio.desvincular(req.body || {},
      req.user)),
};
