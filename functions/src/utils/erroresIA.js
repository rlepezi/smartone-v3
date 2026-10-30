// Traducción de los errores de la API de Anthropic a mensajes para el
// usuario. Nunca incluye la API key.

/**
 * Mensaje en español de un error de la API de IA.
 * @param {Error} error Error del SDK (con `status`) u otro.
 * @param {string} [modelo] Modelo usado (para el error de modelo).
 * @return {string} Mensaje.
 */
function traducirErrorIA(error, modelo) {
  const status = error?.status;
  const mensaje = String(error?.error?.error?.message || error?.message || "");
  if (status === 401) return "API key inválida.";
  if (status === 403) {
    return "La API key no tiene permiso para usar este recurso.";
  }
  if (status === 429) {
    return "Se alcanzó el límite de tasa de la API. Intenta en unos minutos.";
  }
  if (/credit balance|billing|saldo/i.test(mensaje)) {
    return "La cuenta de Anthropic no tiene saldo suficiente.";
  }
  if (status === 404 || (status === 400 && /model/i.test(mensaje))) {
    return `El modelo ${modelo || ""} no existe o no acepta esta solicitud: ` +
        mensaje;
  }
  if (status === 529 || (status >= 500 && status < 600)) {
    return "La API de Anthropic no está disponible temporalmente.";
  }
  if (error?.name === "APIConnectionTimeoutError") {
    return "La API de Anthropic no respondió a tiempo.";
  }
  return mensaje || "Error desconocido al llamar a la API de IA.";
}

module.exports = {traducirErrorIA};
