// Conector SharePoint (Microsoft Graph, solo lectura): token, prueba de
// conexión paso a paso, navegación paginada, throttling, aislamiento por
// Mandante y rol, y el client secret fuera de respuestas y logs. Graph y
// Entra ID simulados (ninguna llamada real a Microsoft); datos sintéticos.
const SECRET = "s3cr3t-NO-DEBE-SALIR~abc";
const TENANT = "11111111-2222-3333-4444-555555555555";
const CLIENT = "66666666-7777-8888-9999-000000000000";
const SITIO = "https://acme.sharepoint.com/sites/docs";

const mockFuentes = new Map();
jest.mock("../src/repositories/fuenteDocumentalRepository", () => ({
  list: jest.fn(async (m) => [...mockFuentes.values()]
      .filter((f) => f.mandanteId === m)),
  getById: jest.fn(async (id) => mockFuentes.get(id) || null),
  update: jest.fn(async (id, d) => Object.assign(mockFuentes.get(id), d)),
}));
jest.mock("../src/services/fuenteDocumentalService", () => ({
  obtenerCredenciales: jest.fn(async (id) => ({
    config: mockFuentes.get(id).config, clientSecret: SECRET})),
}));
jest.mock("../src/utils/bitacoraLogger", () => ({
  registrarEvento: jest.fn(async () => undefined),
}));

const graph = require("../src/repositories/graphRepository");
const bitacoraLogger = require("../src/utils/bitacoraLogger");
const sp = require("../src/services/sharePointService");

const SUPER = {uid: "s1", rol: "superadmin"};
const ADMIN_M1 = {uid: "a1", rol: "mandante_admin", mandanteId: "m1"};
const ADMIN_M2 = {uid: "a2", rol: "mandante_admin", mandanteId: "m2"};
const LECTOR_M1 = {uid: "l1", rol: "mandante_lector", mandanteId: "m1"};
const EVALUADOR = {uid: "e1", rol: "evaluador"};
const CONFIG = {tenantId: TENANT, clientId: CLIENT, siteUrl: SITIO,
  biblioteca: "Documentos", rutaBase: "Acreditacion/"};

// ── Graph simulado ──
const respuesta = (status, cuerpo, cabeceras = {}) => ({
  ok: status >= 200 && status < 300, status,
  headers: {get: (k) => cabeceras[k] ?? null},
  json: async () => cuerpo,
  body: null,
});
const BASE = {id: "base", name: "Acreditacion", folder: {childCount: 3},
  parentReference: {driveId: "d1", path: "/drives/d1/root:"}};
const hijo = (id, name, carpeta, path = "/drives/d1/root:/Acreditacion") => ({
  id, name, size: carpeta ? 0 : 1234,
  lastModifiedDateTime: "2026-10-01T12:00:00Z",
  ...(carpeta ? {folder: {childCount: 1}} :
    {file: {mimeType: "application/pdf"}}),
  parentReference: {driveId: "d1", path},
});
let rutas;
let llamadas;
const rutasPorDefecto = () => ({
  "token": () => respuesta(200, {access_token: "tok-1", expires_in: 3600}),
  "/sites/acme.sharepoint.com:/sites/docs": () =>
    respuesta(200, {id: "site1", displayName: "Docs"}),
  "/sites/site1/drives": () => respuesta(200, {value: [{id: "d1",
    name: "Documentos", webUrl: `${SITIO}/Shared%20Documents`}]}),
  "/drives/d1/root:/Acreditacion": () => respuesta(200, BASE),
  "/drives/d1/items/base/children": (url) => (url.includes("$skiptoken=2") ?
    respuesta(200, {value: [hijo("f2", "contrato.pdf", false)]}) :
    respuesta(200, {"value": [hijo("c1", "2. TECNORED", true),
      hijo("c0", "1. BOSCH", true)],
    "@odata.nextLink": "https://graph.microsoft.com/v1.0/drives/d1/items/" +
      "base/children?$skiptoken=2"})),
  "/drives/d1/items/c1": () => respuesta(200, hijo("c1", "2. TECNORED", true)),
  "/drives/d1/items/fuera": () => respuesta(200, hijo("fuera", "Otra", true,
      "/drives/d1/root:/Privado")),
});
const ruta = (url) => {
  if (url.includes("login.microsoftonline.com")) return "token";
  const camino = url.replace("https://graph.microsoft.com/v1.0", "")
      .split("?")[0];
  return camino;
};

