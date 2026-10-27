const AppError = require("./AppError");

// Validación y normalización de una Plantilla de Estructura de carpetas.
// Función pura: la usan la importación (archivo JSON) y la edición.

const TIPOS_SECCION = ["archivos", "entidades", "grupos", "subcontratos"];
const ENTIDADES = ["persona", "maquinaria"];
const RE_CLAVE = /^[a-z0-9_]{2,40}$/;

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
    };
  });
  return {nombre, profundidadSubcontratos: profundidad, secciones};
}

module.exports = {TIPOS_SECCION, validarPlantilla};
