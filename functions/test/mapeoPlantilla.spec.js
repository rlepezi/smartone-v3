// Mapeo documental sobre la plantilla: claves inmutables, validación de
// nivel, retiro de nodos, overrides con alias sugerido y duplicado
// (repositorios simulados en memoria; datos sintéticos).
const mockEstado = {plantilla: null, vinculos: new Map(), overrides: new Map(),
  sugerencias: new Map(), versiones: [], creadas: []};

jest.mock("../src/repositories/plantillaEstructuraRepository", () => ({
  getActiva: jest.fn(async (m) => (mockEstado.plantilla?.mandanteId === m ?
    mockEstado.plantilla : null)),
  getById: jest.fn(async () => mockEstado.plantilla),
  update: jest.fn(async (id, data) => {
    mockEstado.plantilla = {...mockEstado.plantilla, ...data};
    return mockEstado.plantilla;
  }),
  actualizarEnTransaccion: jest.fn(async (id, fn) => {
    mockEstado.plantilla = {...mockEstado.plantilla,
      ...fn(mockEstado.plantilla)};
    return mockEstado.plantilla;
  }),
  create: jest.fn(async (data) => {
    const p = {id: `nueva${mockEstado.creadas.length}`, ...data};
    mockEstado.creadas.push(p);
    return p;
  }),
  existeVersion: jest.fn(async () => false),
  guardarVersion: jest.fn(async (id, p) => mockEstado.versiones.push(
      p.version)),
}));
jest.mock("../src/repositories/mapeoRequerimientoRepository", () => ({
  id: (m, n, r) => `${m}|${String(n).replace(/\//g, "~")}|${r}`,
  getById: jest.fn(async (id) => mockEstado.vinculos.get(id) || null),
  list: jest.fn(async (f) => [...mockEstado.vinculos.values()].filter((v) =>
    v.mandanteId === f.mandanteId &&
    (!f.requerimientoId || v.requerimientoId === f.requerimientoId) &&
    (!f.estado || v.estado === f.estado))),
  activar: jest.fn(async (d) => {
    const id = `${d.mandanteId}|${d.nodoClave.replace(/\//g, "~")}|` +
      d.requerimientoId;
    mockEstado.vinculos.set(id, {id, ...d, estado: "activo",
      motivoInactivo: null});
    return mockEstado.vinculos.get(id);
  }),
  cambiarEstado: jest.fn(async (ids, estado, motivo) => ids.forEach((id) =>
    mockEstado.vinculos.set(id, {...mockEstado.vinculos.get(id), estado,
      motivoInactivo: estado === "inactivo" ? motivo : null}))),
}));
jest.mock("../src/repositories/ubicacionExpedienteRepository", () => ({
  id: (e, n, s) => `${e}|${String(n).replace(/\//g, "~")}|${s}`,
  getById: jest.fn(async (id) => mockEstado.overrides.get(id) || null),
  list: jest.fn(async () => [...mockEstado.overrides.values()]
      .filter((o) => o.activo)),
  guardar: jest.fn(async (id, d) => {
    mockEstado.overrides.set(id, {id, ...d, activo: true});
    return mockEstado.overrides.get(id);
  }),
  desactivar: jest.fn(async (id) => {
    mockEstado.overrides.set(id, {...mockEstado.overrides.get(id),
      activo: false});
    return mockEstado.overrides.get(id);
  }),
}));
jest.mock("../src/repositories/aliasSugeridoRepository", () => ({
  getById: jest.fn(async (id) => mockEstado.sugerencias.get(id) || null),
  list: jest.fn(async () => [...mockEstado.sugerencias.values()]),
  create: jest.fn(async (d) => {
    const id = `s${mockEstado.sugerencias.size + 1}`;
    mockEstado.sugerencias.set(id, {id, ...d});
    return mockEstado.sugerencias.get(id);
  }),
  resolver: jest.fn(async (id, estado) => {
    mockEstado.sugerencias.set(id, {...mockEstado.sugerencias.get(id),
      estado});
    return mockEstado.sugerencias.get(id);
  }),
}));
jest.mock("../src/repositories/requerimientoRepository", () => {
  const r = (id, nombre, tipoEntidad) => ({id, nombre, tipoEntidad,
    mandanteId: "m1", estado: "activo"});
  const reqs = {
    rMutual: r("rMutual", "Certificado Afiliación Mutualidad", "empresa"),
    rCi: r("rCi", "Cédula de identidad", "persona"),
    rOdi: r("rOdi", "ODI", "empresa"),
  };
  return {getById: jest.fn(async (id) => reqs[id] || null)};
});
jest.mock("../src/repositories/perfilRequerimientoRepository", () => ({
  getActivosByPerfil: jest.fn(async () => [{requerimientoId: "rMutual"},
    {requerimientoId: "rCi"}]),
}));
jest.mock("../src/repositories/mandanteRepository", () => ({
  getById: jest.fn(async (id) => ({id})),
}));
jest.mock("../src/repositories/usuarioRepository", () => ({
  getById: jest.fn(async () => ({nombre: "Ana", apellido: "Soto"})),
}));
jest.mock("../src/repositories/tipoDocumentalRepository", () => ({
  list: jest.fn(async () => []),
}));
jest.mock("../src/services/expedienteService", () => ({
  getExpedienteById: jest.fn(async (id) => ({id, mandanteId: "m1",
    estado: "en_ejecucion", perfilParticipacionId: "perm"})),
}));
jest.mock("../src/utils/bitacoraLogger", () => ({
  registrarEvento: jest.fn().mockResolvedValue(null),
}));