beforeEach(() => {
  jest.clearAllMocks();
  mockFuentes.clear();
  mockFuentes.set("f1", {id: "f1", mandanteId: "m1", tipo: "sharepoint",
    estado: "activa", nombre: "SP", config: {...CONFIG}});
  rutas = rutasPorDefecto();
  llamadas = [];
  graph.tokens.clear();
  sp.contextos.clear();
  graph.esperar = jest.fn(async () => undefined);
  graph.fetch = jest.fn(async (url, opciones) => {
    llamadas.push({url, opciones});
    const r = rutas[ruta(url)];
    if (!r) return respuesta(404, {error: {code: "itemNotFound"}});
    return r(url, opciones);
  });
});

describe("token de aplicación", () => {
  test("éxito y cache hasta poco antes de expirar", async () => {
    const c = {tenantId: TENANT, clientId: CLIENT, clientSecret: SECRET};
    expect(await graph.token(c)).toBe("tok-1");
    expect(await graph.token(c)).toBe("tok-1");
    expect(llamadas.filter((l) => ruta(l.url) === "token")).toHaveLength(1);
    // El cache no guarda el secret (la clave usa un hash).
    expect(JSON.stringify([...graph.tokens.keys()])).not.toContain(SECRET);
    // Vencido (dentro del margen): se pide otro.
    const [clave] = graph.tokens.keys();
    graph.tokens.get(clave).expira = Date.now() + 60 * 1000;
    await graph.token(c);
    expect(llamadas.filter((l) => ruta(l.url) === "token")).toHaveLength(2);
  });

  test("credenciales inválidas: mensaje accionable", async () => {
    rutas.token = () => respuesta(401, {error: "invalid_client",
      error_description: "AADSTS7000215: Invalid client secret provided."});
    await expect(graph.token({tenantId: TENANT, clientId: CLIENT,
      clientSecret: SECRET})).rejects.toMatchObject({status: 401,
      codigo: "CREDENCIALES_INVALIDAS",
      message: expect.stringContaining("client secret no es válido")});
  });
});

