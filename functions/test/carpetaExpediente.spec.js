// resolverCarpetaExpediente: un solo resolvedor para backend y frontend.
// Los mismos casos (fixtures/casosCarpetaExpediente.json) se corren contra la
// versión del backend y contra la del frontend
// (frontend/src/utils/carpetaExpediente.js, cargada con Node como módulo ES),
// para que no se desalineen. Datos sintéticos.
const path = require("path");
const {execFileSync} = require("child_process");
const {pathToFileURL} = require("url");
const casos = require("./fixtures/casosCarpetaExpediente.json");
const backend = require("../src/utils/carpetaExpediente");

const RUTA_FRONTEND = path.join(__dirname,
    "../../frontend/src/utils/carpetaExpediente.js");

/**
 * Corre los casos con la versión del frontend en un proceso Node aparte.
 * @return {Object} {resolver, estadoMapeo} con los resultados.
 */
function resultadosFrontend() {
  const script = `
    const m = await import(${JSON.stringify(
      pathToFileURL(RUTA_FRONTEND).href)});
    const casos = JSON.parse(process.argv[1]);
    console.log(JSON.stringify({
      resolver: casos.resolver.map((c) =>
        m.resolverCarpetaExpediente(c.entrada)),
      estadoMapeo: casos.estadoMapeo.map((c) =>
        m.calcularEstadoMapeo(c.mapeo, c.ids)),
    }));`;
  const salida = execFileSync(process.execPath,
      ["--input-type=module", "-e", script, JSON.stringify(casos)],
      {encoding: "utf8"});
  return JSON.parse(salida);
}

const frontend = resultadosFrontend();

describe("resolverCarpetaExpediente", () => {
  casos.resolver.forEach((c, i) => {
    test(c.caso, () => {
      const r = backend.resolverCarpetaExpediente(c.entrada);
      expect(r).toEqual(c.esperado);
      expect(frontend.resolver[i]).toEqual(c.esperado);
    });
  });

  test("rutasDeRequerimiento", () => {
    const {carpeta} = backend.resolverCarpetaExpediente(
        casos.resolver[0].entrada);
    expect(backend.rutasDeRequerimiento(carpeta, "r1"))
        .toEqual(["01. Contratos"]);
    expect(backend.rutasDeRequerimiento(carpeta, "otro")).toEqual([]);
    expect(backend.rutasDeRequerimiento(null, "r1")).toEqual([]);
  });
});

describe("calcularEstadoMapeo", () => {
  casos.estadoMapeo.forEach((c, i) => {
    test(c.caso, () => {
      expect(backend.calcularEstadoMapeo(c.mapeo, c.ids)).toBe(c.esperado);
      expect(frontend.estadoMapeo[i]).toBe(c.esperado);
    });
  });
});

describe("coberturaMapeo", () => {
  it("cuenta las carpetas mapeadas y agrupa las ubicaciones por " +
      "requerimiento, ordenadas por ruta", () => {
    const c = backend.coberturaMapeo([
      {id: "c2", ruta: "10. BETA", empresaNombre: "Beta", mapeo: {
        r1: [{ruta: "10. BETA/01 ODI", tipo: "carpeta"}],
        r2: [{ruta: "10. BETA/x.pdf", tipo: "archivo"}]}},
      {id: "c1", ruta: "2. ALFA", empresaNombre: "Alfa", estadoMapeo:
        "parcial", mapeo: {r1: "2. ALFA/ODI"}},
      {id: "c3", ruta: "3. VACIA", mapeo: {r1: []}},
    ]);
    expect(c.carpetasMapeadas).toBe(2);
    expect(c.porRequerimiento.r1.map((x) => x.carpetaEmpresaId))
        .toEqual(["c1", "c2"]);
    expect(c.porRequerimiento.r1[0]).toMatchObject({estadoMapeo: "parcial",
      ubicaciones: [{ruta: "2. ALFA/ODI", tipo: "carpeta"}]});
    expect(c.porRequerimiento.r2[0].ubicaciones[0].tipo).toBe("archivo");
    expect(backend.coberturaMapeo([])).toEqual({carpetasMapeadas: 0,
      porRequerimiento: {}});
  });
});
