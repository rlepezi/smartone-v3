// "Revisar con IA" por requerimiento con repositorios y reglas simulados
// (datos sintéticos; sin Firestore ni llamadas reales a la IA).
jest.mock("firebase-admin/firestore", () => ({
  FieldValue: {serverTimestamp: () => "AHORA"},
}));
jest.mock("../src/repositories/consumoIARepository", () => ({
  crear: jest.fn().mockResolvedValue("consumo"),
}));
jest.mock("../src/repositories/revisionRequerimientoIARepository", () => ({
  COLLECTION: "revisionesRequerimientoIA",
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
  crearEvaluacion: jest.fn(),
}));
jest.mock("../src/repositories/evaluacionRepository", () => ({
  getByExpediente: jest.fn().mockResolvedValue([]),
}));
jest.mock("../src/services/aiConfigService", () => ({
  obtenerParametros: jest.fn(),
  gastoMes: jest.fn(),
}));
jest.mock("../src/services/requerimientoReglaIAService", () => ({
  _piezas: jest.fn((archivos) => archivos.map((a) => ({...a,
    tamanoBytes: 10, ultimaModificacion: null}))),
  _metaArchivos: jest.fn((piezas) => piezas.map((p) => ({nombre: p.nombre,
    rutaRelativa: p.rutaRelativa || null, tamanoBytes: p.tamanoBytes,
    ultimaModificacion: null}))),
  ejecutarReglas: jest.fn(),
  registrarConsumo: jest.fn().mockResolvedValue(undefined),
  MAX_ARCHIVOS: 6,
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
        // El consumo de IA queda registrado con el Mandante del expediente.
        expect(requerimientoReglaIAService.registrarConsumo)
            .toHaveBeenCalledWith(expect.objectContaining({
              origen: "revision_requerimiento",
              coleccion: "revisionesRequerimientoIA",
              actor: EVALUADOR}));
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

describe("revisión en lote (E5)", () => {
  const evaluacionService = require("../src/services/evaluacionService");
  const evaluacionRepository =
      require("../src/repositories/evaluacionRepository");
  const aiConfigService = require("../src/services/aiConfigService");
  const CON_CARPETA = {id: "e1", mandanteId: "m1", empresaId: "emp1",
    proyectoId: "pr1", estado: "en_ejecucion",
    repositorioDocumental: {carpetaEmpresaId: "c1"}};
  const INSTANCIAS = [
    {id: "i1", expedienteId: "e1", requerimientoId: "r1", personaId: "p1",
      requiereVencimiento: true},
    {id: "i2", expedienteId: "e1", requerimientoId: "r2"},
    {id: "i3", expedienteId: "e1", requerimientoId: "r3", recursoId: "x1"},
  ];
  beforeEach(() => {
    expedienteService.getExpedienteById.mockResolvedValue(CON_CARPETA);
    expedienteRequerimientoRepository.listByExpediente
        .mockResolvedValue(INSTANCIAS);
    requerimientoRepository.getByIds.mockResolvedValue([
      {id: "r1", estadoIA: "habilitado"},
      {id: "r2", estadoIA: "habilitado", modeloPreferidoIA: "modelo-b"},
      {id: "r3", estadoIA: "en_prueba", nombre: "Revisión técnica"}]);
    aiConfigService.obtenerParametros.mockResolvedValue({
      modeloPorDefecto: "modelo-a", limiteGastoMensualUsd: 5,
      preciosPorModelo: {"modelo-a": {entrada: 3, salida: 15},
        "modelo-b": {entrada: 1, salida: 5}}});
    aiConfigService.gastoMes.mockResolvedValue({mes: "2026-10",
      gastoUsd: 4.99});
  });

  it("estimar: documentos por entidad, costo y límite mensual", async () => {
    const r = await servicio.estimarLote("e1", {items: [
      {expedienteRequerimientoId: "i1",
        archivos: [{mime: "image/jpeg"}, {mime: "image/jpeg"}]},
      {expedienteRequerimientoId: "i2",
        archivos: [{mime: "application/pdf", paginas: 3}]},
    ]}, EVALUADOR);
    expect(r).toMatchObject({documentos: 2, archivos: 3,
      porEntidad: {empresa: 1, persona: 1, recurso: 0},
      modelos: ["modelo-a", "modelo-b"], faltanPrecios: [],
      limiteMensualUsd: 5, gastoMesUsd: 4.99, disponibleUsd: 0.01,
      alcanza: false});
    expect(r.costoEstimadoUsd).toBeGreaterThan(0);
  });

  it("estimar rechaza requisitos sin IA habilitada y expedientes sin " +
      "Carpeta de empresa", async () => {
    await expect(servicio.estimarLote("e1", {items: [
      {expedienteRequerimientoId: "i3", archivos: [{mime: "image/png"}]},
    ]}, EVALUADOR)).rejects.toThrow(/habilitada/);
    expedienteService.getExpedienteById.mockResolvedValue({...CON_CARPETA,
      repositorioDocumental: null});
    await expect(servicio.estimarLote("e1", {items: [
      {expedienteRequerimientoId: "i1", archivos: [{mime: "image/png"}]},
    ]}, EVALUADOR)).rejects.toMatchObject({status: 409});
  });

  it("revisar en lote registra el consumo como revision_lote", async () => {
    expedienteRequerimientoRepository.getById.mockResolvedValue(INSTANCIAS[0]);
    revisionRepository.listByExpediente.mockResolvedValue([]);
    requerimientoReglaIAService.ejecutarReglas.mockResolvedValue({
      tipo: null, snapshot: [], modelo: "modelo-a", umbralConfianza: 0.7,
      camposExtraidos: {}, resultadosReglas: [],
      resultadoPropuesto: {resultado: "revision_manual", motivos: []},
      tokensEntrada: 1, tokensSalida: 1, costoEstimado: 0.001, intentos: 1,
      latenciaMs: 1});
    const r = await servicio.revisar("e1", {expedienteRequerimientoId: "i1",
      archivos: [{nombre: "ci.pdf"}], lote: true, loteId: "L-1"}, EVALUADOR);
    expect(r).toMatchObject({modo: "lote", loteId: "L-1"});
    expect(requerimientoReglaIAService.registrarConsumo)
        .toHaveBeenCalledWith(expect.objectContaining({
          origen: "revision_lote"}));
    await expect(servicio.revisar("e1", {expedienteRequerimientoId: "i1",
      archivos: [{nombre: "ci.pdf"}], lote: true, loteId: "mal id"},
    EVALUADOR)).rejects.toThrow(/lote no válido/);
  });

  it("confirmar en bloque: guarda las aplicables y omite con motivo",
      async () => {
        const rev = (id, extra) => ({id, expedienteId: "e1",
          estado: "propuesta", createdAt: new Date("2026-10-30T10:00:00Z"),
          ...extra});
        const revisiones = {
          a: rev("a", {expedienteRequerimientoId: "i2",
            propuestaEvaluacion: {resultado: "no_cumple",
              observaciones: "Revisión IA: no cumple."}}),
          b: rev("b", {expedienteRequerimientoId: "i1",
            propuestaEvaluacion: {resultado: "cumple",
              fechaVencimiento: null}}),
          c: rev("c", {expedienteRequerimientoId: "i3",
            propuestaEvaluacion: {resultado: null}}),
          d: rev("d", {expedienteRequerimientoId: "i2",
            estado: "confirmada"}),
        };
        revisionRepository.getById.mockImplementation(async (id) =>
          revisiones[id] || null);
        evaluacionService.crearEvaluacion.mockResolvedValue({id: "ev1"});
        const r = await servicio.confirmarLote("e1", ["a", "b", "c", "d", "z"],
            EVALUADOR);
        expect(evaluacionService.crearEvaluacion).toHaveBeenCalledTimes(1);
        expect(evaluacionService.crearEvaluacion).toHaveBeenCalledWith(
            expect.objectContaining({expedienteRequerimientoId: "i2",
              resultado: "no_cumple", revisionIAId: "a"}), EVALUADOR);
        expect(r.aplicadas).toEqual([{revisionId: "a", evaluacionId: "ev1",
          resultado: "no_cumple"}]);
        expect(Object.fromEntries(r.omitidas.map((o) =>
          [o.revisionId, o.motivo]))).toEqual({b: "sin_fecha_vencimiento",
          c: "revision_manual", d: "ya_resuelta", z: "no_encontrada"});
        expect(evaluacionRepository.getByExpediente).toHaveBeenCalledWith("e1");
      });
});

describe("motivoNoConfirmable", () => {
  const {motivoNoConfirmable} = require("../src/reglasIA/lote");
  it("una evaluación posterior a la propuesta la deja fuera", () => {
    const r = {expedienteId: "e1", estado: "propuesta",
      createdAt: new Date("2026-10-30T10:00:00Z"),
      propuestaEvaluacion: {resultado: "cumple"}};
    expect(motivoNoConfirmable(r, "e1", {id: "i"},
        {createdAt: new Date("2026-10-30T11:00:00Z")}))
        .toBe("evaluado_despues");
    expect(motivoNoConfirmable(r, "e1", {id: "i"},
        {createdAt: new Date("2026-10-29T11:00:00Z")})).toBeNull();
    expect(motivoNoConfirmable(r, "otro", {id: "i"}, null))
        .toBe("no_encontrada");
  });
});
