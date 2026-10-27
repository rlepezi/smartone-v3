// "Revisar con IA" por requerimiento con repositorios y reglas simulados
// (datos sintéticos; sin Firestore ni llamadas reales a la IA).
jest.mock("firebase-admin/firestore", () => ({
  FieldValue: {serverTimestamp: () => "AHORA"},
}));
jest.mock("../src/repositories/revisionRequerimientoIARepository", () => ({
  getById: jest.fn(), create: jest.fn(), update: jest.fn(),
  listByExpediente: jest.fn(),
}));
jest.mock("../src/repositories/expedienteRequerimientoRepository", () => ({
  getById: jest.fn(), listByExpediente: jest.fn(),
}));
jest.mock("../src/repositories/requerimientoRepository", () => ({
  getById: jest.fn(), getByIds: jest.fn(),
}));
jest.mock("../src/repositories/personaRepository", () => ({
  getById: jest.fn(), getByIds: jest.fn().mockResolvedValue([]),
}));
jest.mock("../src/repositories/recursoRepository", () => ({
  getById: jest.fn(), getByIds: jest.fn().mockResolvedValue([]),
}));
jest.mock("../src/repositories/empresaRepository", () => ({
  getById: jest.fn(),
}));
jest.mock("../src/repositories/proyectoRepository", () => ({
  getById: jest.fn(),
}));
jest.mock("../src/repositories/usuarioRepository", () => ({
  getById: jest.fn().mockResolvedValue({nombre: "Eva", apellido: "Demo"}),
}));
jest.mock("../src/utils/bitacoraLogger", () => ({
  registrarEvento: jest.fn().mockResolvedValue(),
}));
jest.mock("../src/services/expedienteService", () => ({
  getExpedienteById: jest.fn(),
}));
jest.mock("../src/services/evaluacionService", () => ({
  exigirInstanciaEvaluable: jest.fn(),
}));
jest.mock("../src/services/requerimientoReglaIAService", () => ({
  _piezas: jest.fn((archivos) => archivos.map((a) => ({...a,
    tamanoBytes: 10, ultimaModificacion: null}))),
  _metaArchivos: jest.fn((piezas) => piezas.map((p) => ({nombre: p.nombre,
    rutaRelativa: p.rutaRelativa || null, tamanoBytes: p.tamanoBytes,
    ultimaModificacion: null}))),
  ejecutarReglas: jest.fn(),
}));

const revisionRepository =
    require("../src/repositories/revisionRequerimientoIARepository");
const expedienteRequerimientoRepository =
    require("../src/repositories/expedienteRequerimientoRepository");
const requerimientoRepository =
    require("../src/repositories/requerimientoRepository");
const personaRepository = require("../src/repositories/personaRepository");
const empresaRepository = require("../src/repositories/empresaRepository");
const proyectoRepository = require("../src/repositories/proyectoRepository");
const expedienteService = require("../src/services/expedienteService");
const requerimientoReglaIAService =
    require("../src/services/requerimientoReglaIAService");
const servicio = require("../src/services/revisionRequerimientoIAService");

const EVALUADOR = {uid: "u1", rol: "evaluador"};
const INSTANCIA = {id: "i1", expedienteId: "e1", requerimientoId: "r1",
  personaId: "p1", requiereVencimiento: true, estado: "activo"};

beforeEach(() => {
  jest.clearAllMocks();
  expedienteService.getExpedienteById.mockResolvedValue({id: "e1",
    mandanteId: "m1", empresaId: "emp1", proyectoId: "pr1"});
  expedienteRequerimientoRepository.getById.mockResolvedValue(INSTANCIA);
  requerimientoRepository.getById.mockResolvedValue({id: "r1",
    nombre: "Cédula", tipoEntidad: "persona", estadoIA: "habilitado"});
  personaRepository.getById.mockResolvedValue({rut: "11.111.111-1",
    nombre: "Ana", apellido: "Demo"});
  empresaRepository.getById.mockResolvedValue({rut: "22.222.222-2"});
  proyectoRepository.getById.mockResolvedValue({
    fechaTermino: new Date("2027-03-31T00:00:00Z")});
  revisionRepository.create.mockImplementation(async (d) => ({id: "rv2",
    ...d}));
});

