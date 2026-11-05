const crypto = require("crypto");
const {validarRutaRelativa} = require("./repositorioDocumental");
const {carpetaDeUrlSharePoint} = require("./carpetaEmpresa");

// Validaciones de las Carpetas de empresa (subcarpetas de la fuente
// documental del Mandante) y de su mapeo. Funciones PURAS.

const RE_REQUERIMIENTO = /^[A-Za-z0-9_-]{1,128}$/;
const MAX_REQUERIMIENTOS = 500;
const MAX_ENTRADAS = 20;
const TIPOS_ENTRADA = ["carpeta", "archivo"];

/**
 * ID determinístico de una Carpeta de empresa: única por fuente y ruta (sin
 * distinguir mayúsculas: los nombres de carpeta no las distinguen en
 * Windows ni en SharePoint). Así el find-or-create no deja duplicados.
 * @param {string} fuenteId Fuente.
 * @param {string} ruta Ruta relativa a la fuente.
 * @return {string} ID.
 */
function idCarpeta(fuenteId, ruta) {
  return crypto.createHash("sha1")
      .update(`${fuenteId}|${String(ruta).trim().toLowerCase()}`)
      .digest("hex");
}

/**
 * Ruta de una carpeta local, relativa a la fuente (sin "..", sin unidad ni
 * "/" inicial). Puede tener subniveles: la de una empresa dentro de la
 * carpeta de su proyecto ("Proyecto X/Empresa Y").
 * @param {*} valor Nombre recibido.
 * @return {{ok: boolean, error: ?string, valor: ?string}} Resultado.
 */
function validarRutaCarpeta(valor) {
  const r = validarRutaRelativa(valor);
  if (!r.ok) return r;
  if (!r.valor) {
    return {ok: false, error: "Indique la carpeta de la empresa.",
      valor: null};
  }
  return r;
}

/**
 * Nombre de la carpeta: el último tramo de su ruta (con la ruta anidada, la
 * validación contra la Empresa mira solo la carpeta, no la del proyecto).
 * @param {?string} ruta Ruta relativa.
 * @return {string} Nombre.
 */
function nombreDeRuta(ruta) {
  const tramos = String(ruta || "").split("/").filter(Boolean);
  return tramos[tramos.length - 1] || "";
}

/**
 * Referencia común de una carpeta de la fuente documental (en `carpetas` y
 * en `proyectos.repositorioDocumental`): {tipoFuente, driveId, itemId,
 * nombre, rutaRelativa}. En SharePoint, driveId + itemId la identifican de
 * forma estable (no cambian al renombrar); nombre y ruta son para mostrar.
 * Se agrega junto a los campos de siempre (ruta, url, fuenteId), que el
 * código sigue leyendo.
 * @param {Object} c Datos.
 * @param {string} c.tipoFuente "local" | "sharepoint".
 * @param {string} c.ruta Ruta relativa (local) o nombre (SharePoint por
 *     URL).
 * @param {?string} [c.driveId] Biblioteca (SharePoint vía Graph).
 * @param {?string} [c.itemId] Item (SharePoint vía Graph).
 * @param {?string} [c.rutaRelativa] Ruta relativa a la carpeta base
 *     (SharePoint vía Graph).
 * @return {Object} Referencia.
 */
function referenciaCarpeta({tipoFuente, ruta, driveId = null, itemId = null,
  rutaRelativa = null}) {
  const local = tipoFuente === "local";
  return {
    tipoFuente: local ? "local" : "sharepoint",
    driveId: local ? null : driveId || null,
    itemId: local ? null : itemId || null,
    nombre: nombreDeRuta(rutaRelativa || ruta),
    // SharePoint pegado por URL (sin Graph) aún no tiene la ruta relativa a
    // la carpeta base: queda null hasta elegirla desde el árbol.
    rutaRelativa: local ? ruta : rutaRelativa || null,
  };
}

/**
 * Clave del ID de una carpeta: en SharePoint vía Graph, driveId + itemId
 * (estables al renombrar); por URL, la ruta completa dentro del sitio (dos
 * carpetas homónimas en proyectos distintos no comparten ID); local, la ruta.
 * @param {{ruta: string, url: ?string, referencia: ?Object}} carpeta
 *     Carpeta.
 * @return {string} Clave.
 */
