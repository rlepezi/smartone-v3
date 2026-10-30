// Validación de la carpeta del repositorio documental contra la Empresa.
// Los mismos casos (fixtures/casosCarpetaEmpresa.json) se corren contra la
// versión del backend y contra la del frontend
// (frontend/src/utils/carpetaEmpresa.js, cargada con Node como módulo ES),
// para que las dos den siempre el mismo resultado. Datos sintéticos.
const path = require("path");
const {execFileSync} = require("child_process");
const {pathToFileURL} = require("url");
const casos = require("./fixtures/casosCarpetaEmpresa.json");
const backend = require("../src/utils/carpetaEmpresa");

const RUTA_FRONTEND = path.join(__dirname,
    "../../frontend/src/utils/carpetaEmpresa.js");

/**
 * Corre los casos con la versión del frontend en un proceso Node aparte.
 * @return {Object} {validacion, terminos, sharepoint} con los resultados.
 */
function resultadosFrontend() {
  const script = `
    const m = await import(${JSON.stringify(
      pathToFileURL(RUTA_FRONTEND).href)});
    const c = JSON.parse(process.argv[1]);
    console.log(JSON.stringify({
      validacion: c.validacion.map((x) =>
        m.validarCarpetaEmpresa(x.carpeta, x.empresa)),
      terminos: c.terminos.map((x) =>
        m.validarCarpetaEmpresa("x", x.empresa).terminosBuscados),
      sharepoint: c.sharepoint.map((x) => m.carpetaDeUrlSharePoint(x.url)),
    }));`;
  const salida = execFileSync(process.execPath,
      ["--input-type=module", "-e", script, JSON.stringify(casos)],
      {encoding: "utf8"});
  return JSON.parse(salida);
}

const frontend = resultadosFrontend();

describe("validarCarpetaEmpresa", () => {
  casos.validacion.forEach((c, i) => {
    test(`${c.caso}: «${c.carpeta}»`, () => {
      const esperado = {valida: c.valida, coincidencia: c.coincidencia};
      const r = backend.validarCarpetaEmpresa(c.carpeta, c.empresa);
      expect({valida: r.valida, coincidencia: r.coincidencia})
          .toEqual(esperado);
      // El frontend da exactamente lo mismo (incluidos los términos).
      expect(frontend.validacion[i]).toEqual(r);
    });
  });

  test("términos buscados para la advertencia", () => {
    casos.terminos.forEach((c, i) => {
      const r = backend.validarCarpetaEmpresa("x", c.empresa);
      expect(r.terminosBuscados).toEqual(c.terminosBuscados);
      expect(frontend.terminos[i]).toEqual(c.terminosBuscados);
    });
  });
});

describe("carpetaDeUrlSharePoint", () => {
  casos.sharepoint.forEach((c, i) => {
    test(c.url, () => {
      expect(backend.carpetaDeUrlSharePoint(c.url)).toBe(c.carpeta);
      expect(frontend.sharepoint[i]).toBe(c.carpeta);
    });
  });
});

describe("mensajeCarpetaNoCoincide", () => {
  test("nombra la carpeta, la empresa y lo buscado", () => {
    expect(backend.mensajeCarpetaNoCoincide("2. PROYECTO B",
        {razonSocial: "ADMINISTRADORA PLAZA S.A."},
        ["administradora plaza", "99581960-0"])).toBe(
        "La carpeta «2. PROYECTO B» no contiene el nombre de la empresa " +
        "ADMINISTRADORA PLAZA S.A. (se buscó: «administradora plaza», " +
        "«99581960-0»).");
  });
});
