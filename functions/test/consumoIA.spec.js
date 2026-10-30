// Registro y resumen de consumo de IA por Mandante (datos sintéticos; sin
// Firestore).
jest.mock("firebase-admin", () => ({firestore: () => ({})}));
jest.mock("../src/repositories/consumoIARepository", () => ({
  crear: jest.fn(async (id) => id || "auto"),
  listEntre: jest.fn(),
}));
jest.mock("../src/repositories/sesionRevisionRepository", () => ({}));
jest.mock("../src/repositories/mandanteRepository", () => ({
  getByIds: jest.fn(async (ids) => ids.filter(Boolean).map((id) => ({
    id, razonSocial: `Mandante ${id}`, logoUrl: null}))),
}));
jest.mock("../src/services/aiConfigService", () => ({}));

const consumoIARepository = require("../src/repositories/consumoIARepository");
const registroConsumoIAService =
    require("../src/services/registroConsumoIAService");
const consumoIAService = require("../src/services/consumoIAService");

const {armarRegistro, ORIGENES} = registroConsumoIAService;
const SUPERADMIN = {rol: "superadmin", uid: "u1"};
const fecha = (iso) => ({toDate: () => new Date(iso)});

describe("armarRegistro", () => {
  test("congela el precio y calcula el costo con él", () => {
    const r = armarRegistro({mandanteId: "m1",
      origen: ORIGENES.PRUEBA_REGLAS, modelo: "modelo-x",
      tokensEntrada: 1000000, tokensSalida: 500000,
      precio: {entrada: 3, salida: 15}, createdBy: "u1"});
    expect(r).toMatchObject({mandanteId: "m1", origen: "prueba_reglas",
      precioEntradaUsdMillon: 3, precioSalidaUsdMillon: 15, costoUsd: 10.5,
      expedienteId: null, createdBy: "u1"});
  });

  test("sin precio el costo es 0", () => {
    expect(armarRegistro({origen: ORIGENES.PROBAR_CONEXION, modelo: "m",
      tokensEntrada: 10, tokensSalida: 2}).costoUsd).toBe(0);
  });
});

describe("registrar", () => {
  test("con fuente usa un ID determinístico (no duplica)", async () => {
    const id = await registroConsumoIAService.registrar({
      origen: ORIGENES.REVISION_CARPETA, modelo: "m",
      fuente: {coleccion: "procesamientosIA", id: "p1"}});
    expect(id).toBe("procesamientosIA_p1");
  });

  test("nunca lanza si falla la escritura", async () => {
    consumoIARepository.crear.mockRejectedValueOnce(new Error("caída"));
    const espia = jest.spyOn(console, "error").mockImplementation(() => {});
    await expect(registroConsumoIAService.registrar({
      origen: ORIGENES.PROBAR_CONEXION, modelo: "m"})).resolves.toBeNull();
    espia.mockRestore();
  });
});

describe("resumen", () => {
  const items = [
    {mandanteId: "m1", origen: "revision_carpeta", tipoDocumentalId: "t1",
      tipoDocumentalNombre: "Cédula", tokensEntrada: 100, tokensSalida: 10,
      costoUsd: 0.3, createdAt: fecha("2026-10-05T15:00:00Z")},
    {mandanteId: "m1", origen: "revision_requerimiento",
      tipoDocumentalId: "t1", tipoDocumentalNombre: "Cédula",
      tokensEntrada: 100, tokensSalida: 10, costoUsd: 0.1,
      createdAt: fecha("2026-10-06T15:00:00Z")},
    {mandanteId: "m2", origen: "prueba_reglas", tipoDocumentalId: "t2",
      tipoDocumentalNombre: "Licencia", tokensEntrada: 50, tokensSalida: 5,
      costoUsd: 0.5, createdAt: fecha("2026-10-07T15:00:00Z")},
    {mandanteId: null, origen: "probar_conexion", tokensEntrada: 10,
      tokensSalida: 2, costoUsd: 0.9, createdAt: fecha("2026-10-08T15:00:00Z")},
  ];

  beforeEach(() => consumoIARepository.listEntre.mockReset());

  test("solo superadmin", async () => {
    await expect(consumoIAService.resumen({},
        {rol: "mandante_admin", mandanteId: "m1"}))
        .rejects.toMatchObject({status: 403});
  });

  test("total y por Mandante, ordenado por costo y el interno al final",
      async () => {
        consumoIARepository.listEntre.mockResolvedValue(items);
        const r = await consumoIAService.resumen(
            {desde: "2026-10-01", hasta: "2026-10-31"}, SUPERADMIN);
        expect(r.total).toMatchObject({llamadas: 4, documentos: 3,
          tokensEntrada: 260, tokensSalida: 27, costoUsd: 1.8});
        expect(r.porMandante.map((m) => m.mandanteId))
            .toEqual(["m2", "m1", null]);
        const m1 = r.porMandante[1];
        expect(m1).toMatchObject({documentos: 2, costoUsd: 0.4,
          costoPromedioDocumentoUsd: 0.2, porcentaje: 22.2,
          mandanteNombre: "Mandante m1"});
        expect(r.porMandante[2]).toMatchObject({mandanteNombre: null,
          documentos: 0, llamadas: 1});
        expect(r.detalle).toBeUndefined();
      });

  test("con Mandante: desglose por origen, tipo y 6 meses", async () => {
    const delM1 = items.filter((i) => i.mandanteId === "m1");
    consumoIARepository.listEntre.mockResolvedValue(delM1);
    const r = await consumoIAService.resumen({desde: "2026-10-01",
      hasta: "2026-10-31", mandanteId: "m1"}, SUPERADMIN);
    expect(consumoIARepository.listEntre.mock.calls[0][2]).toBe("m1");
    expect(r.detalle.porOrigen.map((o) => o.origen))
        .toEqual(["revision_carpeta", "revision_requerimiento"]);
    expect(r.detalle.porTipoDocumental).toEqual([expect.objectContaining({
      tipoDocumentalNombre: "Cédula", documentos: 2, costoUsd: 0.4})]);
    expect(r.detalle.porMes.map((m) => m.mes)).toEqual(["2026-05",
      "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"]);
    expect(r.detalle.porMes[5].costoUsd).toBe(0.4);
  });

  test("\"interno\" filtra los sin Mandante", async () => {
    consumoIARepository.listEntre.mockResolvedValue([]);
    await consumoIAService.resumen({desde: "2026-10-01",
      hasta: "2026-10-31", mandanteId: "interno"}, SUPERADMIN);
    expect(consumoIARepository.listEntre.mock.calls[0][2]).toBeNull();
  });

  test("rechaza fechas inválidas o desordenadas", async () => {
    await expect(consumoIAService.resumen({desde: "2026-02-30",
      hasta: "2026-03-01"}, SUPERADMIN)).rejects.toMatchObject({status: 400});
    await expect(consumoIAService.resumen({desde: "2026-03-02",
      hasta: "2026-03-01"}, SUPERADMIN)).rejects.toMatchObject({status: 400});
  });
});
