// Verificaciones "Archivo presente" y "Campo con valor esperado" (datos
// sintéticos).
const {
  ejecutar, validarParametros, camposDe, VERIFICACIONES,
} = require("../src/reglasIA/verificaciones");

describe("archivo_presente", () => {
  test("cumple: la regla solo se evalúa sobre un archivo revisado", () => {
    expect(ejecutar("archivo_presente", {}, {}, {}).resultado).toBe("cumple");
    expect(camposDe("archivo_presente", {})).toEqual([]);
    expect(VERIFICACIONES.archivo_presente.entidades)
        .toEqual(["persona", "empresa", "recurso"]);
  });
});

describe("campo_valor", () => {
  const params = (p) => validarParametros("campo_valor", p).valor;

  test("igual: sin distinguir mayúsculas ni tildes", () => {
    const p = params({campo: "cargo", valores: "Prevencionista, Supervisor"});
    expect(p.modo).toBe("igual");
    expect(ejecutar("campo_valor", {cargo: {valor: "prevencionista"}}, {}, p))
        .toMatchObject({resultado: "cumple",
          detalle: expect.stringContaining("PREVENCIONISTA")});
    expect(ejecutar("campo_valor", {cargo: {valor: "Prevencionista jefe"}},
        {}, p).resultado).toBe("no_cumple");
  });

  test("contiene: palabras completas", () => {
    const p = params({campo: "cargo", modo: "contiene",
      valores: ["jefe de obra"]});
    expect(ejecutar("campo_valor", {cargo: {valor: "Jefe de Obra eléctrica"}},
        {}, p).resultado).toBe("cumple");
    expect(ejecutar("campo_valor", {cargo: {valor: "Subjefe"}}, {}, p)
        .resultado).toBe("no_cumple");
  });

  test("sin dato o mal configurada: no determinable", () => {
    const p = params({campo: "cargo", valores: "X"});
    expect(ejecutar("campo_valor", {}, {}, p).resultado)
        .toBe("no_determinable");
    expect(validarParametros("campo_valor", {campo: "cargo"}).ok).toBe(false);
    expect(camposDe("campo_valor", p)).toEqual(["cargo"]);
  });
});

describe("carpeta_presente", () => {
  const params = (p) => validarParametros("carpeta_presente", p).valor;

  test("sin nombres: basta con que venga de la carpeta", () => {
    expect(ejecutar("carpeta_presente", {},
        {rutaArchivo: "Empresa/Mutualidad/cert.pdf"}, params({})))
        .toMatchObject({resultado: "cumple",
          detalle: expect.stringContaining("Empresa/Mutualidad")});
    expect(ejecutar("carpeta_presente", {}, {rutaArchivo: null}, params({}))
        .resultado).toBe("no_cumple");
    expect(camposDe("carpeta_presente", {})).toEqual([]);
  });

  test("con nombres: sin distinguir mayúsculas ni tildes", () => {
    const p = params({nombres: "Mutualidad"});
    expect(ejecutar("carpeta_presente", {},
        {rutaArchivo: "Empresa\\04 Mutualídad ACHS\\cert.pdf"}, p).resultado)
        .toBe("cumple");
    expect(ejecutar("carpeta_presente", {},
        {rutaArchivo: "Empresa/ODI/cert.pdf"}, p).resultado)
        .toBe("no_cumple");
    expect(ejecutar("carpeta_presente", {}, {rutaArchivo: "cert.pdf"}, p)
        .resultado).toBe("no_cumple");
  });
});