const {
  validarPlantilla, validarCambioEstructura, nodosDe,
} = require("../src/utils/plantillaEstructura");
const bitacora = require("../src/utils/bitacoraLogger");
const plantillaService = require("../src/services/plantillaEstructuraService");
const mapeoService = require("../src/services/mapeoRequerimientoService");
const ubicacionService = require("../src/services/ubicacionExpedienteService");

const SUPER = {uid: "s1", rol: "superadmin"};
const EVAL = {uid: "e1", rol: "evaluador"};
const ADMIN_M = {uid: "a1", rol: "mandante_admin", mandanteId: "m1"};

const plantillaBase = () => validarPlantilla({
  nombre: "Carpeta de Arranque", secciones: [
    {clave: "mutualidad", nombre: "Certificados Mutualidad",
      alias: ["certificado mutualidad"], tipo: "archivos"},
    {clave: "odi", nombre: "ODI", tipo: "archivos",
      archivosSeccion: [{clave: "odi_firmada", nombre: "ODI firmada",
        requerimientoId: "rOdi"}]},
    {clave: "personas", nombre: "Carpetas Personales", tipo: "entidades",
      entidad: "persona", documentos: [{clave: "cedula",
        nombre: "Cédula de identidad", alias: ["ci"],
        tipoDocumentalCodigo: "CEDULA_CL", datosSensibles: true}]},
  ],
});

beforeEach(() => {
  mockEstado.plantilla = {id: "p1", mandanteId: "m1", estado: "activa",
    version: 5, ...plantillaBase()};
  mockEstado.vinculos.clear();
  mockEstado.overrides.clear();
  mockEstado.sugerencias.clear();
  mockEstado.versiones = [];
  mockEstado.creadas = [];
  jest.clearAllMocks();
});

