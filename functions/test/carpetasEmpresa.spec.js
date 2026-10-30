// Entrega 1 del mapeo documental: fuentes por Mandante y Carpetas de
// empresa. Datos sintéticos en memoria (sin Firestore): los repositorios se
// reemplazan por fakes que imitan su contrato (la transacción de vincular
// llama a `validar` antes de escribir).

const mockDb = {fuentes: [], carpetas: new Map(), expedientes: new Map(),
  config: new Map(), patrones: new Map()};
let mockSeq = 0;

jest.mock("../src/repositories/fuenteDocumentalRepository", () => ({
  list: jest.fn(async (m) => mockDb.fuentes.filter((f) => !m ||
    f.mandanteId === m)),
  getById: jest.fn(async (id) => mockDb.fuentes.find((f) => f.id === id) ||
    null),
  create: jest.fn(async (d) => {
    const f = {id: `f${++mockSeq}`, ...d};
    mockDb.fuentes.push(f);
    return f;
  }),
  update: jest.fn(async (id, d) => {
    const f = mockDb.fuentes.find((x) => x.id === id);
    Object.assign(f, d);
    return f;
  }),
}));
jest.mock("../src/repositories/carpetaEmpresaRepository", () => ({
  getById: jest.fn(async (id) => mockDb.carpetas.get(id) || null),
  list: jest.fn(async ({mandanteId, fuenteId, empresaId}) => [...mockDb
      .carpetas.values()].filter((c) => (!mandanteId ||
      c.mandanteId === mandanteId) && (!fuenteId || c.fuenteId === fuenteId) &&
    (!empresaId || c.empresaId === empresaId))),
  contarActivasDeFuente: jest.fn(async (fid) => [...mockDb.carpetas.values()]
      .filter((c) => c.fuenteId === fid && c.estado === "activa").length),
  update: jest.fn(async (id, d) => {
    Object.assign(mockDb.carpetas.get(id), d);
    return mockDb.carpetas.get(id);
  }),
  vincular: jest.fn(async ({id, nueva, expedienteId, validar}) => {
    const actual = mockDb.carpetas.get(id) || null;
    const expediente = mockDb.expedientes.get(expedienteId);
    const otroId = actual?.expedienteId && actual.expedienteId !==
      expedienteId ? actual.expedienteId : null;
    await validar({actual, expediente,
      otroExpediente: otroId ? mockDb.expedientes.get(otroId) : null});
    if (actual) {
      Object.assign(actual, {expedienteId, estado: "activa",
        ...(actual.proyectoId ? {} : {proyectoId: expediente.proyectoId})});
    } else {
      mockDb.carpetas.set(id, {id, ...nueva, expedienteId,
        estado: "activa"});
    }
    const anteriorId = expediente.repositorioDocumental?.carpetaEmpresaId;
    if (anteriorId && anteriorId !== id) {
      mockDb.carpetas.get(anteriorId).expedienteId = null;
    }
    expediente.repositorioDocumental = {carpetaEmpresaId: id};
    return {carpeta: mockDb.carpetas.get(id), creada: !actual,
      anteriorId: anteriorId && anteriorId !== id ? anteriorId : null};
  }),
  crear: jest.fn(async (id, data) => {
    if (mockDb.carpetas.has(id)) {
      return {carpeta: mockDb.carpetas.get(id), creada: false};
    }
    mockDb.carpetas.set(id, {id, ...data});
    return {carpeta: mockDb.carpetas.get(id), creada: true};
  }),
  desvincular: jest.fn(async (expedienteId) => {
    const exp = mockDb.expedientes.get(expedienteId);
    const id = exp.repositorioDocumental?.carpetaEmpresaId || null;
    if (id) mockDb.carpetas.get(id).expedienteId = null;
    exp.repositorioDocumental = {carpetaEmpresaId: null};
    return id;
  }),
}));
// Patrones (Entrega 3): la transacción aplica los deltas con la lógica real
// (aplicarDelta) y escribe la carpeta, todo junto.
jest.mock("../src/repositories/patronRequerimientoRepository", () => ({
  aplicar: jest.fn(async ({deltas, autor, carpetaEmpresaId,
    cambiosCarpeta}) => {
    const {aplicarDelta} = jest.requireActual("../src/utils/patronesMapeo");
    const aplicados = [];
    deltas.forEach((d) => {
      const actual = mockDb.patrones.get(d.id) || null;
      const valor = aplicarDelta(actual, d.delta);
      if (!valor) return;
      mockDb.patrones.set(d.id, {...(actual || {mandanteId: d.mandanteId,
        ambito: d.ambito, objetivo: d.objetivo, patron: d.patron,
        requerimientoId: d.requerimientoId || null,
        carpetaEmpresaIdOrigen: carpetaEmpresaId, createdBy: autor}),
      ...valor});
      aplicados.push({id: d.id, patron: d.patron,
        requerimientoId: d.requerimientoId || null, delta: d.delta, ...valor});
    });
    if (cambiosCarpeta && carpetaEmpresaId) {
      Object.assign(mockDb.carpetas.get(carpetaEmpresaId), cambiosCarpeta);
    }
    return aplicados;
  }),
  getById: jest.fn(async (id) => (mockDb.patrones.has(id) ?
    {id, ...mockDb.patrones.get(id)} : null)),
  list: jest.fn(async ({mandanteId, ambito}) => [...mockDb.patrones]
      .filter(([, p]) => p.mandanteId === mandanteId &&
        (!ambito || p.ambito === ambito)).map(([id, p]) => ({id, ...p}))),
  cambiarEstado: jest.fn(async (id, estado) => {
    mockDb.patrones.get(id).estado = estado;
    return {id, ...mockDb.patrones.get(id)};
  }),
}));
jest.mock("../src/repositories/requerimientoRepository", () => {
  const req = (id) => ({id, nombre: `Requerimiento ${id}`,
    tipoEntidad: id === "rp" ? "persona" : "empresa"});
  return {
    getByIds: jest.fn(async (ids) => ids.map(req)),
    // Requerimientos activos del Mandante por entidad (sin expediente).
    list: jest.fn(async ({tipoEntidad}) => (tipoEntidad === "persona" ?
      ["rp"] : ["r1", "r2", "r3"]).map(req)),
  };
});
jest.mock("../src/repositories/empresaMandanteRepository", () => ({
  empresaIdsActivas: jest.fn(async (m) => (m === "m1" ? ["emp1", "emp2"] :
    [])),
}));
jest.mock("../src/services/expedienteService", () => ({
  // Mismo alcance que el real: los roles del Mandante solo ven el suyo.
  getExpedienteById: jest.fn(async (id, actor) => {
    const e = mockDb.expedientes.get(id);
    if (!e || (["mandante_admin", "mandante_lector"].includes(actor.rol) &&
        e.mandanteId !== actor.mandanteId)) {
      const AppError = jest.requireActual("../src/utils/AppError");
      throw new AppError(404, "Expediente no encontrado.");
    }
    return e;
  }),
}));
jest.mock("../src/repositories/empresaRepository", () => ({
  getById: jest.fn(async (id) => ({
    emp1: {id: "emp1", razonSocial: "TECNORED S.A.", rut: "76.111.111-1"},
    emp2: {id: "emp2", razonSocial: "BOSCH LTDA.", rut: "77.222.222-2"},
  })[id] || null),
  getByIds: jest.fn(async () => []),
}));
jest.mock("../src/repositories/proyectoRepository", () => ({
  getById: jest.fn(async (id) => ({id, nombre: `Proyecto ${id}`})),
  getByIds: jest.fn(async () => []),
}));
jest.mock("../src/repositories/expedienteRepository", () => ({
  getById: jest.fn(async (id) => mockDb.expedientes.get(id) || null),
  getByIds: jest.fn(async () => []),
}));
jest.mock("../src/repositories/expedienteRequerimientoRepository", () => ({
  listByExpediente: jest.fn(async () => [
    {requerimientoId: "r1", tipoEntidad: "empresa"},
    {requerimientoId: "r2", tipoEntidad: "empresa"},
    {requerimientoId: "rp", tipoEntidad: "persona"},
  ]),
}));
jest.mock("../src/repositories/configRevisionExpedienteRepository", () => ({
  get: jest.fn(async (id) => mockDb.config.get(id) || null),
  guardar: jest.fn(async (id, d) => {
    mockDb.config.set(id, {...(mockDb.config.get(id) || {}), ...d});
  }),
}));
jest.mock("../src/repositories/participacionPersonaRepository", () => ({}));
jest.mock("../src/repositories/participacionRecursoRepository", () => ({}));
jest.mock("../src/repositories/mandanteRepository", () => ({
  getById: jest.fn(async (id) => ({id})),
}));
jest.mock("../src/repositories/usuarioRepository", () => ({
  getById: jest.fn(async () => ({nombre: "Ana", apellido: "Demo"})),
}));
jest.mock("../src/services/aiConfigService", () => ({
  cifrarSecreto: () => ({cifrado: "c", iv: "i", authTag: "t"}),
}));
jest.mock("../src/utils/bitacoraLogger", () => ({
  registrarEvento: jest.fn(async () => undefined),
}));

