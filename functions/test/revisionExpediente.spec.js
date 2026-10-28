const {
  elegibilidadRequerimiento, calcularEstadoCelda,
} = require("../src/utils/revisionExpediente");

const HOY = "2026-10-20";
const tipoActivo = {id: "t1", codigo: "CEDULA_CL", estado: "activo",
  estadoIA: "piloto"};
const plantilla = (doc = {}, seccion = {}) => ({
  secciones: [{
    clave: "personal", nombre: "Carpetas Personales", ...seccion,
    documentos: [{clave: "ci", nombre: "Cédula de identidad",
      tipoDocumentalCodigo: "CEDULA_CL", ...doc}],
  }],
});
const req = {id: "r1", tipoDocumentalId: "t1"};

describe("elegibilidadRequerimiento", () => {
  it("elegible con tipo piloto y documento habilitado", () => {
    const r = elegibilidadRequerimiento({requerimiento: req, tipo: tipoActivo,
      plantilla: plantilla()});
    expect(r.elegible).toBe(true);
    expect(r.documentoPlantilla).toEqual(
        {nombre: "Cédula de identidad", seccion: "Carpetas Personales"});
  });

  it("sin tipo documental", () => {
    expect(elegibilidadRequerimiento({requerimiento: {id: "r"}, tipo: null,
      plantilla: plantilla()}).motivo).toBe("sin_tipo");
  });

  it("tipo inactivo o no normalizado", () => {
    expect(elegibilidadRequerimiento({requerimiento: req,
      tipo: {...tipoActivo, estado: "inactivo"}, plantilla: plantilla()})
        .motivo).toBe("tipo_inactivo");
    expect(elegibilidadRequerimiento({requerimiento: req,
      tipo: {...tipoActivo, estadoIA: "no_normalizado"},
      plantilla: plantilla()}).motivo).toBe("tipo_inactivo");
  });

  it("tipo soloReglas: no elegible ni en carpeta libre", () => {
    expect(elegibilidadRequerimiento({requerimiento: req,
      tipo: {...tipoActivo, soloReglas: true}, plantilla: null, libre: true})
        .motivo).toBe("solo_reglas");
  });

  it("no existe en la plantilla", () => {
    expect(elegibilidadRequerimiento({requerimiento: req, tipo: tipoActivo,
      plantilla: {secciones: []}}).motivo).toBe("no_en_plantilla");
  });

  it("documento o sección deshabilitados", () => {
    expect(elegibilidadRequerimiento({requerimiento: req, tipo: tipoActivo,
      plantilla: plantilla({habilitado: false})}).motivo)
        .toBe("documento_deshabilitado");
    expect(elegibilidadRequerimiento({requerimiento: req, tipo: tipoActivo,
      plantilla: plantilla({}, {habilitada: false})}).motivo)
        .toBe("documento_deshabilitado");
  });

  it("dato sensible", () => {
    expect(elegibilidadRequerimiento({requerimiento: req, tipo: tipoActivo,
      plantilla: plantilla({datosSensibles: true})}).motivo)
        .toBe("dato_sensible");
  });

  it("carpeta libre: basta el tipo, sin plantilla", () => {
    expect(elegibilidadRequerimiento({requerimiento: req, tipo: tipoActivo,
      plantilla: null, libre: true}).elegible).toBe(true);
  });
});

describe("calcularEstadoCelda", () => {
  const manual = (resultado, extra = {}) =>
    ({resultado, modalidad: "manual", ...extra});
  const ia = (resultado, extra = {}) =>
    ({resultado, modalidad: "ia_asistida", ...extra});
  const estado = (evaluacionVigente, propuestaPendiente = null) =>
    calcularEstadoCelda({evaluacionVigente, propuestaPendiente, hoy: HOY})
        .estado;

  it("pendiente y propuesta IA", () => {
    expect(estado(null)).toBe("pendiente");
    expect(estado(manual("pendiente"))).toBe("pendiente");
    expect(estado(null, {propuesta: "cumple"})).toBe("propuesta_ia");
  });

  it("validado IA y manual (reutilizada cuenta como manual)", () => {
    expect(estado(ia("cumple"))).toBe("validado_ia");
    expect(estado(ia("no_cumple"))).toBe("validado_ia");
    expect(estado(manual("cumple"))).toBe("validado_manual");
    const r = calcularEstadoCelda({evaluacionVigente:
      {resultado: "cumple", modalidad: "reutilizada"}, hoy: HOY});
    expect(r).toEqual({estado: "validado_manual", resultado: "cumple",
      origen: "reutilizada"});
  });

  it("no aplica", () => {
    expect(estado(manual("no_aplica"))).toBe("no_aplica");
  });

  it("vencido solo si la fecha es anterior a hoy", () => {
    expect(estado(ia("cumple", {fechaVencimiento: "2026-10-19T12:00:00Z"})))
        .toBe("vencido");
    expect(estado(ia("cumple", {fechaVencimiento: "2026-10-20T12:00:00Z"})))
        .toBe("validado_ia");
  });

  it("discrepancia: manual vigente y propuesta con otro resultado", () => {
    expect(estado(manual("no_cumple"), {propuesta: "cumple"}))
        .toBe("discrepancia");
    expect(estado(manual("cumple"), {propuesta: "cumple"}))
        .toBe("validado_manual");
    expect(estado(manual("cumple"), {propuesta: "revision_humana"}))
        .toBe("validado_manual");
  });

  it("propuesta nueva sobre una evaluación IA vigente", () => {
    expect(estado(ia("cumple"), {propuesta: "no_cumple"}))
        .toBe("propuesta_ia");
  });
});

const {
  ajustarPlanAExpediente, motivoFueraDeLote,
} = require("../src/utils/revisionExpediente");

