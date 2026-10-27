// Habilitación de la plantilla y alcance de validación. Datos SINTÉTICOS.
const {
  calcularEstadoEfectivo, calcularAlcance, aplicarHabilitacion, cambiosMasivos,
} = require("../src/utils/alcanceValidacion");
const {analizarArbol} = require("../src/utils/estructuraPlan");
const PLANTILLA_BASE =
    require("../config/plantillas/transemel-carpeta-arranque-v1.json");
const {repositorio} = require("./fixtures/arbolSintetico");

const TIPOS = [
  {codigo: "CEDULA_CL", nombre: "Cédula de identidad", estado: "activo",
    estadoIA: "piloto", reglas: ["CI-01", "CI-02", "CI-03", "CI-04", "CI-05",
      "CI-06"]},
  {codigo: "LICENCIA_CL", nombre: "Licencia de conducir", estado: "activo",
    estadoIA: "piloto", reglas: ["LC-01", "LC-02"]},
];
const conTipo = (codigo, cambios) => TIPOS.map((t) =>
  (t.codigo === codigo ? {...t, ...cambios} : t));
const nueva = () => ({...JSON.parse(JSON.stringify(PLANTILLA_BASE)),
  version: 3});

// Solo "Carpetas Personales" con la cédula: el escenario de partida.
const soloCedula = () => {
  const p = nueva();
  const todo = aplicarHabilitacion(p.secciones,
      cambiosMasivos(p.secciones, "deshabilitar_todo"));
  p.secciones = aplicarHabilitacion(todo.secciones, [
    {nivel: "seccion", seccionClave: "trabajadores", habilitado: true},
    {nivel: "documento", seccionClave: "trabajadores", elementoClave: "cedula",
      habilitado: true},
  ]).secciones;
  return p;
};

describe("calcularEstadoEfectivo", () => {
  test("campo ausente se lee como habilitado", () => {
    const e = calcularEstadoEfectivo(nueva());
    expect(e.trabajadores.habilitada).toBe(true);
    expect(e.trabajadores.documentos.cedula.efectivo).toBe(true);
  });
  test("sección deshabilitada con documento habilitado: efectivo false",
      () => {
        const p = nueva();
        p.secciones = aplicarHabilitacion(p.secciones, [{nivel: "seccion",
          seccionClave: "trabajadores", habilitado: false}]).secciones;
        const doc = calcularEstadoEfectivo(p).trabajadores.documentos.cedula;
        expect(doc.habilitado).toBe(true);
        expect(doc.efectivo).toBe(false);
      });
  test("al rehabilitar la sección se recupera el valor original", () => {
    let secciones = aplicarHabilitacion(nueva().secciones, [
      {nivel: "documento", seccionClave: "trabajadores",
        elementoClave: "contrato", habilitado: false},
      {nivel: "seccion", seccionClave: "trabajadores", habilitado: false},
    ]).secciones;
    secciones = aplicarHabilitacion(secciones, [{nivel: "seccion",
      seccionClave: "trabajadores", habilitado: true}]).secciones;
    const docs = calcularEstadoEfectivo({secciones}).trabajadores.documentos;
    expect(docs.contrato.efectivo).toBe(false);
    expect(docs.cedula.efectivo).toBe(true);
  });
  test("identifica por clave y rechaza claves inexistentes", () => {
    expect(() => aplicarHabilitacion(nueva().secciones, [{nivel: "documento",
      seccionClave: "trabajadores", elementoClave: "no_existe",
      habilitado: false}])).toThrow(/no existe/);
  });
});

describe("calcularAlcance", () => {
  test("solo Carpetas Personales y Cédula: 1 documento IA (CI)", () => {
    const a = calcularAlcance(soloCedula(), conTipo("LICENCIA_CL",
        {estado: "inactivo"}));
    expect(a.resumen).toMatchObject({seccionesHabilitadas: 1,
      documentosHabilitados: 1, conValidacionIA: 1, soloCompletitud: 0,
      sensibles: 0});
    expect(a.documentos[0]).toMatchObject({documentoClave: "cedula",
      modalidad: "ia", motivoModalidad: null});
    expect(a.documentos[0].reglas.map((r) => r.codigo)).toEqual(["CI-01",
      "CI-02", "CI-03", "CI-04", "CI-05", "CI-06", "CI-07"]);
    expect(a.advertencias).toEqual([]);
  });
  test("documento sensible habilitado: modalidad sensible", () => {
    const p = soloCedula();
    p.secciones = aplicarHabilitacion(p.secciones, [{nivel: "documento",
      seccionClave: "trabajadores", elementoClave: "antecedentes",
      habilitado: true}]).secciones;
    const a = calcularAlcance(p, TIPOS);
    expect(a.documentos.find((d) => d.documentoClave === "antecedentes"))
        .toMatchObject({modalidad: "sensible", reglas: []});
  });
  test("tipo inactivo: solo completitud con motivo y advertencia", () => {
    const a = calcularAlcance(soloCedula(), conTipo("CEDULA_CL",
        {estado: "inactivo"}));
    expect(a.documentos[0]).toMatchObject({modalidad: "solo_completitud",
      motivoModalidad: "tipo_inactivo"});
    expect(a.advertencias.map((x) => x.codigo)).toEqual(
        expect.arrayContaining(["sin_ia", "tipo_inactivo"]));
  });
  test("tipo activo sin uso: advertencia", () => {
    const a = calcularAlcance(soloCedula(), TIPOS);
    expect(a.advertencias.map((x) => x.codigo)).toContain("tipo_sin_uso");
  });
  test("sin documentos habilitados: advertencia de bloqueo", () => {
    const p = nueva();
    p.secciones = aplicarHabilitacion(p.secciones,
        cambiosMasivos(p.secciones, "deshabilitar_todo")).secciones;
    const a = calcularAlcance(p, TIPOS);
    expect(a.resumen.documentosHabilitados).toBe(0);
    expect(a.advertencias[0].codigo).toBe("sin_documentos");
  });
});

