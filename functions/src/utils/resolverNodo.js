const {normalizarNombreMapeo} = require("./normalizacionMapeo");

// Resolvedor de nodos de la plantilla de estructura sobre una carpeta real.
// Funciones PURAS: la MISMA lógica vive en frontend/src/utils/resolverNodo.js
// y ambas se prueban con test/fixtures/casosResolverNodo.json (en los dos
// lados).
//
// Un nombre real calza con un nodo si contiene TODAS las palabras de su
// nombre o de alguno de sus alias, comparando normalizados con
// normalizarNombreMapeo (sin prefijo de orden "02." / "03 -" / "2)", sin
// tildes ni mayúsculas, sin puntuación ni espacios dobles), y NO contiene
// las de ninguna exclusión ("no: anexo"). Así "02. Listado del personal" y
// "03. Listado del personal" caen en el mismo nodo.
//
// Orden: 1) override activo del expediente; 2) alias; con más de un
// candidato no se elige (sugerencia).
//
// El backend no lee carpetas: quien llama entrega `hijosDe(ruta)` con lo que
// ya leyó ({carpetas, archivos}; null si no existe; undefined si aún no la
// leyó, y entonces el resultado pide leerla con `leer`).

const palabras = (texto, archivo) => normalizarNombreMapeo(texto, {archivo})
    .split(" ").filter(Boolean);

/**
 * true si el nombre real calza con el nodo (nombre o alias) y no con una
 * exclusión.
 * @param {string} nombre Nombre real de la carpeta o el archivo.
 * @param {Object} nodo {nombre, alias, excluir}.
 * @param {{archivo: (boolean|undefined)}} [opciones] archivo: quita la
 *     extensión.
 * @return {boolean} Calza.
 */
function calzaNombre(nombre, nodo, {archivo = false} = {}) {
  const real = new Set(palabras(nombre, archivo));
  if (!real.size) return false;
  const contiene = (frase) => {
    const p = palabras(frase, false);
    return p.length > 0 && p.every((x) => real.has(x));
  };
  if ((nodo.excluir || []).some(contiene)) return false;
  return [nodo.nombre, ...(nodo.alias || [])].filter(Boolean).some(contiene);
}

const unir = (...p) => p.filter(Boolean).join("/");
const padre = (ruta) => String(ruta || "").split("/").slice(0, -1).join("/");

const resultado = (estado, extra = {}) => ({estado, rutaReal: null,
  origen: null, candidatos: [], archivos: [], leer: null, ...extra});

/**
 * Archivos de primer nivel de una carpeta real (o la petición de leerla).
 * @param {function(string): (Object|null|undefined)} hijosDe Lecturas.
 * @param {string} ruta Carpeta.
 * @return {(Object|null)} {archivos} | resultado "pendiente"/"no_encontrada".
 */
function archivosDe(hijosDe, ruta) {
  const l = hijosDe(ruta);
  if (l === undefined) return {pendiente: resultado("pendiente", {leer: ruta})};
  if (l === null) return {pendiente: resultado("no_encontrada")};
  return {archivos: l.archivos || [], carpetas: l.carpetas || []};
}

/**
 * Resuelve un nodo de la plantilla sobre la carpeta real.
 * @param {Object} entrada Datos.
 * @param {Object} entrada.nodo Nodo (nodosDe): {tipoNodo, nombre, alias,
 *     excluir, multiple}.
 * @param {?Object} entrada.seccion Nodo de su sección (archivoSuelto).
 * @param {string} entrada.base Carpeta del expediente ("" = raíz del
 *     acceso).
 * @param {?string} entrada.carpetaSujeto Carpeta de la persona o maquinaria
 *     (documentoEntidad).
 * @param {?Object} entrada.override Override del nodo para el sujeto
 *     ({rutaReal}).
 * @param {?Object} entrada.overrideSeccion Override de la sección
 *     (archivoSuelto).
 * @param {function(string): (Object|null|undefined)} entrada.hijosDe
 *     Lecturas.
 * @return {Object} {estado: "resuelta" | "sugerida" | "no_encontrada" |
 *     "pendiente", rutaReal, origen: "override" | "alias", candidatos,
 *     archivos, leer}.
 */
