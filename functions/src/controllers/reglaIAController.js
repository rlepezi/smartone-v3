const reglaIAService = require("../services/reglaIAService");

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
 * Controlador HTTP de la biblioteca de reglas de revisión IA.
 */
const reglaIAController = {
  listar: responder((req) => reglaIAService.listar(req.query, req.user)),
  verificaciones: responder(async (req) =>
    reglaIAService.verificaciones(req.user)),
  obtener: responder((req) => reglaIAService.obtener(req.params.id, req.user)),
  crear: responder((req) => reglaIAService.crear(req.body || {}, req.user),
      201),
  actualizar: responder((req) => reglaIAService.actualizar(req.params.id,
      req.body || {}, req.user)),
  duplicar: responder((req) => reglaIAService.duplicar(req.params.id,
      req.body || null, req.user), 201),
  cambiarEstado: responder((req) => reglaIAService.cambiarEstado(
      req.params.id, (req.body || {}).estado, req.user)),
};

module.exports = reglaIAController;