describe("probar conexión", () => {
  const probar = (extra = {}, actor = ADMIN_M1) => sp.probarConexion({
    mandanteId: "m1", ...CONFIG, clientSecret: SECRET, ...extra}, actor);
  const estados = (r) => Object.fromEntries(r.pasos.map((p) =>
    [p.clave, p.estado]));

  test("todo bien: cada paso ok", async () => {
    const r = await probar();
    expect(r.ok).toBe(true);
    expect(r.pasos.every((p) => p.estado === "ok")).toBe(true);
    expect(r.driveId).toBe("d1");
  });

  test("cada paso que falla da su mensaje y omite los siguientes",
      async () => {
        rutas.token = () => respuesta(400, {error: "invalid_client",
          error_description: "AADSTS7000215"});
        let r = await probar();
        expect(estados(r)).toMatchObject({credenciales: "error",
          sitio: "omitido", lectura: "omitido"});
        expect(r.pasos[0].mensaje).toMatch(/Credenciales inválidas/);

        rutas = rutasPorDefecto();
        rutas["/sites/acme.sharepoint.com:/sites/docs"] = () =>
          respuesta(403, {error: {code: "accessDenied"}});
        r = await probar();
        expect(r.pasos.find((p) => p.clave === "sitio").mensaje)
            .toMatch(/falta conceder Sites.Selected/);

        rutas["/sites/acme.sharepoint.com:/sites/docs"] = () =>
          respuesta(404, {error: {code: "itemNotFound"}});
        r = await probar();
        expect(r.pasos.find((p) => p.clave === "sitio").mensaje)
            .toBe(`No existe el sitio ${SITIO}.`);

        rutas = rutasPorDefecto();
        r = await probar({biblioteca: "Contratos"});
        expect(estados(r)).toMatchObject({sitio: "ok", biblioteca: "error",
          carpetaBase: "omitido"});
        expect(r.pasos.find((p) => p.clave === "biblioteca").mensaje)
            .toMatch(/No existe la biblioteca «Contratos».*Documentos/);

        // "Shared Documents" (último tramo de la URL) también la encuentra.
        r = await probar({biblioteca: "Shared Documents"});
        expect(estados(r).biblioteca).toBe("ok");

        r = await probar({rutaBase: "NoExiste"});
        expect(r.pasos.find((p) => p.clave === "carpetaBase").mensaje)
            .toBe("No existe la carpeta base «NoExiste» en la biblioteca " +
              "«Documentos».");

        rutas["/drives/d1/items/base/children"] = () =>
          respuesta(403, {error: {code: "accessDenied"}});
        r = await probar();
        expect(estados(r)).toMatchObject({carpetaBase: "ok",
          lectura: "error"});
        expect(r.ok).toBe(false);
      });

  test("con la fuente guardada (sin datos del formulario) deja su estado " +
      "de conexión y la Bitácora sin secretos", async () => {
    const r = await sp.probarConexion({mandanteId: "m1", fuenteId: "f1"},
        ADMIN_M1);
    expect(r.ok).toBe(true);
    expect(mockFuentes.get("f1")).toMatchObject({estadoConexion: "conectada",
      ultimoErrorConexion: null, config: expect.objectContaining({
        siteId: "site1", driveId: "d1"})});
    expect(bitacoraLogger.registrarEvento).toHaveBeenCalledWith(
        expect.objectContaining({accion: "conexion_probada",
          detalle: {ok: true, paso: null}}));
  });

  test("solo quienes administran la fuente, y en su Mandante", async () => {
    await expect(probar({}, LECTOR_M1)).rejects.toMatchObject({status: 403});
    await expect(probar({}, EVALUADOR)).rejects.toMatchObject({status: 403});
    await expect(sp.probarConexion({mandanteId: "m1", fuenteId: "f1"},
        ADMIN_M2)).rejects.toMatchObject({status: 403});
    await expect(sp.probarConexion({mandanteId: "m2", fuenteId: "f1"},
        SUPER)).rejects.toMatchObject({status: 404});
  });
});

describe("navegación", () => {
  test("listarHijos sigue @odata.nextLink; carpetas primero; ruta " +
      "relativa a la carpeta base", async () => {
    const r = await sp.listarHijos({mandanteId: "m1"}, LECTOR_M1);
    expect(r.hijos.map((h) => [h.nombre, h.tipo, h.rutaRelativa])).toEqual([
      ["1. BOSCH", "carpeta", "1. BOSCH"],
      ["2. TECNORED", "carpeta", "2. TECNORED"],
      ["contrato.pdf", "archivo", "contrato.pdf"],
    ]);
    expect(r.hijos[0]).toMatchObject({id: "c0", driveId: "d1"});
    expect(r.hijos[2]).toMatchObject({tamano: 1234,
      modificado: "2026-10-01T12:00:00Z"});
    expect(llamadas.filter((l) => l.url.includes("/children"))).toHaveLength(2);
  });

  test("obtenerItem dentro de la base; fuera de ella, 404", async () => {
    expect(await sp.obtenerItem({mandanteId: "m1", itemId: "c1"}, SUPER))
        .toMatchObject({id: "c1", nombre: "2. TECNORED",
          rutaRelativa: "2. TECNORED"});
    await expect(sp.obtenerItem({mandanteId: "m1", itemId: "fuera"}, SUPER))
        .rejects.toMatchObject({status: 404});
  });

  test("aislamiento: los roles del Mandante solo el suyo; otros roles no",
      async () => {
        mockFuentes.set("f2", {id: "f2", mandanteId: "m2", tipo: "sharepoint",
          estado: "activa", config: {...CONFIG}});
        await expect(sp.listarHijos({mandanteId: "m2"}, LECTOR_M1))
            .rejects.toMatchObject({status: 403});
        await expect(sp.listarHijos({mandanteId: "m1"}, ADMIN_M2))
            .rejects.toMatchObject({status: 403});
        await expect(sp.listarHijos({mandanteId: "m1"},
            {uid: "x", rol: "admin_comercial"}))
            .rejects.toMatchObject({status: 403});
        // Sin mandanteId, el rol del Mandante usa el suyo.
        expect((await sp.listarHijos({}, ADMIN_M2)).hijos).toHaveLength(3);
        // El evaluador, según su alcance actual (cualquier Mandante).
        expect((await sp.listarHijos({mandanteId: "m2"}, EVALUADOR)).hijos)
            .toHaveLength(3);
        // Mandante sin fuente SharePoint activa.
        await expect(sp.listarHijos({mandanteId: "m3"}, SUPER))
            .rejects.toMatchObject({status: 409,
              codigo: "SIN_FUENTE_SHAREPOINT"});
      });
});

