// Plan de la revisión en lote (frontend/src/utils/loteRevision.js, cargado
// con Node como módulo ES) con datos sintéticos.
const path = require("path");
const {execFileSync} = require("child_process");
const {pathToFileURL} = require("url");

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

describe("planLote (ubicación desde el Mapeo documental)", () => {
  test("resuelta / sugerida / no encontrada / sin mapeo, con su motivo",
      () => {
        const r = correr(`
      const sujetos = new Map([
        ["persona|p1", {tipo: "persona", id: "p1", nombre: "Ana",
          apellido: "Rojas Demo", carpeta: "10. Trabajadores/Ana"}],
        ["persona|p2", {tipo: "persona", id: "p2", nombre: "Luis",
          apellido: "Demo", carpeta: null}],
      ]);
      const resoluciones = new Map([
        ["rMutual|empresa", {estado: "resuelta", origen: "alias",
          archivos: [{nombre: "Cert.pdf", ruta: "03. Mutual/Cert.pdf"},
            {nombre: "nota.txt", ruta: "03. Mutual/nota.txt"}]}],
        ["rSeguro|empresa", {estado: "sugerida", origen: "alias",
          candidatos: ["03. A", "04. A"]}],
        ["rIper|empresa", {estado: "no_encontrada"}],
        ["rVacia|empresa", {estado: "resuelta", origen: "alias",
          archivos: [{nombre: "x.txt", ruta: "x.txt"}]}],
        ["rCi|p1", {estado: "resuelta", origen: "override",
          archivos: [{nombre: "CI.pdf", ruta: "10. Trabajadores/Ana/CI.pdf"}]}],
        ["rContrato|p1", {estado: "no_encontrada"}],
        ["rSinMapeo|empresa", {estado: "sin_mapeo"}],
      ]);
      const plan = m.planLote({
        instancias: [
          {id: "a", requerimientoId: "rMutual", nombre: "Mutual"},
          {id: "b", requerimientoId: "rSeguro", nombre: "Seguro"},
          {id: "c", requerimientoId: "rIper", nombre: "IPER"},
          {id: "d", requerimientoId: "rVacia", nombre: "Vacía"},
          {id: "e", requerimientoId: "rCi", nombre: "CI", personaId: "p1"},
          {id: "f", requerimientoId: "rContrato", nombre: "Contrato",
            personaId: "p1"},
          {id: "g", requerimientoId: "rCi", nombre: "CI", personaId: "p2"},
          {id: "h", requerimientoId: "rSinMapeo", nombre: "Sin mapeo"},
          {id: "i", requerimientoId: "rNoHab", nombre: "Sin reglas"},
        ],
        habilitados: new Set(["rMutual", "rSeguro", "rIper", "rVacia", "rCi",
          "rContrato", "rSinMapeo"]),
        sujetos, resoluciones,
      });
      console.log(JSON.stringify({
        estados: Object.fromEntries(plan.map((x) => [x.instanciaId,
          [x.estado, x.origen || null]])),
        archivos: Object.fromEntries(plan.map((x) => [x.instanciaId,
          x.archivos.map((a) => a.ruta)])),
        resumen: m.resumenPlan(plan),
      }));`);
        expect(r.estados).toEqual({
          a: ["listo", "alias"], b: ["ubicacion_ambigua", null],
          c: ["ubicacion_no_encontrada", null], d: ["carpeta_vacia", null],
          e: ["listo", "override"], f: ["sin_documento", null],
          g: ["sin_carpeta_sujeto", null], h: ["sin_ubicacion", null],
          i: ["sin_reglas", null]});
        // Solo los archivos revisables.
        expect(r.archivos.a).toEqual(["03. Mutual/Cert.pdf"]);
        expect(r.resumen.totalListos).toBe(2);
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
