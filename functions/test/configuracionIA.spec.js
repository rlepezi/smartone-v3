const crypto = require("crypto");
const {claveDesdeBase64, cifrar, descifrar} = require("../src/utils/cifrado");
const {
  normalizarRutaBase, validarFuenteSharePoint, aPublica, hayOtraActiva,
} = require("../src/utils/fuentesDocumentales");
const {
  concordancia, normalizarDescripcion, agruparPorNormalizar,
} = require("../src/utils/metricasIA");
const {faltanPrecios} = require("../src/services/costoService");

// Servicio de mockFuentes con sus dependencias simuladas (sin Firestore).
const mockFuentes = new Map();
jest.mock("../src/repositories/fuenteDocumentalRepository", () => ({
  list: jest.fn(async (mandanteId) => [...mockFuentes.values()]
      .filter((f) => f.mandanteId === mandanteId)),
  getById: jest.fn(async (id) => mockFuentes.get(id) || null),
  create: jest.fn(async (data) => {
    const f = {id: `f${mockFuentes.size + 1}`, ...data};
    mockFuentes.set(f.id, f);
    return f;
  }),
  update: jest.fn(async (id, data) => {
    const f = {...mockFuentes.get(id), ...data};
    mockFuentes.set(id, f);
    return f;
  }),
}));
jest.mock("../src/repositories/mandanteRepository", () => ({
  getById: jest.fn(async (id) => ({id})),
}));
jest.mock("../src/repositories/usuarioRepository", () => ({
  getById: jest.fn(async () => ({nombre: "Ana", apellido: "Soto"})),
}));
jest.mock("../src/utils/bitacoraLogger", () => ({
  registrarEvento: jest.fn(async () => {}),
}));
const mockClave = crypto.randomBytes(32);
jest.mock("../src/services/aiConfigService", () => {
  const cif = require("../src/utils/cifrado");
  return {
    cifrarSecreto: (texto) => cif.cifrar(texto, mockClave),
    descifrarSecreto: (datos) => cif.descifrar(datos, mockClave),
  };
});
const fuenteDocumentalService =
    require("../src/services/fuenteDocumentalService");

const GUID = "11111111-2222-3333-4444-555555555555";
const DATOS = {
  mandanteId: "m1", nombre: "SharePoint Transemel", tenantId: GUID,
  clientId: GUID.replace(/1/g, "a"), clientSecret: "secreto-abcd-1234",
  siteUrl: "https://transemel.sharepoint.com/sites/Acreditacion",
  biblioteca: "", rutaBase: "/Acreditacion",
};
const ACTOR = {uid: "u1", rol: "superadmin"};
const SECRETOS = ["secretCifrado", "iv", "authTag", "clientSecret"];
const sinSecretos = (obj) => {
  const texto = JSON.stringify(obj);
  return SECRETOS.every((c) => !(c in obj)) &&
      !texto.includes(DATOS.clientSecret);
};

describe("cifrado del client secret (AES-256-GCM)", () => {
  const clave = crypto.randomBytes(32);
  test("cifra y descifra", () => {
    const datos = cifrar("mi-secreto", clave);
    expect(datos.cifrado).not.toContain("mi-secreto");
    expect(descifrar(datos, clave)).toBe("mi-secreto");
  });
  test("otra clave no descifra", () => {
    const datos = cifrar("mi-secreto", clave);
    expect(() => descifrar(datos, crypto.randomBytes(32))).toThrow();
  });
  test("la clave maestra debe tener 32 bytes", () => {
    expect(claveDesdeBase64(clave.toString("base64"))).toHaveLength(32);
    expect(claveDesdeBase64("corta")).toBeNull();
  });
});

describe("validaciones de mockFuentes documentales", () => {
  test("normaliza la ruta base", () => {
    expect(normalizarRutaBase("/Acreditacion")).toBe("Acreditacion/");
    expect(normalizarRutaBase("Acreditacion\\Personas\\"))
        .toBe("Acreditacion/Personas/");
    expect(normalizarRutaBase("  ")).toBe("");
  });
  test("datos válidos, biblioteca por defecto", () => {
    const r = validarFuenteSharePoint(DATOS, {esNueva: true});
    expect(r.config.biblioteca).toBe("Documentos");
    expect(r.config.rutaBase).toBe("Acreditacion/");
  });
  test.each([
    ["tenantId", "no-es-guid"],
    ["clientId", "123"],
    ["siteUrl", "https://transemel.sharepoint.com/teams/x"],
    ["siteUrl", "http://transemel.sharepoint.com/sites/x"],
    ["nombre", ""],
  ])("rechaza %s inválido", (campo, valor) => {
    expect(() => validarFuenteSharePoint({...DATOS, [campo]: valor},
        {esNueva: true})).toThrow();
  });
  test("secret obligatorio solo al crear", () => {
    const sinSecret = {...DATOS, clientSecret: ""};
    expect(() => validarFuenteSharePoint(sinSecret, {esNueva: true}))
        .toThrow();
    expect(validarFuenteSharePoint(sinSecret, {esNueva: false}).clientSecret)
        .toBeNull();
  });
  test("una sola SharePoint activa por Mandante", () => {
    const lista = [{id: "a", tipo: "sharepoint", estado: "activa"},
      {id: "b", tipo: "sharepoint", estado: "inactiva"}];
    expect(hayOtraActiva(lista, "sharepoint")).toBe(true);
    expect(hayOtraActiva(lista, "sharepoint", "a")).toBe(false);
    expect(hayOtraActiva([], "sharepoint")).toBe(false);
  });
  test("aPublica quita los secretos", () => {
    const publica = aPublica({id: "x", secretCifrado: "c", iv: "i",
      authTag: "t", secretUltimos4: "1234"});
    expect(publica).toEqual({id: "x", secretUltimos4: "1234"});
  });
});

