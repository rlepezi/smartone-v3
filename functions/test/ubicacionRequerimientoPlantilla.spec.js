// Ubicación de un requerimiento en la plantilla de estructura (formulario de
// Requerimiento): cálculo de la nueva plantilla y guardado en la MISMA
// transacción que el requerimiento. Datos sintéticos; sin Firestore (la
// transacción se simula: si `aplicar` lanza, no se escribe nada).
jest.mock("../src/repositories/requerimientoRepository", () => ({
  nuevaRef: jest.fn(() => ({id: "rNuevo"})),
  guardarAtomico: jest.fn(),
  getByIds: jest.fn().mockResolvedValue([{id: "rOtro", nombreCorto: "Otro"}]),
}));
jest.mock("../src/repositories/perfilRequerimientoRepository", () => ({
  escribirCambiosEn: jest.fn(),
}));
jest.mock("../src/services/perfilRequerimientoService", () => ({
  planificarVinculos: jest.fn().mockResolvedValue({resumen: {creados: 1},
    afectados: []}),
  sincronizarExpedientes: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../src/repositories/mandanteRepository", () => ({
  getById: jest.fn().mockResolvedValue({id: "m1"}),
}));
jest.mock("../src/repositories/plantillaEstructuraRepository", () => ({
  getActiva: jest.fn(),
}));
jest.mock("../src/repositories/usuarioRepository", () => ({
  getById: jest.fn().mockResolvedValue({nombre: "Ana", apellido: "Demo"}),
}));
jest.mock("../src/utils/bitacoraLogger", () => ({
  registrarEvento: jest.fn().mockResolvedValue(undefined),
}));

const requerimientoRepository =
    require("../src/repositories/requerimientoRepository");
const plantillaEstructuraRepository =
    require("../src/repositories/plantillaEstructuraRepository");
const bitacoraLogger = require("../src/utils/bitacoraLogger");
const servicio = require("../src/services/requerimientoService");
const {
  aplicarUbicacionRequerimiento, opcionesUbicacion,
} = require("../src/utils/ubicacionRequerimiento");

const plantilla = () => ({id: "pl1", estado: "activa", version: 3,
  secciones: [
    {clave: "personal", tipo: "entidades", entidad: "persona",
      requerimientoId: "rListado",
      archivosSeccion: [{clave: "listado", tipoDocumentalCodigo: "LISTADO"}],
      documentos: [
        {clave: "ci", tipoDocumentalCodigo: "CEDULA_CL"},
        {clave: "lic", tipoDocumentalCodigo: "LICENCIA_CL",
          requerimientoId: "rOtro"},
      ]},
    {clave: "cronograma", tipo: "archivos"},
  ]});

