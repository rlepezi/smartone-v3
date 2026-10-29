// Servicio de reglas IA del requerimiento con repositorios y modelo simulados
// (datos sintéticos; sin Firestore ni llamadas reales a la IA).
jest.mock("firebase-admin/firestore", () => ({
  FieldValue: {serverTimestamp: () => "AHORA"},
}));
jest.mock("../src/repositories/consumoIARepository", () => ({
  crear: jest.fn().mockResolvedValue("consumo"),
}));
jest.mock("../src/repositories/requerimientoRepository", () => ({
  getById: jest.fn(), update: jest.fn(), getByIds: jest.fn(),
  listActivosResumenIA: jest.fn(),
}));
jest.mock("../src/repositories/tipoDocumentalRepository", () => ({
  getById: jest.fn(), list: jest.fn(),
}));
jest.mock("../src/repositories/reglaIARepository", () => ({
  getById: jest.fn(), getByIds: jest.fn(),
}));
jest.mock("../src/repositories/requerimientoReglaRepository", () => ({
  listByRequerimiento: jest.fn(), create: jest.fn(), getById: jest.fn(),
  update: jest.fn(), listActivosByRegla: jest.fn(),
}));
jest.mock("../src/repositories/pruebaReglaIARepository", () => ({
  listByRequerimiento: jest.fn(), create: jest.fn(),
}));
jest.mock("../src/repositories/usuarioRepository", () => ({
  getById: jest.fn().mockResolvedValue({nombre: "Ana", apellido: "Demo"}),
}));
jest.mock("../src/utils/bitacoraLogger", () => ({
  registrarEvento: jest.fn().mockResolvedValue(),
}));
jest.mock("../src/services/aiConfigService", () => ({
  obtenerParametros: jest.fn().mockResolvedValue({
    modeloPorDefecto: "modelo-demo", umbralConfianzaReglas: 0.7,
    preciosPorModelo: {"modelo-demo": {entrada: 1, salida: 5}},
  }),
  validarLimiteMensual: jest.fn().mockResolvedValue(),
}));
jest.mock("../src/services/modeloReglasIAService", () => ({
  evaluar: jest.fn(),
}));

const requerimientoRepository =
    require("../src/repositories/requerimientoRepository");
const tipoDocumentalRepository =
    require("../src/repositories/tipoDocumentalRepository");
const reglaIARepository = require("../src/repositories/reglaIARepository");
const requerimientoReglaRepository =
    require("../src/repositories/requerimientoReglaRepository");
const pruebaReglaIARepository =
    require("../src/repositories/pruebaReglaIARepository");
const bitacoraLogger = require("../src/utils/bitacoraLogger");
const modeloReglasIAService =
    require("../src/services/modeloReglasIAService");
const servicio = require("../src/services/requerimientoReglaIAService");

const ACTOR = {uid: "u1", rol: "superadmin", email: "demo@ejemplo.cl"};
const CEDULA = {id: "t-ci", codigo: "CEDULA_CL", nombre: "Cédula",
  estado: "activo", estadoIA: "piloto",
  campos: [{clave: "rut", etiqueta: "RUT", tipo: "rut"},
    {clave: "fechaVencimiento", etiqueta: "Vence", tipo: "fecha"}]};
const REGLA_RUT = {id: "g-rut", nombre: "RUT coincide", version: 1,
  tipo: "deterministica", verificacion: "coincide_rut", parametros: {},
  camposRequeridos: ["rut"], entidades: ["persona"], estado: "activa"};
const REGLA_EMISION = {id: "g-emi", nombre: "Antigüedad", version: 1,
  tipo: "deterministica", verificacion: "antiguedad_maxima",
  parametros: {diasMaximos: 30}, camposRequeridos: ["fechaEmision"],
  entidades: ["persona"], estado: "activa"};

let req;
beforeEach(() => {
  jest.clearAllMocks();
  req = {id: "r1", nombre: "Cédula de Identidad Nacional",
    tipoEntidad: "persona", mandanteId: "m1", tipoDocumentalId: "t-ci"};
  requerimientoRepository.getById.mockImplementation(async () => req);
  requerimientoRepository.update.mockImplementation(async (id, c) => {
    req = {...req, ...c};
    return req;
  });
  tipoDocumentalRepository.getById.mockResolvedValue(CEDULA);
  tipoDocumentalRepository.list.mockResolvedValue([CEDULA]);
  pruebaReglaIARepository.listByRequerimiento.mockResolvedValue([]);
});

