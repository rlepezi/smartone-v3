const AppError = require("./AppError");

// Validación y normalización de una Plantilla de Estructura de carpetas.
// Función pura: la usan la importación (archivo JSON) y la edición.

const TIPOS_SECCION = ["archivos", "entidades", "grupos", "subcontratos"];
const ENTIDADES = ["persona", "maquinaria"];
const RE_CLAVE = /^[a-z0-9_]{2,40}$/;
// Estado de un nodo: "retirado" = quitado de la plantilla sin borrarlo (su
// clave queda reservada y sus vínculos con requerimientos, inactivos).
const ESTADOS_NODO = ["activo", "retirado"];
const estadoNodo = (v) => (v === "retirado" ? "retirado" : "activo");

const listaTexto = (valor) => [...new Set((Array.isArray(valor) ? valor : [])
    .map((x) => String(x || "").trim()).filter(Boolean))];

const texto = (valor, campo, max = 120) => {
  const t = String(valor || "").trim();
  if (!t) throw new AppError(400, `Falta ${campo}.`);
  if (t.length > max) {
    throw new AppError(400, `${campo} no puede exceder ${max} caracteres.`);
  }
  return t;
};

/**
 * Documento esperado normalizado.
 * @param {Object} d Documento.
 * @param {string} donde Sección (para el mensaje de error).
 * @return {Object} Documento.
 */
function normalizarDocumento(d, donde) {
  const clave = String(d?.clave || "").trim();
  if (!RE_CLAVE.test(clave)) {
    throw new AppError(400, `Clave de documento inválida en ${donde}: ` +
        `"${clave}" (minúsculas, números y _).`);
  }
  return {
    clave,
    nombre: texto(d.nombre, `el nombre del documento ${clave}`),
    alias: listaTexto(d.alias),
    excluir: listaTexto(d.excluir),
    obligatorio: Boolean(d.obligatorio),
    multiple: Boolean(d.multiple),
    tipoDocumentalCodigo: d.tipoDocumentalCodigo ?
        String(d.tipoDocumentalCodigo).trim() : null,
    requerimientoId: d.requerimientoId || null,
    datosSensibles: Boolean(d.datosSensibles),
    // Habilitación (ausente = habilitado).
    habilitado: d.habilitado !== false,
    estado: estadoNodo(d.estado),
  };
}

/**
 * Valida y normaliza una plantilla (nombre, profundidad de subcontratos y
 * secciones con sus documentos). Claves únicas por nivel.
 * @param {Object} entrada Plantilla.
 * @return {Object} {nombre, profundidadSubcontratos, secciones}.
 */