function resolverNodo({nodo, seccion = null, base = "", carpetaSujeto = null,
  override = null, overrideSeccion = null, hijosDe}) {
  // 1) Override: la carpeta o el archivo confirmado en el expediente.
  if (override?.rutaReal) {
    const ruta = override.rutaReal;
    const enPadre = archivosDe(hijosDe, padre(ruta));
    if (enPadre.pendiente) {
      return enPadre.pendiente.estado === "pendiente" ? enPadre.pendiente :
        resultado("no_encontrada", {origen: "override"});
    }
    const archivo = enPadre.archivos.find((a) => a.ruta === ruta);
    if (archivo) {
      return resultado("resuelta", {rutaReal: padre(ruta), origen: "override",
        archivos: [archivo]});
    }
    const enCarpeta = archivosDe(hijosDe, ruta);
    if (enCarpeta.pendiente) {
      return enCarpeta.pendiente.estado === "pendiente" ? enCarpeta.pendiente :
        resultado("no_encontrada", {origen: "override"});
    }
    const archivos = nodo.tipoNodo === "seccion" ? enCarpeta.archivos :
      enCarpeta.archivos.filter((a) => calzaNombre(a.nombre, nodo,
          {archivo: true}));
    return resultado("resuelta", {rutaReal: ruta, origen: "override",
      archivos: archivos.length ? archivos : enCarpeta.archivos});
  }

  // 2) Sección: la subcarpeta de la carpeta del expediente que calza.
  if (nodo.tipoNodo === "seccion") {
    const l = archivosDe(hijosDe, base);
    if (l.pendiente) return l.pendiente;
    const calzan = l.carpetas.filter((c) => calzaNombre(c.nombre, nodo));
    if (!calzan.length) return resultado("no_encontrada", {origen: "alias"});
    if (calzan.length > 1) {
      return resultado("sugerida", {origen: "alias",
        candidatos: calzan.map((c) => c.ruta)});
    }
    const dentro = archivosDe(hijosDe, calzan[0].ruta);
    if (dentro.pendiente) return dentro.pendiente;
    return resultado("resuelta", {rutaReal: calzan[0].ruta, origen: "alias",
      archivos: dentro.archivos});
  }

  // 3) Archivo suelto (en la carpeta de su sección) o documento de entidad
  // (en la carpeta de la persona o maquinaria).
  let carpeta = carpetaSujeto;
  if (nodo.tipoNodo === "archivoSuelto") {
    if (!seccion) return resultado("no_encontrada", {origen: "alias"});
    const s = resolverNodo({nodo: seccion, base, override: overrideSeccion,
      hijosDe});
    if (s.estado !== "resuelta") return s;
    carpeta = s.rutaReal;
  }
  if (!carpeta) return resultado("no_encontrada", {origen: "alias"});
  const l = archivosDe(hijosDe, carpeta);
  if (l.pendiente) return l.pendiente;
  const archivos = l.archivos.filter((a) => calzaNombre(a.nombre, nodo,
      {archivo: true}));
  if (!archivos.length) return resultado("no_encontrada", {origen: "alias"});
  if (archivos.length > 1 && !nodo.multiple) {
    return resultado("sugerida", {rutaReal: carpeta, origen: "alias",
      candidatos: archivos.map((a) => a.ruta)});
  }
  return resultado("resuelta", {rutaReal: carpeta, origen: "alias",
    archivos});
}

/**
 * Nodos aplicables a un expediente: activos, habilitados y con al menos un
 * requerimiento vinculado (activo) que está en el perfil del expediente.
 * @param {Object} entrada Datos.
 * @param {Array<Object>} entrada.nodos nodosDe(plantilla).
 * @param {Array<Object>} entrada.vinculos mapeoRequerimientos.
 * @param {Iterable<string>} entrada.requerimientosPerfil Requerimientos del
 *     perfil del expediente.
 * @return {Map<string, Array<Object>>} requerimientoId → nodos.
 */
function requerimientosDeExpediente({nodos, vinculos, requerimientosPerfil}) {
  const delPerfil = new Set(requerimientosPerfil || []);
  const porClave = new Map((nodos || []).filter((n) => n.estado === "activo" &&
    n.habilitado).map((n) => [n.nodoClave, n]));
  const salida = new Map();
  (vinculos || []).filter((v) => v.estado === "activo" &&
    delPerfil.has(v.requerimientoId) && porClave.has(v.nodoClave))
      .forEach((v) => {
        if (!salida.has(v.requerimientoId)) salida.set(v.requerimientoId, []);
        salida.get(v.requerimientoId).push(porClave.get(v.nodoClave));
      });
  return salida;
}

/**
 * Lo que la IA lee de los nodos de un requerimiento: unión de alias y
 * múltiple / sensible si algún nodo lo es; códigos de tipo documental.
 * @param {Array<Object>} nodos Nodos vinculados.
 * @return {{alias: string[], multiple: boolean, sensible: boolean,
 *     tiposDocumentales: string[]}} Datos.
 */
function lecturaDeNodos(nodos) {
  const lista = nodos || [];
  return {
    alias: [...new Set(lista.flatMap((n) => n.alias || []))],
    multiple: lista.some((n) => n.multiple),
    sensible: lista.some((n) => n.datosSensibles),
    tiposDocumentales: [...new Set(lista.map((n) => n.tipoDocumentalCodigo)
        .filter(Boolean))],
  };
}

module.exports = {calzaNombre, resolverNodo, requerimientosDeExpediente,
  lecturaDeNodos, unir};
