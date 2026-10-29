const {calcularResultadoPropuesto} = require("../src/reglasIA/resultado");
const {
  estadoIADe, estadoTrasCambio, errorTransicion, AVISO_VUELVE_A_DEFINICION,
} = require("../src/reglasIA/estadoIA");
const {
  esquemaRespuesta, textoPedido, validarRespuesta, snapshotRegla,
  aplicarReglas,
} = require("../src/reglasIA/prueba");
const {ejecutar, validarParametros} = require("../src/reglasIA/verificaciones");
const {conDefaults} = require("../src/reglasIA/tiposDocumentales");

// Datos sintéticos: RUT de prueba válidos (DV módulo 11) y nombres ficticios.
const RUT_A = "11.111.111-1";
const RUT_B = "22.222.222-2";

const r = (severidad, resultado, extra = {}) => ({
  tipo: "deterministica", severidad, resultado, nombre: "R", ...extra});

describe("calcularResultadoPropuesto", () => {
  it("bloqueante con no_cumple → no_cumple (aunque haya dudas)", () => {
    expect(calcularResultadoPropuesto([
      r("bloqueante", "no_cumple"), r("bloqueante", "no_determinable"),
    ]).resultado).toBe("no_cumple");
  });
  it("no_determinable → revisión manual", () => {
    expect(calcularResultadoPropuesto([
      r("bloqueante", "cumple"), r("advertencia", "no_determinable"),
    ]).resultado).toBe("revision_manual");
  });
  it("interpretativa con confianza bajo 0,7 → revisión manual", () => {
    const lista = [r("bloqueante", "cumple"),
      r("advertencia", "cumple", {tipo: "interpretativa", confianza: 0.6})];
    expect(calcularResultadoPropuesto(lista).resultado)
        .toBe("revision_manual");
    // El umbral es configurable.
    expect(calcularResultadoPropuesto(lista, {umbralConfianza: 0.5})
        .resultado).toBe("cumple");
  });
  it("solo fallan advertencias → cumple con observación", () => {
    expect(calcularResultadoPropuesto([
      r("bloqueante", "cumple"), r("advertencia", "no_cumple"),
    ]).resultado).toBe("cumple_con_observacion");
  });
  it("todo cumple → cumple; sin reglas → revisión manual", () => {
    expect(calcularResultadoPropuesto([r("bloqueante", "cumple"),
      r("advertencia", "cumple", {tipo: "interpretativa", confianza: 0.9})]))
        .toEqual({resultado: "cumple", motivos: []});
    expect(calcularResultadoPropuesto([]).resultado).toBe("revision_manual");
  });
});

describe("estado IA del requerimiento", () => {
  const ok = {reglasActivas: 1, pruebaVigente: true};
  it("default sin_reglas (sin migración)", () => {
    expect(estadoIADe({})).toBe("sin_reglas");
    expect(estadoIADe({estadoIA: "en_prueba"})).toBe("en_prueba");
  });
  it("cambios: sin_reglas y habilitado vuelven a En definición", () => {
    expect(estadoTrasCambio("sin_reglas"))
        .toEqual({estado: "en_definicion", aviso: null});
    expect(estadoTrasCambio("habilitado"))
        .toEqual({estado: "en_definicion", aviso: AVISO_VUELVE_A_DEFINICION});
    expect(estadoTrasCambio("en_prueba").estado).toBe("en_prueba");
  });
  it("en_definicion → en_prueba exige una regla activa (el tipo " +
      "documental es opcional)", () => {
    expect(errorTransicion("en_definicion", "en_prueba", ok)).toBeNull();
    expect(errorTransicion("en_definicion", "en_prueba",
        {...ok, reglasActivas: 0})).toMatch(/regla activa/);
  });
  it("en_prueba → habilitado exige una prueba vigente", () => {
    expect(errorTransicion("en_prueba", "habilitado", ok)).toBeNull();
    expect(errorTransicion("en_prueba", "habilitado",
        {...ok, pruebaVigente: false})).toMatch(/Pruebe/);
    expect(errorTransicion("en_definicion", "habilitado", ok))
        .toMatch(/En prueba/);
  });
  it("a En definición siempre; a Sin reglas nunca", () => {
    expect(errorTransicion("habilitado", "en_definicion", ok)).toBeNull();
    expect(errorTransicion("en_prueba", "sin_reglas", ok)).toMatch(/no vuelve/);
  });
});

describe("clases_aceptadas (parámetro lista)", () => {
  it("normaliza la lista y verifica", () => {
    expect(validarParametros("clases_aceptadas", {clases: "b, d ,B"}).valor)
        .toEqual({clases: ["B", "D"]});
    expect(validarParametros("clases_aceptadas", {}).ok).toBe(false);
    const p = {clases: ["B"]};
    expect(ejecutar("clases_aceptadas", {clases: "A2 B"}, {}, p).resultado)
        .toBe("cumple");
    expect(ejecutar("clases_aceptadas", {clases: "C"}, {}, p).resultado)
        .toBe("no_cumple");
    expect(ejecutar("clases_aceptadas", {}, {}, p).resultado)
        .toBe("no_determinable");
  });
});

