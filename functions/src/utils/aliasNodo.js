const {normalizarNombreMapeo} = require("./normalizacionMapeo");

// Alias de los nodos de la plantilla. Función PURA.

const MAX_ALIAS = 40;
const MAX_TEXTO = 120;

/**
 * Lista de alias sin vacíos ni repetidos (por su forma normalizada),
 * conservando el primero escrito.
 * @param {*} lista Alias.
 * @return {string[]} Alias.
 */
function aliasLimpios(lista) {
  const vistos = new Set();
  const salida = [];
  (Array.isArray(lista) ? lista : []).forEach((a) => {
    const t = typeof a === "string" ? a.replace(/\s+/g, " ").trim()
        .slice(0, MAX_TEXTO) : "";
    const n = t ? normalizarNombreMapeo(t, {archivo: false}) : "";
    if (!n || vistos.has(n)) return;
    vistos.add(n);
    salida.push(t);
  });
  return salida.slice(0, MAX_ALIAS);
}

/**
 * true si un nombre real ya está cubierto por el nombre o un alias del nodo
 * (misma forma normalizada), para no sugerir un alias repetido.
 * @param {Object} nodo {nombre, alias}.
 * @param {string} nombreReal Nombre real.
 * @param {boolean} [archivo] Quitar la extensión.
 * @return {boolean} Cubierto.
 */
function aliasCubierto(nodo, nombreReal, archivo = false) {
  const n = normalizarNombreMapeo(nombreReal, {archivo});
  return [nodo?.nombre, ...(nodo?.alias || [])].filter(Boolean)
      .some((x) => normalizarNombreMapeo(x, {archivo: false}) === n);
}

module.exports = {aliasLimpios, aliasCubierto};
