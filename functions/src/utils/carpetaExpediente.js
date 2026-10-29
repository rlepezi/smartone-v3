// Carpeta documental de un Expediente: UN SOLO resolvedor para todos los
// consumidores (acreditación, Documentación, Revisiones IA, panel de
// documentos). Funciones PURAS: quien llama lee los documentos.
// La MISMA lógica vive en frontend/src/utils/carpetaExpediente.js; ambas se
// prueban con test/fixtures/casosCarpetaExpediente.json.
//
// Precedencia: 1° la Carpeta de empresa del expediente
// (expediente.repositorioDocumental.carpetaEmpresaId); 2° solo si el
// expediente no tiene carpetaEmpresaId, el formato legado
// (configRevisionExpediente.repositorioDocumental: {tipo, etiqueta, url,
// mapeo}); 3° ninguna.

const mapeoVacio = () => ({carpetaPersonas: null, carpetaRecursos: null,
  requerimientos: {}});

/**
 * Entradas del mapeo de un requerimiento en el formato nuevo (arreglo). El
 * legado guarda un texto (la ruta de una carpeta).
 * @param {*} valor Arreglo de entradas o texto (legado).
 * @return {Array<{ruta: string, tipo: string, origen: string,
 *     confirmadoPor: ?string, confirmadoAt: *}>} Entradas.
 */
function entradasMapeo(valor) {
  if (typeof valor === "string") {
    return valor ? [{ruta: valor, tipo: "carpeta", origen: "manual",
      confirmadoPor: null, confirmadoAt: null}] : [];
  }
  if (!Array.isArray(valor)) return [];
  return valor.filter((e) => e && typeof e.ruta === "string" && e.ruta)
      .map((e) => ({ruta: e.ruta, tipo: e.tipo === "archivo" ? "archivo" :
        "carpeta", origen: e.origen === "sugerencia" ? "sugerencia" :
        "manual", confirmadoPor: e.confirmadoPor || null,
      confirmadoAt: e.confirmadoAt || null}));
}

/**
 * Mapeo normalizado: requerimientos siempre en el formato nuevo.
 * @param {?Object} mapeo Mapeo (nuevo o legado).
 * @return {{carpetaPersonas: ?string, carpetaRecursos: ?string,
 *     requerimientos: Object}} Mapeo.
 */
function normalizarMapeo(mapeo) {
  const salida = mapeoVacio();
  if (!mapeo || typeof mapeo !== "object") return salida;
  salida.carpetaPersonas = mapeo.carpetaPersonas || null;
  salida.carpetaRecursos = mapeo.carpetaRecursos || null;
  // Carpeta de empresa: {requerimientoId: [...]} en "mapeo"; legado:
  // mapeo.requerimientos.
  const reqs = mapeo.requerimientos && typeof mapeo.requerimientos ===
    "object" ? mapeo.requerimientos : {};
  Object.entries(reqs).forEach(([id, v]) => {
    const e = entradasMapeo(v);
    if (e.length) salida.requerimientos[id] = e;
  });
  return salida;
}

/**
 * Resuelve la carpeta de un Expediente.
 * @param {Object} entrada Datos ya leídos.
 * @param {?Object} entrada.expediente Expediente
 *     ({repositorioDocumental: {carpetaEmpresaId}}).
 * @param {?Object} entrada.carpetaEmpresa Carpeta de empresa de ese id
 *     ({id, fuenteId, ruta, url, empresaId, proyectoId, carpetaPersonas,
 *     carpetaRecursos, mapeo, estadoMapeo, estado}).
 * @param {?Object} entrada.fuente Fuente de la carpeta ({id, tipo,
 *     etiqueta}).
 * @param {?Object} entrada.legado configRevisionExpediente
 *     .repositorioDocumental ({tipo, etiqueta, url, mapeo}).
 * @return {{origen: string, carpeta: ?Object}} origen: "carpetaEmpresa" |
 *     "legado" | "ninguna". carpeta: {carpetaEmpresaId, fuenteId,
 *     fuenteEtiqueta, tipo, etiqueta, ruta, url, empresaId, proyectoId,
 *     estadoMapeo, mapeo: {carpetaPersonas, carpetaRecursos,
 *     requerimientos: {id: [entradas]}}}.
 */