const bitacoraLogger = require("../src/utils/bitacoraLogger");
const configRepository =
    require("../src/repositories/configRevisionExpedienteRepository");
const fuentes = require("../src/services/fuenteDocumentalService");
const carpetas = require("../src/services/carpetaEmpresaService");
const repositorio = require("../src/services/repositorioDocumentalService");
const {
  idCarpeta, validarRutaCarpeta, validarUrlCarpeta, aplicarCambiosMapeo,
} = require("../src/utils/carpetasEmpresa");

const SUPER = {uid: "s1", rol: "superadmin"};
const EVALUADOR = {uid: "ev1", rol: "evaluador"};
const ADMIN_M1 = {uid: "a1", rol: "mandante_admin", mandanteId: "m1"};
const ADMIN_M2 = {uid: "a2", rol: "mandante_admin", mandanteId: "m2"};

const expediente = (id, extra = {}) => mockDb.expedientes.set(id, {id,
  mandanteId: "m1", empresaId: "emp1", proyectoId: "p1",
  estado: "en_ejecucion", repositorioDocumental: null, ...extra});

beforeEach(() => {
  mockDb.fuentes = [];
  mockDb.carpetas = new Map();
  mockDb.expedientes = new Map();
  mockDb.config = new Map();
  mockDb.patrones = new Map();
  jest.clearAllMocks();
  expediente("e1");
  expediente("e2");
  expediente("e3", {proyectoId: "p2"});
  expediente("eB", {empresaId: "emp2"});
});

