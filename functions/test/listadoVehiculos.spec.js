// Vehículos de un listado en planilla
// (frontend/src/utils/listadoVehiculos.js, cargado como módulo ES) con datos
// sintéticos.
const path = require("path");
const {execFileSync} = require("child_process");
const {pathToFileURL} = require("url");

const RUTA = path.join(__dirname,
    "../../frontend/src/utils/listadoVehiculos.js");

/**
 * Corre una función del módulo del frontend en un proceso aparte.
 * @param {string} cuerpo Código con `m` (el módulo) y `datos`.
 * @param {*} datos Entrada.
 * @return {*} Resultado.
 */
function correr(cuerpo, datos) {
  const script = `
    const m = await import(${JSON.stringify(pathToFileURL(RUTA).href)});
    const datos = JSON.parse(process.argv[1]);
    console.log(JSON.stringify(${cuerpo}));`;
  return JSON.parse(execFileSync(process.execPath,
      ["--input-type=module", "-e", script, JSON.stringify(datos)],
      {encoding: "utf8"}));
}

describe("listado de vehículos en planilla", () => {
  test("título combinado sobre el encabezado; descripción, patente, marca " +
      "y modelo; varias hojas; sin repetir patente", () => {
    const v = correr("m.vehiculosDeListado(datos)", [
      {nombre: "MAQUINAS", filas: [
        ["DESCRIPCION VEHICULO", "DESCRIPCION VEHICULO", "", "", ""],
        ["ITEM", "TIPO DE VEHICULO", "MARCA", "MODELO", "PLACA PATENTE"],
        ["1", "CAMIONETA", "CHEVROLET", "COLORADO 4X4", "RH-ZF-98"],
        ["2", "CAMIÓN 3/4", "Mercedes", "Atego", "rwjh 94"],
        ["3", "CAMIONETA", "CHEVROLET", "COLORADO 4X4", "RHZF98"],
        ["", "", "", "", ""],
      ]},
      {nombre: "EQUIPOS", filas: [
        ["Equipo", "Marca", "N° Serie"],
        ["Generador", "Honda", "GX-1234"],
      ]},
      {nombre: "Hoja1", filas: [["sin tabla"]]},
    ]);
    expect(v).toHaveLength(3);
    expect(v[0]).toMatchObject({hoja: "MAQUINAS", fila: 3,
      descripcion: "CAMIONETA", marca: "CHEVROLET", modelo: "COLORADO 4X4",
      patente: "RHZF98", tipoIdentificacion: "patente", patenteValida: true,
      nombre: "CHEVROLET COLORADO 4X4"});
    expect(v[1]).toMatchObject({descripcion: "CAMIÓN 3/4", patente: "RWJH94",
      nombre: "Mercedes Atego"});
    expect(v[2]).toMatchObject({hoja: "EQUIPOS", descripcion: "Generador",
      patente: "GX-1234", tipoIdentificacion: "serie", nombre: "Honda"});
  });

  test("caracteres invisibles se limpian; una letra de otro alfabeto se " +
      "informa con su código", () => {
    const v = correr("m.vehiculosDeListado(datos)", [{nombre: "H", filas: [
      ["Tipo", "Marca", "Patente"],
      // Espacio de ancho cero dentro de la patente.
      ["CAMIÓN PLUMA", "Volvo", "CGCF\u200B28"],
      // «\u0421» cirílica (U+0421) en vez de la C latina.
      ["CAMIONETA", "Ford", "\u0421GCF29"],
    ]}]);
    expect(v[0]).toMatchObject({patente: "CGCF28", patenteValida: true,
      motivoPatente: null});
    expect(v[1]).toMatchObject({patenteValida: false,
      motivoPatente: expect.stringContaining("U+0421")});
  });

  test("registrado por patente normalizada", () => {
    const r = correr("m.registradoDe(datos.fila, datos.recursos)", {
      fila: {patente: "RHZF98"},
      recursos: [{id: "x", patente: "BBCD12"}, {id: "y", patente: "rh-zf-98"}],
    });
    expect(r).toEqual({id: "y", patente: "rh-zf-98"});
  });
});