function validarPlantilla(entrada) {
  const p = entrada || {};
  const nombre = texto(p.nombre, "el nombre de la plantilla");
  const profundidad = p.profundidadSubcontratos ?? 1;
  if (!(Number.isInteger(profundidad) && profundidad >= 0 &&
      profundidad <= 3)) {
    throw new AppError(400,
        "La profundidad de subcontratos debe ser un entero de 0 a 3.");
  }
  if (!Array.isArray(p.secciones) || !p.secciones.length) {
    throw new AppError(400, "La plantilla debe tener al menos una sección.");
  }
  const claves = new Set();
  const secciones = p.secciones.map((s) => {
    const clave = String(s?.clave || "").trim();
    if (!RE_CLAVE.test(clave)) {
      throw new AppError(400, `Clave de sección inválida: "${clave}" ` +
          "(minúsculas, números y _).");
    }
    if (claves.has(clave)) {
      throw new AppError(400, `La sección "${clave}" está repetida.`);
    }
    claves.add(clave);
    if (!TIPOS_SECCION.includes(s.tipo)) {
      throw new AppError(400, `Tipo de sección inválido en ${clave}. ` +
          `Valores: ${TIPOS_SECCION.join(", ")}.`);
    }
    const entidad = s.tipo === "entidades" ? s.entidad : null;
    if (s.tipo === "entidades" && !ENTIDADES.includes(entidad)) {
      throw new AppError(400, `La sección ${clave} es de entidades: indique ` +
          "persona o maquinaria.");
    }
    const min = Number(s.cardinalidad?.min ?? 0);
    const maxBruto = s.cardinalidad?.max;
    const max = maxBruto === null || maxBruto === undefined || maxBruto === "" ?
        null : Number(maxBruto);
    if (!(Number.isInteger(min) && min >= 0) ||
        (max !== null && !(Number.isInteger(max) && max >= min))) {
      throw new AppError(400, `Cardinalidad inválida en ${clave}.`);
    }
    const clavesDoc = new Set();
    const unicos = (docs) => docs.map((d) => {
      const doc = normalizarDocumento(d, clave);
      if (clavesDoc.has(doc.clave)) {
        throw new AppError(400,
            `El documento "${doc.clave}" está repetido en ${clave}.`);
      }
      clavesDoc.add(doc.clave);
      return doc;
    });
    return {
      clave,
      nombre: texto(s.nombre, `el nombre de la sección ${clave}`),
      alias: listaTexto(s.alias),
      numeroSugerido: s.numeroSugerido ? String(s.numeroSugerido).trim() : null,
      obligatoria: Boolean(s.obligatoria),
      tipo: s.tipo,
      entidad,
      rolEntidad: entidad === "persona" && s.rolEntidad ?
          String(s.rolEntidad).trim() : null,
      cardinalidad: {min, max},
      archivosSeccion: unicos(Array.isArray(s.archivosSeccion) ?
          s.archivosSeccion : []),
      documentos: unicos(Array.isArray(s.documentos) ? s.documentos : []),
      requerimientoId: s.requerimientoId || null,
      nota: s.nota ? String(s.nota).trim() : null,
      habilitada: s.habilitada !== false,
      multiple: Boolean(s.multiple),
      datosSensibles: Boolean(s.datosSensibles),
      estado: estadoNodo(s.estado),
    };
  });
  return {nombre, profundidadSubcontratos: profundidad, secciones};
}

// ── Nodos de la plantilla ──
// nodoClave: "seccion" para una sección y "seccion/documento" para un
// archivo suelto o un documento. Es inmutable y única en la plantilla.
//  - seccion: carpeta de la sección (nivel Empresa);
//  - archivoSuelto: archivo de la sección (archivosSeccion, o documentos de
//    una sección que no es de entidades) → Empresa;
//  - documentoEntidad: documento dentro de la subcarpeta de cada persona o
//    maquinaria de una sección de entidades → Persona / Maquinaria.

const claveNodo = (seccionClave, documentoClave = null) =>
  (documentoClave ? `${seccionClave}/${documentoClave}` : seccionClave);

/**
 * Nivel de requerimiento compatible con un nodo.
 * @param {string} tipoNodo "seccion" | "archivoSuelto" | "documentoEntidad".
 * @param {?string} entidad "persona" | "maquinaria" (documentoEntidad).
 * @return {string} "empresa" | "persona" | "maquinaria".
 */
function nivelDeNodo(tipoNodo, entidad = null) {
  if (tipoNodo !== "documentoEntidad") return "empresa";
  return entidad === "maquinaria" ? "maquinaria" : "persona";
}

// tipoEntidad del requerimiento ↔ nivel del nodo.
const NIVEL_POR_TIPO_ENTIDAD = {empresa: "empresa", persona: "persona",
  recurso: "maquinaria"};

/**
 * Todos los nodos de una plantilla (activos y retirados), planos y en
 * orden, con lo necesario para el mapeo y el resolvedor.
 * @param {?Object} plantilla Plantilla.
 * @return {Array<Object>} [{nodoClave, tipoNodo, seccionClave, clave,
 *     nombre, ruta, alias, excluir, multiple, datosSensibles,
 *     tipoDocumentalCodigo, habilitado, estado, nivel, entidad,
 *     seccionTipo, orden}].
 */
