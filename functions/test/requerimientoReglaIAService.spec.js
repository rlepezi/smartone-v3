// Servicio de reglas IA del requerimiento con repositorios y modelo simulados
// (datos sintéticos; sin Firestore ni llamadas reales a la IA).
jest.mock("firebase-admin/firestore", () => ({
  FieldValue: {serverTimestamp: () => "AHORA"},
}));
jest.mock("../src/repositories/consumoIARepository", () => ({
  crear: jest.fn().mockResolvedValue("consumo"),
}));
jest.mock("../src/repositories/requerimientoRepository", () => ({
  getById: jest.fn(), update: jest.fn(), getByIds: jest.fn(),
  listActivosResumenIA: jest.fn(),
}));
jest.mock("../src/repositories/tipoDocumentalRepository", () => ({
  getById: jest.fn(), list: jest.fn(),
}));
jest.mock("../src/repositories/plantillaEstructuraRepository", () => ({
  getActiva: jest.fn().mockResolvedValue(null),
}));
jest.mock("../src/repositories/reglaIARepository", () => ({
  getById: jest.fn(), getByIds: jest.fn(),
}));
jest.mock("../src/repositories/requerimientoReglaRepository", () => ({
  listByRequerimiento: jest.fn(), create: jest.fn(), getById: jest.fn(),
  update: jest.fn(), listActivosByRegla: jest.fn(),
}));
jest.mock("../src/repositories/pruebaReglaIARepository", () => ({
  listByRequerimiento: jest.fn(), create: jest.fn(),
}));
jest.mock("../src/repositories/usuarioRepository", () => ({
  getById: jest.fn().mockResolvedValue({nombre: "Ana", apellido: "Demo"}),
}));
jest.mock("../src/utils/bitacoraLogger", () => ({
  registrarEvento: jest.fn().mockResolvedValue(),
}));
jest.mock("../src/services/aiConfigService", () => ({
  obtenerParametros: jest.fn().mockResolvedValue({
    modeloPorDefecto: "modelo-demo", umbralConfianzaReglas: 0.7,
    preciosPorModelo: {"modelo-demo": {entrada: 1, salida: 5}},
  }),
  validarLimiteMensual: jest.fn().mockResolvedValue(),
}));
jest.mock("../src/services/modeloReglasIAService", () => ({
  evaluar: jest.fn(),
}));

const requerimientoRepository =
    require("../src/repositories/requerimientoRepository");
const tipoDocumentalRepository =
    require("../src/repositories/tipoDocumentalRepository");
const reglaIARepository = require("../src/repositories/reglaIARepository");
const requerimientoReglaRepository =
    require("../src/repositories/requerimientoReglaRepository");
const pruebaReglaIARepository =
    require("../src/repositories/pruebaReglaIARepository");
const bitacoraLogger = require("../src/utils/bitacoraLogger");
const modeloReglasIAService =
    require("../src/services/modeloReglasIAService");
const plantillaEstructuraRepository =
    require("../src/repositories/plantillaEstructuraRepository");
const servicio = require("../src/services/requerimientoReglaIAService");

const ACTOR = {uid: "u1", rol: "superadmin", email: "demo@ejemplo.cl"};
const CEDULA = {id: "t-ci", codigo: "CEDULA_CL", nombre: "Cédula",
  estado: "activo", estadoIA: "piloto",
  campos: [{clave: "rut", etiqueta: "RUT", tipo: "rut"},
    {clave: "fechaVencimiento", etiqueta: "Vence", tipo: "fecha"}]};
const REGLA_RUT = {id: "g-rut", nombre: "RUT coincide", version: 1,
  tipo: "deterministica", verificacion: "coincide_rut", parametros: {},
  camposRequeridos: ["rut"], entidades: ["persona"], estado: "activa"};
const REGLA_EMISION = {id: "g-emi", nombre: "Antigüedad", version: 1,
  tipo: "deterministica", verificacion: "antiguedad_maxima",
  parametros: {diasMaximos: 30}, camposRequeridos: ["fechaEmision"],
  entidades: ["persona"], estado: "activa"};

let req;
beforeEach(() => {
  jest.clearAllMocks();
  req = {id: "r1", nombre: "Cédula de Identidad Nacional",
    tipoEntidad: "persona", mandanteId: "m1", tipoDocumentalId: "t-ci"};
  requerimientoRepository.getById.mockImplementation(async () => req);
  requerimientoRepository.update.mockImplementation(async (id, c) => {
    req = {...req, ...c};
    return req;
  });
  tipoDocumentalRepository.getById.mockResolvedValue(CEDULA);
  tipoDocumentalRepository.list.mockResolvedValue([CEDULA]);
  pruebaReglaIARepository.listByRequerimiento.mockResolvedValue([]);
});

