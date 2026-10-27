const servicio = require("../services/requerimientoReglaIAService");

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

const cuerpo = (req) => req.body || {};

/**
 * Controlador HTTP de las reglas IA de un requerimiento.
 */
const requerimientoReglaIAController = {
  cobertura: responder((req) => servicio.cobertura(req.user)),
  obtener: responder((req) => servicio.obtener(req.params.id, req.user)),
  asignarTipo: responder((req) => servicio.asignarTipo(req.params.id,
      cuerpo(req).tipoDocumentalId ?? null, req.user)),
  cambiarEstadoIA: responder((req) => servicio.cambiarEstadoIA(req.params.id,
      cuerpo(req).estadoIA, req.user)),
  agregarRegla: responder((req) => servicio.agregarRegla(req.params.id,
      cuerpo(req), req.user), 201),
  actualizarVinculo: responder((req) => servicio.actualizarVinculo(
      req.params.id, req.params.vinculoId, cuerpo(req), req.user)),
  quitarVinculo: responder((req) => servicio.quitarVinculo(req.params.id,
      req.params.vinculoId, req.user)),
  ordenar: responder((req) => servicio.ordenar(req.params.id,
      cuerpo(req).ids, req.user)),
  copiarDe: responder((req) => servicio.copiarDe(req.params.id,
      cuerpo(req).origenId, req.user)),
  probar: responder((req) => servicio.probar(req.params.id, cuerpo(req),
      req.user), 201),
  listarPruebas: responder((req) => servicio.listarPruebas(req.params.id,
      req.user)),
};

module.exports = requerimientoReglaIAController;
