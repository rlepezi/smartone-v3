// Datos propuestos para una Empresa desde su carpeta
// (frontend/src/utils/datosEmpresaCarpeta.js, cargado como módulo ES) con
// datos sintéticos.
const path = require("path");
const {execFileSync} = require("child_process");
const {pathToFileURL} = require("url");

const RUTA = path.join(__dirname,
    "../../frontend/src/utils/datosEmpresaCarpeta.js");

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

// RUT con DV válido: dos de empresa (≥ 50.000.000) y dos de persona.
const EMPRESA_A = "77.104.219-8";
const EMPRESA_B = "76.045.622-5";
const PERSONA_A = "15.748.401-K";
const PERSONA_B = "19.298.052-6";

describe("nombre propuesto desde la carpeta", () => {
  test("tabla de la especificación", () => {
    expect(correr(`console.log(JSON.stringify(["1. TECNORED",
      "21. SLV (Proyectos 2024)",
      "17.B-BOSCH_Proyecto_Linea_1x220_Charrua_Temuco",
      "05 - Constructora Ñandú - Proyecto Sur", "Áridos del Maule"]
      .map(m.nombreDesdeCarpeta)));`)).toEqual(["TECNORED", "SLV",
      "B-BOSCH", "Constructora Ñandú", "Áridos del Maule"]);
  });
});

describe("documentos de la carpeta", () => {
  test("abre primero uno con palabra clave; si no, el primer PDF", () => {
    const r = correr(`console.log(JSON.stringify([
      m.documentoPreferido([{nombre: "Listado.pdf"},
        {nombre: "Certificado F30 2026.pdf"}])?.nombre,
      m.documentoPreferido([{nombre: "nota.txt"}, {nombre: "Contrato.pdf"}])
          ?.nombre,
      m.documentoPreferido([{nombre: "nota.txt"}]),
      m.documentosParaAnalizar([{nombre: "a.pdf"}, {nombre: "b.docx"},
        {nombre: "Escritura constitucion.pdf"}, {nombre: "c.pdf"},
        {nombre: "d.pdf"}, {nombre: "e.pdf"}, {nombre: "f.jpg"}])
          .map((a) => a.nombre),
    ]));`);
    expect(r).toEqual(["Certificado F30 2026.pdf", "Contrato.pdf", null,
      ["Escritura constitucion.pdf", "a.pdf", "b.docx", "c.pdf", "d.pdf"]]);
  });
});

describe("subcarpetas con palabra clave", () => {
  test("se revisan además de la raíz (incluido el cronograma)", () => {
    expect(correr(`console.log(JSON.stringify(m.carpetasConPalabraClave([
      {nombre: "01. Cronograma de actividades"},
      {nombre: "03. Certificado de Mutualidad"},
      {nombre: "Escritura de constitución"}, {nombre: "F30"},
      {nombre: "02. Carpeta de trabajadores"}]).map((c) => c.nombre)));`))
        .toEqual(["01. Cronograma de actividades",
          "03. Certificado de Mutualidad", "Escritura de constitución", "F30"]);
  });
});

describe("RUT propuesto", () => {
  test("prefiere el jurídico más frecuente aunque haya más RUT de " +
      "personas", () => {
    const textos = [
      {texto: `Empleador ${EMPRESA_A}\nTrabajador ${PERSONA_A}\n` +
        `Trabajador ${PERSONA_B}\nTrabajador ${PERSONA_A}`, documento: "F30"},
      {texto: `RUT ${EMPRESA_A} · otro ${EMPRESA_B}`, documento: "e-RUT"},
    ];
    const r = correr(`const c = m.rutsCandidatos(${JSON.stringify(textos)});
      console.log(JSON.stringify({c: c.map((x) => [x.rut, x.veces,
        x.juridico]), p: m.propuestaRut(c)?.rut || null}));`);
    expect(r.p).toBe(EMPRESA_A);
    expect(r.c).toEqual(expect.arrayContaining([[EMPRESA_A, 2, true],
      [PERSONA_A, 2, false], [EMPRESA_B, 1, true]]));
  });

  test("empate entre jurídicos o solo personas: no propone", () => {
    const r = correr(`console.log(JSON.stringify([
      m.propuestaRut(m.rutsCandidatos([{texto: "${EMPRESA_A} ${EMPRESA_B}"}])),
      m.propuestaRut(m.rutsCandidatos([{texto: "${PERSONA_A}"}])),
      m.rutsCandidatos([{texto: "12.345.678-0 tel 987654321"}]).length]));`);
    expect(r).toEqual([null, null, 0]);
  });
});

describe("razón social propuesta", () => {
  test("la línea con sufijo societario junto al RUT y con el nombre de " +
      "fantasía", () => {
    const textos = [{documento: "e-RUT", texto: [
      "SERVICIO DE IMPUESTOS INTERNOS",
      "Razón social: TECNORED S.A.",
      `RUT: ${EMPRESA_A}`,
      "Otra Empresa Limitada",
    ].join("\n")}];
    const r = correr(`console.log(JSON.stringify([
      m.propuestaRazonSocial({textos: ${JSON.stringify(textos)},
        rut: "${EMPRESA_A}", nombreFantasia: "TECNORED"}),
      m.propuestaRazonSocial({textos: ${JSON.stringify(textos)},
        rut: "${EMPRESA_A}", nombreFantasia: "SLV"}),
      m.razonesSocialesCandidatas(${JSON.stringify(textos[0].texto)}),
    ]));`);
    expect(r[0]).toEqual({razonSocial: "TECNORED S.A.", documento: "e-RUT"});
    expect(r[1]).toBeNull();
    expect(r[2]).toEqual(["TECNORED S.A.", "Otra Empresa Limitada"]);
  });
});

describe("carpetas libres para la acreditación", () => {
  test("sin expediente y sin proyecto o del mismo proyecto", () => {
    const carpetas = [
      {id: "a", empresaId: "e1", proyectoId: null, expedienteId: null},
      {id: "b", empresaId: "e1", proyectoId: "p1", expedienteId: null},
      {id: "c", empresaId: "e1", proyectoId: "p2", expedienteId: null},
      {id: "d", empresaId: "e1", proyectoId: null, expedienteId: "x"},
      {id: "e", empresaId: "e2", proyectoId: null, expedienteId: null},
    ];
    const r = correr(`const c = ${JSON.stringify(carpetas)};
      console.log(JSON.stringify([
        m.carpetasLibresDeEmpresa(c, "e1", "p1").map((x) => x.id),
        m.carpetasLibresDeEmpresa(c, "e1", null).map((x) => x.id),
        m.carpetasLibresDeEmpresa(c, "e3", null).length]));`);
    expect(r).toEqual([["a", "b"], ["a"], 0]);
  });
});