describe("vincular reglas", () => {
  it("acepta una regla cuyo campo el tipo no extrae: se suma a lo que " +
      "lee la IA", async () => {
    const vinculo = {id: "v9", requerimientoId: "r1", reglaId: "g-emi",
      orden: 1, severidad: "bloqueante", parametros: {}, activa: true};
    requerimientoReglaRepository.listByRequerimiento
        .mockResolvedValueOnce([]).mockResolvedValue([vinculo]);
    reglaIARepository.getByIds.mockResolvedValue([REGLA_EMISION]);
    reglaIARepository.getById.mockResolvedValue(REGLA_EMISION);
    requerimientoReglaRepository.create.mockResolvedValue(vinculo);
    const r = await servicio.agregarRegla("r1", {reglaId: "g-emi"}, ACTOR);
    expect(requerimientoReglaRepository.create).toHaveBeenCalled();
    expect(r.vinculos[0].alertas).toEqual([]);
    // Tipo solo GUARDADO (respaldo): sus campos no se suman.
    expect(r.tipo.origen).toBe("guardado");
    expect(r.camposIA.map((c) => c.clave)).toEqual(["fechaEmision", "titulo"]);
  });

  it("el tipo sale del documento de la plantilla vinculado y sus campos " +
      "se suman a los de las reglas", async () => {
    req = {...req, tipoDocumentalId: null};
    plantillaEstructuraRepository.getActiva.mockResolvedValueOnce({
      secciones: [{clave: "personal", tipo: "entidades", entidad: "persona",
        documentos: [{clave: "ci", nombre: "Cédula",
          tipoDocumentalCodigo: "CEDULA_CL", requerimientoId: "r1"}]}]});
    requerimientoReglaRepository.listByRequerimiento.mockResolvedValue([
      {id: "v9", requerimientoId: "r1", reglaId: "g-emi", orden: 1,
        severidad: "bloqueante", parametros: {}, activa: true}]);
    reglaIARepository.getByIds.mockResolvedValue([REGLA_EMISION]);
    const r = await servicio.obtener("r1", ACTOR);
    expect(r.tipo).toMatchObject({codigo: "CEDULA_CL", origen: "plantilla"});
    expect(r.camposIA.map((c) => c.clave))
        .toEqual(["rut", "fechaVencimiento", "fechaEmision", "titulo"]);
  });

  it("la primera regla pasa de Sin reglas a En definición y queda en la " +
      "Bitácora", async () => {
    const vinculo = {id: "v1", requerimientoId: "r1", reglaId: "g-rut",
      orden: 1, severidad: "bloqueante", parametros: {}, activa: true};
    requerimientoReglaRepository.listByRequerimiento
        .mockResolvedValueOnce([]).mockResolvedValue([vinculo]);
    reglaIARepository.getByIds.mockResolvedValue([REGLA_RUT]);
    reglaIARepository.getById.mockResolvedValue(REGLA_RUT);
    requerimientoReglaRepository.create.mockResolvedValue(vinculo);
    const r = await servicio.agregarRegla("r1", {reglaId: "g-rut"}, ACTOR);
    expect(r.requerimiento.estadoIA).toBe("en_definicion");
    expect(r.transiciones.en_prueba).toBeNull();
    expect(bitacoraLogger.registrarEvento).toHaveBeenCalledWith(
        expect.objectContaining({accion: "regla_ia_vinculada",
          detalle: expect.objectContaining({estadoIAAnterior: "sin_reglas",
            estadoIANuevo: "en_definicion"})}));
  });

  it("estando habilitado, un cambio vuelve a En definición con aviso",
      async () => {
        req.estadoIA = "habilitado";
        const vinculo = {id: "v1", requerimientoId: "r1", reglaId: "g-rut",
          orden: 1, severidad: "bloqueante", parametros: {}, activa: true};
        requerimientoReglaRepository.listByRequerimiento
            .mockResolvedValue([vinculo]);
        requerimientoReglaRepository.getById.mockResolvedValue(vinculo);
        reglaIARepository.getByIds.mockResolvedValue([REGLA_RUT]);
        reglaIARepository.getById.mockResolvedValue(REGLA_RUT);
        const r = await servicio.actualizarVinculo("r1", "v1",
            {severidad: "advertencia"}, ACTOR);
        expect(r.aviso).toMatch(/vuelve a En definición/);
        expect(req.estadoIA).toBe("en_definicion");
      });
});