describe("fuentes: una sola activa por Mandante", () => {
  test("la carpeta local solo la registra superadmin", async () => {
    await expect(fuentes.guardarLocal("m1", {etiqueta: "Repositorio " +
      "Empresas"}, ADMIN_M1)).rejects.toMatchObject({status: 403});
    const f = await fuentes.guardarLocal("m1",
        {etiqueta: "Repositorio Empresas"}, SUPER);
    expect(f).toMatchObject({tipo: "local", etiqueta: "Repositorio Empresas",
      url: null, estado: "activa"});
    // Repetir no duplica.
    await fuentes.guardarLocal("m1", {etiqueta: "Repositorio Empresas"},
        SUPER);
    expect(mockDb.fuentes).toHaveLength(1);
  });

  test("con SharePoint activo, la local se rechaza (nunca en silencio)",
      async () => {
        mockDb.fuentes.push({id: "sp", mandanteId: "m1", tipo: "sharepoint",
          nombre: "Sitio", estado: "activa", config: {siteUrl:
            "https://acme.sharepoint.com/sites/x"}});
        await expect(fuentes.guardarLocal("m1", {etiqueta: "Repo"}, SUPER))
            .rejects.toMatchObject({status: 409, codigo: "SHAREPOINT_ACTIVA",
              detalle: {fuenteId: "sp"}});
        expect(mockDb.fuentes.find((f) => f.id === "sp").estado)
            .toBe("activa");
      });

  test("con carpetas activas no se cambia ni se desactiva la fuente",
      async () => {
        const f = await fuentes.guardarLocal("m1", {etiqueta: "Repo"}, SUPER);
        await carpetas.vincular({expedienteId: "e1",
          ruta: "1. TECNORED"}, SUPER);
        await expect(fuentes.guardarLocal("m1", {etiqueta: "Otro"}, SUPER))
            .rejects.toMatchObject({status: 409, codigo: "FUENTE_CON_CARPETAS",
              detalle: {carpetas: 1},
              message: expect.stringContaining("1 carpeta de empresa")});
        await expect(fuentes.cambiarEstado(f.id, "inactiva", SUPER))
            .rejects.toMatchObject({codigo: "FUENTE_CON_CARPETAS"});
      });

  test("fuente activa: aislada por Mandante", async () => {
    await fuentes.guardarLocal("m1", {etiqueta: "Repo"}, SUPER);
    expect(await fuentes.activa("m1", EVALUADOR))
        .toMatchObject({etiqueta: "Repo"});
    expect(await fuentes.activa(null, ADMIN_M2)).toBeNull();
    await expect(fuentes.activa("m1", ADMIN_M2))
        .rejects.toMatchObject({status: 403});
  });
});

describe("Carpetas de empresa: vincular", () => {
  beforeEach(async () => {
    await fuentes.guardarLocal("m1", {etiqueta: "Repositorio Empresas"},
        SUPER);
  });

  test("find-or-create: misma carpeta (sin distinguir mayúsculas), sin " +
      "duplicados", async () => {
    const a = await carpetas.vincular({expedienteId: "e1",
      ruta: "1. TECNORED"}, SUPER);
    await carpetas.desvincular("e1", SUPER);
    const b = await carpetas.vincular({expedienteId: "e1",
      ruta: "1. tecnored"}, EVALUADOR);
    expect(b.id).toBe(a.id);
    expect(mockDb.carpetas.size).toBe(1);
    expect(idCarpeta("f1", " 1. TECNORED ")).toBe(idCarpeta("f1",
        "1. tecnored"));
    expect(mockDb.expedientes.get("e1").repositorioDocumental)
        .toEqual({carpetaEmpresaId: a.id});
  });

  test("validación estricta contra la Empresa", async () => {
    await expect(carpetas.vincular({expedienteId: "e1",
      ruta: "17.B-BOSCH_Proyecto"}, SUPER))
        .rejects.toMatchObject({status: 400,
          message: expect.stringContaining("«17.B-BOSCH_Proyecto»")});
    expect(mockDb.carpetas.size).toBe(0);
  });

  test("una carpeta, un solo expediente activo", async () => {
    await carpetas.vincular({expedienteId: "e1", ruta: "1. TECNORED"},
        SUPER);
    await expect(carpetas.vincular({expedienteId: "e2",
      ruta: "1. TECNORED"}, SUPER)).rejects.toMatchObject({status: 400,
      message: "La carpeta «1. TECNORED» ya está vinculada al expediente " +
        "de TECNORED S.A. en Proyecto p1"});
    // Con el otro expediente cerrado, se puede.
    mockDb.expedientes.get("e1").estado = "cerrado";
    await expect(carpetas.vincular({expedienteId: "e2",
      ruta: "1. TECNORED"}, SUPER)).resolves.toMatchObject({
      expedienteId: "e2"});
  });

  test("verificar (paso 1, sin expediente): no escribe y aplica el mismo " +
      "bloqueo", async () => {
    const pedido = {mandanteId: "m1", empresaId: "emp1", proyectoId: "p1",
      ruta: "1. TECNORED"};
    expect(await carpetas.verificar(pedido, ADMIN_M1))
        .toMatchObject({ruta: "1. TECNORED", existente: false});
    expect(mockDb.carpetas.size).toBe(0);
    await carpetas.vincular({expedienteId: "e1", ruta: "1. TECNORED"},
        SUPER);
    await expect(carpetas.verificar(pedido, ADMIN_M1))
        .rejects.toMatchObject({status: 400,
          message: expect.stringContaining("ya está vinculada")});
    await expect(carpetas.verificar({...pedido, ruta: "OTRA"}, ADMIN_M1))
        .rejects.toMatchObject({status: 400});
    await expect(carpetas.verificar(pedido, ADMIN_M2))
        .rejects.toMatchObject({status: 403});
    // Sin proyecto (paso Empresa) no se compara el proyecto; con otro
    // proyecto, sí.
    await carpetas.desvincular("e1", SUPER);
    expect(await carpetas.verificar({...pedido, proyectoId: null}, ADMIN_M1))
        .toMatchObject({existente: true});
    await expect(carpetas.verificar({...pedido, proyectoId: "p2"}, ADMIN_M1))
        .rejects.toMatchObject({message: expect.stringContaining(
            "Cada proyecto usa su propia")});
  });

  test("otro proyecto de la misma empresa usa otra carpeta", async () => {
    await carpetas.vincular({expedienteId: "e1", ruta: "1. TECNORED"},
        SUPER);
    await carpetas.desvincular("e1", SUPER);
    await expect(carpetas.vincular({expedienteId: "e3",
      ruta: "1. TECNORED"}, SUPER)).rejects.toMatchObject({status: 400,
      message: expect.stringContaining("Cada proyecto usa su propia")});
  });

  test("sin fuente activa: 409 SIN_FUENTE", async () => {
    mockDb.fuentes = [];
    await expect(carpetas.vincular({expedienteId: "e1",
      ruta: "1. TECNORED"}, SUPER)).rejects.toMatchObject({status: 409,
      codigo: "SIN_FUENTE"});
  });

  test("aislamiento por Mandante", async () => {
    await expect(carpetas.vincular({expedienteId: "e1",
      ruta: "1. TECNORED"}, ADMIN_M2)).rejects.toMatchObject({status: 404});
    await expect(carpetas.listar({mandanteId: "m1"}, ADMIN_M2))
        .rejects.toMatchObject({status: 403});
    // El evaluador lista (Mapeo documental); el mandante_lector no.
    expect(await carpetas.listar({mandanteId: "m1"}, EVALUADOR))
        .toEqual([]);
    await expect(carpetas.listar({}, {uid: "l1", rol: "mandante_lector",
      mandanteId: "m1"})).rejects.toMatchObject({status: 403});
    await carpetas.vincular({expedienteId: "e1", ruta: "1. TECNORED"},
        ADMIN_M1);
    expect(await carpetas.listar({}, ADMIN_M1)).toHaveLength(1);
    expect(await carpetas.listar({}, ADMIN_M2)).toHaveLength(0);
  });

  test("desvincular conserva la carpeta y su mapeo", async () => {
    const c = await carpetas.vincular({expedienteId: "e1",
      ruta: "1. TECNORED"}, SUPER);
    await carpetas.actualizar(c.id, {mapeo: {r1: [{ruta: "01. Contratos"}]}},
        SUPER);
    expect(await carpetas.desvincular("e1", SUPER))
        .toEqual({carpetaEmpresaId: c.id});
    expect(mockDb.carpetas.get(c.id)).toMatchObject({expedienteId: null,
      estado: "activa"});
    expect(mockDb.carpetas.get(c.id).mapeo.r1).toHaveLength(1);
    expect(bitacoraLogger.registrarEvento).toHaveBeenCalledWith(
        expect.objectContaining({accion: "carpeta_empresa_desvinculada"}));
  });
});

