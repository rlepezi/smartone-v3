// Deducción de la Empresa desde el nombre de su carpeta
// (frontend/src/utils/deduccionEmpresaCarpeta.js, cargado como módulo ES)
// con datos sintéticos.
const path = require("path");
const {execFileSync} = require("child_process");
const {pathToFileURL} = require("url");

const RUTA = path.join(__dirname,
    "../../frontend/src/utils/deduccionEmpresaCarpeta.js");

const EMPRESAS = [
  {id: "a", razonSocial: "TECNORED S.A.", nombreFantasia: "TECNORED",
    rut: "77.104.219-8"},
  {id: "b", razonSocial: "CONSTRUCTORA ÑANDÚ LIMITADA",
    nombreFantasia: "ÑANDÚ", rut: "76.045.622-5"},
  {id: "c", razonSocial: "TECNORED SERVICIOS SPA",
    nombreFantasia: "TECNORED SERVICIOS", rut: "76.555.444-3"},
];

/**
 * Deduce las empresas de varias carpetas con el módulo del frontend.
 * @param {string[]} carpetas Nombres o rutas.
 * @return {Object[]} [{tipo, ids}] por carpeta.
 */
function deducir(carpetas) {
  const script = `
    const m = await import(${JSON.stringify(pathToFileURL(RUTA).href)});
    const [carpetas, empresas] = JSON.parse(process.argv[1]);
    console.log(JSON.stringify(carpetas.map((c) => {
      const r = m.empresasDeCarpeta(m.nombreDeRuta(c), empresas);
      return {tipo: r.tipo, ids: r.empresas.map((e) => e.id)};
    })));`;
  return JSON.parse(execFileSync(process.execPath,
      ["--input-type=module", "-e", script, JSON.stringify([carpetas,
        EMPRESAS])], {encoding: "utf8"}));
}

describe("empresa deducida desde la carpeta", () => {
  test("una, varias o ninguna coincidencia", () => {
    const [una, varias, ninguna] = deducir([
      "3. Constructora Ñandú", "Tecnored Servicios", "17. B-BOSCH"]);
    expect(una).toEqual({tipo: "una", ids: ["b"]});
    // "Tecnored Servicios" contiene a TECNORED y a TECNORED SERVICIOS.
    expect(varias).toEqual({tipo: "varias", ids: ["a", "c"]});
    expect(ninguna).toEqual({tipo: "ninguna", ids: []});
  });

  test("sin tildes, mayúsculas ni puntuación; solo el último tramo de la " +
      "ruta", () => {
    const [tildes, ruta, proyecto] = deducir([
      "01 - nandu", "PLANTA NORTE/2. tecnored s.a.",
      "TECNORED (proyecto)/Otra carpeta"]);
    expect(tildes).toEqual({tipo: "una", ids: ["b"]});
    expect(ruta).toEqual({tipo: "una", ids: ["a"]});
    // El nombre del proyecto no cuenta: la carpeta es "Otra carpeta".
    expect(proyecto).toEqual({tipo: "ninguna", ids: []});
  });

  test("por RUT en el nombre de la carpeta", () => {
    expect(deducir(["Empresa 77104219-8"])[0])
        .toEqual({tipo: "una", ids: ["a"]});
  });
});
