// normalizarNombreMapeo y similitudTokens: misma lógica en backend y
// frontend (frontend/src/utils/normalizacionMapeo.js, cargada con Node como
// módulo ES), probadas con los mismos casos. Datos sintéticos.
const path = require("path");
const {execFileSync} = require("child_process");
const {pathToFileURL} = require("url");
const casos = require("./fixtures/casosNormalizacionMapeo.json");
const backend = require("../src/utils/normalizacionMapeo");

const RUTA_FRONTEND = path.join(__dirname,
    "../../frontend/src/utils/normalizacionMapeo.js");

/**
 * Corre los casos con la versión del frontend en un proceso Node aparte.
 * @return {Object} {normalizar, similitud}.
 */
function resultadosFrontend() {
  const script = `
    const m = await import(${JSON.stringify(
      pathToFileURL(RUTA_FRONTEND).href)});
    const casos = JSON.parse(process.argv[1]);
    console.log(JSON.stringify({
      normalizar: casos.normalizar.map((c) =>
        m.normalizarNombreMapeo(c.entrada, c.opciones)),
      similitud: casos.similitud.map((c) => m.similitudTokens(c.a, c.b)),
      sugerir: casos.sugerir.map((c) =>
        m.sugerirRequerimiento(c.nodo, c.contexto)),
      conjuntos: casos.conjuntos.map((c) => m.similitudConjuntos(c.a, c.b)),
    }));`;
  return JSON.parse(execFileSync(process.execPath,
      ["--input-type=module", "-e", script, JSON.stringify(casos)],
      {encoding: "utf8"}));
}

const frontend = resultadosFrontend();

describe("normalizarNombreMapeo", () => {
  casos.normalizar.forEach((c, i) => {
    test(`«${c.entrada}»`, () => {
      expect(backend.normalizarNombreMapeo(c.entrada, c.opciones))
          .toBe(c.esperado);
      expect(frontend.normalizar[i]).toBe(c.esperado);
    });
  });
});

describe("similitudTokens (Dice sin stopwords)", () => {
  casos.similitud.forEach((c, i) => {
    test(`«${c.a}» vs «${c.b}»`, () => {
      expect(backend.similitudTokens(c.a, c.b)).toBeCloseTo(c.esperado, 5);
      expect(frontend.similitud[i]).toBeCloseTo(c.esperado, 5);
    });
  });
});

describe("sugerirRequerimiento (niveles de confianza)", () => {
  casos.sugerir.forEach((c, i) => {
    test(c.caso, () => {
      expect(backend.sugerirRequerimiento(c.nodo, c.contexto))
          .toEqual(c.esperado);
      expect(frontend.sugerir[i]).toEqual(c.esperado);
    });
  });
});

describe("similitudConjuntos (Dice exacto entre carpetas)", () => {
  casos.conjuntos.forEach((c, i) => {
    test(`caso ${i + 1}`, () => {
      expect(backend.similitudConjuntos(c.a, c.b)).toBeCloseTo(c.esperado, 5);
      expect(frontend.conjuntos[i]).toBeCloseTo(c.esperado, 5);
    });
  });
});