// Ejemplo del informe: "Cédula de Identidad Nacional" con 5 reglas.
const regla = (id, tipo, extra) => ({id, nombre: id, version: 1, tipo,
  estado: "activa", entidades: ["persona"], parametros: {}, ...extra});
const REGLAS = [
  regla("es_cedula", "interpretativa", {instruccionIA: "El documento es " +
    "una cédula de identidad chilena (no pasaporte ni licencia).",
  camposRequeridos: []}),
  regla("rut", "deterministica", {verificacion: "coincide_rut"}),
  regla("nombre", "deterministica", {verificacion: "coincide_nombre",
    parametros: {tolerancia: "tokens"}}),
  regla("vigente", "deterministica", {verificacion: "vigente_a_fecha",
    parametros: {diasMargen: 0}}),
  regla("legible", "interpretativa", {instruccionIA: "Se leen con claridad " +
    "el anverso y el reverso de la cédula.", camposRequeridos: []}),
];
const SEVERIDAD = {es_cedula: "bloqueante", rut: "bloqueante",
  nombre: "advertencia", vigente: "bloqueante", legible: "advertencia"};
const SNAPSHOT = REGLAS.map((x, i) => snapshotRegla({id: `v${i}`,
  severidad: SEVERIDAD[x.id], orden: i + 1, parametros: {}}, x));
const CEDULA = conDefaults({codigo: "CEDULA_CL",
  nombre: "Cédula de Identidad Nacional"});
const INTERP = SNAPSHOT.filter((x) => x.tipo === "interpretativa");
const CTX = {rut: RUT_A, nombre: "Ana María Demo Prueba",
  fechaEvaluacion: "2026-10-26"};

/**
 * Respuesta sintética del modelo.
 * @param {Object} cambios Campos a reemplazar.
 * @param {Array} interp Interpretativas.
 * @return {Object} JSON.
 */
function respuesta(cambios = {}, interp = null) {
  const campos = {};
  CEDULA.campos.forEach((c) => {
    campos[c.clave] = {valor: null, confianza: 0.2};
  });
  Object.assign(campos, {
    rut: {valor: "11111111-1", confianza: 0.98},
    nombre: {valor: "ANA DEMO", confianza: 0.95},
    fechaVencimiento: {valor: "2030-05-01", confianza: 0.97},
  }, cambios);
  return {camposExtraidos: campos, interpretativas: interp || [
    {reglaId: "R1", resultado: "cumple", confianza: 0.95,
      justificacion: "Formato de cédula chilena."},
    {reglaId: "R2", resultado: "cumple", confianza: 0.9,
      justificacion: "Ambas caras legibles."},
  ]};
}

/**
 * Prueba completa: valida la respuesta, aplica reglas y propone.
 * @param {Object} json Respuesta del modelo.
 * @return {Object} {resultados, propuesto}.
 */
function probar(json) {
  const v = validarRespuesta(json, CEDULA.campos, INTERP);
  if (!v.ok) throw new Error(v.error);
  const resultados = aplicarReglas(SNAPSHOT, v.valor.camposExtraidos,
      v.valor.interpretativas, CTX);
  return {resultados, propuesto: calcularResultadoPropuesto(resultados)};
}

describe("Probar reglas: ejemplo Cédula de Identidad Nacional", () => {
  it("el esquema y el pedido incluyen campos y reglas interpretativas", () => {
    const esquema = esquemaRespuesta(CEDULA.campos, INTERP);
    expect(esquema.properties.camposExtraidos.required)
        .toEqual(CEDULA.campos.map((c) => c.clave));
    expect(esquema.properties.interpretativas.items.properties.reglaId.enum)
        .toEqual(["R1", "R2"]);
    const texto = textoPedido(CEDULA, CEDULA.campos, INTERP);
    expect(texto).toMatch(/R1: El documento es una cédula/);
    expect(texto).not.toMatch(/11\.111/); // El contexto no viaja al modelo.
  });
  it("todo en orden: nombre por palabras (sin importar orden) → cumple", () => {
    const {resultados, propuesto} = probar(respuesta());
    expect(resultados.map((x) => x.resultado))
        .toEqual(["cumple", "cumple", "cumple", "cumple", "cumple"]);
    expect(propuesto.resultado).toBe("cumple");
    expect(resultados[0].reglaId).toBe("es_cedula");
  });
  it("RUT distinto (bloqueante) → no cumple", () => {
    expect(probar(respuesta({rut: {valor: RUT_B, confianza: 0.9}}))
        .propuesto.resultado).toBe("no_cumple");
  });
  it("vencida (bloqueante) → no cumple", () => {
    expect(probar(respuesta({fechaVencimiento: {valor: "2026-10-25",
      confianza: 0.9}})).propuesto.resultado).toBe("no_cumple");
  });
  it("nombre distinto (advertencia) → cumple con observación", () => {
    expect(probar(respuesta({nombre: {valor: "PEDRO OTRO", confianza: 0.9}}))
        .propuesto.resultado).toBe("cumple_con_observacion");
  });
  it("legibilidad dudosa → revisión manual", () => {
    const {propuesto} = probar(respuesta({}, [
      {reglaId: "R1", resultado: "cumple", confianza: 0.95,
        justificacion: "Cédula."},
      {reglaId: "R2", resultado: "cumple", confianza: 0.55,
        justificacion: "Reverso borroso."},
    ]));
    expect(propuesto.resultado).toBe("revision_manual");
  });
  it("sin fecha de vencimiento → revisión manual (no determinable)", () => {
    expect(probar(respuesta({fechaVencimiento: {valor: null,
      confianza: 0.1}})).propuesto.resultado).toBe("revision_manual");
  });
});