describe("mapeo: en la Carpeta de empresa o en el expediente legado", () => {
  beforeEach(async () => {
    await fuentes.guardarLocal("m1", {etiqueta: "Repo"}, SUPER);
  });

  test("con carpetaEmpresaId se escribe en la carpeta (formato nuevo)",
      async () => {
        const c = await carpetas.vincular({expedienteId: "e1",
          ruta: "1. TECNORED"}, SUPER);
        const r = await repositorio.actualizar("e1", {mapeo: {
          carpetaPersonas: "02. Carpeta de trabajadores",
          requerimientos: {r1: "01. Contratos"}}}, EVALUADOR);
        expect(configRepository.guardar).not.toHaveBeenCalled();
        const guardada = mockDb.carpetas.get(c.id);
        expect(guardada.carpetaPersonas).toBe("02. Carpeta de trabajadores");
        expect(guardada.mapeo.r1).toEqual([expect.objectContaining({
          ruta: "01. Contratos", tipo: "carpeta", origen: "manual",
          confirmadoPor: "ev1"})]);
        expect(guardada.estadoMapeo).toBe("parcial");
        expect(r.origen).toBe("carpetaEmpresa");
        expect(r.repositorioDocumental.mapeo.requerimientos.r1[0].ruta)
            .toBe("01. Contratos");
        // Cambiar la carpeta por el formato legado no se permite.
        await expect(repositorio.actualizar("e1", {tipo: "local",
          etiqueta: "1. TECNORED"}, EVALUADOR))
            .rejects.toMatchObject({status: 409});
      });

  test("expediente legado: sigue escribiendo como antes", async () => {
    const r = await repositorio.actualizar("e2", {tipo: "local",
      etiqueta: "1. TECNORED", mapeo: {requerimientos: {r1: "Contratos"}}},
    EVALUADOR);
    expect(configRepository.guardar).toHaveBeenCalledTimes(1);
    expect(mockDb.config.get("e2").repositorioDocumental.mapeo
        .requerimientos).toEqual({r1: "Contratos"});
    expect(r.origen).toBe("legado");
    expect(r.repositorioDocumental.mapeo.requerimientos.r1)
        .toEqual([expect.objectContaining({ruta: "Contratos"})]);
    // El panel reenvía el mapeo tal como lo recibió (arreglos): sigue como
    // texto en el legado.
    await repositorio.actualizar("e2", {mapeo: {
      ...r.repositorioDocumental.mapeo,
      requerimientos: {...r.repositorioDocumental.mapeo.requerimientos,
        r2: "Anexos"}}}, EVALUADOR);
    expect(mockDb.config.get("e2").repositorioDocumental.mapeo
        .requerimientos).toEqual({r1: "Contratos", r2: "Anexos"});
  });
});

