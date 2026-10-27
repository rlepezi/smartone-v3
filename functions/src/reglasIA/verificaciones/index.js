const {
  coincideRut, coincideNombre, coincidePatente, coincideEmpresa,
} = require("./identidad");
const {
  vigenteAFecha, vigenteHastaFinProyecto, antiguedadMaxima,
} = require("./fechas");
const {cumple, noCumple, noDeterminable, valorDe} = require("./comunes");

// Registro de verificaciones determinísticas: la IA solo extrae los campos y
// el código verifica. Cada una es una función pura
//   (camposExtraidos, contexto, parametros) → {resultado, detalle}
// con resultado "cumple" | "no_cumple" | "no_determinable". El esquema de
// parámetros viaja al frontend para armar el formulario.
//
// Esquema de un parámetro: {tipo: "numero" | "opcion" | "campo" | "lista",
// etiqueta, requerido, default, min, max, opciones: [{valor, etiqueta}]}.
// "lista": textos cortos (se guardan en mayúsculas, sin repetir).

/**
 * El campo indicado viene en el documento. Aquí la ausencia ES lo que se
 * verifica (no_cumple); sin parámetro, no_determinable.
 * @param {Object} campos Campos extraídos.
 * @param {Object} contexto No se usa.
 * @param {Object} parametros {campo}.
 * @return {{resultado: string, detalle: string}} Resultado.
 */
function campoPresente(campos, contexto, parametros) {
  const clave = parametros?.campo;
  if (!clave) return noDeterminable("Falta indicar el campo.");
  return valorDe(campos, clave) !== null ?
    cumple(`El campo ${clave} está presente.`) :
    noCumple(`El documento no trae el campo ${clave}.`);
}

/**
 * Alguna clase de la licencia está entre las aceptadas (equivale a LC-04 del
 * motor de carpetas).
 * @param {Object} campos Campos extraídos ({clases}: texto o lista).
 * @param {Object} contexto No se usa.
 * @param {Object} parametros {clases: Array<string>}.
 * @return {{resultado: string, detalle: string}} Resultado.
 */
function clasesAceptadas(campos, contexto, parametros) {
  const aceptadas = parametros?.clases || [];
  if (!aceptadas.length) return noDeterminable("Faltan las clases aceptadas.");
  const valor = valorDe(campos, "clases");
  const leidas = (Array.isArray(valor) ? valor : String(valor ?? "")
      .split(/[\s,;/]+/)).map((c) => String(c).trim().toUpperCase())
      .filter(Boolean);
  if (!leidas.length) return noDeterminable("No se pudieron leer las clases.");
  const calzan = leidas.filter((c) => aceptadas.includes(c));
  return calzan.length ?
    cumple(`Clase ${calzan.join(", ")} aceptada.`) :
    noCumple(`Clases ${leidas.join(", ")}; se requiere ` +
        `${aceptadas.join(" o ")}.`);
}

const TODAS = ["persona", "empresa", "recurso"];

const VERIFICACIONES = {
  coincide_rut: {
    nombre: "RUT coincide",
    descripcion: "El RUT del documento es válido y coincide con el de la " +
        "persona o empresa evaluada.",
    campos: ["rut"], contexto: ["rut"], entidades: ["persona", "empresa"],
    parametros: {}, verificar: coincideRut,
  },
  coincide_nombre: {
    nombre: "Nombre coincide",
    descripcion: "El nombre del documento coincide con el de la persona.",
    campos: ["nombre"], contexto: ["nombre"], entidades: ["persona"],
    parametros: {
      tolerancia: {tipo: "opcion", etiqueta: "Tolerancia", requerido: true,
        default: "tokens", opciones: [
          {valor: "tokens", etiqueta: "Por palabras (sin importar el orden)"},
          {valor: "estricta", etiqueta: "Estricta (nombre idéntico)"},
        ]},
    },
    verificar: coincideNombre,
  },
  vigente_a_fecha: {
    nombre: "Vigente a la fecha",
    descripcion: "La fecha de vencimiento es posterior a la fecha de " +
        "evaluación (más un margen opcional).",
    campos: ["fechaVencimiento"], contexto: ["fechaEvaluacion"],
    entidades: TODAS,
    parametros: {
      diasMargen: {tipo: "numero", etiqueta: "Días de margen",
        requerido: false, default: 0, min: 0, max: 365},
    },
    verificar: vigenteAFecha,
  },
  vigente_hasta_fin_proyecto: {
    nombre: "Vigente hasta el fin del proyecto",
    descripcion: "La fecha de vencimiento es igual o posterior a la fecha " +
        "de término del proyecto.",
    campos: ["fechaVencimiento"], contexto: ["fechaTerminoProyecto"],
    entidades: TODAS, parametros: {}, verificar: vigenteHastaFinProyecto,
  },
  antiguedad_maxima: {
    nombre: "Antigüedad máxima",
    descripcion: "El documento no tiene más días de emitido que el máximo " +
        "indicado.",
    campos: ["fechaEmision"], contexto: ["fechaEvaluacion"], entidades: TODAS,
    parametros: {
      diasMaximos: {tipo: "numero", etiqueta: "Días máximos desde la emisión",
        requerido: true, default: null, min: 1, max: 3650},
    },
    verificar: antiguedadMaxima,
  },
  campo_presente: {
    nombre: "Campo presente",
    descripcion: "El documento trae el campo indicado.",
    campos: [], contexto: [], entidades: TODAS,
    parametros: {
      campo: {tipo: "campo", etiqueta: "Campo", requerido: true,
        default: null},
    },
    verificar: campoPresente,
  },
  clases_aceptadas: {
    nombre: "Clase de licencia aceptada",
    descripcion: "Alguna clase de la licencia está entre las aceptadas por " +
        "el requerimiento.",
    campos: ["clases"], contexto: [], entidades: ["persona"],
    parametros: {
      clases: {tipo: "lista", etiqueta: "Clases aceptadas (p. ej. B, D)",
        requerido: true, default: null},
    },
    verificar: clasesAceptadas,
  },
  coincide_patente: {
    nombre: "Patente coincide",
    descripcion: "La patente del documento coincide con la del recurso.",
    campos: ["patente"], contexto: ["patente"], entidades: ["recurso"],
    parametros: {}, verificar: coincidePatente,
  },
  coincide_empresa: {
    nombre: "Empleador coincide con la empresa",
    descripcion: "El RUT del empleador del documento coincide con la " +
        "empresa del expediente.",
    campos: ["rutEmpleador"], contexto: ["rutEmpresa"],
    entidades: ["persona", "recurso"], parametros: {},
    verificar: coincideEmpresa,
  },
};

