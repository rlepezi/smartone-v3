// Nueva Empresa sin carpeta: las carpetas se registran por proyecto y empresa
// en el Mapeo documental, nunca en el alta (Firestore y repositorios
// simulados; datos sintéticos).
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

const bitacoraLogger = require("../src/utils/bitacoraLogger");
const empresaService = require("../src/services/empresaService");

const SUPER = {uid: "s1", rol: "superadmin"};
const DATOS = {rut: "77.104.219-8", razonSocial: "Tecnored S.A.",
  nombreFantasia: "TECNORED", giro: "Telecomunicaciones", mandanteId: "m1"};

beforeEach(() => {
  jest.clearAllMocks();
  mockEscrituras.length = 0;
  mockFallo = null;
  mockIndiceRut = false;
});

describe("crear empresa sin carpeta", () => {
  test("una carpeta en el payload se ignora: solo empresa, índice RUT y " +
      "vínculo con el Mandante", async () => {
    const r = await empresaService.crearEmpresa({...DATOS,
      carpeta: {ruta: "1. TECNORED"}, origenes: {rut: "x"}}, SUPER);
    expect(mockEscrituras.map((e) => e.coleccion).sort()).toEqual(
        ["empresaMandantes", "empresas", "empresasRut"]);
    expect(r.carpetaEmpresaId).toBeUndefined();
    expect(bitacoraLogger.registrarEvento).toHaveBeenCalledTimes(1);
    expect(bitacoraLogger.registrarEvento).toHaveBeenCalledWith(
        expect.objectContaining({entidad: "empresa", accion: "creado",
          detalle: {razonSocial: "TECNORED S.A.", mandanteId: "m1"}}));
  });

  test("RUT duplicado: no crea nada y ofrece la empresa existente",
      async () => {
        mockFallo = Object.assign(new Error("ya existe"), {code: 6});
        mockIndiceRut = true;
        await expect(empresaService.crearEmpresa(DATOS, SUPER))
            .rejects.toMatchObject({status: 409, codigo: "RUT_EXISTENTE"});
        expect(bitacoraLogger.registrarEvento).not.toHaveBeenCalled();
      });
});