describe("validarRespuesta", () => {
  it("rechaza respuestas incompletas (para reintentar)", () => {
    expect(validarRespuesta(null, CEDULA.campos, INTERP).ok).toBe(false);
    const sinCampo = respuesta();
    delete sinCampo.camposExtraidos.rut;
    expect(validarRespuesta(sinCampo, CEDULA.campos, INTERP).error)
        .toMatch(/rut/);
    expect(validarRespuesta(respuesta({}, [{reglaId: "R1",
      resultado: "cumple", confianza: 1, justificacion: ""}]),
    CEDULA.campos, INTERP).error).toMatch(/R2/);
  });
  it("acota la confianza a 0–1 y deja vacíos como null", () => {
    const v = validarRespuesta(respuesta({numeroDocumento: {valor: "  ",
      confianza: 3}}), CEDULA.campos, INTERP);
    expect(v.valor.camposExtraidos.numeroDocumento)
        .toEqual({valor: null, confianza: 1});
  });
});

describe("snapshotRegla", () => {
  it("combina parámetros de la regla y del vínculo", () => {
    const s = snapshotRegla({id: "v", severidad: "advertencia",
      parametros: {diasMargen: 30}}, REGLAS[3]);
    expect(s.parametros).toEqual({diasMargen: 30});
    expect(s.camposRequeridos).toEqual(["fechaVencimiento"]);
  });
  it("parámetros inválidos quedan como error (no_determinable)", () => {
    const s = snapshotRegla({id: "v", severidad: "bloqueante",
      parametros: {diasMargen: 999}}, REGLAS[3]);
    expect(s.error).toMatch(/Días de margen/);
    expect(aplicarReglas([s], {}, [], CTX)[0].resultado)
        .toBe("no_determinable");
  });
});

const {propuestaEvaluacion} = require("../src/reglasIA/propuesta");

describe("propuestaEvaluacion (Aplicar propuesta)", () => {
  const reglas = [
    {nombre: "RUT coincide", tipo: "deterministica", severidad: "bloqueante",
      resultado: "cumple", detalle: "RUT coincide."},
    {nombre: "Nombre coincide", tipo: "deterministica",
      severidad: "advertencia", resultado: "no_cumple",
      detalle: "Nombre distinto."},
  ];
  it("cumple con observación → SI, con la advertencia y la fecha", () => {
    const p = propuestaEvaluacion({
      resultadoPropuesto: {resultado: "cumple_con_observacion"},
      resultadosReglas: reglas, requiereVencimiento: true,
      camposExtraidos: {fechaVencimiento: {valor: "01/05/2030",
        confianza: 0.9}},
    });
    expect(p.resultado).toBe("cumple");
    expect(p.fechaVencimiento).toBe("2030-05-01");
    expect(p.observaciones).toMatch(/Nombre coincide: Nombre distinto/);
  });
  it("no cumple → NO, sin fecha; revisión manual → sin marcar", () => {
    const no = propuestaEvaluacion({resultadoPropuesto: {resultado:
      "no_cumple"}, resultadosReglas: [{...reglas[0], resultado: "no_cumple",
      detalle: "RUT distinto."}], requiereVencimiento: true,
    camposExtraidos: {}});
    expect(no).toEqual({resultado: "no_cumple", fechaVencimiento: null,
      observaciones: "Revisión IA: no cumple.\n- RUT coincide: RUT distinto."});
    expect(propuestaEvaluacion({resultadoPropuesto: {resultado:
      "revision_manual"}, resultadosReglas: [], camposExtraidos: {}})
        .resultado).toBeNull();
  });
});
