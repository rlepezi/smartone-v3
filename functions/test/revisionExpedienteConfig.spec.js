// Carpeta de Revisiones IA del Expediente: misma validación estricta que
// el repositorio documental, y una carpeta "libre" nunca lo escribe.
// Datos sintéticos; sin Firestore.
jest.mock("../src/services/expedienteService", () => ({
  getExpedienteById: jest.fn().mockResolvedValue({id: "e1",
    empresaId: "emp1", mandanteId: "m1", estado: "en_ejecucion"}),
}));
jest.mock("../src/repositories/configRevisionExpedienteRepository", () => ({
  get: jest.fn(), guardar: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../src/repositories/expedienteRequerimientoRepository", () => ({
  listByExpediente: jest.fn().mockResolvedValue([]),
}));
jest.mock("../src/repositories/requerimientoRepository", () => ({
  getByIds: jest.fn().mockResolvedValue([]),
}));
jest.mock("../src/repositories/tipoDocumentalRepository", () => ({
  list: jest.fn().mockResolvedValue([]),
}));
jest.mock("../src/repositories/plantillaEstructuraRepository", () => ({
  getActiva: jest.fn().mockResolvedValue(null),
}));
jest.mock("../src/repositories/empresaRepository", () => ({
  getById: jest.fn().mockResolvedValue({id: "emp1", razonSocial: "SLV",
    rut: "76.111.222-3"}),
}));
jest.mock("../src/repositories/usuarioRepository", () => ({
  getById: jest.fn().mockResolvedValue({nombre: "Ana", apellido: "Demo"}),
}));
[
  "evaluacionRepository", "resultadoRevisionRepository",
  "procesamientoIARepository", "participacionPersonaRepository",
  "participacionRecursoRepository", "personaRepository", "recursoRepository",
  "sesionRevisionRepository",
].forEach((r) => jest.mock(`../src/repositories/${r}`, () => ({})));
jest.mock("../src/services/resolucionService", () => ({}));
jest.mock("../src/utils/bitacoraLogger", () => ({
  registrarEvento: jest.fn().mockResolvedValue(undefined),
}));

const configRepository =
    require("../src/repositories/configRevisionExpedienteRepository");
const servicio = require("../src/services/revisionExpedienteService");

const ACTOR = {uid: "u1", rol: "evaluador"};
const REPO_PREVIO = {tipo: "local", etiqueta: "21. SLV (Proyectos 2024)",
  url: null, mapeo: {carpetaPersonas: "Personal", carpetaRecursos: null,
    requerimientos: {}}};

describe("guardarConfig: carpeta del expediente", () => {
  beforeEach(() => {
    configRepository.guardar.mockClear();
    configRepository.get.mockResolvedValue({
      carpetaNombre: REPO_PREVIO.etiqueta, modoEstructura: "plantilla",
      repositorioDocumental: REPO_PREVIO,
    });
    jest.spyOn(servicio, "obtenerConfig").mockResolvedValue({});
  });

  test("rechaza con 400 la carpeta de otra empresa", async () => {
    await expect(servicio.guardarConfig("e1",
        {carpetaNombre: "Raúl Lepez"}, ACTOR))
        .rejects.toMatchObject({status: 400,
          message: expect.stringContaining("«Raúl Lepez»")});
    expect(configRepository.guardar).not.toHaveBeenCalled();
  });

  test("también valida la carpeta libre", async () => {
    await expect(servicio.guardarConfig("e1",
        {carpetaNombre: "Documentos sueltos", modoEstructura: "libre"},
        ACTOR)).rejects.toMatchObject({status: 400});
  });

  test("una carpeta libre no escribe el repositorio documental", async () => {
    await servicio.guardarConfig("e1",
        {carpetaNombre: "SLV documentos sueltos", modoEstructura: "libre"},
        ACTOR);
    const guardado = configRepository.guardar.mock.calls[0][1];
    expect(guardado.carpetaNombre).toBe("SLV documentos sueltos");
    expect(guardado.repositorioDocumental).toBe(REPO_PREVIO);
  });

  test("quitar una carpeta libre tampoco toca el repositorio", async () => {
    configRepository.get.mockResolvedValue({
      carpetaNombre: "SLV documentos sueltos", modoEstructura: "libre",
      repositorioDocumental: REPO_PREVIO,
    });
    await servicio.guardarConfig("e1", {carpetaNombre: null}, ACTOR);
    expect(configRepository.guardar.mock.calls[0][1].repositorioDocumental)
        .toBe(REPO_PREVIO);
  });

  test("con estructura, la carpeta nueva se refleja en el repositorio",
      async () => {
        await servicio.guardarConfig("e1",
            {carpetaNombre: "SLV 2025", modoEstructura: "plantilla"}, ACTOR);
        const repo = configRepository.guardar.mock.calls[0][1]
            .repositorioDocumental;
        expect(repo).toMatchObject({tipo: "local", etiqueta: "SLV 2025",
          mapeo: REPO_PREVIO.mapeo});
      });

  test("sin cambio de carpeta no se valida de nuevo", async () => {
    configRepository.get.mockResolvedValue({carpetaNombre: "Raúl Lepez",
      modoEstructura: "plantilla", repositorioDocumental: null});
    await servicio.guardarConfig("e1", {requerimientosIA: []}, ACTOR);
    expect(configRepository.guardar).toHaveBeenCalled();
  });
});
