// Consolidación con la precedencia de ubicación: un requerimiento vinculado
// en la plantilla solo recibe los archivos de sus documentos; uno sin
// vínculo, los del tipo que no están vinculados a otro. Datos sintéticos.
[
  "procesamientoIARepository", "resultadoRevisionRepository",
  "sesionRevisionRepository", "tipoDocumentalRepository", "personaRepository",
  "participacionPersonaRepository", "expedienteRepository",
  "expedienteRequerimientoRepository", "requerimientoRepository",
  "empresaRepository", "proyectoRepository", "resultadoCompletitudRepository",
].forEach((r) => jest.mock(`../src/repositories/${r}`, () => ({})));
jest.mock("../src/repositories/plantillaEstructuraRepository", () => ({
  getById: jest.fn(),
}));
jest.mock("../src/services/requerimientoReglaIAService", () => ({}));

const plantillaEstructuraRepository =
    require("../src/repositories/plantillaEstructuraRepository");
const consolidacion = require("../src/services/consolidacionService");
const {ajustarPlanAExpediente} = require("../src/utils/revisionExpediente");

// Dos documentos de Cédula: "ci_contrato" vinculado a reqA; "ci" sin
// vínculo.
const PLANTILLA = {id: "pl1", secciones: [{clave: "personal",
  tipo: "entidades", entidad: "persona", documentos: [
    {clave: "ci", tipoDocumentalCodigo: "CEDULA_CL"},
    {clave: "ci_contrato", tipoDocumentalCodigo: "CEDULA_CL",
      requerimientoId: "reqA"},
  ]}]};
const proc = (documentoClave) => ({seccionClave: "personal", documentoClave});

describe("_vinculosPlantilla y _ubicadoEn", () => {
  beforeEach(() => plantillaEstructuraRepository.getById
      .mockResolvedValue(PLANTILLA));

  test("archivo del documento vinculado: solo a su requerimiento", async () => {
    const v = await consolidacion._vinculosPlantilla(
        {plantillaId: "pl1", modoEstructura: "plantilla"},
        {CEDULA_CL: [proc("ci_contrato")]});
    expect(consolidacion._ubicadoEn(v, "CEDULA_CL", "reqA")).toBe(true);
    // reqB (Cédula, sin vínculo) no recibe un archivo vinculado a reqA.
    expect(consolidacion._ubicadoEn(v, "CEDULA_CL", "reqB")).toBe(false);
  });

  test("archivo sin vínculo: a los requerimientos sin vínculo", async () => {
    const v = await consolidacion._vinculosPlantilla(
        {plantillaId: "pl1", modoEstructura: "plantilla"},
        {CEDULA_CL: [proc("ci")]});
    expect(consolidacion._ubicadoEn(v, "CEDULA_CL", "reqB")).toBe(true);
    // Sin caída: reqA está vinculado en la plantilla y su documento no vino.
    expect(consolidacion._ubicadoEn(v, "CEDULA_CL", "reqA")).toBe(false);
  });

  test("carpeta libre o sin plantilla: rige solo el tipo", async () => {
    expect(await consolidacion._vinculosPlantilla(
        {plantillaId: "pl1", modoEstructura: "libre"}, {})).toBeNull();
    expect(await consolidacion._vinculosPlantilla({}, {})).toBeNull();
    expect(consolidacion._ubicadoEn(null, "CEDULA_CL", "reqA")).toBe(true);
  });
});

describe("ajustarPlanAExpediente con admitir", () => {
  test("a la IA solo va lo que algún requerimiento pedido recibe", () => {
    const archivo = (documentoClave) => ({rutaRelativa: documentoClave,
      nombre: documentoClave, tipoDocumentalCodigo: "CEDULA_CL",
      documentoClave, seccionClave: "personal", entidadClave: "e1"});
    const r = ajustarPlanAExpediente({
      empresa: {entidades: [{entidadTipo: "persona", entidadClave: "e1",
        entidadCarpeta: "Personal/Ana Demo", entidadNombre: "Ana Demo"}],
      secciones: [], archivosIA: [archivo("ci"), archivo("ci_contrato")],
      archivosExcluidosIA: []},
      personas: [{id: "p1", nombre: "Ana", apellido: "Demo"}],
      codigos: new Set(["CEDULA_CL"]),
      admitir: (a) => a.documentoClave === "ci_contrato",
    });
    expect(r.empresa.archivosIA.map((a) => a.documentoClave))
        .toEqual(["ci_contrato"]);
    expect(r.empresa.archivosExcluidosIA).toEqual([expect.objectContaining({
      documentoClave: "ci", motivo: "no_solicitado"})]);
  });
});
