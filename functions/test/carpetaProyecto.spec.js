// Carpeta raíz del Proyecto (proyectos.repositorioDocumental): guardar,
// cambiar y quitar, con aislamiento por Mandante, permisos y Bitácora.
// Repositorios simulados; datos sintéticos.
const mockProyectos = new Map();
let mockFuentes = [];

jest.mock("../src/repositories/proyectoRepository", () => ({
  getById: jest.fn(async (id) => (mockProyectos.has(id) ?
    {id, ...mockProyectos.get(id)} : null)),
  update: jest.fn(async (id, data) => {
    Object.assign(mockProyectos.get(id), data);
    return {id, ...mockProyectos.get(id)};
  }),
}));
jest.mock("../src/repositories/fuenteDocumentalRepository", () => ({
  list: jest.fn(async (m) => mockFuentes.filter((f) => f.mandanteId === m)),
}));
["mandanteRepository", "participacionRepository", "expedienteRepository",
  "participacionPersonaRepository", "participacionRecursoRepository"]
    .forEach((n) => jest.doMock(`../src/repositories/${n}`, () => ({})));
jest.mock("../src/services/bitacoraService", () => ({}));
jest.mock("../src/utils/bitacoraLogger", () => ({
  registrarEvento: jest.fn(async () => undefined),
}));

const bitacoraLogger = require("../src/utils/bitacoraLogger");
const proyectoService = require("../src/services/proyectoService");

const SUPER = {uid: "s1", rol: "superadmin"};
const ADMIN_M1 = {uid: "a1", rol: "mandante_admin", mandanteId: "m1"};
const ADMIN_M2 = {uid: "a2", rol: "mandante_admin", mandanteId: "m2"};
const EVALUADOR = {uid: "e1", rol: "evaluador"};
const LOCAL = {id: "f1", mandanteId: "m1", tipo: "local", estado: "activa",
  etiqueta: "Repositorio"};
const guardar = (valor, actor = ADMIN_M1) =>
  proyectoService.actualizarRepositorioDocumental("p1", valor, actor);

beforeEach(() => {
  jest.clearAllMocks();
  mockProyectos.clear();
  mockProyectos.set("p1", {mandanteId: "m1", nombre: "PLANTA NORTE",
    estado: "en_ejecucion"});
  mockFuentes = [LOCAL];
});

describe("carpeta del proyecto", () => {
  test("guardar, cambiar y quitar (null), con la Bitácora del valor " +
      "anterior y el nuevo", async () => {
    const a = await guardar({tipo: "local", ruta: " Planta Norte "});
    expect(a.repositorioDocumental).toEqual({tipo: "local", fuenteId: "f1",
      ruta: "Planta Norte", url: null,
      // Referencia común de carpeta (junto a los campos de siempre).
      referencia: {tipoFuente: "local", driveId: null, itemId: null,
        nombre: "Planta Norte", rutaRelativa: "Planta Norte"}});
    expect(bitacoraLogger.registrarEvento).toHaveBeenLastCalledWith(
        expect.objectContaining({entidad: "proyecto", entidadId: "p1",
          accion: "carpeta_proyecto_actualizada", mandanteId: "m1",
          detalle: {anterior: null, nuevo: a.repositorioDocumental}}));

    const b = await guardar({tipo: "local", ruta: "Proyectos/Planta Norte"});
    expect(b.repositorioDocumental.ruta).toBe("Proyectos/Planta Norte");
    expect(bitacoraLogger.registrarEvento).toHaveBeenLastCalledWith(
        expect.objectContaining({detalle: {anterior: a.repositorioDocumental,
          nuevo: b.repositorioDocumental}}));

    const c = await guardar(null);
    expect(c.repositorioDocumental).toBeNull();
    expect(mockProyectos.get("p1")).toHaveProperty("repositorioDocumental",
        null);
    expect(bitacoraLogger.registrarEvento).toHaveBeenLastCalledWith(
        expect.objectContaining({detalle: {anterior: b.repositorioDocumental,
          nuevo: null}}));
    expect(bitacoraLogger.registrarEvento).toHaveBeenCalledTimes(3);
  });

  test("sin cambios no escribe ni registra", async () => {
    await guardar({tipo: "local", ruta: "Planta Norte"});
    await guardar({tipo: "local", ruta: "Planta Norte"});
    expect(bitacoraLogger.registrarEvento).toHaveBeenCalledTimes(1);
  });

  test("SharePoint: URL dentro del sitio de la fuente", async () => {
    mockFuentes = [{id: "f2", mandanteId: "m1", tipo: "sharepoint",
      estado: "activa", config: {siteUrl: "https://acme.sharepoint.com/sites/docs"}}];
    const r = await guardar({tipo: "sharepoint",
      url: "https://acme.sharepoint.com/sites/docs/Shared%20Documents/Planta%20Norte"});
    expect(r.repositorioDocumental).toMatchObject({tipo: "sharepoint",
      fuenteId: "f2", ruta: "Planta Norte"});
    await expect(guardar({tipo: "sharepoint",
      url: "https://otra.sharepoint.com/sites/x/Planta"}))
        .rejects.toMatchObject({status: 400});
  });

  test("valida tipo, ruta y fuente", async () => {
    await expect(guardar({tipo: "ftp", ruta: "x"}))
        .rejects.toMatchObject({status: 400});
    await expect(guardar({tipo: "local", ruta: "  "}))
        .rejects.toMatchObject({status: 400,
          message: "Indique la carpeta del proyecto."});
    await expect(guardar({tipo: "local", ruta: "../fuera"}))
        .rejects.toMatchObject({status: 400});
    await expect(guardar({tipo: "sharepoint",
      url: "https://acme.sharepoint.com/x"}))
        .rejects.toMatchObject({status: 400});
    await expect(guardar(undefined)).rejects.toMatchObject({status: 400});
    mockFuentes = [];
    await expect(guardar({tipo: "local", ruta: "Planta Norte"}))
        .rejects.toMatchObject({status: 409, codigo: "SIN_FUENTE"});
    expect(bitacoraLogger.registrarEvento).not.toHaveBeenCalled();
  });

  test("otro Mandante: no lo encuentra; superadmin sí", async () => {
    await expect(guardar({tipo: "local", ruta: "Planta Norte"}, ADMIN_M2))
        .rejects.toMatchObject({status: 404});
    expect((await guardar({tipo: "local", ruta: "Planta Norte"}, SUPER))
        .repositorioDocumental.ruta).toBe("Planta Norte");
  });

  test("rol sin permiso de edición del proyecto", async () => {
    await expect(guardar({tipo: "local", ruta: "Planta Norte"}, EVALUADOR))
        .rejects.toMatchObject({status: 403});
    await expect(guardar(null, {uid: "l1", rol: "mandante_lector",
      mandanteId: "m1"})).rejects.toMatchObject({status: 403});
    expect(mockProyectos.get("p1").repositorioDocumental).toBeUndefined();
  });

  test("proyecto archivado no se modifica", async () => {
    mockProyectos.get("p1").estado = "archivado";
    await expect(guardar({tipo: "local", ruta: "Planta Norte"}))
        .rejects.toMatchObject({status: 400});
  });
});