describe("validaciones puras", () => {
  test("ruta de la carpeta: relativa, un nivel, sin .. ni unidad", () => {
    expect(validarRutaCarpeta("1. TECNORED").ok).toBe(true);
    expect(validarRutaCarpeta("C:\\Repo\\1. TECNORED").ok).toBe(false);
    expect(validarRutaCarpeta("../otra").ok).toBe(false);
    expect(validarRutaCarpeta("a/b").ok).toBe(false);
    expect(validarRutaCarpeta("").ok).toBe(false);
  });

  test("URL de SharePoint dentro del sitio de la fuente", () => {
    const sitio = "https://acme.sharepoint.com/sites/x";
    expect(validarUrlCarpeta(`${sitio}/Docs/1.%20TECNORED`, sitio))
        .toMatchObject({ok: true, ruta: "1. TECNORED"});
    expect(validarUrlCarpeta("https://otro.sharepoint.com/sites/y/A", sitio)
        .ok).toBe(false);
    expect(validarUrlCarpeta("http://acme.sharepoint.com/sites/x/A", sitio)
        .ok).toBe(false);
  });

  test("cambios al mapeo: sello manual, conserva y quita", () => {
    const sello = {uid: "u1", ahora: "T1"};
    const a = aplicarCambiosMapeo({r1: [{ruta: "A"}, {ruta: "A"},
      {ruta: "B/f.pdf", tipo: "archivo"}]}, {}, sello).valor;
    expect(a.r1).toEqual([
      {ruta: "A", tipo: "carpeta", origen: "manual", confirmadoPor: "u1",
        confirmadoAt: "T1"},
      {ruta: "B/f.pdf", tipo: "archivo", origen: "manual",
        confirmadoPor: "u1", confirmadoAt: "T1"}]);
    const b = aplicarCambiosMapeo({r1: [{ruta: "A"}], r2: [{ruta: "C"}]}, a,
        {uid: "u2", ahora: "T2"}).valor;
    expect(b.r1[0].confirmadoPor).toBe("u1");
    expect(b.r2[0].confirmadoPor).toBe("u2");
    expect(aplicarCambiosMapeo({r1: null}, b, sello).valor.r1).toBeUndefined();
    expect(aplicarCambiosMapeo({r1: [{ruta: "../x"}]}, {}, sello).ok)
        .toBe(false);
    expect(aplicarCambiosMapeo({"r/1": []}, {}, sello).ok).toBe(false);
  });
});

