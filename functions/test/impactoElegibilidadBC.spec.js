// Script de impacto de B y C: la lógica anterior (solo por tipo) y la
// desplegada (mapeo → vínculo → tipo, por contexto). Datos sintéticos.
const {
  elegibilidadAnterior, elegibilidadDesplegada, contarVinculos,
} = require("../src/scripts/impactoElegibilidadBC");

const tipo = (codigo) => ({id: `t-${codigo}`, codigo, estado: "activo",
  estadoIA: "piloto"});
const req = (id, codigo, tipoEntidad) => ({id, tipoEntidad,
  tipoDocumentalId: `t-${codigo}`});

// Cédula en una sección de archivos (contexto Empresa) y un contrato
// vinculado a reqA cuyo tipo es otro.
const plantilla = {secciones: [
  {clave: "docs", tipo: "archivos", archivosSeccion: [
    {clave: "ci", tipoDocumentalCodigo: "CEDULA_CL"},
    {clave: "contrato", tipoDocumentalCodigo: "CONTRATO",
      requerimientoId: "reqA"},
    {clave: "off", tipoDocumentalCodigo: "OTRO", habilitado: false},
  ]},
]};

describe("impacto de B: anterior vs desplegada", () => {
  test("contexto de entidad: una cédula de persona en una sección de " +
      "archivos deja de ser elegible", () => {
    const e = {requerimiento: req("r1", "CEDULA_CL", "persona"),
      tipo: tipo("CEDULA_CL"), plantilla, libre: false};
    expect(elegibilidadAnterior(e).elegible).toBe(true);
    expect(elegibilidadDesplegada({...e, tipoEntidad: "persona"}))
        .toMatchObject({elegible: false, motivo: "no_en_plantilla"});
  });

  test("vínculo a un documento de otro tipo: tipo_no_coincide", () => {
    const e = {requerimiento: req("reqA", "ANEXO", "empresa"),
      tipo: tipo("ANEXO"), plantilla, libre: false};
    expect(elegibilidadAnterior(e).motivo).toBe("no_en_plantilla");
    expect(elegibilidadDesplegada({...e, tipoEntidad: "empresa"}))
        .toMatchObject({elegible: false, motivo: "tipo_no_coincide",
          nivel: "plantilla"});
  });

  test("mapeo del expediente: elegible sin mirar la plantilla", () => {
    const e = {requerimiento: req("r9", "OTRO", "empresa"), tipo: tipo("OTRO"),
      plantilla, libre: false};
    expect(elegibilidadAnterior(e).motivo).toBe("documento_deshabilitado");
    expect(elegibilidadDesplegada({...e, tipoEntidad: "empresa",
      mapeo: {requerimientos: {r9: "Carpeta"}}}))
        .toMatchObject({elegible: true, nivel: "mapeo"});
  });

  test("sin vínculos ni mapeo, Empresa: igual que antes", () => {
    const e = {requerimiento: req("r2", "CEDULA_CL", "empresa"),
      tipo: tipo("CEDULA_CL"), plantilla, libre: false};
    expect(elegibilidadDesplegada({...e, tipoEntidad: "empresa"}).elegible)
        .toBe(elegibilidadAnterior(e).elegible);
    expect(contarVinculos(plantilla)).toBe(1);
  });
});
