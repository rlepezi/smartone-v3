// Guardar el repositorio documental exige que la carpeta sea de la Empresa
// del Expediente (datos sintéticos; sin Firestore).
jest.mock("../src/services/expedienteService", () => ({
  getExpedienteById: jest.fn().mockResolvedValue({id: "e1",
    empresaId: "emp1", mandanteId: "m1", estado: "en_ejecucion"}),
}));
jest.mock("../src/repositories/configRevisionExpedienteRepository", () => ({
  get: jest.fn().mockResolvedValue(null),
  guardar: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../src/repositories/participacionPersonaRepository", () => ({}));
jest.mock("../src/repositories/participacionRecursoRepository", () => ({}));
jest.mock("../src/repositories/usuarioRepository", () => ({
  getById: jest.fn().mockResolvedValue({nombre: "Ana Demo"}),
}));
jest.mock("../src/repositories/empresaRepository", () => ({
  getById: jest.fn().mockResolvedValue({id: "emp1",
    razonSocial: "ADMINISTRADORA PLAZA S.A.", rut: "99.581.960-0"}),
}));
jest.mock("../src/utils/bitacoraLogger", () => ({
  registrarEvento: jest.fn().mockResolvedValue(undefined),
}));

const configRepository =
    require("../src/repositories/configRevisionExpedienteRepository");
const servicio = require("../src/services/repositorioDocumentalService");

const ACTOR = {uid: "u1", rol: "evaluador"};

describe("actualizar: carpeta de la Empresa", () => {
  beforeEach(() => {
    configRepository.guardar.mockClear();
    jest.spyOn(servicio, "obtener").mockResolvedValue({});
  });

  test("rechaza con 400 una carpeta local de otra empresa", async () => {
    await expect(servicio.actualizar("e1",
        {tipo: "local", etiqueta: "2. PROYECTO B"}, ACTOR))
        .rejects.toMatchObject({status: 400,
          message: expect.stringContaining("«2. PROYECTO B»")});
    expect(configRepository.guardar).not.toHaveBeenCalled();
  });

  test("rechaza una URL de SharePoint sin carpeta", async () => {
    await expect(servicio.actualizar("e1", {tipo: "sharepoint",
      url: "https://demo.sharepoint.com/"}, ACTOR))
        .rejects.toMatchObject({status: 400});
  });

  test("guarda la carpeta que coincide (local y SharePoint)", async () => {
    await servicio.actualizar("e1",
        {tipo: "local", etiqueta: "4. Administradora Plaza"}, ACTOR);
    await servicio.actualizar("e1", {tipo: "sharepoint",
      url: "https://demo.sharepoint.com/sites/r/Docs/99581960-0%20Plaza"},
    ACTOR);
    expect(configRepository.guardar).toHaveBeenCalledTimes(2);
  });

  test("quitar la vinculación no valida nada", async () => {
    await servicio.actualizar("e1", {tipo: null}, ACTOR);
    expect(configRepository.guardar).toHaveBeenCalledTimes(1);
  });
});
