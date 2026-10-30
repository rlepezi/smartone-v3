jest.mock("firebase-admin", () => ({firestore: () => ({})}));
jest.mock("../src/services/plantillaEstructuraService", () => ({}));
jest.mock("../src/services/aiConfigService", () => ({}));
jest.mock("../src/repositories/tipoDocumentalRepository", () => ({}));
jest.mock("../src/repositories/empresaMandanteRepository", () => ({}));
jest.mock("../src/repositories/empresaRepository", () => ({}));
jest.mock("../src/repositories/empresaPersonaRepository", () => ({}));
jest.mock("../src/repositories/personaRepository", () => ({}));
jest.mock("../src/repositories/expedienteRepository", () => ({}));
jest.mock("../src/repositories/proyectoRepository", () => ({}));

const {empresaPorNombre} =
    require("../src/services/estructuraRevisionService");
const {extraerNombreEmpresa} = require("../src/utils/estructuraCalce");

const detectado = extraerNombreEmpresa("1. TECNORED").nombreEmpresa;

describe("calce de empresa por nombre (umbral 0.75)", () => {
  it("no sugiere una empresa con nombre distinto", () => {
    expect(empresaPorNombre(detectado,
        [{id: "e1", razonSocial: "ADMINISTRADORA PLAZA S.A."}])).toBeNull();
  });

  it("sugiere la empresa con el mismo nombre", () => {
    const r = empresaPorNombre(detectado, [
      {id: "e1", razonSocial: "ADMINISTRADORA PLAZA S.A."},
      {id: "e2", razonSocial: "TECNORED SpA"},
    ]);
    expect(r.empresa.id).toBe("e2");
    expect(r.similitud).toBeGreaterThanOrEqual(0.75);
  });
});
