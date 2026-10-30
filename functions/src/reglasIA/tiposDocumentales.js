// Tipos documentales para las reglas de revisión IA: a qué entidades aplican
// y qué campos extrae la IA de cada uno. Funciones PURAS.
//
// Sin migración: un tipo que aún no tiene `entidades` o `campos` en
// Firestore se lee con los valores base de abajo (los tipos existentes son
// de persona). Se editan desde Configuración IA › Tipos documentales.

// Mismos valores que `tipoEntidad` de los requerimientos ("recurso" =
// Maquinaria).
const ENTIDADES = ["persona", "empresa", "recurso"];
const TIPOS_CAMPO = ["rut", "texto", "fecha", "patente", "numero"];
// Estados IA del tipo que permiten usarlo con IA ("no_normalizado" no).
const ESTADOS_IA_HABILITADOS = ["piloto", "activo"];

const campo = (clave, etiqueta, tipo) => ({clave, etiqueta, tipo});
const BASE = {
  CEDULA_CL: {
    entidades: ["persona"],
    campos: [
      campo("rut", "RUT", "rut"),
      campo("nombre", "Nombre completo", "texto"),
      campo("fechaNacimiento", "Fecha de nacimiento", "fecha"),
      campo("fechaEmision", "Fecha de emisión", "fecha"),
      campo("fechaVencimiento", "Fecha de vencimiento", "fecha"),
      campo("numeroDocumento", "Número de documento", "texto"),
    ],
  },
  LICENCIA_CL: {
    entidades: ["persona"],
    campos: [
      campo("rut", "RUT", "rut"),
      campo("nombre", "Nombre completo", "texto"),
      campo("clases", "Clases", "texto"),
      campo("fechaEmision", "Fecha del último control", "fecha"),
      campo("fechaVencimiento", "Fecha del próximo control", "fecha"),
      campo("restricciones", "Restricciones", "texto"),
    ],
  },
};

/**
 * Tipo documental con entidades y campos (los guardados, o los base).
 * @param {Object} tipo Documento de tiposDocumentales.
 * @return {Object} Tipo con `entidades` y `campos` siempre presentes.
 */
function conDefaults(tipo) {
  const base = BASE[tipo?.codigo] || {entidades: ["persona"], campos: []};
  return {
    ...tipo,
    entidades: Array.isArray(tipo?.entidades) && tipo.entidades.length ?
      tipo.entidades : base.entidades,
    campos: Array.isArray(tipo?.campos) && tipo.campos.length ?
      tipo.campos : base.campos,
  };
}

/**
 * ¿El tipo se puede usar con IA para esta entidad? Activo, con estado IA
 * habilitado (piloto o activo) y la entidad entre las suyas.
 * @param {Object} tipo Tipo (con o sin defaults).
 * @param {?string} entidad Entidad, o null para no filtrar por entidad.
 * @return {boolean} true si está disponible.
 */
function disponibleParaIA(tipo, entidad = null) {
  const t = conDefaults(tipo);
  return t.estado === "activo" && ESTADOS_IA_HABILITADOS.includes(t.estadoIA) &&
    (!entidad || t.entidades.includes(entidad));
}

/**
 * Valida la lista de entidades.
 * @param {*} entidades Valor recibido.
 * @return {{ok: boolean, error: ?string, valor: ?Array<string>}} Resultado.
 */
function validarEntidades(entidades) {
  if (!Array.isArray(entidades) || !entidades.length) {
    return {ok: false, error: "Indique al menos una entidad.", valor: null};
  }
  const unicas = [...new Set(entidades.map(String))];
  const invalida = unicas.find((e) => !ENTIDADES.includes(e));
  if (invalida) {
    return {ok: false, error: `Entidad no válida: ${invalida}. Valores ` +
        `permitidos: ${ENTIDADES.join(", ")}.`, valor: null};
  }
  return {ok: true, error: null, valor: unicas};
}

/**
 * Valida los campos que extrae un tipo documental.
 * @param {*} campos [{clave, etiqueta, tipo}].
 * @return {{ok: boolean, error: ?string, valor: ?Array<Object>}} Resultado.
 */
function validarCampos(campos) {
  const error = (mensaje) => ({ok: false, error: mensaje, valor: null});
  if (!Array.isArray(campos) || !campos.length) {
    return error("Indique al menos un campo.");
  }
  if (campos.length > 40) return error("Máximo 40 campos por tipo.");
  const claves = new Set();
  const valor = [];
  for (const c of campos) {
    const clave = String(c?.clave || "").trim();
    const etiqueta = String(c?.etiqueta || "").trim();
    if (!/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/.test(clave)) {
      return error(`Clave de campo no válida: "${clave}". Use letras, ` +
          "números y _ (empieza con letra).");
    }
    if (claves.has(clave)) return error(`Campo repetido: ${clave}.`);
    if (!etiqueta || etiqueta.length > 60) {
      return error(`El campo ${clave} necesita una etiqueta (máx. 60).`);
    }
    if (!TIPOS_CAMPO.includes(c?.tipo)) {
      return error(`Tipo de campo no válido en ${clave}. Valores ` +
          `permitidos: ${TIPOS_CAMPO.join(", ")}.`);
    }
    claves.add(clave);
    valor.push({clave, etiqueta, tipo: c.tipo});
  }
  return {ok: true, error: null, valor};
}

module.exports = {
  ENTIDADES, TIPOS_CAMPO, ESTADOS_IA_HABILITADOS, conDefaults,
  disponibleParaIA, validarEntidades, validarCampos,
};
