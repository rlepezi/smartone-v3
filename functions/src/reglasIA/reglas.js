const {VERIFICACIONES, validarParametros, camposDe} =
    require("./verificaciones");
const {validarEntidades} = require("./tiposDocumentales");

// Biblioteca de reglas de revisión IA: validación de una regla. Función PURA.
//  - determinística: la IA extrae y el código verifica (verificación del
//    catálogo + parámetros por defecto según su esquema).
//  - interpretativa: la IA juzga con una instrucción en lenguaje natural.
// La severidad y los parámetros de cada requerimiento van en el vínculo
// requerimiento ↔ regla, no aquí (aquí solo los valores por defecto).

const TIPOS_REGLA = ["deterministica", "interpretativa"];
const MIN_INSTRUCCION = 20;
const MAX_INSTRUCCION = 4000;
const RE_CLAVE = /^[a-zA-Z][a-zA-Z0-9_]{0,39}$/;

/**
 * Valida y normaliza una regla recibida del cliente.
 * @param {Object} entrada {nombre, descripcion, tipo, verificacion,
 *     instruccionIA, camposRequeridos, parametros, entidades}.
 * @return {{ok: boolean, error: ?string, valor: ?Object}} Resultado.
 */
function validarRegla(entrada) {
  const error = (mensaje) => ({ok: false, error: mensaje, valor: null});
  const e = entrada || {};
  const nombre = String(e.nombre || "").trim();
  if (!nombre || nombre.length > 120) {
    return error("El nombre es obligatorio (máx. 120 caracteres).");
  }
  const descripcion = String(e.descripcion || "").trim();
  if (descripcion.length > 1000) {
    return error("La descripción admite hasta 1000 caracteres.");
  }
  if (!TIPOS_REGLA.includes(e.tipo)) {
    return error("El tipo debe ser 'deterministica' o 'interpretativa'.");
  }
  const ent = validarEntidades(e.entidades);
  if (!ent.ok) return error(ent.error);

  if (e.tipo === "deterministica") {
    const v = VERIFICACIONES[e.verificacion];
    if (!v) return error("Elija una verificación válida.");
    const fueraDeAlcance = ent.valor.filter((x) => !v.entidades.includes(x));
    if (fueraDeAlcance.length) {
      return error(`La verificación "${v.nombre}" no aplica a: ` +
          `${fueraDeAlcance.join(", ")}.`);
    }
    const p = validarParametros(e.verificacion, e.parametros);
    if (!p.ok) return error(p.error);
    return {ok: true, error: null, valor: {
      nombre, descripcion, tipo: e.tipo, verificacion: e.verificacion,
      instruccionIA: null, camposRequeridos: camposDe(e.verificacion, p.valor),
      parametros: p.valor, entidades: ent.valor,
    }};
  }

  const instruccion = String(e.instruccionIA || "").trim();
  if (instruccion.length < MIN_INSTRUCCION) {
    return error(`La instrucción para la IA debe tener al menos ` +
        `${MIN_INSTRUCCION} caracteres.`);
  }
  if (instruccion.length > MAX_INSTRUCCION) {
    return error(`La instrucción admite hasta ${MAX_INSTRUCCION} caracteres.`);
  }
  const campos = Array.isArray(e.camposRequeridos) ?
    [...new Set(e.camposRequeridos.map((c) => String(c).trim()))]
        .filter(Boolean) : [];
  const invalido = campos.find((c) => !RE_CLAVE.test(c));
  if (invalido) return error(`Clave de campo no válida: "${invalido}".`);
  return {ok: true, error: null, valor: {
    nombre, descripcion, tipo: e.tipo, verificacion: null,
    instruccionIA: instruccion, camposRequeridos: campos, parametros: {},
    entidades: ent.valor,
  }};
}

module.exports = {TIPOS_REGLA, MIN_INSTRUCCION, validarRegla};
