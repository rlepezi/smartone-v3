/**
 * Error de aplicación con código de estado HTTP asociado.
 */
class AppError extends Error {
  /**
   * @param {number} status Código de estado HTTP.
   * @param {string} message Mensaje descriptivo del error.
   * @param {{codigo: (string|undefined), detalle: *}} [extra] Código de
   *     negocio estable (ej. "RUT_EXISTENTE", "CONFIRMACION_REQUERIDA") y
   *     datos para que el cliente resuelva el caso (ej. la lista de
   *     afectados que debe confirmar). Opcional.
   */
  constructor(status, message, extra = {}) {
    super(message);
    this.name = "AppError";
    this.status = status;
    if (extra.codigo) this.codigo = extra.codigo;
    if (extra.detalle !== undefined) this.detalle = extra.detalle;
  }
}

module.exports = AppError;
