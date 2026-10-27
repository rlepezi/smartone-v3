const {cleanRut, validateRut} = require("../utils/rutValidator");

// Reglas de validación de Revisiones IA. Funciones PURAS (sin Firestore ni
// IA) para poder probarlas aisladas. Ninguna regla usa texto libre del
// modelo: solo campos estructurados (RUN, fechas, MRZ, clases, legibilidad).
// Fechas en formato AAAA-MM-DD.

const MS_DIA = 24 * 60 * 60 * 1000;
// Primer RUT en el nombre de una carpeta, con o sin puntos y guion.
const RE_RUT_CARPETA =
    /(?:^|[^\d.])(\d{1,2}(?:\.\d{3}){2}|\d{7,8})-?([\dkK])(?![\dA-Za-z])/;
const SIMILITUD_MINIMA_NOMBRE = 0.85;
const DIAS_ALERTA_POR_DEFECTO = 30;
const UMBRAL_LEGIBILIDAD_POR_DEFECTO = 0.8;
const RESULTADOS_REGLA = [
  "cumple", "no_cumple", "revision", "informativa", "no_aplica",
];

// Campo con conflicto entre piezas -> reglas que pasan a "revision".
const REGLAS_POR_CAMPO = {
  "run": ["CI-01", "CI-02", "LC-01", "LC-02"],
  "nombres": ["CI-03"],
  "apellidos": ["CI-03"],
  "cedula.fechaVencimiento": ["CI-04"],
  "cedula.numeroDocumento": ["CI-05"],
  "cedula.mrz": ["CI-05"],
  "fechaNacimiento": ["CI-05"],
  "licencia.fechaProximoControl": ["LC-03"],
  "licencia.clases": ["LC-04"],
};

/**
 * Valida un RUN chileno (módulo 11). Acepta con o sin puntos y guion, y
 * dígito verificador K (mayúscula o minúscula) o 0.
 * @param {?string} run RUN.
 * @return {boolean} true si es válido.
 */
function validarRun(run) {
  return typeof run === "string" && validateRut(run);
}

/**
 * Normaliza un RUN al formato 12345678-5 (sin puntos, DV en mayúscula).
 * @param {?string} run RUN en cualquier formato.
 * @return {?string} RUN normalizado, o null si no tiene forma de RUN.
 */
function normalizarRun(run) {
  const limpio = cleanRut(run || "");
  if (limpio.length < 8 || limpio.length > 9) return null;
  if (!/^\d+[\dK]$/.test(limpio)) return null;
  return `${limpio.slice(0, -1)}-${limpio.slice(-1)}`;
}

/**
 * Primer RUT del nombre de una carpeta ("12.345.678-5 Juan Pérez").
 * @param {?string} nombre Nombre de la carpeta.
 * @return {?string} RUT normalizado (sin validar el DV), o null.
 */
function extraerRunDeNombreCarpeta(nombre) {
  const m = String(nombre || "").match(RE_RUT_CARPETA);
  return m ? normalizarRun(`${m[1]}-${m[2]}`) : null;
}

/**
 * Normaliza un nombre: sin tildes, mayúsculas y espacios colapsados.
 * @param {?string} texto Nombre.
 * @return {string} Nombre normalizado.
 */
