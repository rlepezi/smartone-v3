// Métricas de Revisiones IA. Funciones puras.

/**
 * Concordancia de un tipo documental: aceptados sin cambio ÷ (aceptados sin
 * cambio + corregidos), en %. null sin resoluciones.
 * @param {?Object} metricas {aceptadosSinCambio, corregidos}.
 * @return {?number} Porcentaje entero o null.
 */
function concordancia(metricas) {
  const aceptados = metricas?.aceptadosSinCambio || 0;
  const resueltos = aceptados + (metricas?.corregidos || 0);
  return resueltos ? Math.round((aceptados / resueltos) * 100) : null;
}

/**
 * Costo promedio por documento procesado.
 * @param {?Object} metricas {procesados, costoTotalUsd}.
 * @return {?number} USD o null sin procesados.
 */
function costoPromedio(metricas) {
  return metricas?.procesados ?
    (metricas.costoTotalUsd || 0) / metricas.procesados : null;
}

/**
 * Descripción normalizada: minúsculas, sin tildes y sin espacios extra.
 * @param {?string} texto Descripción detectada por la IA.
 * @return {string} Descripción normalizada ("" si no hay).
 */
function normalizarDescripcion(texto) {
  return String(texto || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
      .toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Agrupa los procesamientos OTRO por descripción normalizada.
 * @param {Array<{tipoDetectadoDescripcion: ?string, mandanteId: string,
 *     fecha: ?Date}>} items Procesamientos.
 * @return {Array<{descripcion: string, apariciones: number,
 *     mandanteIds: string[], ultimoVisto: ?Date}>} Grupos, de más a menos
 *     apariciones.
 */
function agruparPorNormalizar(items) {
  const grupos = new Map();
  (items || []).forEach((item) => {
    const descripcion = normalizarDescripcion(item.tipoDetectadoDescripcion) ||
        "sin descripción";
    if (!grupos.has(descripcion)) {
      grupos.set(descripcion, {descripcion, apariciones: 0,
        mandanteIds: new Set(), ultimoVisto: null});
    }
    const g = grupos.get(descripcion);
    g.apariciones++;
    if (item.mandanteId) g.mandanteIds.add(item.mandanteId);
    if (item.fecha && (!g.ultimoVisto || item.fecha > g.ultimoVisto)) {
      g.ultimoVisto = item.fecha;
    }
  });
  return [...grupos.values()]
      .map((g) => ({...g, mandanteIds: [...g.mandanteIds]}))
      .sort((a, b) => b.apariciones - a.apariciones ||
          a.descripcion.localeCompare(b.descripcion, "es"));
}

module.exports = {
  concordancia, costoPromedio, normalizarDescripcion, agruparPorNormalizar,
};
