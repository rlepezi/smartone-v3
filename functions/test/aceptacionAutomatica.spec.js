const mockTipos = {getByCodigo: jest.fn(), incrementarMetricas: jest.fn()};
const mockRequerimientos = {getByIds: jest.fn()};
const mockInstancias = {getById: jest.fn()};
const mockEvaluaciones = {getById: jest.fn()};

jest.mock("../src/repositories/resultadoRevisionRepository", () => ({}));
jest.mock("../src/repositories/procesamientoIARepository", () => ({}));
jest.mock("../src/repositories/tipoDocumentalRepository", () => mockTipos);
jest.mock("../src/repositories/expedienteRequerimientoRepository",
    () => mockInstancias);
jest.mock("../src/repositories/evaluacionRepository",
    () => mockEvaluaciones);
jest.mock("../src/repositories/usuarioRepository", () => ({}));
jest.mock("../src/repositories/requerimientoRepository",
    () => mockRequerimientos);
jest.mock("../src/repositories/evidenciaRepository", () => ({}));
jest.mock("../src/services/evidenciaService", () => ({}));
jest.mock("../src/services/evidenciaRequerimientoService", () => ({}));
jest.mock("../src/services/evaluacionService", () => ({}));
jest.mock("../src/utils/bitacoraLogger", () => ({}));

const resolucionService = require("../src/services/resolucionService");

const resultadoBase = () => ({
  id: "res-1",
  estado: "propuesto",
  propuesta: "cumple",
  estadoEnlace: "confirmado",
  conflictos: [],
  tipoDocumentalCodigo: "CEDULA_CL",
  enlaces: [{
    requerido: true, requerimientoId: "req-1",
    expedienteRequerimientoId: "inst-1",
  }],
});

describe("aceptación automática (motivoNoAutomatico)", () => {
  beforeEach(() => {
    mockTipos.getByCodigo.mockResolvedValue(
        {id: "t1", estado: "activo", estadoIA: "activo"});
    mockRequerimientos.getByIds.mockResolvedValue(
        [{id: "req-1", modoValidacion: "automatico"}]);
    mockInstancias.getById.mockResolvedValue(
        {id: "inst-1", evaluacionVigenteId: null});
    mockEvaluaciones.getById.mockResolvedValue(null);
  });

  it("no reemplaza una evaluación manual vigente", async () => {
    mockInstancias.getById.mockResolvedValue(
        {id: "inst-1", evaluacionVigenteId: "ev-1"});
    mockEvaluaciones.getById.mockResolvedValue({id: "ev-1",
      estado: "vigente", resultado: "no_cumple", modalidad: "manual"});
    expect(await resolucionService.motivoNoAutomatico(resultadoBase()))
        .toBe("evaluacion_manual_vigente");
  });

  it("sí reemplaza una evaluación IA anterior", async () => {
    mockInstancias.getById.mockResolvedValue(
        {id: "inst-1", evaluacionVigenteId: "ev-1"});
    mockEvaluaciones.getById.mockResolvedValue({id: "ev-1",
      estado: "vigente", resultado: "cumple", modalidad: "ia_asistida"});
    expect(await resolucionService.motivoNoAutomatico(resultadoBase()))
        .toBeNull();
  });

  it("acepta cuando todo cumple", async () => {
    expect(await resolucionService.motivoNoAutomatico(resultadoBase()))
        .toBeNull();
  });

  it("no acepta propuestas distintas de cumple", async () => {
    const r = {...resultadoBase(), propuesta: "revision_humana"};
    expect(await resolucionService.motivoNoAutomatico(r))
        .toBe("propuesta_no_cumple");
  });

  it("exige el RUN confirmado y sin conflictos", async () => {
    expect(await resolucionService.motivoNoAutomatico(
        {...resultadoBase(), estadoEnlace: "sin_confirmar"}))
        .toBe("run_sin_confirmar");
    expect(await resolucionService.motivoNoAutomatico(
        {...resultadoBase(), conflictos: [{campo: "cedula.run"}]}))
        .toBe("conflictos");
  });

  it("no acepta con el tipo documental en piloto", async () => {
    mockTipos.getByCodigo.mockResolvedValue(
        {id: "t1", estado: "activo", estadoIA: "piloto"});
    expect(await resolucionService.motivoNoAutomatico(resultadoBase()))
        .toBe("tipo_no_activo");
  });

  it("exige que todos los requerimientos estén en automático", async () => {
    const r = resultadoBase();
    r.enlaces.push({requerido: true, requerimientoId: "req-2",
      expedienteRequerimientoId: "inst-2"});
    mockRequerimientos.getByIds.mockResolvedValue([
      {id: "req-1", modoValidacion: "automatico"},
      {id: "req-2", modoValidacion: "asistido"},
    ]);
    expect(await resolucionService.motivoNoAutomatico(r))
        .toBe("requerimiento_no_automatico");
  });

  it("sin requerimientos enlazados no hay nada que evaluar", async () => {
    expect(await resolucionService.motivoNoAutomatico(
        {...resultadoBase(), enlaces: [{requerido: false}]}))
        .toBe("sin_requerimientos");
  });
});