describe("revisar", () => {
  it("arma el contexto solo, propone y descarta la propuesta anterior",
      async () => {
        revisionRepository.listByExpediente.mockResolvedValue([
          {id: "rv1", expedienteRequerimientoId: "i1", estado: "propuesta"}]);
        requerimientoReglaIAService.ejecutarReglas.mockResolvedValue({
          tipo: {id: "t1"}, snapshot: [{reglaId: "g", version: 2}],
          modelo: "modelo-demo", umbralConfianza: 0.7,
          camposExtraidos: {fechaVencimiento: {valor: "2030-01-01",
            confianza: 0.9}},
          resultadosReglas: [{nombre: "RUT", severidad: "bloqueante",
            tipo: "deterministica", resultado: "cumple"}],
          resultadoPropuesto: {resultado: "cumple", motivos: []},
          tokensEntrada: 10, tokensSalida: 5, costoEstimado: 0.001,
          intentos: 1, latenciaMs: 1,
        });
        const r = await servicio.revisar("e1", {expedienteRequerimientoId: "i1",
          archivos: [{nombre: "anverso.jpg"}, {nombre: "reverso.jpg"}]},
        EVALUADOR);
        const ctx = requerimientoReglaIAService.ejecutarReglas.mock
            .calls[0][2];
        expect(ctx).toMatchObject({rut: "11.111.111-1", nombre: "Ana Demo",
          rutEmpresa: "22.222.222-2", fechaTerminoProyecto: "2027-03-31"});
        expect(ctx.fechaEvaluacion).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(revisionRepository.update).toHaveBeenCalledWith("rv1",
            expect.objectContaining({estado: "descartada",
              motivoDescarte: "reemplazada"}));
        expect(r).toMatchObject({estado: "propuesta",
          archivo: {nombre: "anverso.jpg + reverso.jpg"},
          propuestaEvaluacion: {resultado: "cumple",
            fechaVencimiento: "2030-01-01"},
          reglasSnapshot: [{reglaId: "g", version: 2}]});
      });

  it("rechaza requerimientos sin IA habilitada y roles de Mandante",
      async () => {
        requerimientoRepository.getById.mockResolvedValue({id: "r1",
          estadoIA: "en_prueba"});
        await expect(servicio.revisar("e1", {expedienteRequerimientoId: "i1",
          archivos: [{nombre: "a.jpg"}]}, EVALUADOR))
            .rejects.toThrow(/habilitada/);
        await expect(servicio.revisar("e1", {}, {uid: "x",
          rol: "mandante_admin"})).rejects.toThrow(/superadmin y evaluador/);
      });
});

describe("confirmar y descartar", () => {
  it("solo una propuesta del mismo requisito se puede confirmar", async () => {
    revisionRepository.getById.mockResolvedValue({id: "rv1",
      expedienteRequerimientoId: "i1", estado: "descartada"});
    await expect(servicio.validarParaConfirmar("rv1", "i1", EVALUADOR))
        .rejects.toThrow(/ya fue confirmada o descartada/);
    await expect(servicio.validarParaConfirmar("rv1", "otro", EVALUADOR))
        .rejects.toThrow(/no corresponde/);
  });

  it("descartar cambia el estado (no borra)", async () => {
    revisionRepository.getById.mockResolvedValue({id: "rv1",
      expedienteId: "e1", estado: "propuesta"});
    revisionRepository.update.mockImplementation(async (id, c) => ({id, ...c}));
    const r = await servicio.descartar("rv1", EVALUADOR);
    expect(r.estado).toBe("descartada");
  });
});
