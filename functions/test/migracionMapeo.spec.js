// Plan de migración al Mapeo documental sobre la plantilla (función pura;
// datos sintéticos).
const {
  planMigracionMapeo, seccionesConAlias,
} = require("../src/utils/migracionMapeo");
const {validarPlantilla, nodosDe} = require("../src/utils/plantillaEstructura");

const plantilla = {id: "p1", mandanteId: "m1", ...validarPlantilla({
  nombre: "Arranque", secciones: [
    {clave: "listado", nombre: "Listado del personal",
      alias: ["listado del personal"], tipo: "archivos"},
    {clave: "mutualidad", nombre: "Certificados Mutualidad",
      alias: ["certificado mutualidad"], tipo: "archivos",
      requerimientoId: "rMutual"},
    {clave: "personas", nombre: "Carpetas Trabajadores",
      alias: ["trabajadores"], tipo: "entidades", entidad: "persona",
      documentos: [{clave: "contrato", nombre: "Contrato de trabajo",
        alias: ["contrato"]}]},
  ]})};
const req = (id, nombre, tipoEntidad) => [id, {id, nombre, tipoEntidad,
  mandanteId: "m1", estado: "activo"}];
const requerimientos = new Map([req("rTrab", "Listado", "empresa"),
  req("rMutual", "Mutualidad", "empresa"),
  req("rContrato", "Contrato", "persona"),
  req("rSeguro", "Seguro", "empresa")]);
const base = {plantillas: new Map([["m1", plantilla]]), requerimientos,
  vinculos: [], patrones: [], carpetas: []};

describe("planMigracionMapeo", () => {
  test("el requerimientoId 1:1 de la plantilla pasa a vínculo", () => {
    const plan = planMigracionMapeo(base);
    expect(plan.vinculos).toEqual([expect.objectContaining({
      nodoClave: "mutualidad", requerimientoId: "rMutual", nivel: "empresa",
      origen: "plantilla"})]);
  });

  test("mapeo de carpeta: numeración distinta calza por alias", () => {
    const plan = planMigracionMapeo({...base, carpetas: [{id: "c1",
      mandanteId: "m1", ruta: "17.B-BOSCH", mapeo: {
        rTrab: [{ruta: "03. Listado del personal", tipo: "carpeta"}],
        rSeguro: [{ruta: "09. Seguros", tipo: "carpeta"}]}}]});
    expect(plan.vinculos.map((v) => `${v.nodoClave}|${v.requerimientoId}`))
        .toEqual(expect.arrayContaining(["listado|rTrab"]));
    // Sin nodo que calce: conflicto y requerimiento sin mapear.
    expect(plan.reporte.conflictos).toEqual([expect.objectContaining({
      requerimiento: "Seguro"})]);
    expect(plan.reporte.requerimientosSinMapear.map((r) => r.requerimiento))
        .toEqual(expect.arrayContaining(["Seguro"]));
  });

  test("carpeta del personal: qué sección la reconoce o qué alias sugerir",
      () => {
        const plan = planMigracionMapeo({...base, carpetas: [
          {id: "c1", mandanteId: "m1", ruta: "A", mapeo: {},
            carpetaPersonas: "02. Trabajadores"},
          {id: "c2", mandanteId: "m1", ruta: "B", mapeo: {},
            carpetaPersonas: "02. Personal contratista"}]});
        expect(plan.reporte.estructura[0].reconocidaPor)
            .toEqual(["Carpetas Trabajadores"]);
        expect(plan.reporte.estructura[1].sugerencia)
            .toMatch(/Agregar «Personal contratista»/);
      });

  test("patrones → alias del nodo vinculado a su requerimiento", () => {
    const plan = planMigracionMapeo({...base,
      vinculos: [{mandanteId: "m1", nodoClave: "personas/contrato",
        requerimientoId: "rContrato", estado: "activo"}],
      patrones: [
        {id: "p1", mandanteId: "m1", ambito: "persona", objetivo: "archivo",
          patron: "contrato de trabajo firmado", requerimientoId: "rContrato"},
        {id: "p2", mandanteId: "m1", ambito: "estructura",
          objetivo: "carpetaPersonas", patron: "personal"},
        {id: "p3", mandanteId: "m1", ambito: "empresa", objetivo: "carpeta",
          patron: "seguros", requerimientoId: "rSeguro"},
      ]});
    const porNodo = plan.alias.get("m1");
    expect(porNodo.get("personas/contrato"))
        .toEqual(["contrato de trabajo firmado"]);
    expect(porNodo.get("personas")).toEqual(["personal"]);
    expect(plan.patronesMigrados).toEqual(["p1", "p2"]);
    expect(plan.reporte.patronesSinNodo).toEqual([expect.objectContaining({
      patron: "seguros"})]);
    // Los alias se agregan a la plantilla sin repetir.
    const secciones = seccionesConAlias(plantilla, porNodo);
    const nodo = nodosDe({secciones}).find((n) =>
      n.nodoClave === "personas/contrato");
    expect(nodo.alias).toEqual(["contrato", "contrato de trabajo firmado"]);
  });

  test("Mandante sin plantilla: la carpeta se reporta", () => {
    const plan = planMigracionMapeo({...base, carpetas: [{id: "c9",
      mandanteId: "m9", ruta: "Z", mapeo: {}}]});
    expect(plan.reporte.sinPlantilla).toEqual(["Z"]);
  });
});
