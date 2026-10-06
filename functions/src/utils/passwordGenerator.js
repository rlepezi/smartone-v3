const crypto = require("crypto");

/**
 * Genera una contraseña temporal aleatoria y criptográficamente segura.
 * @param {number} length Longitud de la contraseña a generar.
 * @return {string} Contraseña temporal generada.
 */
const generateTempPassword = (length = 14) => {
  return crypto.randomBytes(length)
      .toString("base64url")
      .slice(0, length);
};

module.exports = {generateTempPassword};