describe("throttling", () => {
  test("429 con Retry-After: espera lo indicado y reintenta", async () => {
    let n = 0;
    rutas["/drives/d1/items/c1"] = () => (++n === 1 ?
      respuesta(429, {}, {"Retry-After": "2"}) :
      respuesta(200, hijo("c1", "2. TECNORED", true)));
    expect((await sp.obtenerItem({mandanteId: "m1", itemId: "c1"}, SUPER))
        .nombre).toBe("2. TECNORED");
    expect(graph.esperar).toHaveBeenCalledWith(2000);
  });

  test("reintentos acotados: luego un 503 claro", async () => {
    rutas["/drives/d1/items/c1"] = () =>
      respuesta(503, {}, {"Retry-After": "120"});
    await expect(sp.obtenerItem({mandanteId: "m1", itemId: "c1"}, SUPER))
        .rejects.toMatchObject({status: 503, codigo: "LIMITADO"});
    // Retry-After largo: la espera se acota a 10 s.
    expect(graph.esperar).toHaveBeenCalledWith(10000);
    expect(graph.esperar).toHaveBeenCalledTimes(3);
  });
});

describe("el client secret no sale", () => {
  test("ni en respuestas, ni en errores, ni en la Bitácora, ni en logs",
      async () => {
        const espias = ["log", "info", "warn", "error", "debug"].map((m) =>
          jest.spyOn(console, m).mockImplementation(() => undefined));
        const salidas = [];
        salidas.push(await sp.probarConexion({mandanteId: "m1", ...CONFIG,
          clientSecret: SECRET}, SUPER));
        salidas.push(await sp.probarConexion({mandanteId: "m1",
          fuenteId: "f1"}, SUPER));
        salidas.push(await sp.listarHijos({mandanteId: "m1"}, SUPER));
        rutas.token = () => respuesta(401, {error: "invalid_client",
          error_description: `AADSTS7000215 secret ${SECRET}`});
        graph.tokens.clear();
        salidas.push(await sp.probarConexion({mandanteId: "m1", ...CONFIG,
          clientSecret: SECRET}, SUPER));
        await sp.listarHijos({mandanteId: "m1"}, SUPER)
            .catch((e) => salidas.push({message: e.message, codigo: e.codigo}));

        expect(JSON.stringify(salidas)).not.toContain(SECRET);
        expect(JSON.stringify(bitacoraLogger.registrarEvento.mock.calls))
            .not.toContain(SECRET);
        espias.forEach((e) => {
          expect(JSON.stringify(e.mock.calls)).not.toContain(SECRET);
          e.mockRestore();
        });
        // El secret solo viajó en el cuerpo del POST del token.
        const conSecret = llamadas.filter((l) =>
          JSON.stringify(l).includes(encodeURIComponent(SECRET)));
        expect(conSecret.every((l) => ruta(l.url) === "token")).toBe(true);
      });
});