describe("plan de revisión con habilitación", () => {
  const tipos = (lista) => new Map(lista.map((t) => [t.codigo, t]));

  test("contrato deshabilitado: va a ignorados, no a no reconocidos", () => {
    const p = nueva();
    p.secciones = aplicarHabilitacion(p.secciones, [{nivel: "documento",
      seccionClave: "trabajadores", elementoClave: "contrato",
      habilitado: false}]).secciones;
    const plan = analizarArbol(repositorio, p, {tipos: tipos(TIPOS)});
    const persona = plan.empresas[0].secciones.find((s) =>
      s.seccionClave === "trabajadores" && s.entidadCarpeta);
    expect(persona.documentosIgnorados.map((d) => d.clave)).toEqual(
        ["contrato"]);
    expect(persona.archivosNoReconocidos).not.toContain(
        "1.- CONTRATO DE TRABAJO_Juan Perez.pdf");
    expect(persona.documentosFaltantes).not.toContain("contrato");
  });
  test("sección deshabilitada: estado deshabilitada, no no_reconocida", () => {
    const p = nueva();
    p.secciones = aplicarHabilitacion(p.secciones, [{nivel: "seccion",
      seccionClave: "mutualidad", habilitado: false}]).secciones;
    const plan = analizarArbol(repositorio, p, {tipos: tipos(TIPOS)});
    const fila = plan.empresas[0].secciones.find((s) =>
      s.seccionCarpeta === "03. Certificado de Mutualidad");
    expect(fila.estado).toBe("deshabilitada");
    expect(fila.seccionClave).toBe("mutualidad");
  });
  test("licencia con LICENCIA_CL inactivo: excluida por tipo_inactivo", () => {
    const plan = analizarArbol(repositorio, nueva(), {tipos: tipos(
        conTipo("LICENCIA_CL", {estado: "inactivo"}))});
    const alfa = plan.empresas[0];
    expect(alfa.archivosIA.map((a) => a.tipoDocumentalCodigo))
        .toEqual(["CEDULA_CL"]);
    expect(alfa.archivosExcluidosIA.find((x) =>
      x.documentoClave === "licencia").motivo).toBe("tipo_inactivo");
  });
  test("solo cédula habilitada: el resto ignorado o deshabilitado", () => {
    const plan = analizarArbol(repositorio, soloCedula(),
        {tipos: tipos(TIPOS)});
    const alfa = plan.empresas[0];
    expect(alfa.archivosIA.map((a) => a.documentoClave)).toEqual(["cedula"]);
    expect(alfa.secciones.find((s) => s.seccionClave === "conductores")
        .estado).toBe("deshabilitada");
    expect(alfa.entidades.every((e) => e.seccionClave === "trabajadores"))
        .toBe(true);
  });
});

describe("PATCH de habilitación", () => {
  test("varios cambios en una llamada suben la versión una sola vez",
      async () => {
        await jest.isolateModulesAsync(async () => {
          const mockPlantilla = {id: "p1", mandanteId: "m1", estado: "activa",
            version: 3, secciones: nueva().secciones};
          const repo = "../src/repositories/plantillaEstructuraRepository";
          jest.doMock(repo, () => ({
            getById: jest.fn(async () => mockPlantilla),
            actualizarEnTransaccion: jest.fn(async (id, fn) =>
              ({...mockPlantilla, ...fn(mockPlantilla)})),
          }));
          jest.doMock("../src/repositories/mandanteRepository", () => ({
            getById: jest.fn(async (id) => ({id})),
          }));
          jest.doMock("../src/repositories/usuarioRepository", () => ({
            getById: jest.fn(async () => ({nombre: "Ana", apellido: "Soto"})),
          }));
          jest.doMock("../src/repositories/tipoDocumentalRepository", () => ({
            list: jest.fn(async () => TIPOS),
          }));
          const mockBitacora = {registrarEvento: jest.fn(async () => {})};
          jest.doMock("../src/utils/bitacoraLogger", () => mockBitacora);
          const servicio =
              require("../src/services/plantillaEstructuraService");
          const r = await servicio.habilitacion("p1", [
            {nivel: "seccion", seccionClave: "mutualidad", habilitado: false},
            {nivel: "documento", seccionClave: "trabajadores",
              elementoClave: "contrato", habilitado: false},
            {nivel: "archivoSeccion", seccionClave: "trabajadores",
              elementoClave: "listado_trabajadores", habilitado: false},
          ], {uid: "u1", rol: "superadmin"});
          expect(r.plantilla.version).toBe(4);
          expect(mockBitacora.registrarEvento).toHaveBeenCalledTimes(1);
          expect(mockBitacora.registrarEvento.mock.calls[0][0].detalle.cambios)
              .toHaveLength(3);
          expect(r.alcance.plantillaVersion).toBe(4);
        });
      });
});