function normalizarNombre(texto) {
  return String(texto || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
      .toUpperCase().replace(/[^A-Z\s]/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Distancia de Levenshtein entre dos textos.
 * @param {string} a Texto.
 * @param {string} b Texto.
 * @return {number} Distancia.
 */
function levenshtein(a, b) {
  let previa = Array.from({length: b.length + 1}, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const actual = [i];
    for (let j = 1; j <= b.length; j++) {
      actual[j] = Math.min(
          previa[j] + 1, actual[j - 1] + 1,
          previa[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previa = actual;
  }
  return previa[b.length];
}

/**
 * Indica si dos nombres corresponden a la misma persona: todos los tokens
 * del más corto están en el más largo (orden libre, segundo nombre
 * opcional), o la similitud de Levenshtein es al menos 0.85.
 * @param {?string} a Nombre.
 * @param {?string} b Nombre.
 * @return {boolean} true si coinciden.
 */
function coincideNombre(a, b) {
  const na = normalizarNombre(a);
  const nb = normalizarNombre(b);
  if (!na || !nb) return false;
  const [corto, largo] = na.split(" ").length <= nb.split(" ").length ?
      [na, nb] : [nb, na];
  const tokensLargo = new Set(largo.split(" "));
  if (corto.split(" ").every((t) => tokensLargo.has(t))) return true;
  const similitud = 1 - levenshtein(na, nb) / Math.max(na.length, nb.length);
  return similitud >= SIMILITUD_MINIMA_NOMBRE;
}

/**
 * Dígito de control ICAO 9303 (pesos 7, 3, 1; dígitos = su valor, A–Z =
 * 10–35, "<" = 0).
 * @param {string} texto Campo.
 * @return {number} Dígito de control.
 */
function digitoControlMrz(texto) {
  const pesos = [7, 3, 1];
  let suma = 0;
  [...texto].forEach((c, i) => {
    let valor = 0;
    if (/\d/.test(c)) valor = Number(c);
    else if (/[A-Z]/.test(c)) valor = c.charCodeAt(0) - 55;
    suma += valor * pesos[i % 3];
  });
  return suma % 10;
}

/**
 * Indica si un dígito de control MRZ calza con su campo.
 * @param {string} campo Campo.
 * @param {string} digito Dígito leído.
 * @return {boolean} true si calza.
 */
function controlOk(campo, digito) {
  const leido = digito === "<" ? 0 : Number(digito);
  return /^[\d<]$/.test(digito) && digitoControlMrz(campo) === leido;
}

/**
 * AAMMDD de la MRZ a AAAA-MM-DD.
 * @param {string} aammdd Fecha MRZ.
 * @param {boolean} esNacimiento true: siglo según el año actual.
 * @param {Date} [hoy] Fecha de referencia.
 * @return {?string} Fecha ISO o null.
 */
function fechaMrzAIso(aammdd, esNacimiento, hoy = new Date()) {
  if (!/^\d{6}$/.test(aammdd)) return null;
  const aa = Number(aammdd.slice(0, 2));
  const actual = hoy.getUTCFullYear() % 100;
  const siglo = esNacimiento && aa > actual ? 1900 : 2000;
  return `${siglo + aa}-${aammdd.slice(2, 4)}-${aammdd.slice(4, 6)}`;
}

/**
 * Valida una MRZ TD1 (3 líneas de 30 caracteres): dígitos de control del
 * número de documento, fecha de nacimiento y fecha de vencimiento. El dígito
 * compuesto es opcional: si falla, solo se informa.
 * @param {?Array<string>} lineas Líneas transcritas.
 * @return {{formatoValido: boolean, valida: boolean, documento: boolean,
 *     nacimiento: boolean, vencimiento: boolean, compuesto: ?boolean,
 *     datos: ?Object}} Resultado y datos leídos de la MRZ.
 */
function validarMrzTd1(lineas) {
  const limpias = (lineas || []).map((l) => String(l || "")
      .toUpperCase().replace(/\s/g, ""));
  const formatoValido = limpias.length === 3 &&
      limpias.every((l) => /^[A-Z0-9<]{30}$/.test(l));
  if (!formatoValido) {
    return {
      formatoValido: false, valida: false, documento: false,
      nacimiento: false, vencimiento: false, compuesto: null, datos: null,
    };
  }
  const [l1, l2] = limpias;
  const documento = controlOk(l1.slice(5, 14), l1[14]);
  const nacimiento = controlOk(l2.slice(0, 6), l2[6]);
  const vencimiento = controlOk(l2.slice(8, 14), l2[14]);
  const compuesto = controlOk(
      l1.slice(5, 30) + l2.slice(0, 7) + l2.slice(8, 15) + l2.slice(18, 29),
      l2[29],
  );
  return {
    formatoValido, valida: documento && nacimiento && vencimiento,
    documento, nacimiento, vencimiento, compuesto,
    datos: {
      numeroDocumento: l1.slice(5, 14).replace(/</g, ""),
      fechaNacimiento: fechaMrzAIso(l2.slice(0, 6), true),
      fechaVencimiento: fechaMrzAIso(l2.slice(8, 14), false),
      run: runDesdeMrz(l1, l2),
    },
  };
}

/**
 * RUN en los datos opcionales de la MRZ de la cédula chilena (formato
 * <cuerpo><<DV>, ej. 12345678<5). Se busca primero en la línea 2 (datos
 * opcionales, posiciones 19 a 29) y luego en la línea 1 (posiciones 16 a
 * 30).
 * @param {string} l1 Línea 1.
 * @param {string} l2 Línea 2.
 * @return {?string} RUN normalizado (12345678-5) o null.
 */
function runDesdeMrz(l1, l2) {
  for (const opcional of [l2.slice(18, 29), l1.slice(15, 30)]) {
    const m = opcional.match(/(\d{7,8})<([\dK])/);
    if (m) return `${m[1]}-${m[2]}`;
  }
  return null;
}

/**
 * Vigencia de un documento.
 * @param {?string} fechaVencimiento AAAA-MM-DD.
 * @param {string} fechaEvaluacion AAAA-MM-DD.
 * @param {number} [diasAlerta] Días antes del vencimiento con alerta.
 * @return {?string} "vigente" | "por_vencer" | "vencido", o null sin fecha.
 */
function evaluarVigencia(fechaVencimiento, fechaEvaluacion,
    diasAlerta = DIAS_ALERTA_POR_DEFECTO) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaVencimiento || "")) return null;
  const dias = Math.round((Date.parse(`${fechaVencimiento}T00:00:00Z`) -
      Date.parse(`${fechaEvaluacion}T00:00:00Z`)) / MS_DIA);
  if (dias < 0) return "vencido";
  if (dias <= diasAlerta) return "por_vencer";
  return "vigente";
}

const regla = (codigo, resultado, detalle) =>
  ({regla: codigo, resultado, detalle});

/**
 * Regla informativa CI-07 / LC-07: la fecha del nombre del archivo (fecha
 * completa o solo el año) no coincide con la del documento. Solo se agrega
 * si difiere; no bloquea.
 * @param {string} codigo Código de la regla.
 * @param {?Array<string>} fechasEnNombre Fechas leídas de los nombres.
 * @param {?string} fechaDocumento Fecha del documento (AAAA-MM-DD).
 * @return {?Object} Resultado o null.
 */
function reglaFechaNombre(codigo, fechasEnNombre, fechaDocumento) {
  if (!fechaDocumento) return null;
  const distintas = (fechasEnNombre || []).filter(Boolean).filter((f) =>
    (f.length === 4 ? fechaDocumento.slice(0, 4) : fechaDocumento) !== f);
  if (!distintas.length) return null;
  return regla(codigo, "informativa", "La fecha del nombre del archivo " +
      `(${distintas.join(", ")}) no coincide con la del documento ` +
      `(${fechaDocumento}).`);
}

/**
 * Regla de RUN válido (CI-01 / LC-01).
 * @param {string} codigo Código de la regla.
 * @param {?string} run RUN extraído.
 * @return {Object} Resultado.
 */
function reglaRunValido(codigo, run) {
  if (!run) return regla(codigo, "revision", "No se pudo leer el RUN.");
  return validarRun(run) ?
    regla(codigo, "cumple", `RUN ${normalizarRun(run)} válido.`) :
    regla(codigo, "no_cumple", `El dígito verificador de ${run} no es válido.`);
}

/**
 * Regla de RUN igual al de la Persona enlazada (CI-02 / LC-02).
 * @param {string} codigo Código de la regla.
 * @param {?string} run RUN extraído.
 * @param {?Object} persona Persona enlazada ({run, nombre}).
 * @return {Object} Resultado.
 */
function reglaRunPersona(codigo, run, persona) {
  if (!persona) return regla(codigo, "no_aplica", "Sin persona enlazada.");
  if (!run) return regla(codigo, "revision", "No se pudo leer el RUN.");
  return normalizarRun(run) === normalizarRun(persona.run) ?
    regla(codigo, "cumple", "El RUN coincide con la persona.") :
    regla(codigo, "no_cumple",
        `El RUN ${normalizarRun(run)} no coincide con el de la persona ` +
        `(${normalizarRun(persona.run)}).`);
}

/**
 * Regla de legibilidad (y lados presentes, en la cédula).
 * @param {string} codigo Código de la regla.
 * @param {?number} legibilidad Legibilidad mínima de las piezas.
 * @param {number} umbral Umbral del tipo documental.
 * @return {Object} Resultado.
 */
function reglaLegibilidad(codigo, legibilidad, umbral) {
  const valor = typeof legibilidad === "number" ?
      Math.min(Math.max(legibilidad, 0), 1) : null;
  if (valor === null) {
    return regla(codigo, "revision", "Sin dato de legibilidad.");
  }
  return valor >= umbral ?
    regla(codigo, "cumple", `Legibilidad ${valor.toFixed(2)}.`) :
    regla(codigo, "revision",
        `Legibilidad ${valor.toFixed(2)}, bajo el umbral ${umbral}.`);
}

/**
 * Regla de vigencia (CI-04 / LC-03): por vencer cumple con alerta.
 * @param {string} codigo Código de la regla.
 * @param {?string} fecha Fecha de vencimiento (AAAA-MM-DD).
 * @param {string} hoy Fecha de evaluación.
 * @param {number} diasAlerta Días de alerta.
 * @param {string} etiqueta Nombre de la fecha para el detalle.
 * @return {Object} Resultado.
 */
function reglaVigencia(codigo, fecha, hoy, diasAlerta, etiqueta) {
  const vigencia = evaluarVigencia(fecha, hoy, diasAlerta);
  if (!vigencia) return regla(codigo, "revision", `Sin ${etiqueta} legible.`);
  if (vigencia === "vencido") {
    return regla(codigo, "no_cumple", `Vencido (${etiqueta}: ${fecha}).`);
  }
  if (vigencia === "por_vencer") {
    return regla(codigo, "cumple",
        `Por vencer (${etiqueta}: ${fecha}, alerta de ${diasAlerta} días).`);
  }
  return regla(codigo, "cumple", `Vigente (${etiqueta}: ${fecha}).`);
}

/**
 * Pasa a "revision" las reglas cuyos campos tienen conflicto entre piezas.
 * @param {Object[]} resultados Resultados de reglas.
 * @param {?Array<Object>} conflictos Conflictos {campo, valores}.
 * @return {Object[]} Resultados ajustados.
 */
function aplicarConflictos(resultados, conflictos) {
  const afectadas = new Map();
  (conflictos || []).forEach(({campo}) => {
    (REGLAS_POR_CAMPO[campo] || []).forEach((r) => {
      if (!afectadas.has(r)) afectadas.set(r, []);
      afectadas.get(r).push(campo);
    });
  });
  return resultados.map((r) => (
    afectadas.has(r.regla) && ["cumple", "no_cumple"].includes(r.resultado) ?
      regla(r.regla, "revision",
          `Valores distintos entre archivos en: ` +
          `${afectadas.get(r.regla).join(", ")}.`) :
      r));
}

/**
 * Reglas de la cédula de identidad (CI-01 a CI-06).
 * @param {Object} ctx Contexto.
 * @param {Object} ctx.datos Datos consolidados ({run, nombres, apellidos,
 *     fechaNacimiento, legibilidad, ladosPresentes, cedula}).
 * @param {?Object} ctx.persona Persona enlazada ({run, nombre}).
 * @param {string} ctx.hoy Fecha de evaluación (AAAA-MM-DD).
 * @param {number} [ctx.umbralLegibilidad] Umbral del tipo documental.
 * @param {number} [ctx.diasAlerta] Días de alerta de vencimiento.
 * @param {Object[]} [ctx.conflictos] Conflictos entre piezas.
 * @param {string[]} [ctx.fechasEnNombre] Fechas leídas de los nombres de
 *     archivo (CI-07).
 * @return {Object[]} Resultados por regla.
 */
function reglasCedula({
  datos, persona, hoy, conflictos, fechasEnNombre = [],
  umbralLegibilidad = UMBRAL_LEGIBILIDAD_POR_DEFECTO,
  diasAlerta = DIAS_ALERTA_POR_DEFECTO,
}) {
  const cedula = datos.cedula || {};
  const lados = new Set(datos.ladosPresentes || []);
  const tieneAnverso = lados.has("anverso") || lados.has("ambos");
  const tieneReverso = lados.has("reverso") || lados.has("ambos");
  const resultados = [reglaRunValido("CI-01", datos.run)];
  resultados.push(reglaRunPersona("CI-02", datos.run, persona));

  if (!persona) {
    resultados.push(regla("CI-03", "no_aplica", "Sin persona enlazada."));
  } else {
    const nombre = [datos.nombres, datos.apellidos].filter(Boolean).join(" ");
    resultados.push(!nombre ?
      regla("CI-03", "revision", "No se pudo leer el nombre.") :
      coincideNombre(nombre, persona.nombre) ?
        regla("CI-03", "cumple", "El nombre coincide con la persona.") :
        regla("CI-03", "revision",
            `El nombre "${nombre}" no coincide con "${persona.nombre}".`));
  }

  resultados.push(reglaVigencia("CI-04", cedula.fechaVencimiento, hoy,
      diasAlerta, "vencimiento"));

  if (!tieneReverso || !cedula.mrz) {
    resultados.push(regla("CI-05", "revision",
        "Sin reverso con MRZ para verificar."));
  } else {
    const mrz = validarMrzTd1(cedula.mrz);
    const numero = String(cedula.numeroDocumento || "").replace(/\D/g, "");
    const inconsistencias = !mrz.datos ? [] : [
      numero && mrz.datos.numeroDocumento.replace(/\D/g, "") !== numero &&
        "número de documento",
      datos.fechaNacimiento &&
        mrz.datos.fechaNacimiento !== datos.fechaNacimiento &&
        "fecha de nacimiento",
      cedula.fechaVencimiento &&
        mrz.datos.fechaVencimiento !== cedula.fechaVencimiento &&
        "fecha de vencimiento",
    ].filter(Boolean);
    let resultado = regla("CI-05", "cumple",
        "MRZ válida y consistente con el anverso.");
    if (!mrz.valida) {
      resultado = regla("CI-05", "revision", mrz.formatoValido ?
        "Los dígitos de control de la MRZ no calzan." :
        "La MRZ no tiene el formato TD1 (3 líneas de 30 caracteres).");
    } else if (datos.run && mrz.datos.run &&
        normalizarRun(datos.run) !== normalizarRun(mrz.datos.run)) {
      resultado = regla("CI-05", "no_cumple",
          `El RUN de la MRZ (${mrz.datos.run}) no coincide con el del ` +
          `anverso (${normalizarRun(datos.run)}).`);
    } else if (!mrz.datos.run) {
      resultado = regla("CI-05", "revision",
          "No se pudo leer el RUN en la MRZ.");
    } else if (inconsistencias.length) {
      resultado = regla("CI-05", "revision",
          `La MRZ no coincide con el anverso en: ` +
          `${inconsistencias.join(", ")}.`);
    } else if (mrz.compuesto === false) {
      resultado.detalle += " El dígito compuesto no calza (informativo).";
    }
    resultados.push(resultado);
  }

  const legibilidad = reglaLegibilidad("CI-06", datos.legibilidad,
      umbralLegibilidad);
  resultados.push(tieneAnverso && tieneReverso ? legibilidad :
    regla("CI-06", "revision",
        `Falta el ${tieneAnverso ? "reverso" : "anverso"} de la cédula.`));
  const fechaNombre = reglaFechaNombre("CI-07", fechasEnNombre,
      cedula.fechaVencimiento);
  if (fechaNombre) resultados.push(fechaNombre);
  return aplicarConflictos(resultados, conflictos);
}

/**
 * Regla LC-04: alguna clase extraída está entre las aceptadas.
 * @param {?Array<string>} clases Clases extraídas.
 * @param {?Array<string>} clasesAceptadas Clases del requerimiento.
 * @return {Object} Resultado.
 */
function reglaClases(clases, clasesAceptadas) {
  const aceptadas = (clasesAceptadas || [])
      .map((c) => String(c).trim().toUpperCase()).filter(Boolean);
  if (aceptadas.length === 0) {
    return regla("LC-04", "no_aplica",
        "El requerimiento no tiene clases configuradas.");
  }
  const leidas = (clases || []).map((c) => String(c).trim().toUpperCase());
  if (leidas.length === 0) {
    return regla("LC-04", "revision", "No se pudieron leer las clases.");
  }
  const calzan = leidas.filter((c) => aceptadas.includes(c));
  return calzan.length ?
    regla("LC-04", "cumple", `Clase ${calzan.join(", ")} aceptada.`) :
    regla("LC-04", "no_cumple",
        `Clases ${leidas.join(", ")}; se requiere ${aceptadas.join(" o ")}.`);
}

/**
 * Reglas de la licencia de conducir (LC-01 a LC-06).
 * @param {Object} ctx Contexto (como reglasCedula, más
 *     `clasesAceptadas` del requerimiento enlazado).
 * @return {Object[]} Resultados por regla.
 */
function reglasLicencia({
  datos, persona, hoy, conflictos, clasesAceptadas = null, fechasEnNombre = [],
  umbralLegibilidad = UMBRAL_LEGIBILIDAD_POR_DEFECTO,
  diasAlerta = DIAS_ALERTA_POR_DEFECTO,
}) {
  const licencia = datos.licencia || {};
  const resultados = [
    reglaRunValido("LC-01", datos.run),
    reglaRunPersona("LC-02", datos.run, persona),
    reglaVigencia("LC-03", licencia.fechaProximoControl, hoy, diasAlerta,
        "próximo control"),
    reglaClases(licencia.clases, clasesAceptadas),
    regla("LC-05", "informativa", licencia.restricciones ?
      `Restricciones: ${licencia.restricciones}` : "Sin restricciones leídas."),
    reglaLegibilidad("LC-06", datos.legibilidad, umbralLegibilidad),
  ];
  const fechaNombre = reglaFechaNombre("LC-07", fechasEnNombre,
      licencia.fechaProximoControl);
  if (fechaNombre) resultados.push(fechaNombre);
  return aplicarConflictos(resultados, conflictos);
}

/**
 * Propuesta a partir de las reglas: algún no_cumple → no_cumple; si no,
 * alguna revision → revision_humana; si no, cumple.
 * @param {Object[]} resultadoReglas Resultados de reglas.
 * @return {string} "cumple" | "no_cumple" | "revision_humana".
 */
function calcularPropuesta(resultadoReglas) {
  const resultados = (resultadoReglas || []).map((r) => r.resultado);
  if (resultados.includes("no_cumple")) return "no_cumple";
  if (resultados.includes("revision")) return "revision_humana";
  return "cumple";
}

module.exports = {
  RESULTADOS_REGLA, DIAS_ALERTA_POR_DEFECTO, UMBRAL_LEGIBILIDAD_POR_DEFECTO,
  validarRun, normalizarRun, extraerRunDeNombreCarpeta, normalizarNombre,
  coincideNombre, digitoControlMrz, validarMrzTd1, evaluarVigencia,
  reglaClases, reglasCedula, reglasLicencia, calcularPropuesta,
};
