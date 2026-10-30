// Migración E6 (clasificación y traslado del mapeo) con datos sintéticos.
const {
  clasificarLegado, mapeoDesdeLegado,
} = require("../src/utils/migracionLegado");
const {idCarpeta} = require("../src/utils/carpetasEmpresa");

const EMPRESA = {id: "emp1", razonSocial: "Transportes del Valle Ltda.",
  rut: "76.111.111-1"};
const EXP = {id: "e1", estado: "en_ejecucion", empresaId: "emp1",
  proyectoId: "p1"};
const LOCAL = {id: "f1", tipo: "local"};
const LEGADO = {tipo: "local", etiqueta: "1. TRANSPORTES DEL VALLE",
  mapeo: {carpetaPersonas: "10. Trabajadores", carpetaRecursos: null,
    requerimientos: {rA: "01. Antecedentes", rB: "02. Poliza"}}};
const clase = (extra) => clasificarLegado({expediente: EXP, legado: LEGADO,
  fuente: LOCAL, empresa: EMPRESA, ...extra}).clase;

describe("clasificarLegado", () => {
  test("migrable, con su carpeta y su ID determinístico", () => {
    expect(clasificarLegado({expediente: EXP, legado: LEGADO, fuente: LOCAL,
      empresa: EMPRESA})).toEqual({clase: "migrable", detalle: null,
      ruta: "1. TRANSPORTES DEL VALLE", url: null,
      carpetaId: idCarpeta("f1", "1. TRANSPORTES DEL VALLE")});
  });

  test("cada clasificación de no migrable", () => {
    expect(clase({expediente: {...EXP, repositorioDocumental:
      {carpetaEmpresaId: "c"}}})).toBe("ya_migrado");
    expect(clase({legado: {...LEGADO, migradoA: "c"}})).toBe("ya_migrado");
    expect(clase({expediente: {...EXP, estado: "cerrado"}})).toBe("cerrado");
    expect(clase({fuente: null})).toBe("sin_fuente");
    expect(clase({fuente: {id: "f2", tipo: "sharepoint"}}))
        .toBe("fuente_distinta");
    expect(clase({legado: {...LEGADO, etiqueta: "Repositorio/Transportes"}}))
        .toBe("ruta_invalida");
    expect(clase({legado: {...LEGADO, etiqueta: "Carpeta sin identificar"}}))
        .toBe("no_corresponde_empresa");
  });

  test("carpeta en uso: otra empresa, otro proyecto u otro expediente " +
      "activo; vinculada a un expediente cerrado se puede usar", () => {
    const carpeta = (x) => ({empresaId: "emp1", proyectoId: "p1",
      expedienteId: null, ...x});
    expect(clase({carpeta: carpeta({empresaId: "otra"})}))
        .toBe("carpeta_en_uso");
    expect(clase({carpeta: carpeta({proyectoId: "p2"})}))
        .toBe("carpeta_en_uso");
    expect(clase({carpeta: carpeta({expedienteId: "e9"}),
      otroExpediente: {estado: "en_ejecucion"}})).toBe("carpeta_en_uso");
    expect(clase({carpeta: carpeta({expedienteId: "e9"}),
      otroExpediente: {estado: "cerrado"}})).toBe("migrable");
    expect(clase({carpeta: carpeta({proyectoId: null})})).toBe("migrable");
  });

  test("dos expedientes con la misma carpeta en la misma corrida: el " +
      "segundo queda en uso", () => {
    const id = idCarpeta("f1", "1. TRANSPORTES DEL VALLE");
    const tomadas = new Map([[id, {expedienteId: "e0", empresaId: "emp1",
      proyectoId: "p0", expedienteEstado: "en_ejecucion"}]]);
    expect(clase({tomadas})).toBe("carpeta_en_uso");
  });
});

describe("mapeoDesdeLegado", () => {
  const AHORA = new Date("2026-10-30T12:00:00Z");

  test("traslada el mapeo anterior como entradas de carpeta con origen " +
      "migración", () => {
    const r = mapeoDesdeLegado(LEGADO.mapeo, {mapeo: {}}, AHORA);
    expect(r.carpetaPersonas).toBe("10. Trabajadores");
    expect(r.mapeo.rA).toEqual([{ruta: "01. Antecedentes", tipo: "carpeta",
      origen: "migracion", confirmadoPor: "migracion-e6",
      confirmadoAt: AHORA}]);
    expect(r.agregadas).toHaveLength(2);
    expect(r.omitidas).toEqual([]);
  });

  test("nunca sobrescribe y omite lo que no cumple las reglas", () => {
    const actual = {mapeo: {rA: [{ruta: "Otra", tipo: "carpeta"}]},
      carpetaPersonas: null, carpetaRecursos: null};
    const r = mapeoDesdeLegado({carpetaPersonas: "10. Trabajadores",
      requerimientos: {rA: "01. Antecedentes", rB: "10. Trabajadores/Ana",
        rC: "Otra", rD: ""}}, actual, AHORA);
    expect(r.mapeo.rA).toEqual(actual.mapeo.rA);
    expect(Object.fromEntries(r.omitidas.map((o) => [o.requerimientoId,
      o.motivo.slice(0, 20)]))).toEqual({
      rA: "El requerimiento ya ",
      rB: "«10. Trabajadores/An",
      rC: "«Otra» ya está asign",
    });
    expect(r.agregadas).toEqual([]);
  });

  test("conserva la carpeta del personal ya elegida en la carpeta", () => {
    const r = mapeoDesdeLegado(LEGADO.mapeo, {mapeo: {},
      carpetaPersonas: "03. Personal"}, AHORA);
    expect(r.carpetaPersonas).toBe("03. Personal");
  });

  test("idempotente: aplicarlo sobre su propio resultado no agrega nada",
      () => {
        const primera = mapeoDesdeLegado(LEGADO.mapeo, {mapeo: {}}, AHORA);
        const segunda = mapeoDesdeLegado(LEGADO.mapeo, primera, AHORA);
        expect(segunda.mapeo).toEqual(primera.mapeo);
        expect(segunda.agregadas).toEqual([]);
      });
});
