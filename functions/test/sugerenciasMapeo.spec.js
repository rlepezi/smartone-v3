// Sugerencias por nombre del requerimiento
// (frontend/src/utils/sugerenciasMapeo.js,
// cargada con Node como módulo ES). Datos sintéticos basados en la carpeta
// de BOSCH.
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
  {id: "cap", nombreCorto: "Programa Capacitación"},
  {id: "com", nombreCorto: "Comité Paritario"},
  {id: "iper", nombreCorto: "Registros Difusión Matriz IPER"},
  {id: "cro", nombreCorto: "Cronograma"},
  {id: "pers", nombreCorto: "Programa Personalizado"},
  {id: "ya", nombreCorto: "Organigrama"},
]);
const NODOS = JSON.stringify([
  "01. Cronograma de Actividades", "07. Organigrama",
  "09. MIPER del proyecto", "10. Programa Personalizado",
  "11. Comité Paritario CPHS (si aplica)", "15. Programa de capacitación",
  "17. Programa ambiental",
].map((n) => ({ruta: n, nombre: n, tipo: "carpeta"})));
const ESTADO = JSON.stringify({mapeo: {ya: [{ruta: "07. Organigrama"}]},
  carpetaPersonas: null, carpetaRecursos: null});

describe("sugerencias por nombre del requerimiento", () => {
  test("niveles alta / media y sin sugerencia", () => {
    const r = evaluar(`Object.fromEntries([...m.sugerenciasPorRequerimiento({
      requerimientos: ${REQS}, nodos: ${NODOS}, estado: ${ESTADO}})]
      .map(([id, s]) => [id, [s.nodo.ruta, s.nivel]]))`);
    expect(r).toEqual({
      amb: ["17. Programa ambiental", "alta"],
      cap: ["15. Programa de capacitación", "alta"],
      pers: ["10. Programa Personalizado", "alta"],
      com: ["11. Comité Paritario CPHS (si aplica)", "media"],
      cro: ["01. Cronograma de Actividades", "media"],
    });
  });

  test("baja: un token de 4+ letras en común; un nodo, un requerimiento",
      () => {
        expect(evaluar(`m.confianzaPorNombre("reglamento interno riohs",
          {nombreCorto: "RIOHS"}).nivel`)).toBe("media");
        expect(evaluar(`m.confianzaPorNombre("politica hseq transemel",
          {nombreCorto: "Difusión Política", nombre: "Difusión Política HSEQ"})
          .nivel`)).toBe("baja");
        const r = evaluar(`[...m.sugerenciasPorRequerimiento({
          requerimientos: [{id: "a", nombreCorto: "Programa Ambiental"},
            {id: "b", nombre: "Programa ambiental anual"}],
          nodos: [{ruta: "17. Programa ambiental", nombre:
            "17. Programa ambiental", tipo: "carpeta"}],
          estado: {mapeo: {}}}).keys()]`);
        expect(r).toEqual(["a"]);
      });
});