function claveIdCarpeta({ruta, url, referencia = null}) {
  if (referencia?.driveId && referencia?.itemId) {
    return `graph:${referencia.driveId}:${referencia.itemId}`;
  }
  if (!url) return ruta;
  try {
    const u = new URL(url);
    const camino = u.searchParams.get("id") || decodeURIComponent(u.pathname);
    return camino.replace(/\\/g, "/").replace(/\/+$/, "") || ruta;
  } catch (e) {
    return ruta;
  }
}

/**
 * Carpeta de empresa SharePoint: URL https de *.sharepoint.com dentro del
 * sitio de la fuente; la ruta es su último tramo.
 * @param {*} url URL recibida.
 * @param {?string} siteUrl URL del sitio de la fuente.
 * @return {{ok: boolean, error: ?string, url: ?string, ruta: ?string}}
 *     Resultado.
 */
function validarUrlCarpeta(url, siteUrl) {
  const no = (error) => ({ok: false, error, url: null, ruta: null});
  const texto = String(url || "").trim();
  let u;
  try {
    u = new URL(texto);
  } catch (e) {
    return no("La URL de la carpeta no es válida.");
  }
  if (u.protocol !== "https:" || !/\.sharepoint\.com$/i.test(u.hostname)) {
    return no("La URL debe ser https y de *.sharepoint.com.");
  }
  if (siteUrl && !texto.toLowerCase().startsWith(
      String(siteUrl).replace(/\/+$/, "").toLowerCase())) {
    return no("La carpeta debe estar dentro del sitio de la fuente " +
        "documental del Mandante.");
  }
  const ruta = carpetaDeUrlSharePoint(texto);
  if (!ruta) return no("No se reconoce la carpeta en la URL.");
  return {ok: true, error: null, url: texto, ruta};
}

/**
 * Cambios al mapeo de una carpeta: {requerimientoId: [{ruta, tipo, origen}]
 * | null} (null o [] lo quita). Las entradas nuevas quedan con su origen
 * ("sugerencia" o "manual") y quien las confirma; las rutas que ya estaban
 * conservan su confirmación.
 * @param {*} cambios Cambios recibidos.
 * @param {Object} actual Mapeo actual.
 * @param {{uid: string, ahora: *}} sello Quién y cuándo.
 * @return {{ok: boolean, error: ?string, valor: ?Object}} Mapeo resultante.
 */
function aplicarCambiosMapeo(cambios, actual, {uid, ahora}) {
  const error = (mensaje) => ({ok: false, error: mensaje, valor: null});
  if (!cambios || typeof cambios !== "object" || Array.isArray(cambios)) {
    return error("El mapeo no es válido.");
  }
  const salida = {...(actual || {})};
  for (const [id, entradas] of Object.entries(cambios)) {
    if (!RE_REQUERIMIENTO.test(id)) {
      return error("Identificador de requerimiento no válido.");
    }
    if (entradas === null || (Array.isArray(entradas) && !entradas.length)) {
      delete salida[id];
      continue;
    }
    if (!Array.isArray(entradas) || entradas.length > MAX_ENTRADAS) {
      return error("Las entradas del mapeo no son válidas.");
    }
    const previas = new Map((salida[id] || []).map((e) => [e.ruta, e]));
    const lista = [];
    for (const e of entradas) {
      const r = validarRutaRelativa(e?.ruta);
      if (!r.ok) return error(r.error);
      if (!r.valor) return error("Cada entrada del mapeo necesita su ruta.");
      const tipo = e?.tipo || "carpeta";
      if (!TIPOS_ENTRADA.includes(tipo)) {
        return error("El tipo de la entrada debe ser carpeta o archivo.");
      }
      if (lista.some((x) => x.ruta === r.valor)) continue;
      const previa = previas.get(r.valor);
      // Origen "sugerencia" si se confirmó una sugerencia (o una copia de
      // mapeo); si no, "manual".
      lista.push(previa && previa.tipo === tipo ? previa : {ruta: r.valor,
        tipo, origen: e?.origen === "sugerencia" ? "sugerencia" : "manual",
        confirmadoPor: uid, confirmadoAt: ahora});
    }
    salida[id] = lista;
  }
  if (Object.keys(salida).length > MAX_REQUERIMIENTOS) {
    return error("Demasiados requerimientos en el mapeo.");
  }
  return {ok: true, error: null, valor: salida};
}

