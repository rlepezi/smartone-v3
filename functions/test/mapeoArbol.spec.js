// Utilidades puras de la pantalla Mapeo documental
// (frontend/src/utils/mapeoArbol.js, cargada con Node como módulo ES).
// Datos sintéticos.
const path = require("path");
const {execFileSync} = require("child_process");
const {pathToFileURL} = require("url");

const RUTA = path.join(__dirname, "../../frontend/src/utils/mapeoArbol.js");

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

const ESTADO = JSON.stringify({
  mapeo: {r1: [{ruta: "09. MIPER", tipo: "carpeta"}],
    r2: [{ruta: "02. Trab/Listado.docx", tipo: "archivo"}]},
  carpetaPersonas: "02. Trab", carpetaRecursos: null,
});

describe("mapeoArbol (frontend)", () => {
  test("estadoNodo: base, sujeto, interno, incluido, asignado, libre", () => {
    const r = evaluar(`[
      {ruta: "02. Trab", tipo: "carpeta"},
      {ruta: "02. Trab/Juan", tipo: "carpeta"},
      {ruta: "02. Trab/Juan/ci.pdf", tipo: "archivo"},
      {ruta: "02. Trab/Listado.docx", tipo: "archivo"},
      {ruta: "09. MIPER/matriz.xlsx", tipo: "archivo"},
      {ruta: "09. MIPER", tipo: "carpeta"},
      {ruta: "09. MIPER2", tipo: "carpeta"},
    ].map((n) => m.estadoNodo(n, ${ESTADO}))`);
    expect(r).toEqual([
      {clase: "base", etiqueta: "Carpeta del personal"},
      {clase: "sujeto", etiqueta: "Persona"},
      {clase: "interno", etiqueta: null},
      {clase: "asignado", requerimientoId: "r2"},
      {clase: "incluido", requerimientoId: "r1"},
      {clase: "asignado", requerimientoId: "r1"},
      {clase: "libre"},
    ]);
  });

  test("cambiosAsignacion mueve el nodo y cambiosQuitar lo quita", () => {
    const mover = evaluar(`m.cambiosAsignacion(${ESTADO}.mapeo,
      {ruta: "09. MIPER", tipo: "carpeta"}, "r3")`);
    expect(mover).toEqual({r1: [], r3: [{ruta: "09. MIPER", tipo: "carpeta"}]});
    expect(evaluar(`m.cambiosAsignacion(${ESTADO}.mapeo,
      {ruta: "09. MIPER", tipo: "carpeta"}, "r1")`)).toEqual({});
    expect(evaluar(`m.cambiosQuitar(${ESTADO}.mapeo, "r2",
      "02. Trab/Listado.docx")`)).toEqual({r2: []});
    expect(evaluar(`m.ancestros("a/b/c.pdf")`)).toEqual(["a", "a/b"]);
  });
});
