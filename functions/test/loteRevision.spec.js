// Plan de la revisión en lote (frontend/src/utils/loteRevision.js, cargado
// con Node como módulo ES) con datos sintéticos.
const path = require("path");
const {execFileSync} = require("child_process");
const {pathToFileURL} = require("url");
const {normalizarNombreMapeo} = require("../src/utils/normalizacionMapeo");

const RUTA = path.join(__dirname, "../../frontend/src/utils/loteRevision.js");

/**
 * Ejecuta un script con el módulo del frontend en un proceso aparte.
 * @param {string} cuerpo Código con `m` (el módulo); debe imprimir JSON.
 * @return {*} Resultado.
 */
function correr(cuerpo) {
  const script = `
    const m = await import(${JSON.stringify(pathToFileURL(RUTA).href)});
    ${cuerpo}`;
  return JSON.parse(execFileSync(process.execPath,
      ["--input-type=module", "-e", script], {encoding: "utf8"}));
}

const ANA = {nombre: "Ana", apellido: "Rojas Demo"};
const PATRONES = [
  {estado: "activo", ambito: "persona", objetivo: "archivo",
    patron: "contrato de trabajo", requerimientoId: "rContrato",
    vecesConfirmado: 3},
  {estado: "activo", ambito: "persona", objetivo: "archivo", patron: "ci",
    requerimientoId: "rCi", vecesConfirmado: 2},
  // Empate: "anexo" apunta a dos requerimientos con las mismas
  // confirmaciones → ambiguo, no se asigna.
  {estado: "activo", ambito: "persona", objetivo: "archivo", patron: "anexo",
    requerimientoId: "rContrato", vecesConfirmado: 1},
  {estado: "activo", ambito: "persona", objetivo: "archivo", patron: "anexo",
    requerimientoId: "rOtro", vecesConfirmado: 1},
  {estado: "inactivo", ambito: "persona", objetivo: "archivo",
    patron: "examen", requerimientoId: "rExamen", vecesConfirmado: 0},
];

describe("patrón de archivo de persona", () => {
  test("igual que el backend al Recordar (mismas opciones)", () => {
    const nombres = ["1.- CONTRATO DE TRABAJO_Ana Rojas Demo.pdf",
      "2.- C.I. Ana Rojas Demo 31-12-2031.pdf", "Anexo.pdf"];
    const frontend = correr(`console.log(JSON.stringify(${JSON.stringify(
        nombres)}.map((n) => m.patronArchivoSujeto(n, "persona",
        ${JSON.stringify(ANA)}))));`);
    const backend = nombres.map((n) => normalizarNombreMapeo(n, {
      archivo: true, quitarFechas: true, nombrePersona: "Ana Rojas Demo"}));
    expect(frontend).toEqual(backend);
    expect(frontend).toEqual(["contrato de trabajo", "ci", "anexo"]);
  });
});

describe("archivosPorPatron", () => {
  test("solo coincidencias exactas de alta confianza, sin empates", () => {
    const archivos = [
      {nombre: "1.- CONTRATO DE TRABAJO_Ana Rojas Demo.pdf", ruta: "p/a.pdf"},
      {nombre: "Anexo.pdf", ruta: "p/anexo.pdf"},
      {nombre: "Examen.pdf", ruta: "p/ex.pdf"},
      {nombre: "contrato de trabajo.txt", ruta: "p/c.txt"},
    ];
    const r = correr(`console.log(JSON.stringify(["rContrato", "rOtro",
      "rExamen"].map((id) => m.archivosPorPatron({archivos: ${JSON.stringify(
      archivos)}, patrones: ${JSON.stringify(PATRONES)},
      requerimientoId: id, tipo: "persona", sujeto: ${JSON.stringify(ANA)}})
      .map((a) => a.ruta))));`);
    // rContrato: solo el contrato (el anexo es ambiguo y el .txt no es
    // revisable); rOtro: nada; rExamen: patrón inactivo.
    expect(r).toEqual([["p/a.pdf"], [], []]);
  });
});