describe("aplicarUbicacionRequerimiento", () => {
  test("agrega, mueve (un documento, un requerimiento) y quita", () => {
    const p = plantilla();
    const r = aplicarUbicacionRequerimiento(p, "rNuevo", "persona",
        [{seccionClave: "personal", documentoClave: "lic"}]);
    const docs = r.secciones[0].documentos;
    expect(docs.find((d) => d.clave === "lic").requerimientoId)
        .toBe("rNuevo");
    expect(r.cambios.movidos).toEqual([{seccionClave: "personal",
      documentoClave: "lic", desde: "rOtro"}]);
    // La plantilla recibida no se modifica.
    expect(p.secciones[0].documentos[1].requerimientoId).toBe("rOtro");
    // Volver a guardar sin "lic": queda sin vínculo propio.
    const p2 = {...p, secciones: r.secciones};
    const r2 = aplicarUbicacionRequerimiento(p2, "rNuevo", "persona", []);
    expect(r2.secciones[0].documentos[1].requerimientoId).toBeNull();
    expect(r2.cambios.quitados).toHaveLength(1);
  });

  test("varios documentos para un requerimiento", () => {
    const r = aplicarUbicacionRequerimiento(plantilla(), "rNuevo", "persona",
        [{seccionClave: "personal", documentoClave: "ci"},
          {seccionClave: "personal", documentoClave: "lic"}]);
    // "ci" heredaba rListado de su sección y "lic" era de rOtro: ambos se
    // mueven a rNuevo.
    expect(r.cambios.agregados).toHaveLength(0);
    expect(r.cambios.movidos.map((m) => m.desde)).toEqual(
        ["rListado", "rOtro"]);
  });

  test("vínculo de sección: pasa a documentos sin tocar otra entidad", () => {
    // rListado está vinculado a la sección "personal" (nivel Empresa: el
    // listado suelto). Al editarlo desde Empresa sin elegir nada, la
    // sección pierde el vínculo; los documentos de persona (ci) que lo
    // heredaban lo conservan explícito.
    const r = aplicarUbicacionRequerimiento(plantilla(), "rListado",
        "empresa", []);
    const s = r.secciones[0];
    expect(s.requerimientoId).toBeNull();
    expect(s.archivosSeccion[0].requerimientoId).toBeFalsy();
    expect(s.documentos.find((d) => d.clave === "ci").requerimientoId)
        .toBe("rListado");
    expect(s.documentos.find((d) => d.clave === "lic").requerimientoId)
        .toBe("rOtro");
    expect(r.cambios.quitados).toEqual([{seccionClave: "personal",
      documentoClave: "listado"}]);
  });

  test("sección sin documentos y ubicación inválida", () => {
    const r = aplicarUbicacionRequerimiento(plantilla(), "rCrono", "empresa",
        [{seccionClave: "cronograma", documentoClave: null}]);
    expect(r.secciones[1].requerimientoId).toBe("rCrono");
    expect(() => aplicarUbicacionRequerimiento(plantilla(), "rX", "persona",
        [{seccionClave: "cronograma", documentoClave: null}]))
        .toThrow(/no existe/);
  });

  test("sin cambios: listas vacías", () => {
    const r = aplicarUbicacionRequerimiento(plantilla(), "rOtro", "persona",
        [{seccionClave: "personal", documentoClave: "lic"}]);
    expect(r.cambios).toEqual({agregados: [], quitados: [], movidos: []});
  });

  test("opciones del selector con su vínculo efectivo", () => {
    expect(opcionesUbicacion(plantilla(), "persona").map((o) =>
      [o.documentoClave, o.requerimientoId])).toEqual(
        [["ci", "rListado"], ["lic", "rOtro"]]);
  });
});

describe("crear requerimiento con ubicación (transacción)", () => {
  const ACTOR = {uid: "u1", rol: "superadmin"};
  const payload = (ubicacionPlantilla) => ({mandanteId: "m1",
    tipoEntidad: "persona", nombre: "Licencia", nombreCorto: "Licencia",
    aplicabilidad: {perfilParticipacionIds: ["pp1"]}, ubicacionPlantilla});
  // Simula runTransaction: lee la plantilla, aplica, y solo "escribe" si
  // nada lanzó.
  let escrito;
  beforeEach(() => {
    escrito = null;
    bitacoraLogger.registrarEvento.mockClear();
    requerimientoRepository.guardarAtomico.mockReset()
        .mockImplementation(async (op) => {
          const campos = op.plantilla ? op.plantilla.aplicar(plantilla()) :
            null;
          escrito = {requerimiento: op.datos, plantilla: campos};
        });
  });

  test("requerimiento y nueva versión de la plantilla juntos", async () => {
    plantillaEstructuraRepository.getActiva.mockResolvedValue(plantilla());
    await servicio.crearRequerimiento(payload(
        [{seccionClave: "personal", documentoClave: "lic"}]), ACTOR);
    expect(escrito.requerimiento.nombre).toBe("Licencia");
    expect(escrito.plantilla.version).toBe(4);
    expect(escrito.plantilla.updatedBy).toEqual({uid: "u1",
      nombre: "Ana Demo"});
    expect(bitacoraLogger.registrarEvento).toHaveBeenCalledWith(
        expect.objectContaining({entidad: "plantillasEstructura",
          accion: "ubicacion_requerimiento"}));
  });

  test("ubicación inválida: 400 y no se escribe nada", async () => {
    plantillaEstructuraRepository.getActiva.mockResolvedValue(plantilla());
    await expect(servicio.crearRequerimiento(payload(
        [{seccionClave: "cronograma", documentoClave: null}]), ACTOR))
        .rejects.toMatchObject({status: 400});
    expect(escrito).toBeNull();
  });

  test("sin plantilla activa: 409 con ubicación; sin ella, se crea",
      async () => {
        plantillaEstructuraRepository.getActiva.mockResolvedValue(null);
        await expect(servicio.crearRequerimiento(payload(
            [{seccionClave: "personal", documentoClave: "lic"}]), ACTOR))
            .rejects.toMatchObject({status: 409});
        expect(requerimientoRepository.guardarAtomico).not.toHaveBeenCalled();
        await servicio.crearRequerimiento(payload([]), ACTOR);
        expect(escrito.plantilla).toBeNull();
      });
});
