// Personas de un listado del personal en planilla
// (frontend/src/utils/listadoPersonal.js, cargado como módulo ES) con datos
// sintéticos.
const path = require("path");
const {execFileSync} = require("child_process");
const {pathToFileURL} = require("url");

const RUTA = path.join(__dirname,
    "../../frontend/src/utils/listadoPersonal.js");

/**
 * Personas de unas hojas con el módulo del frontend.
 * @param {Object[]} hojas [{nombre, filas}].
 * @return {Object[]} Personas.
 */
function extraer(hojas) {
  const script = `
    const m = await import(${JSON.stringify(pathToFileURL(RUTA).href)});
    const hojas = JSON.parse(process.argv[1]);
    console.log(JSON.stringify(m.personasDeListado(hojas)));`;
  return JSON.parse(execFileSync(process.execPath,
      ["--input-type=module", "-e", script, JSON.stringify(hojas)],
      {encoding: "utf8"}));
}

// RUT con DV válido (sintéticos).
const R1 = "15.748.401-K";
const R2 = "19.298.052-6";

describe("listado del personal en planilla", () => {
  test("encabezado bajo títulos; «APELLIDOS, NOMBRES»; RUT y cargo",
      () => {
        const p = extraer([{nombre: "Hoja1", filas: [
          ["1.- DETALLE DE REQUISITOS Y CUMPLIMIENTOS", ""],
          ["DATOS PERSONAL", ""],
          ["N°", "NOMBRE COMPLETO", "RUT", "CARGO"],
          ["1", "ARAVENA ESPINOZA, JAIME ENRIQUE", R1, "Supervisor"],
          ["2", "Pablo Concha Gajardo", R2, "Operador"],
          ["", "", "", ""],
          ["3", "Sin Rut Valido", "12.345.678-0", ""],
        ]}]);
        expect(p).toHaveLength(3);
        expect(p[0]).toMatchObject({nombre: "Jaime Enrique",
          apellido: "Aravena Espinoza", rut: "15748401K", rutValido: true,
          cargo: "Supervisor", fila: 4});
        expect(p[1]).toMatchObject({nombre: "Pablo", apellido: "Concha Gajardo",
          rut: "192980526", cargo: "Operador"});
        expect(p[2]).toMatchObject({rut: null, rutValido: false,
          rutOriginal: "12.345.678-0", cargo: null});
      });

  test("nombres y apellidos en columnas separadas; sin repetir RUT; sin " +
      "encabezado, nada", () => {
    const p = extraer([
      {nombre: "Otra", filas: [["Texto suelto"], ["Sin tabla"]]},
      {nombre: "Personal", filas: [
        ["Nombres", "Apellido Paterno", "Apellido Materno", "R.U.T.",
          "Función"],
        ["María José", "Rodríguez", "Canales", R1, "Prevencionista"],
        ["María José", "Rodríguez", "Canales", R1, "Prevencionista"],
      ]},
    ]);
    expect(p).toEqual([expect.objectContaining({hoja: "Personal",
      nombre: "María José", apellido: "Rodríguez Canales", rut: "15748401K",
      cargo: "Prevencionista"})]);
  });
});
