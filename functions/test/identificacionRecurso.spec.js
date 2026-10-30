// Identificación de Maquinaria: patente chilena o N° de serie (datos
// sintéticos; sin Firestore).
jest.mock("firebase-admin", () => ({firestore: () => ({})}));
jest.mock("../src/repositories/recursoRepository", () => ({
  listByPatente: jest.fn().mockResolvedValue([]),
}));
jest.mock("../src/repositories/empresaRepository", () => ({}));
jest.mock("../src/repositories/empresaRecursoRepository", () => ({}));
jest.mock("../src/services/empresaRecursoService", () => ({}));
jest.mock("../src/repositories/perfilRecursoRepository", () => ({}));
jest.mock("../src/utils/bitacoraLogger", () => ({}));
jest.mock("../src/services/bitacoraService", () => ({}));
jest.mock("../src/repositories/participacionRecursoRepository", () => ({}));
jest.mock("../src/utils/alcanceMandante", () => ({
  sujetoIdsVisibles: jest.fn().mockResolvedValue(null),
}));

const {
  normalizarPatente, esPatenteChilena,
} = require("../src/utils/identificacionRecurso");
const servicio = require("../src/services/recursoService");

const ACTOR = {uid: "u1", rol: "superadmin"};

describe("patente chilena", () => {
  it("normaliza separadores y minúsculas", () => {
    expect(normalizarPatente(" bb-cc 12 ")).toBe("BBCC12");
    expect(normalizarPatente("ab.12.34")).toBe("AB1234");
  });

  it("acepta autos y motos, rechaza otros formatos", () => {
    ["BBCC12", "AB1234", "AB123", "BCD12"].forEach((p) =>
      expect(esPatenteChilena(p)).toBe(true));
    ["TTUJ4", "CAT320", "1234AB", "B12"].forEach((p) =>
      expect(esPatenteChilena(p)).toBe(false));
  });
});

describe("recursoService: tipo de identificación", () => {
  it("patente: guarda sin separadores y exige formato", async () => {
    await expect(servicio._validarPatente("ttuj-45",
        {actor: ACTOR, tipoIdentificacion: "patente"})).resolves
        .toBe("TTUJ45");
    await expect(servicio._validarPatente("CAT 320",
        {actor: ACTOR, tipoIdentificacion: "patente"})).rejects
        .toThrow(/formato chileno/);
  });

  it("serie y sin tipo: texto libre en mayúsculas", async () => {
    await expect(servicio._validarPatente(" cat-320 88 ",
        {actor: ACTOR, tipoIdentificacion: "serie"})).resolves
        .toBe("CAT-320 88");
    await expect(servicio._validarPatente("abc", {actor: ACTOR})).resolves
        .toBe("ABC");
  });

  it("tipo no válido", () => {
    expect(() => servicio._validarTipoIdentificacion("vin"))
        .toThrow(/no válido/);
    expect(servicio._validarTipoIdentificacion(undefined)).toBeNull();
    expect(servicio._validarTipoIdentificacion("serie")).toBe("serie");
  });
});
