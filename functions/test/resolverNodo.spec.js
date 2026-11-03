// Resolvedor de nodos de la plantilla: misma lógica en backend y frontend
// (frontend/src/utils/resolverNodo.js, cargada con Node como módulo ES),
// probadas con los mismos casos para detectar desalineación. Datos
// sintéticos.
const path = require("path");
const {execFileSync} = require("child_process");
const {pathToFileURL} = require("url");
const casos = require("./fixtures/casosResolverNodo.json");
const backend = require("../src/utils/resolverNodo");

const RUTA_FRONTEND = path.join(__dirname,
    "../../frontend/src/utils/resolverNodo.js");

/**
 * hijosDe() desde el árbol del caso ({ruta: {carpetas, archivos} | null};
 * una ruta ausente = aún no leída).
 * @param {Object} arbol Árbol.
 * @return {function(string): (Object|null|undefined)} hijosDe.
 */
function hijosDesde(arbol) {
  const unir = (a, b) => [a, b].filter(Boolean).join("/");
  const nodos = (ruta, lista) => (lista || []).map((x) => ({nombre: x,
    ruta: unir(ruta, x)}));
  return (ruta) => {
    if (!(ruta in arbol)) return undefined;
    const n = arbol[ruta];
    if (n === null) return null;
    return {carpetas: nodos(ruta, n.carpetas), archivos: nodos(ruta,
        n.archivos)};
  };
}

const comparable = (r) => ({estado: r.estado, rutaReal: r.rutaReal,
  origen: r.origen, candidatos: r.candidatos,
  archivos: (r.archivos || []).map((a) => a.nombre),
  ...(r.leer ? {leer: r.leer} : {})});

const aObjeto = (mapa) => Object.fromEntries([...mapa.entries()].map(
    ([k, v]) => [k, v.map((n) => n.nodoClave)]));

/**
 * Corre los casos con la versión del frontend en un proceso aparte.
 * @return {Object} Resultados.
 */
function resultadosFrontend() {
  const script = `
    const m = await import(${JSON.stringify(
      pathToFileURL(RUTA_FRONTEND).href)});
    const casos = JSON.parse(process.argv[1]);
    ${hijosDesde.toString()}
    const comparable = ${comparable.toString()};
    const aObjeto = ${aObjeto.toString()};
    console.log(JSON.stringify({
      resolver: casos.resolver.map((c) => comparable(m.resolverNodo({
        ...c.entrada, hijosDe: hijosDesde(c.entrada.arbol)}))),
      calza: casos.calza.map((c) => m.calzaNombre(c.nombre, c.nodo,
        {archivo: c.archivo})),
      aplicables: casos.aplicables.map((c) =>
        aObjeto(m.requerimientosDeExpediente(c))),
    }));`;
  return JSON.parse(execFileSync(process.execPath,
      ["--input-type=module", "-e", script, JSON.stringify(casos)],
      {encoding: "utf8"}));
}

const frontend = resultadosFrontend();

describe("resolverNodo (override → alias con exclusiones → sugerencia)",
    () => {
      casos.resolver.forEach((c, i) => {
        test(c.caso, () => {
          const r = backend.resolverNodo({...c.entrada,
            hijosDe: hijosDesde(c.entrada.arbol)});
          expect(comparable(r)).toEqual(c.esperado);
          expect(frontend.resolver[i]).toEqual(c.esperado);
        });
      });
    });

describe("calzaNombre", () => {
  casos.calza.forEach((c, i) => {
    test(`«${c.nombre}»`, () => {
      expect(backend.calzaNombre(c.nombre, c.nodo, {archivo: c.archivo}))
          .toBe(c.esperado);
      expect(frontend.calza[i]).toBe(c.esperado);
    });
  });
});

describe("requerimientosDeExpediente (nodos aplicables por perfil)", () => {
  casos.aplicables.forEach((c, i) => {
    test(c.caso, () => {
      expect(aObjeto(backend.requerimientosDeExpediente(c)))
          .toEqual(c.esperado);
      expect(frontend.aplicables[i]).toEqual(c.esperado);
    });
  });
});

describe("lecturaDeNodos", () => {
  test("unión de alias; múltiple y sensible si algún nodo lo es", () => {
    expect(backend.lecturaDeNodos([
      {alias: ["ci", "cedula"], multiple: false, datosSensibles: true,
        tipoDocumentalCodigo: "CEDULA_CL"},
      {alias: ["cedula", "carnet"], multiple: true, datosSensibles: false,
        tipoDocumentalCodigo: null},
    ])).toEqual({alias: ["ci", "cedula", "carnet"], multiple: true,
      sensible: true, tiposDocumentales: ["CEDULA_CL"]});
  });
});
