// Extracción con IA de los datos de una empresa (modelo y consumo
// simulados; datos sintéticos).
jest.mock("../src/repositories/mandanteRepository", () => ({
  getById: jest.fn(async (id) => (id === "m1" ? {id: "m1"} : null)),
}));
jest.mock("../src/services/aiConfigService", () => ({
  estado: jest.fn().mockResolvedValue({configurada: true}),
  obtenerParametros: jest.fn().mockResolvedValue({
    modeloPorDefecto: "modelo-demo",
    preciosPorModelo: {"modelo-demo": {entrada: 1, salida: 5}}}),
  validarLimiteMensual: jest.fn().mockResolvedValue(),
  MENSAJE_SIN_PRECIOS: "Sin precios.",
}));
jest.mock("../src/services/modeloReglasIAService", () => ({
  evaluar: jest.fn(),
}));
jest.mock("../src/services/registroConsumoIAService", () => ({
  ORIGENES: {EXTRACCION_EMPRESA: "extraccion_empresa"},
  registrar: jest.fn().mockResolvedValue(null),
}));
jest.mock("../src/services/requerimientoReglaIAService", () => ({
  MAX_ARCHIVOS: 6,
  _piezas: jest.fn((archivos) => archivos.map((a) => ({...a,
    buffer: Buffer.from("x")}))),
}));

const modelo = require("../src/services/modeloReglasIAService");
const registro = require("../src/services/registroConsumoIAService");
const servicio = require("../src/services/extraccionEmpresaService");

const SUPER = {uid: "s1", rol: "superadmin"};
const ARCHIVO = [{nombre: "e-RUT.pdf", mime: "application/pdf"}];
const respuesta = (rut) => ({
  camposExtraidos: {razonSocial: {valor: "TECNORED S.A.", confianza: 0.95},
    rut: {valor: rut, confianza: 0.9}, giro: {valor: "Telecom",
      confianza: 0.8}, direccion: {valor: null, confianza: 0.2}},
  tokensEntrada: 1000, tokensSalida: 200,
});

beforeEach(() => jest.clearAllMocks());

describe("extracción de datos de la empresa", () => {
  test("una sola llamada con los 4 campos; consumo con el Mandante y " +
      "origen extraccion_empresa; RUT validado con DV", async () => {
    modelo.evaluar.mockResolvedValue(respuesta("77.104.219-8"));
    const r = await servicio.extraer({mandanteId: "m1", archivos: ARCHIVO},
        SUPER);
    expect(modelo.evaluar).toHaveBeenCalledTimes(1);
    expect(modelo.evaluar.mock.calls[0][0].campos.map((c) => c.clave))
        .toEqual(["razonSocial", "rut", "giro", "direccion"]);
    expect(registro.registrar).toHaveBeenCalledWith(expect.objectContaining({
      mandanteId: "m1", origen: "extraccion_empresa", modelo: "modelo-demo",
      tokensEntrada: 1000, tokensSalida: 200, createdBy: "s1"}));
    expect(r).toMatchObject({rutValido: true,
      campos: {razonSocial: {valor: "TECNORED S.A."}}});
    expect(r.costoEstimado).toBeGreaterThan(0);
  });

  test("RUT con DV inválido: se informa, no se corrige", async () => {
    modelo.evaluar.mockResolvedValue(respuesta("77.104.219-1"));
    const r = await servicio.extraer({mandanteId: "m1", archivos: ARCHIVO},
        SUPER);
    expect(r.rutValido).toBe(false);
  });

  test("si el modelo responde mal, el consumo igual queda registrado",
      async () => {
        modelo.evaluar.mockRejectedValue(Object.assign(new Error("inválida"),
            {tokens: {tokensEntrada: 50, tokensSalida: 5}}));
        await expect(servicio.extraer({mandanteId: "m1", archivos: ARCHIVO},
            SUPER)).rejects.toThrow(/inválida/);
        expect(registro.registrar).toHaveBeenCalledWith(
            expect.objectContaining({tokensEntrada: 50,
              origen: "extraccion_empresa"}));
      });

  test("solo superadmin y con un Mandante existente", async () => {
    await expect(servicio.extraer({mandanteId: "m1", archivos: ARCHIVO},
        {uid: "e", rol: "evaluador"})).rejects.toMatchObject({status: 403});
    await expect(servicio.estimar({mandanteId: "otro"}, SUPER))
        .rejects.toMatchObject({status: 400});
    expect(modelo.evaluar).not.toHaveBeenCalled();
  });

  test("estimar: conexión activa y costo del documento", async () => {
    const r = await servicio.estimar({mandanteId: "m1",
      archivos: [{mime: "application/pdf", paginas: 2}]}, SUPER);
    expect(r).toMatchObject({conexionActiva: true, modelo: "modelo-demo",
      faltanPrecios: false});
    expect(r.costoEstimadoUsd).toBeGreaterThan(0);
  });
});