describe("Entrega 2: mapeo documental", () => {
  const {validarAsignaciones} = require("../src/utils/carpetasEmpresa");
  const LECTOR = {uid: "l1", rol: "mandante_lector", mandanteId: "m1"};

  beforeEach(async () => {
    await fuentes.guardarLocal("m1", {etiqueta: "Repositorio Empresas"},
        SUPER);
  });
  const registrar = (ruta = "1. TECNORED", empresaId = "emp1", actor = SUPER) =>
    carpetas.registrar({mandanteId: "m1", ruta, empresaId}, actor);

  test("registrar: sin proyecto ni expediente, find-or-create, validación " +
      "estricta y empresa del Mandante", async () => {
    const c = await registrar();
    expect(c).toMatchObject({ruta: "1. TECNORED", empresaId: "emp1",
      proyectoId: null, expedienteId: null, empresaNombre: "TECNORED S.A."});
    expect((await registrar()).id).toBe(c.id);
    expect(mockDb.carpetas.size).toBe(1);
    await expect(registrar("1. tecnored", "emp2")).rejects.toMatchObject({
      status: 400});
    await expect(registrar("17.B-BOSCH", "emp1")).rejects.toMatchObject({
      status: 400});
    await expect(registrar("9. OTRA", "emp9")).rejects.toMatchObject({
      message: "La empresa no está asociada a este Mandante."});
    expect(bitacoraLogger.registrarEvento).toHaveBeenCalledWith(
        expect.objectContaining({accion: "registrada"}));
  });

  test("proyectoId null hasta vincular; al vincular toma el del " +
      "expediente; otro proyecto se rechaza", async () => {
    const c = await registrar();
    const v = await carpetas.vincular({expedienteId: "e1",
      ruta: "1. TECNORED"}, SUPER);
    expect(v.id).toBe(c.id);
    expect(mockDb.carpetas.get(c.id).proyectoId).toBe("p1");
    await carpetas.desvincular("e1", SUPER);
    await expect(carpetas.vincular({expedienteId: "e3",
      ruta: "1. TECNORED"}, SUPER)).rejects.toMatchObject({status: 400,
      message: expect.stringContaining("Cada proyecto usa su propia")});
  });

  test("requerimientos asignables: sin expediente, los de Empresa del " +
      "Mandante; con expediente, los que le aplican", async () => {
    const c = await registrar();
    expect(await carpetas.requerimientosAsignables(c.id, EVALUADOR))
        .toMatchObject({conExpediente: false, total: 3});
    await carpetas.vincular({expedienteId: "e1", ruta: "1. TECNORED"}, SUPER);
    const r = await carpetas.requerimientosAsignables(c.id, SUPER);
    expect(r).toMatchObject({conExpediente: true, total: 2});
    expect(r.requerimientos.map((x) => x.id)).toEqual(["r1", "r2"]);
  });

  test("asignables numerados en el orden del expediente", async () => {
    const c = await registrar();
    await carpetas.vincular({expedienteId: "e1", ruta: "1. TECNORED"}, SUPER);
    const repo =
        require("../src/repositories/expedienteRequerimientoRepository");
    repo.listByExpediente.mockResolvedValueOnce([
      {requerimientoId: "r2", tipoEntidad: "empresa", orden: 1},
      {requerimientoId: "r1", tipoEntidad: "empresa", orden: 2},
      {requerimientoId: "rp", tipoEntidad: "persona", orden: 0},
    ]);
    const r = await carpetas.requerimientosAsignables(c.id, SUPER);
    expect(r.requerimientos.map((x) => [x.numero, x.id]))
        .toEqual([[1, "r2"], [2, "r1"]]);
  });

  test("permisos: registrar y asignables solo superadmin y evaluador; " +
      "aislamiento por Mandante", async () => {
    const c = await registrar();
    await expect(registrar("1. TECNORED", "emp1", ADMIN_M1))
        .rejects.toMatchObject({status: 403});
    await expect(carpetas.requerimientosAsignables(c.id, ADMIN_M1))
        .rejects.toMatchObject({status: 403});
    await expect(carpetas.requerimientosAsignables(c.id, LECTOR))
        .rejects.toMatchObject({status: 403});
    await expect(carpetas.actualizar(c.id, {mapeo: {r1: [{ruta: "A"}]}},
        ADMIN_M2)).rejects.toMatchObject({status: 403});
  });

  test("estadoMapeo se recalcula: sin_mapear → parcial → completo → quitar",
      async () => {
        const c = await registrar();
        const p1 = await carpetas.actualizar(c.id, {mapeo: {r1: [{ruta: "A"}]}},
            EVALUADOR);
        expect(p1.estadoMapeo).toBe("parcial");
        const p2 = await carpetas.actualizar(c.id, {mapeo: {
          r2: [{ruta: "B"}, {ruta: "C/anexo.pdf", tipo: "archivo"}],
          r3: [{ruta: "D"}]}}, EVALUADOR);
        expect(p2.estadoMapeo).toBe("completo");
        const p3 = await carpetas.actualizar(c.id, {mapeo: {r1: null}},
            EVALUADOR);
        expect(p3.estadoMapeo).toBe("parcial");
        expect(p3.mapeo.r1).toBeUndefined();
        // Quitar queda en la Bitácora con el valor anterior y el nuevo.
        expect(bitacoraLogger.registrarEvento).toHaveBeenLastCalledWith(
            expect.objectContaining({detalle: expect.objectContaining({
              requerimientos: [{requerimientoId: "r1", anterior: ["A"],
                nuevo: []}]})}));
      });

  test("solo requerimientos de Empresa de la carpeta", async () => {
    const c = await registrar();
    await expect(carpetas.actualizar(c.id, {mapeo: {rp: [{ruta: "A"}]}},
        SUPER)).rejects.toMatchObject({status: 400,
      message: expect.stringContaining("nivel Empresa")});
  });

  test("reglas de asignación en el backend", async () => {
    const c = await registrar();
    await carpetas.actualizar(c.id, {carpetaPersonas: "02. Trabajadores",
      mapeo: {r1: [{ruta: "09. MIPER"}]}}, SUPER);
    const intentar = (mapeo) => carpetas.actualizar(c.id, {mapeo}, SUPER);
    // Un nodo, un solo requerimiento.
    await expect(intentar({r2: [{ruta: "09. MIPER"}]}))
        .rejects.toMatchObject({message: expect.stringContaining(
            "ya está asignada a «Requerimiento r1»")});
    // Descendiente de una carpeta asignada.
    await expect(intentar({r2: [{ruta: "09. MIPER/matriz.xlsx",
      tipo: "archivo"}]})).rejects.toMatchObject({
      message: expect.stringContaining("está dentro de «09. MIPER»")});
    // La carpeta del personal no se asigna.
    await expect(intentar({r2: [{ruta: "02. Trabajadores"}]}))
        .rejects.toMatchObject({message: expect.stringContaining(
            "es la carpeta del personal")});
    // Sus subcarpetas (personas) tampoco; sus archivos sueltos sí.
    await expect(intentar({r2: [{ruta: "02. Trabajadores/Juan Pérez"}]}))
        .rejects.toMatchObject({message: expect.stringContaining(
            "se mapea por patrón")});
    await expect(intentar({r2: [{ruta:
      "02. Trabajadores/Juan Pérez/cedula.pdf", tipo: "archivo"}]}))
        .rejects.toMatchObject({status: 400});
    const ok = await intentar({r2: [{ruta:
      "02. Trabajadores/Listado Trabajadores.docx", tipo: "archivo"}]});
    expect(ok.mapeo.r2[0].ruta).toBe(
        "02. Trabajadores/Listado Trabajadores.docx");
    // Elegir como carpeta del personal una carpeta asignada: rechazado.
    await expect(carpetas.actualizar(c.id, {carpetaRecursos: "09. MIPER"},
        SUPER)).rejects.toMatchObject({message: expect.stringContaining(
        "es la carpeta de maquinarias")});
  });

  test("validarAsignaciones (pura)", () => {
    expect(validarAsignaciones({mapeo: {a: [{ruta: "X"}], b: [{ruta: "Y"}]},
      carpetaPersonas: null, carpetaRecursos: null})).toBeNull();
    expect(validarAsignaciones({mapeo: {a: [{ruta: "X"}, {ruta: "X/y"}]}}))
        .toMatch(/está dentro de «X»/);
    expect(validarAsignaciones({mapeo: {a: [{ruta: "Base"}]},
      carpetaPersonas: "Base/Personal"})).toMatch(/contiene la carpeta del/);
    expect(validarAsignaciones({mapeo: {}, carpetaPersonas: "P",
      carpetaRecursos: "P/M"})).toMatch(/distintas/);
    // "X2" no es descendiente de "X" (prefijo de ruta, no de texto).
    expect(validarAsignaciones({mapeo: {a: [{ruta: "X"}], b: [{ruta: "X2"}]}}))
        .toBeNull();
  });
});

