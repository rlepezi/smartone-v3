/**
 * Error de aplicación con código de estado HTTP asociado.
 */
class AppError extends Error {
  /**
   * @param {number} status Código de estado HTTP.
   * @param {string} message Mensaje descriptivo del error.
   */
  constructor(status, message) {
    super(message);
    this.name = "AppError";
    this.status = status;
  }
}

module.exports = AppError;
