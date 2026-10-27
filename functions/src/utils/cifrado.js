const crypto = require("crypto");

// Cifrado AES-256-GCM de secretos guardados en Firestore (API key de IA,
// client secret de SharePoint). Único lugar del algoritmo: los servicios
// pasan la clave maestra (AI_CONFIG_ENCRYPTION_KEY, 32 bytes).

const ALGORITMO = "aes-256-gcm";

/**
 * Clave maestra desde su valor en base64.
 * @param {?string} valor Base64 de 32 bytes.
 * @return {?Buffer} Clave, o null si no tiene 32 bytes.
 */
function claveDesdeBase64(valor) {
  const clave = Buffer.from(valor || "", "base64");
  return clave.length === 32 ? clave : null;
}

/**
 * Cifra un texto.
 * @param {string} texto Texto plano.
 * @param {Buffer} clave Clave de 32 bytes.
 * @return {{cifrado: string, iv: string, authTag: string}} En base64.
 */
function cifrar(texto, clave) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITMO, clave, iv);
  const cifrado = Buffer.concat([cipher.update(texto, "utf8"),
    cipher.final()]);
  return {
    cifrado: cifrado.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
  };
}

/**
 * Descifra un texto cifrado con `cifrar`.
 * @param {{cifrado: string, iv: string, authTag: string}} datos Base64.
 * @param {Buffer} clave Clave de 32 bytes.
 * @return {string} Texto plano.
 */
function descifrar({cifrado, iv, authTag}, clave) {
  const decipher = crypto.createDecipheriv(ALGORITMO, clave,
      Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(authTag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(cifrado, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

module.exports = {claveDesdeBase64, cifrar, descifrar};