describe("Entrega 3: patrones aprendidos", () => {
  const patronesSrv = require("../src/services/patronRequerimientoService");
  const patronRepo =
      require("../src/repositories/patronRequerimientoRepository");
  const {
    idPatron, deltasMapeo, deltasEspeciales, agruparDeltas, aplicarDelta,
  } = require("../src/utils/patronesMapeo");

  beforeEach(async () => {
    await fuentes.guardarLocal("m1", {etiqueta: "Repositorio Empresas"},
        SUPER);
  });
  const registrar = () => carpetas.registrar({mandanteId: "m1",
    ruta: "1. TECNORED", empresaId: "emp1"}, SUPER);
  const patron = (p, rid, ambito = "empresa", objetivo = "carpeta") =>
    mockDb.patrones.get(idPatron({mandanteId: "m1", ambito, objetivo,
      patron: p, requerimientoId: rid}));

  test("deltas puros: nuevas +1, quitadas −1, estructura y agrupación",
      () => {
        const d = deltasMapeo({r1: [{ruta: "A/09. MIPER", tipo: "carpeta"}]},
            {r2: [{ruta: "05. O.D.I Especifica", tipo: "carpeta"}]});
        expect(d).toEqual([
          {ambito: "empresa", objetivo: "carpeta", patron: "odi especifica",
            requerimientoId: "r2", delta: 1},
          {ambito: "empresa", objetivo: "carpeta", patron: "miper",
            requerimientoId: "r1", delta: -1}]);
        expect(deltasEspeciales({carpetaPersonas: "02. Trabajadores"},
            {carpetaPersonas: "03. Carpeta Personales"})).toEqual([
          {ambito: "estructura", objetivo: "carpetaPersonas",
            patron: "trabajadores", requerimientoId: null, delta: -1},
          {ambito: "estructura", objetivo: "carpetaPersonas",
            patron: "carpeta personales", requerimientoId: null, delta: 1}]);
        expect(agruparDeltas("m1", [...d, {...d[0], delta: -1}]))
            .toHaveLength(1);
        expect(aplicarDelta(null, -1)).toBeNull();
        expect(aplicarDelta({vecesConfirmado: 1}, -1))
            .toEqual({vecesConfirmado: 0, estado: "inactivo"});
      });

  test("aprender al asignar y deshacer al quitar (en 0, inactivo), en una " +
      "sola transacción con la carpeta", async () => {
    const c = await registrar();
    await carpetas.actualizar(c.id, {carpetaPersonas: "03. Carpeta Personales",
      mapeo: {r1: [{ruta: "09. MIPER", origen: "sugerencia"}],
        r2: [{ruta: "Listado Trabajadores.docx", tipo: "archivo"}]}},
    EVALUADOR);
    // Una sola llamada: asignaciones y patrones juntos.
    expect(patronRepo.aplicar).toHaveBeenCalledTimes(1);
    expect(patronRepo.aplicar.mock.calls[0][0].cambiosCarpeta.mapeo.r1[0])
        .toMatchObject({ruta: "09. MIPER", origen: "sugerencia"});
    expect(patron("miper", "r1")).toMatchObject({vecesConfirmado: 1,
      estado: "activo", carpetaEmpresaIdOrigen: c.id});
    expect(patron("listado trabajadores", "r2", "empresa", "archivo"))
        .toMatchObject({vecesConfirmado: 1});
    expect(patron("carpeta personales", null, "estructura",
        "carpetaPersonas")).toMatchObject({vecesConfirmado: 1});
    // Otra carpeta confirma el mismo patrón: 2.
    mockDb.carpetas.get(c.id).mapeo = {};
    await carpetas.actualizar(c.id, {mapeo: {r1: [{ruta: "09. MIPER"}]}},
        SUPER);
    expect(patron("miper", "r1").vecesConfirmado).toBe(2);
    // Quitar resta 1; en 0 queda inactivo (no se borra).
    await carpetas.actualizar(c.id, {mapeo: {r1: null}}, SUPER);
    expect(patron("miper", "r1")).toMatchObject({vecesConfirmado: 1,
      estado: "activo"});
    mockDb.carpetas.get(c.id).mapeo = {r1: [{ruta: "09. MIPER",
      tipo: "carpeta"}]};
    await carpetas.actualizar(c.id, {mapeo: {r1: []}}, SUPER);
    expect(patron("miper", "r1")).toMatchObject({vecesConfirmado: 0,
      estado: "inactivo"});
    expect(bitacoraLogger.registrarEvento).toHaveBeenLastCalledWith(
        expect.objectContaining({detalle: expect.objectContaining({
          patrones: [expect.objectContaining({patron: "miper", delta: -1,
            estado: "inactivo"})]})}));
  });

  test("copia (soloAgregar): nunca sobrescribe lo existente", async () => {
    const c = await registrar();
    await carpetas.actualizar(c.id, {carpetaPersonas: "02. Trabajadores",
      mapeo: {r1: [{ruta: "A"}]}}, SUPER);
    await expect(carpetas.actualizar(c.id, {soloAgregar: true,
      mapeo: {r1: [{ruta: "B"}]}}, SUPER)).rejects.toMatchObject({
      status: 409});
    await expect(carpetas.actualizar(c.id, {soloAgregar: true,
      carpetaPersonas: "03. Otra"}, SUPER)).rejects.toMatchObject({
      status: 409});
    const ok = await carpetas.actualizar(c.id, {soloAgregar: true,
      mapeo: {r1: [{ruta: "A"}, {ruta: "B", origen: "sugerencia"}],
        r2: [{ruta: "C", origen: "sugerencia"}]}}, SUPER);
    expect(ok.mapeo.r1.map((e) => e.ruta)).toEqual(["A", "B"]);
    expect(ok.mapeo.r2[0].origen).toBe("sugerencia");
  });

  test("archivos de personas: el patrón lo calcula el backend; nada por " +
      "persona", async () => {
    const c = await registrar();
    await patronesSrv.confirmarArchivos({carpetaEmpresaId: c.id,
      ambito: "persona", items: [{requerimientoId: "rp",
        nombreArchivo: "2.- C.I. Diego Garrido Muñoz 31-12-2031.pdf",
        nombreSujeto: "Diego Garrido Muñoz"}]}, EVALUADOR);
    expect(patron("ci", "rp", "persona", "archivo"))
        .toMatchObject({vecesConfirmado: 1, estado: "activo"});
    expect(mockDb.carpetas.get(c.id).mapeo).toEqual({});
    // Solo requerimientos de Persona de la carpeta.
    await expect(patronesSrv.confirmarArchivos({carpetaEmpresaId: c.id,
      ambito: "persona", items: [{requerimientoId: "r1", nombreArchivo:
        "x.pdf", nombreSujeto: "Ana"}]}, SUPER)).rejects.toMatchObject({
      status: 400});
    // Un nombre que solo trae la persona y la fecha no deja patrón.
    await expect(patronesSrv.confirmarArchivos({carpetaEmpresaId: c.id,
      ambito: "persona", items: [{requerimientoId: "rp", nombreArchivo:
        "Diego Garrido Muñoz 2024.pdf", nombreSujeto: "Diego Garrido Muñoz"}]},
    SUPER)).rejects.toMatchObject({status: 400});
    await patronesSrv.quitarArchivos({carpetaEmpresaId: c.id,
      ambito: "persona", items: [{requerimientoId: "rp", nombreArchivo:
        "C.I. Diego Garrido Muñoz.pdf", nombreSujeto: "Diego Garrido Muñoz"}]},
    SUPER);
    expect(patron("ci", "rp", "persona", "archivo"))
        .toMatchObject({vecesConfirmado: 0, estado: "inactivo"});
  });

  test("listar y desactivar (E4); aislamiento y permisos", async () => {
    const c = await registrar();
    await carpetas.actualizar(c.id, {mapeo: {r1: [{ruta: "09. MIPER"}]}},
        SUPER);
    const lista = await patronesSrv.listar({mandanteId: "m1",
      ambito: "empresa"}, EVALUADOR);
    expect(lista).toHaveLength(1);
    const p = await patronesSrv.cambiarEstado(lista[0].id, "inactivo", SUPER);
    expect(p.estado).toBe("inactivo");
    await expect(patronesSrv.listar({mandanteId: "m1"}, ADMIN_M1))
        .rejects.toMatchObject({status: 403});
    await expect(patronesSrv.confirmarArchivos({carpetaEmpresaId: c.id,
      ambito: "persona", items: [{requerimientoId: "rp", nombreArchivo:
        "ci.pdf", nombreSujeto: "Ana"}]}, ADMIN_M2))
        .rejects.toMatchObject({status: 403});
    expect(await patronesSrv.listar({mandanteId: "m2"}, SUPER)).toEqual([]);
  });
});