describe("probar", () => {
  it("una llamada al modelo, reglas aplicadas y prueba guardada con costo",
      async () => {
        req.estadoIA = "en_prueba";
        const vinculo = {id: "v1", requerimientoId: "r1", reglaId: "g-rut",
          orden: 1, severidad: "bloqueante", parametros: {}, activa: true};
        requerimientoReglaRepository.listByRequerimiento
            .mockResolvedValue([vinculo]);
        reglaIARepository.getByIds.mockResolvedValue([REGLA_RUT]);
        modeloReglasIAService.evaluar.mockResolvedValue({
          camposExtraidos: {rut: {valor: "11111111-1", confianza: 0.99},
            fechaVencimiento: {valor: null, confianza: 0.1}},
          interpretativas: [], tokensEntrada: 2000, tokensSalida: 400,
          intentos: 1, latenciaMs: 900,
        });
        pruebaReglaIARepository.create.mockImplementation(async (d) =>
          ({id: "p1", ...d}));
        const p = await servicio.probar("r1", {
          archivos: [{nombre: "anverso.jpg", mime: "image/jpeg",
            contenidoBase64: Buffer.from("x").toString("base64")},
          {nombre: "reverso.jpg", mime: "image/jpeg",
            contenidoBase64: Buffer.from("y").toString("base64")}],
          contexto: {rut: "11.111.111-1", fechaEvaluacion: "26/10/2026"},
        }, ACTOR);
        expect(modeloReglasIAService.evaluar).toHaveBeenCalledTimes(1);
        expect(modeloReglasIAService.evaluar.mock.calls[0][0].piezas)
            .toHaveLength(2);
        expect(p.resultadoPropuesto.resultado).toBe("cumple");
        expect(p.contextoUsado.fechaEvaluacion).toBe("2026-10-26");
        expect(p.costoEstimado).toBeCloseTo(0.004, 6);
        expect(p.archivoNombre).toBe("anverso.jpg + reverso.jpg");
      });

  it("rechaza archivos de más de 10 MB sin llamar al modelo", async () => {
    req.estadoIA = "en_definicion";
    requerimientoReglaRepository.listByRequerimiento.mockResolvedValue([
      {id: "v1", reglaId: "g-rut", severidad: "bloqueante", activa: true}]);
    reglaIARepository.getByIds.mockResolvedValue([REGLA_RUT]);
    const grande = Buffer.alloc(10 * 1024 * 1024 + 1).toString("base64");
    await expect(servicio.probar("r1", {archivos: [{nombre: "g.pdf",
      mime: "application/pdf", contenidoBase64: grande}]}, ACTOR))
        .rejects.toThrow("g.pdf supera los 10 MB.");
    expect(modeloReglasIAService.evaluar).not.toHaveBeenCalled();
  });

  it("solo en En definición o En prueba", async () => {
    req.estadoIA = "habilitado";
    await expect(servicio.probar("r1", {}, ACTOR)).rejects.toThrow(/En prueba/);
  });

  it("sin tipo documental: los campos salen de las reglas y el documento " +
      "esperado es el requerimiento", async () => {
    req = {...req, estadoIA: "en_definicion", tipoDocumentalId: null,
      nombreCorto: "Cédula"};
    requerimientoReglaRepository.listByRequerimiento.mockResolvedValue([
      {id: "v1", reglaId: "g-rut", orden: 1, severidad: "bloqueante",
        parametros: {}, activa: true}]);
    reglaIARepository.getByIds.mockResolvedValue([REGLA_RUT]);
    modeloReglasIAService.evaluar.mockResolvedValue({
      camposExtraidos: {rut: {valor: "11111111-1", confianza: 0.99},
        titulo: {valor: "Cédula", confianza: 0.9}},
      interpretativas: [], tokensEntrada: 100, tokensSalida: 20,
      intentos: 1, latenciaMs: 300,
    });
    pruebaReglaIARepository.create.mockImplementation(async (d) =>
      ({id: "p2", ...d}));
    const p = await servicio.probar("r1", {
      archivos: [{nombre: "ci.jpg", mime: "image/jpeg",
        contenidoBase64: Buffer.from("x").toString("base64")}],
      contexto: {rut: "11.111.111-1"},
    }, ACTOR);
    const llamada = modeloReglasIAService.evaluar.mock.calls[0][0];
    expect(llamada.tipo.nombre).toBe("Cédula");
    expect(llamada.campos.map((c) => c.clave)).toEqual(["rut", "titulo"]);
    expect(p.tipoDocumentalId).toBeNull();
    expect(p.camposSolicitados).toHaveLength(2);
    expect(p.resultadoPropuesto.resultado).toBe("cumple");
  });
});

