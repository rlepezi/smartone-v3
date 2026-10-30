const crypto = require("crypto");
const {normalizarNombreMapeo} = require("./normalizacionMapeo");
const {entradasMapeo} = require("./carpetaExpediente");

// Patrones aprendidos del mapeo documental: cada confirmación enseña, a
// nivel de Mandante, que un nombre (normalizado) corresponde a un
// requerimiento (o a la carpeta del personal / de maquinarias). Funciones
// PURAS para calcular qué patrones suben (+1) o bajan (−1).

const AMBITOS = ["empresa", "persona", "recurso", "estructura"];
const OBJETIVOS = ["carpeta", "archivo", "carpetaPersonas", "carpetaRecursos"];

/**
 * ID determinístico: un solo registro por (Mandante, ámbito, objetivo,
 * patrón, requerimiento).
 * @param {Object} p {mandanteId, ambito, objetivo, patron, requerimientoId}.
 * @return {string} ID.
 */
function idPatron({mandanteId, ambito, objetivo, patron, requerimientoId}) {
  return crypto.createHash("sha1").update([mandanteId, ambito, objetivo,
    patron, requerimientoId || ""].join("|")).digest("hex");
}

/**
 * Patrón de un nodo del árbol: su nombre (sin la ruta), normalizado.
 * @param {string} ruta Ruta del nodo.
 * @param {string} tipo "carpeta" | "archivo".
 * @return {string} Patrón.
 */
function patronDeRuta(ruta, tipo) {
  const nombre = String(ruta || "").split("/").filter(Boolean).pop() || "";
  return normalizarNombreMapeo(nombre, {archivo: tipo === "archivo"});
}

/**
 * Cambios de patrones por un cambio del mapeo de Empresa: cada entrada
 * nueva suma 1 y cada entrada quitada resta 1 a su patrón.
 * @param {Object} antes Mapeo anterior {requerimientoId: [entradas]}.
 * @param {Object} despues Mapeo nuevo.
 * @return {Array<Object>} [{ambito, objetivo, patron, requerimientoId,
 *     delta}].
 */
function deltasMapeo(antes, despues) {
  const clave = (id, e) => `${id}|${e.ruta}`;
  const planos = (m) => {
    const mapa = new Map();
    Object.entries(m || {}).forEach(([id, lista]) => entradasMapeo(lista)
        .forEach((e) => mapa.set(clave(id, e), {requerimientoId: id, ...e})));
    return mapa;
  };
  const a = planos(antes);
  const d = planos(despues);
  const salida = [];
  const agregar = (e, delta) => {
    const patron = patronDeRuta(e.ruta, e.tipo);
    if (patron) {
      salida.push({ambito: "empresa", objetivo: e.tipo, patron,
        requerimientoId: e.requerimientoId, delta});
    }
  };
  d.forEach((e, k) => {
    if (!a.has(k)) agregar(e, 1);
  });
  a.forEach((e, k) => {
    if (!d.has(k)) agregar(e, -1);
  });
  return salida;
}

/**
 * Cambios de patrones estructurales por elegir (o cambiar) la carpeta del
 * personal o la de maquinarias.
 * @param {Object} antes {carpetaPersonas, carpetaRecursos} anteriores.
 * @param {Object} cambios Campos que cambian (solo los presentes).
 * @return {Array<Object>} Deltas.
 */
function deltasEspeciales(antes, cambios) {
  const salida = [];
  ["carpetaPersonas", "carpetaRecursos"].forEach((campo) => {
    if (!(campo in cambios)) return;
    const previa = antes[campo] || null;
    const nueva = cambios[campo] || null;
    if (previa === nueva) return;
    [[previa, -1], [nueva, 1]].forEach(([ruta, delta]) => {
      const patron = ruta ? patronDeRuta(ruta, "carpeta") : "";
      if (patron) {
        salida.push({ambito: "estructura", objetivo: campo, patron,
          requerimientoId: null, delta});
      }
    });
  });
  return salida;
}

/**
 * Agrupa deltas por patrón (con su ID) y descarta los netos en cero.
 * @param {string} mandanteId Mandante.
 * @param {Array<Object>} deltas Deltas.
 * @return {Array<Object>} [{id, mandanteId, ambito, objetivo, patron,
 *     requerimientoId, delta}].
 */
function agruparDeltas(mandanteId, deltas) {
  const porId = new Map();
  deltas.forEach((d) => {
    const id = idPatron({mandanteId, ...d});
    const previo = porId.get(id);
    if (previo) previo.delta += d.delta;
    else porId.set(id, {id, mandanteId, ...d});
  });
  return [...porId.values()].filter((d) => d.delta !== 0);
}

/**
 * Nuevo estado de un patrón tras un delta. Sin registro, solo se crea con
 * delta positivo.
 * @param {?Object} actual Patrón actual ({vecesConfirmado, estado}).
 * @param {number} delta Cambio.
 * @return {?{vecesConfirmado: number, estado: string}} Valores, o null si
 *     no hay nada que guardar.
 */
function aplicarDelta(actual, delta) {
  if (!actual) {
    return delta > 0 ? {vecesConfirmado: delta, estado: "activo"} : null;
  }
  const veces = Math.max(0, (actual.vecesConfirmado || 0) + delta);
  return {vecesConfirmado: veces, estado: veces > 0 ? "activo" : "inactivo"};
}

module.exports = {
  AMBITOS, OBJETIVOS, idPatron, patronDeRuta, deltasMapeo, deltasEspeciales,
  agruparDeltas, aplicarDelta,
};