describe("nodos y claves", () => {
  test("nodoClave 'seccion' y 'seccion/documento' con su nivel", () => {
    const nodos = nodosDe(mockEstado.plantilla);
    const de = (k) => nodos.find((n) => n.nodoClave === k);
    expect(de("mutualidad")).toMatchObject({tipoNodo: "seccion",
      nivel: "empresa"});
    expect(de("odi/odi_firmada")).toMatchObject({tipoNodo: "archivoSuelto",
      nivel: "empresa"});
    expect(de("personas/cedula")).toMatchObject({tipoNodo: "documentoEntidad",
      nivel: "persona", tipoDocumentalCodigo: "CEDULA_CL"});
  });

  test("no se puede quitar ni renombrar una clave: se retira", () => {
    const sinOdi = {...plantillaBase(), secciones: plantillaBase().secciones
        .filter((x) => x.clave !== "odi")};
    expect(() => validarCambioEstructura(mockEstado.plantilla, sinOdi))
        .toThrow(/No se puede quitar ni renombrar/);
    const retirada = validarPlantilla({...plantillaBase(), secciones:
      plantillaBase().secciones.map((x) => (x.clave === "odi" ?
        {...x, estado: "retirado"} : x))});
    expect(validarCambioEstructura(mockEstado.plantilla, retirada))
        .toEqual({retirados: ["odi", "odi/odi_firmada"], reactivados: []});
  });

  test("una clave retirada no se reutiliza para un nodo nuevo", () => {
    const conRetirada = validarPlantilla({...plantillaBase(), secciones:
      plantillaBase().secciones.map((x) => (x.clave === "odi" ?
        {...x, estado: "retirado"} : x))});
    expect(() => validarPlantilla({...conRetirada, secciones: [
      ...conRetirada.secciones, {clave: "odi", nombre: "ODI nueva",
        tipo: "archivos"}]})).toThrow(/repetida/);
  });
});

describe("plantilla: versiones y roles", () => {
  test("solo superadmin edita; cada guardado copia la versión", async () => {
    await expect(plantillaService.actualizar("p1", plantillaBase(), ADMIN_M))
        .rejects.toMatchObject({status: 403});
    const p = await plantillaService.actualizar("p1", plantillaBase(), SUPER);
    expect(p.version).toBe(6);
    // Copia de la vigente (v5, sin copia previa) y de la nueva (v6).
    expect(mockEstado.versiones).toEqual([5, 6]);
    expect(bitacora.registrarEvento).toHaveBeenCalledWith(
        expect.objectContaining({accion: "actualizado",
          detalle: expect.objectContaining({version: 6})}));
  });

  test("el requerimientoId 1:1 anterior se conserva al guardar", async () => {
    const sinReq = plantillaBase();
    sinReq.secciones[1].archivosSeccion[0].requerimientoId = null;
    const p = await plantillaService.actualizar("p1", sinReq, SUPER);
    expect(p.secciones[1].archivosSeccion[0].requerimientoId).toBe("rOdi");
  });

  test("duplicar: sin vínculos, con tipo documental, parte en v1",
      async () => {
        const nueva = await plantillaService.duplicar("p1", "m2", SUPER);
        expect(nueva).toMatchObject({mandanteId: "m2", version: 1});
        const nodos = nodosDe(nueva);
        expect(nodos.find((n) => n.nodoClave === "personas/cedula")
            .tipoDocumentalCodigo).toBe("CEDULA_CL");
        expect(nueva.secciones[1].archivosSeccion[0].requerimientoId)
            .toBeNull();
      });
});