// Plan sintético de una empresa: tres carpetas de persona (una por RUT,
// una por nombre, una sin persona en el expediente).
const archivoIA = (entidadClave, nombre, codigo = "CEDULA_CL") => ({
  rutaRelativa: `${entidadClave}/${nombre}`, nombre, entidadClave,
  entidadCarpeta: entidadClave, tipoDocumentalCodigo: codigo,
});
const planEmpresa = () => ({
  empresaCarpeta: "1. EMPRESA PRUEBA",
  secciones: [{seccionClave: "personal", entidadCarpeta: "c-ana"}],
  entidades: [
    {entidadTipo: "persona", entidadClave: "c-ana", entidadCarpeta: "c-ana",
      entidadNombre: "Ana Ficticia", runCarpeta: "11111111-1"},
    {entidadTipo: "persona", entidadClave: "c-luis", entidadCarpeta: "c-luis",
      entidadNombre: "Luis Demo", runCarpeta: null},
    {entidadTipo: "persona", entidadClave: "c-otro", entidadCarpeta: "c-otro",
      entidadNombre: "Carlos Externo", runCarpeta: null},
  ],
  archivosIA: [
    archivoIA("c-ana", "ci.pdf"),
    archivoIA("c-ana", "licencia.pdf", "LICENCIA_CL"),
    archivoIA("c-luis", "ci.jpg"),
    archivoIA("c-otro", "ci.png"),
  ],
  archivosExcluidosIA: [],
});
const personasExpediente = [
  {id: "p-ana", nombre: "Ana María", apellido: "Ficticia", rut: "11.111.111-1"},
  {id: "p-luis", nombre: "Luis", apellido: "Demo Prueba", rut: "22222222-2"},
  {id: "p-sin", nombre: "Marta", apellido: "Sincarpeta", rut: "33333333-3"},
];

describe("ajustarPlanAExpediente", () => {
  const ajustar = (extra = {}) => ajustarPlanAExpediente({
    empresa: planEmpresa(), personas: personasExpediente,
    codigos: new Set(["CEDULA_CL"]), ...extra,
  });

  it("calza por RUT y por nombre; informa sin carpeta y sin persona", () => {
    const r = ajustar();
    const calces = Object.fromEntries(r.empresa.entidades.map((e) =>
      [e.entidadClave, e.personaSugerida && e.personaSugerida.por]));
    expect(calces).toEqual({"c-ana": "rut", "c-luis": "nombre",
      "c-otro": null});
    expect(r.personasSinCarpeta.map((p) => p.personaId)).toEqual(["p-sin"]);
    expect(r.carpetasSinPersona.map((c) => c.entidadCarpeta))
        .toEqual(["c-otro"]);
    expect(r.personasPorEntidad).toEqual(
        {"c-ana": "p-ana", "c-luis": "p-luis"});
    expect(r.empresa.secciones[0].entidadId).toBe("p-ana");
  });

  it("envía solo los tipos pedidos y de personas del expediente", () => {
    const r = ajustar();
    expect(r.empresa.archivosIA.map((a) => a.rutaRelativa).sort())
        .toEqual(["c-ana/ci.pdf", "c-luis/ci.jpg"]);
    const motivos = Object.fromEntries(r.empresa.archivosExcluidosIA
        .map((x) => [x.rutaRelativa, x.motivo]));
    expect(motivos).toEqual({"c-ana/licencia.pdf": "no_solicitado",
      "c-otro/ci.png": "sin_persona_en_expediente"});
  });

  it("omite lo ya validado solo si se pide", () => {
    const validados = new Map([["p-ana", new Set(["CEDULA_CL"])]]);
    expect(ajustar({validados}).empresa.archivosIA).toHaveLength(2);
    const r = ajustar({validados, omitirValidados: true});
    expect(r.empresa.archivosIA.map((a) => a.rutaRelativa))
        .toEqual(["c-luis/ci.jpg"]);
    expect(r.omitidosValidados).toBe(1);
  });

  it("carpeta libre: no filtra por tipo; omite personas validadas", () => {
    const r = ajustar({libre: true, omitirValidados: true,
      todosValidados: new Set(["p-luis"])});
    expect(r.empresa.archivosIA.map((a) => a.rutaRelativa).sort())
        .toEqual(["c-ana/ci.pdf", "c-ana/licencia.pdf"]);
  });
});

describe("motivoFueraDeLote (aceptar todas las que cumplen)", () => {
  const resultado = (extra = {}) => ({estado: "propuesto",
    propuesta: "cumple", enlaces: [{requerido: true, expedienteId: "x1",
      expedienteRequerimientoId: "i1"}], ...extra});

  it("entra una propuesta cumple sin evaluación vigente", () => {
    expect(motivoFueraDeLote(resultado(), "x1", new Map())).toBeNull();
  });

  it("deja fuera revisión humana, no cumple y otro expediente", () => {
    expect(motivoFueraDeLote(resultado({propuesta: "revision_humana"}), "x1",
        new Map())).toBe("propuesta_no_cumple");
    expect(motivoFueraDeLote(resultado(), "x2", new Map()))
        .toBe("otro_expediente");
  });

  it("deja fuera las discrepancias con una evaluación manual", () => {
    const vigentes = new Map([["i1",
      {resultado: "no_cumple", modalidad: "manual"}]]);
    expect(motivoFueraDeLote(resultado(), "x1", vigentes))
        .toBe("discrepancia");
    const iaPrevia = new Map([["i1",
      {resultado: "no_cumple", modalidad: "ia_asistida"}]]);
    expect(motivoFueraDeLote(resultado(), "x1", iaPrevia)).toBeNull();
  });
});