function resolverCarpetaExpediente({expediente = null, carpetaEmpresa = null,
  fuente = null, legado = null} = {}) {
  const carpetaEmpresaId =
      expediente?.repositorioDocumental?.carpetaEmpresaId || null;
  if (carpetaEmpresaId) {
    // Con carpetaEmpresaId el legado NO se usa, aunque la carpeta no se
    // encuentre (queda "ninguna": hay que volver a vincular).
    if (!carpetaEmpresa || carpetaEmpresa.id !== carpetaEmpresaId) {
      return {origen: "ninguna", carpeta: null};
    }
    const tipo = fuente?.tipo === "sharepoint" ? "sharepoint" : "local";
    return {
      origen: "carpetaEmpresa",
      carpeta: {
        carpetaEmpresaId,
        fuenteId: carpetaEmpresa.fuenteId || null,
        fuenteEtiqueta: fuente?.etiqueta || null,
        tipo,
        etiqueta: carpetaEmpresa.ruta,
        ruta: carpetaEmpresa.ruta,
        url: tipo === "sharepoint" ? carpetaEmpresa.url || null : null,
        empresaId: carpetaEmpresa.empresaId || null,
        proyectoId: carpetaEmpresa.proyectoId || null,
        estadoMapeo: carpetaEmpresa.estadoMapeo || "sin_mapear",
        mapeo: normalizarMapeo({
          carpetaPersonas: carpetaEmpresa.carpetaPersonas,
          carpetaRecursos: carpetaEmpresa.carpetaRecursos,
          requerimientos: carpetaEmpresa.mapeo,
        }),
      },
    };
  }
  if (legado && (legado.tipo === "local" || legado.tipo === "sharepoint")) {
    return {
      origen: "legado",
      carpeta: {
        carpetaEmpresaId: null, fuenteId: null, fuenteEtiqueta: null,
        tipo: legado.tipo,
        etiqueta: legado.etiqueta || null,
        ruta: legado.tipo === "local" ? legado.etiqueta || null : null,
        url: legado.tipo === "sharepoint" ? legado.url || null : null,
        empresaId: null, proyectoId: null, estadoMapeo: null,
        mapeo: normalizarMapeo(legado.mapeo),
      },
    };
  }
  return {origen: "ninguna", carpeta: null};
}

/**
 * Rutas asignadas a un requerimiento en la carpeta resuelta.
 * @param {?Object} carpeta Carpeta (resolverCarpetaExpediente).
 * @param {string} requerimientoId Requerimiento.
 * @return {string[]} Rutas (relativas a la carpeta).
 */
function rutasDeRequerimiento(carpeta, requerimientoId) {
  return (carpeta?.mapeo?.requerimientos?.[requerimientoId] || [])
      .map((e) => e.ruta);
}

/**
 * Estado del mapeo: sin_mapear (ninguno con entradas), completo (todos los
 * requerimientos pedidos con al menos una entrada) o parcial.
 * @param {?Object} mapeo {requerimientoId: [entradas]}.
 * @param {string[]} requerimientoIds Requerimientos que debería cubrir.
 * @return {string} Estado.
 */
function calcularEstadoMapeo(mapeo, requerimientoIds) {
  const con = new Set(Object.entries(mapeo || {})
      .filter(([, v]) => entradasMapeo(v).length).map(([id]) => id));
  if (!con.size) return "sin_mapear";
  const ids = [...new Set(requerimientoIds || [])];
  return ids.length && ids.every((id) => con.has(id)) ? "completo" :
    "parcial";
}

module.exports = {
  resolverCarpetaExpediente, rutasDeRequerimiento, calcularEstadoMapeo,
  normalizarMapeo, entradasMapeo,
};
