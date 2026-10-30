// Sugerencias del árbol con el motor compartido
// (frontend/src/utils/sugerenciasMapeo.js, cargada con Node como módulo ES).
// Datos sintéticos basados en la carpeta de BOSCH.
const path = require("path");
const {execFileSync} = require("child_process");
const {pathToFileURL} = require("url");

const RUTA = path.join(__dirname,
    "../../frontend/src/utils/sugerenciasMapeo.js");

/**
 * Evalúa una expresión con el módulo del frontend en un proceso aparte.
 * @param {string} expresion Expresión con `m` (el módulo).
 * @return {*} Resultado (JSON).
 */
function evaluar(expresion) {
  const script = `
    const m = await import(${JSON.stringify(pathToFileURL(RUTA).href)});
    console.log(JSON.stringify(${expresion}));`;
  return JSON.parse(execFileSync(process.execPath,
      ["--input-type=module", "-e", script], {encoding: "utf8"}));
}

const REQS = JSON.stringify([
  {id: "amb", nombreCorto: "Programa Ambiental"},
  {id: "com", nombreCorto: "Comité Paritario"},
  {id: "odi", nombreCorto: "ODI Específica"},
  {id: "ya", nombreCorto: "Organigrama"},
]);
const NODOS = JSON.stringify([
  "07. Organigrama", "11. Comité Paritario CPHS (si aplica)",
  "17. Programa ambiental", "05. O.D.I Especifica del contrato",
  "18. Croquis de instalación",
].map((n) => ({ruta: n, nombre: n, tipo: "carpeta"})));
const ESTADO = JSON.stringify({mapeo: {ya: [{ruta: "07. Organigrama"}]},
  carpetaPersonas: null, carpetaRecursos: null});
const PATRONES = JSON.stringify([{patron: "odi especifica del contrato",
  requerimientoId: "odi", vecesConfirmado: 2, estado: "activo",
  ambito: "empresa", objetivo: "carpeta"}]);

describe("sugerencias del árbol", () => {
  test("alta por patrón aprendido, media por nombre; asignados sin " +
      "sugerencia", () => {
    const r = evaluar(`Object.fromEntries([...m.sugerenciasDelArbol({
      nodos: ${NODOS}, estado: ${ESTADO}, patrones: ${PATRONES},
      requerimientos: ${REQS}})].map(([ruta, s]) => [ruta,
        [s.requerimientoId, s.nivel]]))`);
    expect(r).toEqual({
      "05. O.D.I Especifica del contrato": ["odi", "alta"],
      "11. Comité Paritario CPHS (si aplica)": ["com", "media"],
      "17. Programa ambiental": ["amb", "media"],
    });
  });

  test("mejor por requerimiento y carpeta especial por patrón o clave",
      () => {
        const r = evaluar(`[...m.mejorPorRequerimiento(m.sugerenciasDelArbol({
          nodos: ${NODOS}, estado: ${ESTADO}, patrones: ${PATRONES},
          requerimientos: ${REQS}})).keys()].sort()`);
        expect(r).toEqual(["amb", "com", "odi"]);
        const carpetas = JSON.stringify([
          {ruta: "02. Listado del personal",
            nombre: "02. Listado del personal"},
          {ruta: "03. Carpeta Personales", nombre: "03. Carpeta Personales"}]);
        expect(evaluar(`m.sugerirEspecial({campo: "carpetaPersonas",
          carpetas: ${carpetas}, estado: {mapeo: {}}, patrones: [{patron:
          "carpeta personales", estado: "activo", ambito: "estructura",
          objetivo: "carpetaPersonas", vecesConfirmado: 1}]})`))
            .toEqual({nodo: JSON.parse(carpetas)[1], porPatron: true});
        expect(evaluar(`m.sugerirEspecial({campo: "carpetaPersonas",
          carpetas: ${carpetas}, estado: {mapeo: {}}})`))
            .toEqual({nodo: JSON.parse(carpetas)[0], porPatron: false});
      });
});
