// Umbrales del nivel de acreditación por Mandante (datos sintéticos; sin
// Firestore).
jest.mock("firebase-admin", () => ({firestore: () => ({})}));
jest.mock("../src/repositories/mandanteRepository", () => ({
  getById: jest.fn().mockResolvedValue({id: "m1", estado: "activo"}),
  update: jest.fn(async (id, data) => ({id, ...data})),
}));

const mandanteRepository = require("../src/repositories/mandanteRepository");
const mandanteService = require("../src/services/mandanteService");
const {
  validarUmbralesAcreditacion,
} = require("../src/utils/umbralesAcreditacion");

describe("validarUmbralesAcreditacion", () => {
  test("acepta enteros con Aceptable menor que Acreditada", () => {
    expect(validarUmbralesAcreditacion({acreditada: 95, aceptable: 80}))
        .toEqual({acreditada: 95, aceptable: 80});
    expect(validarUmbralesAcreditacion({acreditada: "100", aceptable: "85"}))
        .toEqual({acreditada: 100, aceptable: 85});
  });

  test("null vuelve a los de defecto", () => {
    expect(validarUmbralesAcreditacion(null)).toBeNull();
  });

  test("rechaza valores fuera de rango, decimales o desordenados", () => {
    [
      {acreditada: 101, aceptable: 85},
      {acreditada: 100, aceptable: 0},
      {acreditada: 99.5, aceptable: 85},
      {acreditada: 85, aceptable: 85},
      {acreditada: 80, aceptable: 90},
      {acreditada: 100},
      "100",
      [100, 85],
    ].forEach((v) => {
      expect(() => validarUmbralesAcreditacion(v)).toThrow();
    });
  });
});

describe("actualizarMandante con umbralesAcreditacion", () => {
  beforeEach(() => mandanteRepository.update.mockClear());

  test("mandante_admin puede configurar los de su Mandante", async () => {
    await mandanteService.actualizarMandante("m1",
        {umbralesAcreditacion: {acreditada: 95, aceptable: 75}},
        {rol: "mandante_admin", mandanteId: "m1"});
    expect(mandanteRepository.update).toHaveBeenCalledWith("m1",
        {umbralesAcreditacion: {acreditada: 95, aceptable: 75}});
  });

  test("superadmin con valores inválidos recibe 400", async () => {
    await expect(mandanteService.actualizarMandante("m1",
        {umbralesAcreditacion: {acreditada: 80, aceptable: 90}},
        {rol: "superadmin"})).rejects.toMatchObject({status: 400});
    expect(mandanteRepository.update).not.toHaveBeenCalled();
  });
});
