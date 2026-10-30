const servicio = require("../services/patronRequerimientoService");

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

// Controlador HTTP de los patrones aprendidos del mapeo documental.
module.exports = {
  listar: responder((req) => servicio.listar(req.query, req.user)),
  confirmar: responder((req) => servicio.confirmarArchivos(req.body || {},
      req.user)),
  quitar: responder((req) => servicio.quitarArchivos(req.body || {},
      req.user)),
  cambiarEstado: responder((req) => servicio.cambiarEstado(req.params.id,
      (req.body || {}).estado, req.user)),
};