describe("Nueva Empresa desde carpeta: preparar la carpeta", () => {
  const EMPRESA = {razonSocial: "TECNORED S.A.", nombreFantasia: "TECNORED",
    rut: "771042198"};
  beforeEach(async () => {
    await fuentes.guardarLocal("m1", {etiqueta: "Repositorio Empresas"},
        SUPER);
  });
  const preparar = (ruta, empresa = EMPRESA) =>
    carpetas.prepararParaNuevaEmpresa({mandanteId: "m1", ruta, empresa,
      actor: SUPER});

  test("valida sin escribir: carpeta libre, sin proyecto ni expediente",
      async () => {
        const antes = mockDb.carpetas.size;
        const r = await preparar("1. TECNORED");
        expect(r.datos).toMatchObject({mandanteId: "m1", ruta: "1. TECNORED",
          proyectoId: null, expedienteId: null, estado: "activa"});
        expect(r.id).toBe(idCarpeta(r.datos.fuenteId, "1. TECNORED"));
        expect(mockDb.carpetas.size).toBe(antes);
      });

  test("validación estricta, ruta inválida y carpeta ya registrada",
      async () => {
        await expect(preparar("9. OTRA")).rejects.toMatchObject({status: 400});
        await expect(preparar("Repositorio/Tecnored"))
            .rejects.toMatchObject({status: 400});
        await carpetas.registrar({mandanteId: "m1", ruta: "1. TECNORED",
          empresaId: "emp1"}, SUPER);
        await expect(preparar("1. TECNORED")).rejects.toMatchObject({
          status: 409, message: expect.stringContaining("TECNORED S.A.")});
      });
});

describe("listar por empresa", () => {
  beforeEach(async () => {
    await fuentes.guardarLocal("m1", {etiqueta: "Repositorio Empresas"},
        SUPER);
    await carpetas.registrar({mandanteId: "m1", ruta: "1. TECNORED",
      empresaId: "emp1"}, SUPER);
  });

  test("sin Mandante, las de la empresa en todos (superadmin); los roles " +
      "de Mandante, solo en el suyo", async () => {
    const todas = await carpetas.listar({empresaId: "emp1"}, SUPER);
    expect(todas.map((c) => c.ruta)).toEqual(["1. TECNORED"]);
    expect(todas.every((c) => c.empresaId === "emp1")).toBe(true);
    expect(await carpetas.listar({empresaId: "emp2"}, SUPER)).toEqual([]);
    const propias = await carpetas.listar({empresaId: "emp1"}, ADMIN_M2);
    expect(propias).toEqual([]);
    await expect(carpetas.listar({}, SUPER))
        .rejects.toMatchObject({status: 400});
  });
});
