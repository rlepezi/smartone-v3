// Parámetros de la API de Anthropic que dependen del modelo.

/**
 * Opciones de esfuerzo según el modelo: los de la generación 5 aceptan
 * `output_config.effort` y aquí van en "low" (menos pensamiento, menos costo
 * y latencia); los anteriores no lo aceptan.
 * @param {string} modelo ID del modelo.
 * @return {Object} {effort: "low"} o {}.
 */
function esfuerzoPara(modelo) {
  return /^claude-[a-z]+-5(-|$)/.test(String(modelo || "")) ?
    {effort: "low"} : {};
}

module.exports = {esfuerzoPara};