/**
 * Valida y completa (con defaults) los parámetros de una verificación.
 * @param {string} clave Verificación.
 * @param {*} parametros Parámetros recibidos.
 * @return {{ok: boolean, error: ?string, valor: ?Object}} Resultado.
 */
function validarParametros(clave, parametros) {
  const v = VERIFICACIONES[clave];
  if (!v) {
    return {ok: false, error: `Verificación no válida: ${clave}.`,
      valor: null};
  }
  const entrada = parametros && typeof parametros === "object" ?
    parametros : {};
  const valor = {};
  for (const [nombre, esquema] of Object.entries(v.parametros)) {
    let x = entrada[nombre];
    if (esquema.tipo === "lista" && x !== undefined && x !== null) {
      x = [...new Set((Array.isArray(x) ? x : String(x).split(","))
          .map((c) => String(c).trim().toUpperCase()).filter(Boolean))];
      if (!x.length) x = null;
    }
    if (x === undefined || x === null || x === "") x = esquema.default;
    if (x === undefined || x === null || x === "") {
      if (esquema.requerido) {
        return {ok: false, error: `Falta el parámetro "${esquema.etiqueta}".`,
          valor: null};
      }
      continue;
    }
    if (esquema.tipo === "numero") {
      const n = Number(x);
      if (!Number.isInteger(n) || (esquema.min !== undefined &&
          n < esquema.min) || (esquema.max !== undefined && n > esquema.max)) {
        return {ok: false, error: `"${esquema.etiqueta}" debe ser un entero ` +
            `entre ${esquema.min} y ${esquema.max}.`, valor: null};
      }
      x = n;
    } else if (esquema.tipo === "opcion") {
      if (!esquema.opciones.some((o) => o.valor === x)) {
        return {ok: false, error: `"${esquema.etiqueta}" no es válido.`,
          valor: null};
      }
    } else if (esquema.tipo === "lista") {
      if (x.length > 20 || x.some((c) => c.length > 20)) {
        return {ok: false, error: `"${esquema.etiqueta}": máximo 20 ` +
            "valores de hasta 20 caracteres.", valor: null};
      }
    } else if (esquema.tipo === "campo") {
      x = String(x).trim();
      if (!/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/.test(x)) {
        return {ok: false, error: `"${esquema.etiqueta}" no es una clave de ` +
            "campo válida.", valor: null};
      }
    }
    valor[nombre] = x;
  }
  return {ok: true, error: null, valor};
}

/**
 * Campos que necesita una regla determinística (campo_presente: el del
 * parámetro).
 * @param {string} clave Verificación.
 * @param {Object} parametros Parámetros ya validados.
 * @return {Array<string>} Claves de campo.
 */
function camposDe(clave, parametros) {
  if (clave === "campo_presente") {
    return parametros?.campo ? [parametros.campo] : [];
  }
  return [...(VERIFICACIONES[clave]?.campos || [])];
}

/**
 * Ejecuta una verificación. Nunca lanza: un error interno es
 * no_determinable.
 * @param {string} clave Verificación.
 * @param {Object} campos Campos extraídos.
 * @param {Object} contexto Contexto.
 * @param {Object} parametros Parámetros.
 * @return {{resultado: string, detalle: string}} Resultado.
 */
function ejecutar(clave, campos, contexto, parametros) {
  const v = VERIFICACIONES[clave];
  if (!v) return noDeterminable(`Verificación desconocida: ${clave}.`);
  try {
    return v.verificar(campos || {}, contexto || {}, parametros || {});
  } catch (e) {
    return noDeterminable("No se pudo verificar.");
  }
}

/**
 * Registro para el frontend (sin las funciones).
 * @return {Array<Object>} [{clave, nombre, descripcion, campos, contexto,
 *     entidades, parametros}].
 */
function catalogo() {
  return Object.entries(VERIFICACIONES).map(([clave, v]) => ({
    clave, nombre: v.nombre, descripcion: v.descripcion, campos: v.campos,
    contexto: v.contexto, entidades: v.entidades, parametros: v.parametros,
  }));
}

module.exports = {VERIFICACIONES, validarParametros, camposDe, ejecutar,
  catalogo};