describe("camposEfectivos", () => {
  const {camposEfectivos} = require("../src/reglasIA/camposEfectivos");
  it("une los del tipo y los de las reglas, sin repetir, con el título",
      () => {
        const campos = camposEfectivos(
            {campos: [{clave: "rut", etiqueta: "RUT del tipo", tipo: "rut"}]},
            [{camposRequeridos: ["rut", "fechaVencimiento"]},
              {camposRequeridos: ["cargo"]}]);
        expect(campos).toEqual([
          {clave: "rut", etiqueta: "RUT del tipo", tipo: "rut"},
          {clave: "fechaVencimiento", etiqueta: "Fecha de vencimiento",
            tipo: "fecha"},
          {clave: "cargo", etiqueta: "cargo", tipo: "texto"},
          {clave: "titulo", etiqueta: "Título del documento", tipo: "texto"},
        ]);
        expect(camposEfectivos(null, []).map((c) => c.clave))
            .toEqual(["titulo"]);
      });
});

describe("E4: campos adicionales y Documento legible", () => {
  const PLANTILLA = {secciones: [{clave: "personal", tipo: "entidades",
    entidad: "persona", documentos: [{clave: "ci", nombre: "Cédula",
      tipoDocumentalCodigo: "CEDULA_CL", requerimientoId: "r1"}]}]};
  const REGLA_LEGIBLE = {id: "g-leg", nombre: "Documento legible",
    version: 1, tipo: "deterministica", verificacion: "documento_legible",
    parametros: {}, entidades: ["persona"], estado: "activa"};

  beforeEach(() => {
    req = {...req, tipoDocumentalId: null};
    plantillaEstructuraRepository.getActiva.mockResolvedValue(PLANTILLA);
    requerimientoReglaRepository.listByRequerimiento.mockResolvedValue([]);
    reglaIARepository.getByIds.mockResolvedValue([]);
  });
  afterEach(() => {
    plantillaEstructuraRepository.getActiva.mockResolvedValue(null);
  });

  it("sin campos propios hereda los del tipo de la plantilla; al guardar " +
      "un cambio se copian al requerimiento sin cambiar lo que lee la IA",
  async () => {
    const antes = await servicio.obtener("r1", ACTOR);
    expect(antes.camposAdicionales).toMatchObject({propios: false,
      tipoNombre: "Cédula"});
    expect(antes.camposAdicionales.campos.map((c) => c.clave))
        .toEqual(["rut", "fechaVencimiento"]);
    const r = await servicio.asignarModelo("r1", "modelo-demo", ACTOR);
    expect(req.camposAdicionales).toEqual(CEDULA.campos);
    expect(r.camposAdicionales.propios).toBe(true);
    expect(r.camposIA.map((c) => c.clave)).toEqual(
        antes.camposIA.map((c) => c.clave));
    expect(bitacoraLogger.registrarEvento).toHaveBeenCalledWith(
        expect.objectContaining({accion: "modelo_ia",
          detalle: expect.objectContaining({
            camposAdicionalesCopiados: ["rut", "fechaVencimiento"]})}));
  });

  it("los campos propios reemplazan a los del tipo (lista vacía: solo los " +
      "de las reglas) y el cambio queda en la Bitácora", async () => {
    const r = await servicio.asignarCamposAdicionales("r1", [], ACTOR);
    expect(req.camposAdicionales).toEqual([]);
    expect(r.camposIA.map((c) => c.clave)).toEqual(["titulo"]);
    expect(bitacoraLogger.registrarEvento).toHaveBeenCalledWith(
        expect.objectContaining({accion: "campos_adicionales_ia",
          detalle: expect.objectContaining({
            anteriores: ["rut", "fechaVencimiento"], nuevos: []})}));
    const otro = await servicio.asignarCamposAdicionales("r1",
        [{clave: "cargo", etiqueta: "Cargo", tipo: "texto"}], ACTOR);
    expect(otro.camposIA.map((c) => c.clave)).toEqual(["cargo", "titulo"]);
    await expect(servicio.asignarCamposAdicionales("r1",
        [{clave: "", etiqueta: "x", tipo: "texto"}], ACTOR))
        .rejects.toMatchObject({status: 400});
    await expect(servicio.asignarCamposAdicionales("r1", "rut", ACTOR))
        .rejects.toMatchObject({status: 400});
  });

  it("Documento legible parte del umbral del tipo (0,65 → 65%)", async () => {
    tipoDocumentalRepository.list.mockResolvedValue([
      {...CEDULA, umbralLegibilidad: 0.65}]);
    const vinculo = {id: "v5", requerimientoId: "r1", reglaId: "g-leg",
      orden: 1, severidad: "bloqueante", parametros: {umbral: 65},
      activa: true};
    reglaIARepository.getById.mockResolvedValue(REGLA_LEGIBLE);
    requerimientoReglaRepository.create.mockResolvedValue(vinculo);
    await servicio.agregarRegla("r1", {reglaId: "g-leg"}, ACTOR);
    expect(requerimientoReglaRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({parametros: {umbral: 65}}));
    tipoDocumentalRepository.list.mockResolvedValue([CEDULA]);
  });
});