/**
 * ¿`ruta` está dentro de `base` (descendiente, no igual)? Por prefijo, sin
 * leer el disco.
 * @param {string} ruta Ruta.
 * @param {string} base Carpeta.
 * @return {boolean} Si está dentro.
 */
const dentroDe = (ruta, base) => Boolean(base) && ruta.startsWith(`${base}/`);

/**
 * Reglas de asignación del mapeo documental sobre el estado FINAL de la
 * carpeta (mapeo, carpeta del personal y de maquinarias):
 *  - un nodo (ruta) pertenece a un solo requerimiento;
 *  - una carpeta asignada incluye todo su contenido: no se asigna un nodo
 *    dentro de otro ya asignado (ni en el mismo requerimiento);
 *  - la carpeta del personal / de maquinarias no se asigna, ni una carpeta
 *    que la contenga; dentro de ellas, sus subcarpetas (personas o
 *    maquinarias) y lo que hay en ellas no se asignan (se mapean por
 *    patrón); sí sus archivos sueltos;
 *  - la carpeta del personal y la de maquinarias son distintas y no una
 *    dentro de la otra.
 * @param {Object} estado {mapeo: {requerimientoId: [{ruta, tipo}]},
 *     carpetaPersonas: ?string, carpetaRecursos: ?string}.
 * @param {function(string): string} [nombreDe] Nombre de un requerimiento.
 * @return {?string} Mensaje del primer problema, o null.
 */
function validarAsignaciones({mapeo, carpetaPersonas, carpetaRecursos},
    nombreDe = (id) => id) {
  const bases = [
    {ruta: carpetaPersonas || null, nombre: "la carpeta del personal",
      sujetos: "personas"},
    {ruta: carpetaRecursos || null, nombre: "la carpeta de maquinarias",
      sujetos: "maquinarias"},
  ].filter((b) => b.ruta);
  if (bases.length === 2 && (bases[0].ruta === bases[1].ruta ||
      dentroDe(bases[0].ruta, bases[1].ruta) ||
      dentroDe(bases[1].ruta, bases[0].ruta))) {
    return "La carpeta del personal y la de maquinarias deben ser carpetas " +
        "distintas, y una no puede estar dentro de la otra.";
  }
  const entradas = [];
  Object.entries(mapeo || {}).forEach(([id, lista]) => (lista || [])
      .forEach((e) => entradas.push({id, ruta: e.ruta,
        tipo: e.tipo === "archivo" ? "archivo" : "carpeta"})));
  const porRuta = new Map();
  for (const e of entradas) {
    const previa = porRuta.get(e.ruta);
    if (previa && previa.id !== e.id) {
      return `«${e.ruta}» ya está asignada a «${nombreDe(previa.id)}»: ` +
          "un nodo pertenece a un solo requerimiento.";
    }
    porRuta.set(e.ruta, e);
  }
  for (const e of entradas) {
    const contenedora = entradas.find((x) => x.tipo === "carpeta" &&
        dentroDe(e.ruta, x.ruta));
    if (contenedora) {
      return `«${e.ruta}» está dentro de «${contenedora.ruta}», asignada a ` +
          `«${nombreDe(contenedora.id)}». Para asignarla por separado, quite ` +
          "primero la asignación de la carpeta.";
    }
    for (const b of bases) {
      if (e.ruta === b.ruta) {
        return `«${e.ruta}» es ${b.nombre}: no se asigna a un requerimiento.`;
      }
      if (dentroDe(b.ruta, e.ruta)) {
        return `«${e.ruta}» contiene ${b.nombre}: no se asigna a un ` +
            "requerimiento de Empresa.";
      }
      if (dentroDe(e.ruta, b.ruta)) {
        const resto = e.ruta.slice(b.ruta.length + 1);
        if (e.tipo === "carpeta" || resto.includes("/")) {
          return `«${e.ruta}» es de las ${b.sujetos} de ${b.nombre}: se ` +
              "mapea por patrón, no a un requerimiento de Empresa.";
        }
      }
    }
  }
  return null;
}

module.exports = {
  idCarpeta, validarRutaCarpeta, nombreDeRuta, claveIdCarpeta,
  referenciaCarpeta,
  validarUrlCarpeta, aplicarCambiosMapeo,
  validarAsignaciones, dentroDe,
};
