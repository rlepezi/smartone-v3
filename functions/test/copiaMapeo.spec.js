// Copia de mapeo entre carpetas (frontend/src/utils/copiaMapeo.js, cargada
// con Node como módulo ES), con el ejemplo BOSCH → SLV en datos sintéticos
// y un lector de disco simulado.
const path = require("path");
const {execFileSync} = require("child_process");
const {pathToFileURL} = require("url");

const RUTA = path.join(__dirname, "../../frontend/src/utils/copiaMapeo.js");

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

// Árbol de SLV (destino): ruta → contenido.
const SLV = JSON.stringify({
  "": {carpetas: ["01. Cronograma de Actividades", "03. Carpeta Personales",
    "05. ODI Específica de contrato", "09. Vehículos y Maquinarias",
    "07. Organigrama"].map((nombre) => ({nombre})),
  archivos: [{nombre: "Listado Trabajadores.docx"}]},
});
const BOSCH = JSON.stringify({
  carpetaPersonas: "03. Carpeta Personales",
  carpetaRecursos: "14. Vehículos y Maquinarias",
  mapeo: {
    cro: [{ruta: "01. Cronograma de Actividades", tipo: "carpeta"}],
    odi: [{ruta: "05. O.D.I Especifica del contrato", tipo: "carpeta"}],
    miper: [{ruta: "09. MIPER del proyecto", tipo: "carpeta"}],
    org: [{ruta: "07. Organigrama", tipo: "carpeta"}],
    otro: [{ruta: "08. Otro", tipo: "carpeta"}],
  },
});
const PROPONER = `
  const arbol = ${SLV};
  const listar = async (r) => arbol[r] || {carpetas: [], archivos: []};
  const filas = await m.proponerCopia({origen: ${BOSCH},
    destino: {mapeo: {lst: [{ruta: "07. Organigrama", tipo: "carpeta"}]},
      carpetaPersonas: null, carpetaRecursos: null},
    asignables: ["cro", "odi", "miper", "org", "lst"], listar,
    nombreDe: (id) => "Req " + id});`;

describe("copia de mapeo BOSCH → SLV", () => {
  test("exacta, parecida, no encontrada, no aplica y conflicto", () => {
    const r = correr(`${PROPONER}
      console.log(JSON.stringify(filas.map((f) => [f.clave, f.destinoRuta,
        f.resultado, f.seleccionada, f.conflicto])));`);
    expect(r).toEqual([
      ["carpetaPersonas", "03. Carpeta Personales", "exacta", true, null],
      ["carpetaRecursos", "09. Vehículos y Maquinarias", "exacta", true,
        null],
      ["cro|01. Cronograma de Actividades", "01. Cronograma de Actividades",
        "exacta", true, null],
      ["odi|05. O.D.I Especifica del contrato",
        "05. ODI Específica de contrato", "parecida", false, null],
      ["miper|09. MIPER del proyecto", null, "no_encontrada", false, null],
      ["org|07. Organigrama", "07. Organigrama", "conflicto", false,
        "Ya asignado a Req lst"],
      ["otro|08. Otro", null, "no_aplica", false, null],
    ]);
  });

  test("cambiosDeCopia: solo agrega lo seleccionado, con origen sugerencia",
      () => {
        const r = correr(`${PROPONER}
          filas.find((f) => f.resultado === "parecida").seleccionada = true;
          console.log(JSON.stringify(m.cambiosDeCopia(filas,
            {mapeo: {cro: [{ruta: "Otra", tipo: "carpeta"}]}})));`);
        expect(r).toEqual({
          soloAgregar: true,
          carpetaPersonas: "03. Carpeta Personales",
          carpetaRecursos: "09. Vehículos y Maquinarias",
          mapeo: {
            cro: [{ruta: "Otra", tipo: "carpeta"},
              {ruta: "01. Cronograma de Actividades", tipo: "carpeta",
                origen: "sugerencia"}],
            odi: [{ruta: "05. ODI Específica de contrato", tipo: "carpeta",
              origen: "sugerencia"}],
          },
        });
      });

  test("similitud entre carpetas por su primer nivel", () => {
    const r = correr(`
      const a = m.nombresNivel1({carpetas: [{nombre: "01. Cronograma"},
        {nombre: "14. Vehículos y Maquinarias"}], archivos: []});
      const b = m.nombresNivel1({carpetas: [{nombre: "01. Cronograma"},
        {nombre: "09. Vehículos y Maquinarias"}], archivos: [
        {nombre: "x.pdf"}]});
      console.log(JSON.stringify([a, m.similitudCarpetas(a, b)]));`);
    expect(r[0]).toEqual(["cronograma", "vehiculos y maquinarias"]);
    expect(r[1]).toBeCloseTo(0.8, 5);
  });
});