describe("respuestas del servicio de mockFuentes sin secretos", () => {
  beforeEach(() => mockFuentes.clear());

  test("crear, listar, obtener, actualizar y cambiar estado", async () => {
    const creada = await fuenteDocumentalService.crear(DATOS, ACTOR);
    expect(sinSecretos(creada)).toBe(true);
    expect(creada.secretUltimos4).toBe("1234");
    // En el almacenamiento sí queda cifrado (y no en texto plano).
    const guardada = mockFuentes.get(creada.id);
    expect(guardada.secretCifrado).toBeTruthy();
    expect(JSON.stringify(guardada)).not.toContain(DATOS.clientSecret);

    const lista = await fuenteDocumentalService.listar({mandanteId: "m1"},
        ACTOR);
    expect(lista.every(sinSecretos)).toBe(true);
    expect(sinSecretos(await fuenteDocumentalService.obtener(creada.id,
        ACTOR))).toBe(true);

    // Editar sin secret conserva el anterior.
    const editada = await fuenteDocumentalService.actualizar(creada.id,
        {...DATOS, nombre: "Otro nombre", clientSecret: ""}, ACTOR);
    expect(sinSecretos(editada)).toBe(true);
    const credenciales =
        await fuenteDocumentalService.obtenerCredenciales(creada.id);
    expect(credenciales.clientSecret).toBe(DATOS.clientSecret);

    const inactiva = await fuenteDocumentalService.cambiarEstado(creada.id,
        "inactiva", ACTOR);
    expect(sinSecretos(inactiva)).toBe(true);
  });

  test("rechaza una segunda SharePoint activa", async () => {
    await fuenteDocumentalService.crear(DATOS, ACTOR);
    await expect(fuenteDocumentalService.crear(DATOS, ACTOR))
        .rejects.toThrow(/ya tiene una fuente SharePoint activa/);
  });

  test("mandante_admin no administra otro Mandante", async () => {
    await expect(fuenteDocumentalService.crear({...DATOS, mandanteId: "m2"},
        {uid: "u2", rol: "mandante_admin", mandanteId: "m1"}))
        .rejects.toThrow(/No tiene acceso/);
  });
});

describe("concordancia", () => {
  test("aceptados sin cambio sobre resueltos", () => {
    expect(concordancia({aceptadosSinCambio: 3, corregidos: 1})).toBe(75);
  });
  test("sin datos", () => {
    expect(concordancia({aceptadosSinCambio: 0, corregidos: 0})).toBeNull();
    expect(concordancia(null)).toBeNull();
  });
});

describe("tipos por normalizar", () => {
  test("normaliza la descripción", () => {
    expect(normalizarDescripcion("  Certificado   de ANTECEDENTES "))
        .toBe("certificado de antecedentes");
    expect(normalizarDescripcion("Certificado de Antecedéntes"))
        .toBe("certificado de antecedentes");
  });
  test("agrupa y ordena por apariciones", () => {
    const grupos = agruparPorNormalizar([
      {tipoDetectadoDescripcion: "Certificado de antecedentes",
        mandanteId: "m1", fecha: new Date("2026-10-01")},
      {tipoDetectadoDescripcion: "certificado  de antecedéntes",
        mandanteId: "m2", fecha: new Date("2026-10-05")},
      {tipoDetectadoDescripcion: "Pasaporte", mandanteId: "m1",
        fecha: new Date("2026-10-02")},
    ]);
    expect(grupos[0].descripcion).toBe("certificado de antecedentes");
    expect(grupos[0].apariciones).toBe(2);
    expect(grupos[0].mandanteIds.sort()).toEqual(["m1", "m2"]);
    expect(grupos[0].ultimoVisto.toISOString().slice(0, 10))
        .toBe("2026-10-05");
    expect(grupos[1].descripcion).toBe("pasaporte");
  });
});

describe("bloqueo del estimador cuando faltan precios", () => {
  const precios = {"modelo-a": {entrada: 2, salida: 10},
    "modelo-b": {entrada: 0, salida: 5}};
  test("con precios no bloquea", () => {
    expect(faltanPrecios(precios, "modelo-a")).toBe(false);
  });
  test("sin modelo, sin precio o con precio 0 bloquea", () => {
    expect(faltanPrecios(precios, null)).toBe(true);
    expect(faltanPrecios(precios, "modelo-x")).toBe(true);
    expect(faltanPrecios(precios, "modelo-b")).toBe(true);
    expect(faltanPrecios({}, "modelo-a")).toBe(true);
  });
});
