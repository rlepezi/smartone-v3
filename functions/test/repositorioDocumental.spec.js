const {validarRepositorio} = require("../src/utils/repositorioDocumental");

describe("validarRepositorio", () => {
  it("local: solo el nombre de la carpeta y url null", () => {
    expect(validarRepositorio({tipo: "local", etiqueta: " 1. EMPRESA DEMO "}))
        .toEqual({ok: true, error: null,
          valor: {tipo: "local", etiqueta: "1. EMPRESA DEMO", url: null}});
    expect(validarRepositorio({tipo: "local", etiqueta: "C:\\docs"}).ok)
        .toBe(false);
    expect(validarRepositorio({tipo: "local", etiqueta: "x",
      url: "https://demo.sharepoint.com/sites/a"}).ok).toBe(false);
    expect(validarRepositorio({tipo: "local", etiqueta: ""}).ok).toBe(false);
  });

  it("sharepoint: https y host *.sharepoint.com", () => {
    const r = validarRepositorio({tipo: "sharepoint",
      url: "https://demo.sharepoint.com/sites/obras/Documentos/Empresa%20X"});
    expect(r.ok).toBe(true);
    expect(r.valor.etiqueta).toBe("Empresa X");
    expect(validarRepositorio({tipo: "sharepoint",
      url: "http://demo.sharepoint.com/sites/a"}).ok).toBe(false);
    expect(validarRepositorio({tipo: "sharepoint",
      url: "https://sharepoint.com.falso.cl/sites/a"}).ok).toBe(false);
    expect(validarRepositorio({tipo: "sharepoint", url: "no es url"}).ok)
        .toBe(false);
  });

  it("rechaza otros tipos", () => {
    expect(validarRepositorio({tipo: "drive"}).ok).toBe(false);
    expect(validarRepositorio(null).ok).toBe(false);
  });
});

const {
  validarMapeo, validarRutaRelativa,
} = require("../src/utils/repositorioDocumental");

describe("validarRutaRelativa", () => {
  it("acepta rutas relativas y normaliza separadores", () => {
    expect(validarRutaRelativa("02. Carpeta de trabajadores\\Ana Demo/").valor)
        .toBe("02. Carpeta de trabajadores/Ana Demo");
    expect(validarRutaRelativa("").valor).toBeNull();
    expect(validarRutaRelativa(null).ok).toBe(true);
  });

  it("rechaza absolutas, letra de unidad y ..", () => {
    for (const ruta of ["C:\\docs", "/etc", "\\\\servidor\\x", "a/../b",
      "./a"]) {
      expect(validarRutaRelativa(ruta).ok).toBe(false);
    }
  });
});

describe("validarMapeo", () => {
  it("normaliza y descarta requerimientos vacíos", () => {
    expect(validarMapeo({carpetaPersonas: "02. Trabajadores",
      requerimientos: {req1: "09. MIPER", req2: ""}}).valor).toEqual({
      carpetaPersonas: "02. Trabajadores", carpetaRecursos: null,
      requerimientos: {req1: "09. MIPER"}});
  });

  it("rechaza rutas inválidas e ids raros", () => {
    expect(validarMapeo({carpetaRecursos: "../x"}).ok).toBe(false);
    expect(validarMapeo({requerimientos: {"a/b": "x"}}).ok).toBe(false);
  });

  it("el repositorio local acepta mapeo", () => {
    const r = validarRepositorio({tipo: "local", etiqueta: "1. EMPRESA DEMO",
      mapeo: {carpetaPersonas: "02. Trabajadores"}});
    expect(r.valor.mapeo.carpetaPersonas).toBe("02. Trabajadores");
    expect(validarRepositorio({tipo: "local", etiqueta: "X"}).valor.mapeo)
        .toBeUndefined();
  });
});
