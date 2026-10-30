// Nueva Empresa desde carpeta: alta con la Carpeta de empresa en el mismo
// lote, y extracción con IA (Firestore, repositorios y modelo simulados;
// datos sintéticos).
const mockEscrituras = [];
let mockFallo = null;
let mockIndiceRut = false;
const mockRef = (coleccion, id) => ({coleccion, id: id || `auto-${coleccion}`,
  get: async () => ({exists: coleccion === "empresasRut" && mockIndiceRut,
    data: () => ({empresaId: "emp-existente"})})});
jest.mock("firebase-admin", () => ({
  firestore: () => ({
    collection: (c) => ({doc: (id) => mockRef(c, id)}),
    batch: () => ({
      create: (r, d) => mockEscrituras.push({op: "create", ...r, d}),
      set: (r, d) => mockEscrituras.push({op: "set", ...r, d}),
      commit: async () => {
        if (mockFallo) throw mockFallo;
      },
    }),
  }),
}));
jest.mock("firebase-admin/firestore", () => ({
  FieldValue: {serverTimestamp: () => "AHORA"},
}));
jest.mock("../src/repositories/empresaRepository", () => ({
  COLLECTION: "empresas",
  getById: jest.fn().mockResolvedValue({id: "emp-existente",
    razonSocial: "TECNORED S.A.", rut: "771042198"}),
}));
jest.mock("../src/repositories/empresaMandanteRepository", () => ({
  ref: (e, m) => ({coleccion: "empresaMandantes", id: `${e}_${m}`}),
  datosActivo: () => ({estado: "activo"}),
  estaActiva: jest.fn().mockResolvedValue(false),
}));
jest.mock("../src/repositories/mandanteRepository", () => ({
  getById: jest.fn().mockResolvedValue({id: "m1", estado: "activo"}),
}));
["empresaPersonaRepository", "empresaRecursoRepository",
  "participacionRepository", "proyectoRepository", "personaRepository",
  "recursoRepository", "perfilParticipacionRepository",
  "participacionPersonaRepository", "participacionRecursoRepository"]
    .forEach((n) => jest.doMock(`../src/repositories/${n}`, () => ({})));
jest.mock("../src/services/reporteService", () => ({}));
jest.mock("../src/services/bitacoraService", () => ({}));
jest.mock("../src/utils/bitacoraLogger", () => ({
  registrarEvento: jest.fn().mockResolvedValue(),
}));
jest.mock("../src/services/carpetaEmpresaService", () => ({
  prepararParaNuevaEmpresa: jest.fn(),
}));

const bitacoraLogger = require("../src/utils/bitacoraLogger");
const carpetaEmpresaService = require("../src/services/carpetaEmpresaService");
const empresaService = require("../src/services/empresaService");

const SUPER = {uid: "s1", rol: "superadmin"};
const DATOS = {rut: "77.104.219-8", razonSocial: "Tecnored S.A.",
  nombreFantasia: "TECNORED", giro: "Telecomunicaciones", mandanteId: "m1"};
const CARPETA = {id: "c1", coleccion: "carpetasEmpresa", datos: {
  mandanteId: "m1", fuenteId: "f1", ruta: "1. TECNORED", proyectoId: null,
  expedienteId: null, estado: "activa"}};

beforeEach(() => {
  jest.clearAllMocks();
  mockEscrituras.length = 0;
  mockFallo = null;
  mockIndiceRut = false;
  carpetaEmpresaService.prepararParaNuevaEmpresa.mockResolvedValue(CARPETA);
});

describe("crear empresa con carpeta", () => {
  test("registra la carpeta en el mismo lote, libre, y deja los orígenes " +
      "en la Bitácora", async () => {
    const r = await empresaService.crearEmpresa({...DATOS,
      carpeta: {ruta: "1. TECNORED"},
      origenes: {nombreFantasia: "Desde nombre de carpeta",
        rut: "Desde documento «e-RUT.pdf»", otro: "x"}}, SUPER);
    expect(carpetaEmpresaService.prepararParaNuevaEmpresa)
        .toHaveBeenCalledWith(expect.objectContaining({mandanteId: "m1",
          ruta: "1. TECNORED", empresa: expect.objectContaining({
            rut: "771042198", nombreFantasia: "TECNORED"})}));
    const carpeta = mockEscrituras.find((e) =>
      e.coleccion === "carpetasEmpresa");
    expect(carpeta).toMatchObject({op: "create", id: "c1", d: {
      empresaId: r.id, proyectoId: null, expedienteId: null}});
    expect(mockEscrituras.map((e) => e.coleccion)).toEqual(
        expect.arrayContaining(["empresasRut", "empresas",
          "empresaMandantes", "carpetasEmpresa"]));
    expect(r.carpetaEmpresaId).toBe("c1");
    expect(bitacoraLogger.registrarEvento).toHaveBeenCalledWith(
        expect.objectContaining({entidad: "empresa", accion: "creado",
          detalle: expect.objectContaining({carpeta: "1. TECNORED",
            origenes: {nombreFantasia: "Desde nombre de carpeta",
              rut: "Desde documento «e-RUT.pdf»"}})}));
    expect(bitacoraLogger.registrarEvento).toHaveBeenCalledWith(
        expect.objectContaining({entidad: "carpetasEmpresa",
          accion: "registrada"}));
  });

  test("RUT duplicado: no crea nada y ofrece la empresa existente",
      async () => {
        mockFallo = Object.assign(new Error("ya existe"), {code: 6});
        mockIndiceRut = true;
        await expect(empresaService.crearEmpresa({...DATOS,
          carpeta: {ruta: "1. TECNORED"}}, SUPER))
            .rejects.toMatchObject({status: 409, codigo: "RUT_EXISTENTE"});
        expect(bitacoraLogger.registrarEvento).not.toHaveBeenCalled();
      });

  test("carpeta registrada a otra empresa entre medio: rechaza todo",
      async () => {
        mockFallo = Object.assign(new Error("ya existe"), {code: 6});
        await expect(empresaService.crearEmpresa({...DATOS,
          carpeta: {ruta: "1. TECNORED"}}, SUPER))
            .rejects.toThrow(/se registró a otra empresa/);
        expect(bitacoraLogger.registrarEvento).not.toHaveBeenCalled();
      });

  test("validación estricta o carpeta ya registrada: no se escribe nada",
      async () => {
        carpetaEmpresaService.prepararParaNuevaEmpresa.mockRejectedValue(
            Object.assign(new Error("no corresponde"), {status: 400}));
        await expect(empresaService.crearEmpresa({...DATOS,
          carpeta: {ruta: "Otra"}}, SUPER)).rejects.toThrow(/no corresponde/);
        expect(mockEscrituras).toEqual([]);
      });

  test("solo superadmin registra la carpeta; sin carpeta, como hoy",
      async () => {
        await expect(empresaService.crearEmpresa({...DATOS,
          carpeta: {ruta: "1. TECNORED"}}, {uid: "a", rol: "admin_comercial"}))
            .rejects.toMatchObject({status: 403});
        const r = await empresaService.crearEmpresa(DATOS,
            {uid: "a", rol: "admin_comercial"});
        expect(r.carpetaEmpresaId).toBeUndefined();
        expect(carpetaEmpresaService.prepararParaNuevaEmpresa)
            .not.toHaveBeenCalled();
      });
});