function nodosDe(plantilla) {
  const salida = [];
  let orden = 0;
  (plantilla?.secciones || []).forEach((s) => {
    const seccionActiva = estadoNodo(s.estado) === "activo";
    const seccionHabilitada = s.habilitada !== false;
    salida.push({nodoClave: claveNodo(s.clave), tipoNodo: "seccion",
      seccionClave: s.clave, clave: s.clave, nombre: s.nombre,
      ruta: s.nombre, alias: s.alias || [], excluir: [],
      multiple: Boolean(s.multiple), datosSensibles: Boolean(s.datosSensibles),
      tipoDocumentalCodigo: null, habilitado: seccionHabilitada,
      estado: estadoNodo(s.estado), nivel: "empresa",
      entidad: s.entidad || null,
      seccionTipo: s.tipo, orden: orden++});
    [["archivosSeccion", false], ["documentos", s.tipo === "entidades"]]
        .forEach(([lista, deEntidad]) => (s[lista] || []).forEach((d) => {
          const tipoNodo = deEntidad ? "documentoEntidad" : "archivoSuelto";
          salida.push({nodoClave: claveNodo(s.clave, d.clave), tipoNodo,
            seccionClave: s.clave, clave: d.clave, nombre: d.nombre,
            ruta: `${s.nombre} › ${d.nombre}`, alias: d.alias || [],
            excluir: d.excluir || [], multiple: Boolean(d.multiple),
            datosSensibles: Boolean(d.datosSensibles),
            tipoDocumentalCodigo: d.tipoDocumentalCodigo || null,
            habilitado: seccionHabilitada && d.habilitado !== false,
            estado: seccionActiva ? estadoNodo(d.estado) : "retirado",
            nivel: nivelDeNodo(tipoNodo, s.entidad), entidad: s.entidad || null,
            seccionTipo: s.tipo, orden: orden++});
        }));
  });
  return salida;
}

/**
 * Valida el paso de una versión a otra: ninguna clave desaparece (se
 * retira), ninguna clave nueva reutiliza una retirada y cada nodoClave es
 * única en la plantilla.
 * @param {?Object} previa Plantilla vigente.
 * @param {Object} nueva Plantilla validada (validarPlantilla).
 * @return {{retirados: string[], reactivados: string[]}} Cambios de estado.
 */
function validarCambioEstructura(previa, nueva) {
  const antes = new Map(nodosDe(previa).map((n) => [n.nodoClave, n]));
  const despues = nodosDe(nueva);
  const vistas = new Set();
  despues.forEach((n) => {
    if (vistas.has(n.nodoClave)) {
      throw new AppError(400, `La clave "${n.nodoClave}" está repetida.`);
    }
    vistas.add(n.nodoClave);
  });
  const faltan = [...antes.keys()].filter((k) => !vistas.has(k));
  if (faltan.length) {
    throw new AppError(400, "No se puede quitar ni renombrar la clave de un " +
        `nodo: retírelo en su lugar (${faltan.join(", ")}).`);
  }
  const retirados = [];
  const reactivados = [];
  despues.forEach((n) => {
    const previo = antes.get(n.nodoClave);
    if (!previo) return;
    if (previo.tipoNodo !== n.tipoNodo) {
      throw new AppError(400, `El nodo "${n.nodoClave}" no puede cambiar de ` +
          "tipo (retírelo y cree otro).");
    }
    if (previo.estado === "activo" && n.estado === "retirado") {
      retirados.push(n.nodoClave);
    }
    if (previo.estado === "retirado" && n.estado === "activo") {
      reactivados.push(n.nodoClave);
    }
  });
  return {retirados, reactivados};
}

module.exports = {
  TIPOS_SECCION, ESTADOS_NODO, NIVEL_POR_TIPO_ENTIDAD, validarPlantilla,
  claveNodo, nivelDeNodo, nodosDe, validarCambioEstructura,
};