describe("vincular reglas", () => {
  it("rechaza una regla cuyo campo el tipo no extrae", async () => {
    requerimientoReglaRepository.listByRequerimiento.mockResolvedValue([]);
    reglaIARepository.getByIds.mockResolvedValue([]);
    reglaIARepository.getById.mockResolvedValue(REGLA_EMISION);
    await expect(servicio.agregarRegla("r1", {reglaId: "g-emi"}, ACTOR))
        .rejects.toThrow("La regla Antigüedad requiere el campo " +
          "fechaEmision, que el tipo Cédula no extrae.");
    expect(requerimientoReglaRepository.create).not.toHaveBeenCalled();
  });

  it("la primera regla pasa de Sin reglas a En definición y queda en la " +
      "Bitácora", async () => {
    const vinculo = {id: "v1", requerimientoId: "r1", reglaId: "g-rut",
      orden: 1, severidad: "bloqueante", parametros: {}, activa: true};
    requerimientoReglaRepository.listByRequerimiento
        .mockResolvedValueOnce([]).mockResolvedValue([vinculo]);
    reglaIARepository.getByIds.mockResolvedValue([REGLA_RUT]);
    reglaIARepository.getById.mockResolvedValue(REGLA_RUT);
    requerimientoReglaRepository.create.mockResolvedValue(vinculo);
    const r = await servicio.agregarRegla("r1", {reglaId: "g-rut"}, ACTOR);
    expect(r.requerimiento.estadoIA).toBe("en_definicion");
    expect(r.transiciones.en_prueba).toBeNull();
    expect(bitacoraLogger.registrarEvento).toHaveBeenCalledWith(
        expect.objectContaining({accion: "regla_ia_vinculada",
          detalle: expect.objectContaining({estadoIAAnterior: "sin_reglas",
            estadoIANuevo: "en_definicion"})}));
  });

  it("estando habilitado, un cambio vuelve a En definición con aviso",
      async () => {
        req.estadoIA = "habilitado";
        const vinculo = {id: "v1", requerimientoId: "r1", reglaId: "g-rut",
          orden: 1, severidad: "bloqueante", parametros: {}, activa: true};
        requerimientoReglaRepository.listByRequerimiento
            .mockResolvedValue([vinculo]);
        requerimientoReglaRepository.getById.mockResolvedValue(vinculo);
        reglaIARepository.getByIds.mockResolvedValue([REGLA_RUT]);
        reglaIARepository.getById.mockResolvedValue(REGLA_RUT);
        const r = await servicio.actualizarVinculo("r1", "v1",
            {severidad: "advertencia"}, ACTOR);
        expect(r.aviso).toMatch(/vuelve a En definición/);
        expect(req.estadoIA).toBe("en_definicion");
      });
});

describe("probar", () => {
  it("una llamada al modelo, reglas aplicadas y prueba guardada con costo",
      async () => {
        req.estadoIA = "en_prueba";
        const vinculo = {id: "v1", requerimientoId: "r1", reglaId: "g-rut",
          orden: 1, severidad: "bloqueante", parametros: {}, activa: true};
        requerimientoReglaRepository.listByRequerimiento
            .mockResolvedValue([vinculo]);
        reglaIARepository.getByIds.mockResolvedValue([REGLA_RUT]);
        modeloReglasIAService.evaluar.mockResolvedValue({
          camposExtraidos: {rut: {valor: "11111111-1", confianza: 0.99},
            fechaVencimiento: {valor: null, confianza: 0.1}},
          interpretativas: [], tokensEntrada: 2000, tokensSalida: 400,
          intentos: 1, latenciaMs: 900,
        });
        pruebaReglaIARepository.create.mockImplementation(async (d) =>
          ({id: "p1", ...d}));
        const p = await servicio.probar("r1", {
          archivos: [{nombre: "anverso.jpg", mime: "image/jpeg",
            contenidoBase64: Buffer.from("x").toString("base64")},
          {nombre: "reverso.jpg", mime: "image/jpeg",
            contenidoBase64: Buffer.from("y").toString("base64")}],
          contexto: {rut: "11.111.111-1", fechaEvaluacion: "26/10/2026"},
        }, ACTOR);
        expect(modeloReglasIAService.evaluar).toHaveBeenCalledTimes(1);
        expect(modeloReglasIAService.evaluar.mock.calls[0][0].piezas)
            .toHaveLength(2);
        expect(p.resultadoPropuesto.resultado).toBe("cumple");
        expect(p.contextoUsado.fechaEvaluacion).toBe("2026-10-26");
        expect(p.costoEstimado).toBeCloseTo(0.004, 6);
        expect(p.archivoNombre).toBe("anverso.jpg + reverso.jpg");
      });

  it("rechaza archivos de más de 10 MB sin llamar al modelo", async () => {
    req.estadoIA = "en_definicion";
    requerimientoReglaRepository.listByRequerimiento.mockResolvedValue([
      {id: "v1", reglaId: "g-rut", severidad: "bloqueante", activa: true}]);
    reglaIARepository.getByIds.mockResolvedValue([REGLA_RUT]);
    const grande = Buffer.alloc(10 * 1024 * 1024 + 1).toString("base64");
    await expect(servicio.probar("r1", {archivos: [{nombre: "g.pdf",
      mime: "application/pdf", contenidoBase64: grande}]}, ACTOR))
        .rejects.toThrow("g.pdf supera los 10 MB.");
    expect(modeloReglasIAService.evaluar).not.toHaveBeenCalled();
  });

  it("solo en En definición o En prueba", async () => {
    req.estadoIA = "habilitado";
    await expect(servicio.probar("r1", {}, ACTOR)).rejects.toThrow(/En prueba/);
  });
});