describe("planLote", () => {
  test("Empresa por mapeo, personas por patrón, con motivos", () => {
    const r = correr(`
      const contenidos = new Map([
        ["05. ODI", {archivos: [{nombre: "ODI firmada.pdf",
          ruta: "05. ODI/ODI firmada.pdf"}, {nombre: "nota.txt",
          ruta: "05. ODI/nota.txt"}]}],
        ["06. Vacia", {archivos: []}],
        ["10. Trabajadores/Ana", {archivos: [{nombre:
          "1.- CONTRATO DE TRABAJO_Ana Rojas Demo.pdf",
          ruta: "10. Trabajadores/Ana/c.pdf"}]}],
      ]);
      const sujetos = new Map([
        ["persona|p1", {tipo: "persona", id: "p1", nombre: "Ana",
          apellido: "Rojas Demo", carpeta: "10. Trabajadores/Ana"}],
        ["persona|p2", {tipo: "persona", id: "p2", nombre: "Luis",
          apellido: "Demo", carpeta: null}],
      ]);
      const plan = m.planLote({
        instancias: [
          {id: "i1", requerimientoId: "rOdi", nombre: "ODI"},
          {id: "i2", requerimientoId: "rVacia", nombre: "Vacía"},
          {id: "i3", requerimientoId: "rSinMapeo", nombre: "Sin mapeo"},
          {id: "i4", requerimientoId: "rContrato", nombre: "Contrato",
            personaId: "p1"},
          {id: "i5", requerimientoId: "rCi", nombre: "CI", personaId: "p1"},
          {id: "i6", requerimientoId: "rContrato", nombre: "Contrato",
            personaId: "p2"},
          {id: "i7", requerimientoId: "rNoHab", nombre: "Sin reglas"},
          {id: "i8", requerimientoId: "rArchivo", nombre: "Póliza"},
        ],
        habilitados: new Set(["rOdi", "rVacia", "rSinMapeo", "rContrato",
          "rCi", "rArchivo"]),
        mapeo: {requerimientos: {
          rOdi: [{ruta: "05. ODI", tipo: "carpeta"}],
          rVacia: [{ruta: "06. Vacia", tipo: "carpeta"}],
          rArchivo: [{ruta: "02. Poliza/Poliza.pdf", tipo: "archivo"}],
        }},
        sujetos, contenidos, patrones: ${JSON.stringify(PATRONES)},
      });
      console.log(JSON.stringify({
        estados: Object.fromEntries(plan.map((x) => [x.instanciaId,
          x.estado])),
        archivos: Object.fromEntries(plan.map((x) => [x.instanciaId,
          x.archivos.map((a) => a.ruta)])),
        resumen: m.resumenPlan(plan),
      }));`);
    expect(r.estados).toEqual({i1: "listo", i2: "carpeta_vacia",
      i3: "sin_ubicacion", i4: "listo", i5: "sin_documento",
      i6: "sin_carpeta_sujeto", i7: "sin_reglas", i8: "listo"});
    expect(r.archivos.i1).toEqual(["05. ODI/ODI firmada.pdf"]);
    expect(r.archivos.i4).toEqual(["10. Trabajadores/Ana/c.pdf"]);
    expect(r.archivos.i8).toEqual(["02. Poliza/Poliza.pdf"]);
    expect(r.resumen).toEqual({listos: {empresa: 2, persona: 1, recurso: 0},
      totalListos: 3, porMotivo: {carpeta_vacia: 1, sin_ubicacion: 1,
        sin_documento: 1, sin_carpeta_sujeto: 1, sin_reglas: 1}});
  });
});

describe("resumenPropuestas y páginas de PDF", () => {
  test("cuenta por resultado y separa las de revisión manual", () => {
    const r = correr(`console.log(JSON.stringify([m.resumenPropuestas([
      {resultadoPropuesto: {resultado: "cumple"},
        propuestaEvaluacion: {resultado: "cumple"}},
      {resultadoPropuesto: {resultado: "no_cumple"},
        propuestaEvaluacion: {resultado: "no_cumple"}},
      {resultadoPropuesto: {resultado: "revision_manual"},
        propuestaEvaluacion: {resultado: null}},
    ]), m.contarPaginasPdf("<< /Type /Pages >> << /Type /Page >> " +
      "<</Type/Page>>"), m.contarPaginasPdf("binario")]));`);
    expect(r[0]).toEqual({total: 3, porResultado: {cumple: 1,
      cumple_con_observacion: 0, no_cumple: 1, revision_manual: 1},
    aplicables: 2, manuales: 1});
    expect(r[1]).toBe(2);
    expect(r[2]).toBeNull();
  });
});
