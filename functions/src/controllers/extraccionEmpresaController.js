const servicio = require("../services/extraccionEmpresaService");

/**
 * Responde con el resultado de una acción del servicio.
 * @param {Function} accion (req) => Promise<datos>.
 * @return {Function} Middleware Express.
 */
const responder = (accion) => async (req, res, next) => {
  try {
    res.status(200).json({data: await accion(req)});
  } catch (error) {
    next(error);
  }
};

/**
 * Controlador HTTP de la extracción con IA de los datos de una empresa.
 */
module.exports = {
  estimar: responder((req) => servicio.estimar(req.body || {}, req.user)),
  extraer: responder((req) => servicio.extraer(req.body || {}, req.user)),
};