describe("mapeo: vínculos y nivel", () => {
  test("a) requerimiento de Empresa a una sección", async () => {
    const v = await mapeoService.vincular({mandanteId: "m1",
      nodoClave: "mutualidad", requerimientoId: "rMutual"}, SUPER);
    expect(v).toMatchObject({nodoClave: "mutualidad", nivel: "empresa",
      estado: "activo"});
  });

  test("b) requerimiento de Persona a un documento de entidad", async () => {
    const v = await mapeoService.vincular({mandanteId: "m1",
      nodoClave: "personas/cedula", requerimientoId: "rCi"}, SUPER);
    expect(v).toMatchObject({nivel: "persona"});
  });

  test("nivel incompatible: error", async () => {
    await expect(mapeoService.vincular({mandanteId: "m1",
      nodoClave: "personas/cedula", requerimientoId: "rMutual"}, SUPER))
        .rejects.toMatchObject({status: 400});
    await expect(mapeoService.vincular({mandanteId: "m1",
      nodoClave: "mutualidad", requerimientoId: "rCi"}, SUPER))
        .rejects.toMatchObject({status: 400});
  });

  test("c) un requerimiento en dos nodos", async () => {
    await mapeoService.vincular({mandanteId: "m1", nodoClave: "mutualidad",
      requerimientoId: "rOdi"}, SUPER);
    await mapeoService.vincular({mandanteId: "m1",
      nodoClave: "odi/odi_firmada", requerimientoId: "rOdi"}, SUPER);
    const r = await mapeoService.porRequerimiento("rOdi", ADMIN_M);
    expect(r.nodos.map((n) => n.nodoClave))
        .toEqual(["mutualidad", "odi/odi_firmada"]);
  });

  test("solo superadmin vincula", async () => {
    await expect(mapeoService.vincular({mandanteId: "m1",
      nodoClave: "mutualidad", requerimientoId: "rMutual"}, EVAL))
        .rejects.toMatchObject({status: 403});
  });

  test("d) retirar un nodo inactiva sus vínculos; reactivarlo los devuelve",
      async () => {
        await mapeoService.vincular({mandanteId: "m1",
          nodoClave: "odi/odi_firmada", requerimientoId: "rOdi"}, SUPER);
        const retirar = (estado) => validarPlantilla({...plantillaBase(),
          secciones: plantillaBase().secciones.map((x) => (x.clave === "odi" ?
            {...x, estado} : x))});
        await plantillaService.actualizar("p1", retirar("retirado"), SUPER);
        const id = "m1|odi~odi_firmada|rOdi";
        expect(mockEstado.vinculos.get(id)).toMatchObject({
          estado: "inactivo", motivoInactivo: "nodo_retirado"});
        await plantillaService.actualizar("p1", retirar("activo"), SUPER);
        expect(mockEstado.vinculos.get(id).estado).toBe("activo");
      });
});

describe("g) override + alias sugerido + aprobación", () => {
  test("el evaluador confirma, sugiere y el superadmin aprueba", async () => {
    const r = await ubicacionService.confirmarOverride("x1", {
      nodoClave: "mutualidad", sujeto: "empresa",
      rutaReal: "Varios/Seguro laboral"}, EVAL);
    expect(r.propuestaAlias).toMatchObject({nodoClave: "mutualidad",
      alias: "Seguro laboral"});
    expect(mockEstado.overrides.get("x1|mutualidad|empresa"))
        .toMatchObject({activo: true, rutaReal: "Varios/Seguro laboral"});
    const s = await ubicacionService.sugerirAlias({expedienteId: "x1",
      nodoClave: "mutualidad", alias: "Seguro laboral"}, EVAL);
    expect(s.estado).toBe("pendiente");
    await expect(ubicacionService.resolverAliasSugerido(s.id, "aprobado",
        EVAL)).rejects.toMatchObject({status: 403});
    await ubicacionService.resolverAliasSugerido(s.id, "aprobado", SUPER);
    const nodo = nodosDe(mockEstado.plantilla).find((n) =>
      n.nodoClave === "mutualidad");
    expect(nodo.alias).toEqual(["certificado mutualidad", "Seguro laboral"]);
    expect(mockEstado.plantilla.version).toBe(6);
  });

  test("si el nombre real ya calza con el nodo, no propone alias",
      async () => {
        const r = await ubicacionService.confirmarOverride("x1", {
          nodoClave: "mutualidad", rutaReal: "03. Certificados Mutualidad"},
        EVAL);
        expect(r.propuestaAlias).toBeNull();
      });

  test("configuración del expediente: nodos aplicables por perfil",
      async () => {
        await mapeoService.vincular({mandanteId: "m1",
          nodoClave: "mutualidad", requerimientoId: "rMutual"}, SUPER);
        await mapeoService.vincular({mandanteId: "m1",
          nodoClave: "odi/odi_firmada", requerimientoId: "rOdi"}, SUPER);
        const c = await ubicacionService.config("x1", ADMIN_M);
        // rOdi no está en el perfil del expediente: su nodo no se exige.
        expect(c.aplicables).toEqual({rMutual: ["mutualidad"]});
      });
});
