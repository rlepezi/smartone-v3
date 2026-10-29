// Ubicación de los documentos de un requerimiento (1° mapeo del Expediente,
// 2° vínculo de la plantilla —documento sobre sección—, 3° tipo
// documental), sin caída entre niveles y por contexto de entidad. Datos
// sintéticos.
const {
  ubicacionRequerimiento, requerimientoDeArchivo, requerimientosVinculados,
} = require("../src/utils/ubicacionRequerimiento");

const tipo = (codigo, extra = {}) => ({id: `t-${codigo}`, codigo,
  estado: "activo", estadoIA: "piloto", ...extra});
const req = (id, codigo) => ({id, tipoDocumentalId: `t-${codigo}`});

const plantilla = (cambios = {}) => ({
  secciones: [
    {clave: "contratos", nombre: "Contratos", tipo: "archivos",
      requerimientoId: "reqA", archivosSeccion: [
        {clave: "contrato", nombre: "Contrato", tipoDocumentalCodigo:
          "CONTRATO"},
        {clave: "anexo", nombre: "Anexo", tipoDocumentalCodigo: "ANEXO",
          requerimientoId: "reqB"},
      ]},
    {clave: "cronograma", nombre: "Cronograma", tipo: "archivos",
      requerimientoId: "reqCrono"},
    {clave: "personal", nombre: "Carpetas Personales", tipo: "entidades",
      entidad: "persona",
      archivosSeccion: [{clave: "listado", nombre: "Listado de personal",
        tipoDocumentalCodigo: "LISTADO"}],
      documentos: [
        {clave: "ci", nombre: "Cédula", tipoDocumentalCodigo: "CEDULA_CL"},
        {clave: "lic", nombre: "Licencia", tipoDocumentalCodigo: "LICENCIA_CL",
          requerimientoId: "reqLic", ...(cambios.lic || {})},
        {clave: "examen", nombre: "Examen", tipoDocumentalCodigo: "EXAMEN",
          requerimientoId: "reqExamen", datosSensibles: true},
      ]},
    {clave: "vehiculos", nombre: "Vehículos", tipo: "entidades",
      entidad: "maquinaria", documentos: [
        {clave: "padron", nombre: "Padrón", tipoDocumentalCodigo: "PADRON"},
        {clave: "soap", nombre: "SOAP", tipoDocumentalCodigo: "SOAP",
          requerimientoId: "reqSoap"},
      ]},
  ],
});

const ubicar = (id, codigo, tipoEntidad, extra = {}) => ubicacionRequerimiento({
  requerimiento: req(id, codigo), tipo: tipo(codigo), tipoEntidad,
  plantilla: plantilla(), ...extra,
});
const claves = (u) => u.documentos.map((d) => d.documentoClave);

describe("Empresa", () => {
  test("1° mapeo del Expediente: ruta asignada a mano", () => {
    const u = ubicar("reqA", "CONTRATO", "empresa",
        {mapeo: {requerimientos: {reqA: "Contratos/2024"}}});
    expect(u).toMatchObject({nivel: "mapeo", ruta: "Contratos/2024",
      elegible: true, motivo: null});
  });

  test("2° sección vinculada a A y un documento a B: ese va a B, el resto a A",
      () => {
        const a = ubicar("reqA", "CONTRATO", "empresa");
        expect(a.nivel).toBe("plantilla");
        expect(claves(a)).toEqual(["contrato"]);
        expect(a.elegible).toBe(true);
        const b = ubicar("reqB", "ANEXO", "empresa");
        expect(claves(b)).toEqual(["anexo"]);
        expect(b.elegible).toBe(true);
      });

  test("el tipo sale del documento vinculado: un tipo guardado distinto " +
      "no bloquea (ya no hay tipo_no_coincide)", () => {
    // reqA tiene guardado ANEXO, pero su vínculo (sección) apunta al
    // Contrato: rige CONTRATO, y no se baja al calce por tipo.
    const tiposPorCodigo = new Map([["CONTRATO", tipo("CONTRATO")],
      ["ANEXO", tipo("ANEXO")]]);
    const u = ubicar("reqA", "ANEXO", "empresa", {tiposPorCodigo});
    expect(u).toMatchObject({nivel: "plantilla", elegible: true,
      motivo: null, origenTipo: "plantilla"});
    expect(u.tipo.codigo).toBe("CONTRATO");
    expect(claves(u)).toEqual(["contrato"]);
  });

  test("el tipo del documento vinculado rige su elegibilidad", () => {
    const tiposPorCodigo = new Map([["CONTRATO",
      tipo("CONTRATO", {estado: "inactivo"})]]);
    expect(ubicar("reqA", "ANEXO", "empresa", {tiposPorCodigo}))
        .toMatchObject({elegible: false, motivo: "tipo_inactivo"});
  });

  test("sin tipo en el vínculo: el guardado es respaldo; sin ninguno, " +
      "sin_tipo (no es error)", () => {
    const respaldo = ubicacionRequerimiento({requerimiento: {id: "reqA"},
      tipo: tipo("CONTRATO"), tipoEntidad: "empresa",
      plantilla: plantilla(), tiposPorCodigo: new Map()});
    expect(respaldo).toMatchObject({elegible: true, origenTipo: "guardado"});
    const ninguno = ubicacionRequerimiento({requerimiento: {id: "reqZ"},
      tipo: null, tipoEntidad: "empresa", plantilla: plantilla(),
      tiposPorCodigo: new Map()});
    expect(ninguno).toMatchObject({elegible: false, motivo: "sin_tipo",
      tipo: null, origenTipo: null});
  });

  test("sección vinculada sin documentos: ubicación sin IA", () => {
    const u = ubicar("reqCrono", "CRONOGRAMA", "empresa");
    expect(u.nivel).toBe("plantilla");
    expect(u.documentos[0]).toMatchObject({seccionClave: "cronograma",
      documentoClave: null});
    expect(u.motivo).toBe("seccion_sin_documentos");
  });

  test("3° tipo documental: archivo suelto de una sección de entidades", () => {
    const u = ubicar("reqListado", "LISTADO", "empresa");
    expect(u.nivel).toBe("tipo");
    expect(claves(u)).toEqual(["listado"]);
    expect(u.elegible).toBe(true);
  });

  test("sin ubicación", () => {
    expect(ubicar("reqX", "OTRO", "empresa")).toMatchObject({nivel: null,
      elegible: false, motivo: "no_en_plantilla"});
  });
});

describe("Persona", () => {
  test("el mapeo del Expediente no aplica", () => {
    const u = ubicar("reqCi", "CEDULA_CL", "persona",
        {mapeo: {requerimientos: {reqCi: "Personal"}}});
    expect(u.nivel).toBe("tipo");
    expect(u.ruta).toBeNull();
  });

  test("3° tipo: solo documentos de las carpetas de personas", () => {
    const u = ubicar("reqCi", "CEDULA_CL", "persona");
    expect(claves(u)).toEqual(["ci"]);
    expect(u.elegible).toBe(true);
    // El listado (suelto, nivel Empresa) no es de la persona.
    expect(ubicar("reqListado", "LISTADO", "persona").nivel).toBeNull();
  });

  test("2° vínculo de la plantilla", () => {
    const u = ubicar("reqLic", "LICENCIA_CL", "persona");
    expect(u).toMatchObject({nivel: "plantilla", elegible: true});
    expect(claves(u)).toEqual(["lic"]);
  });

  test("vínculo a documento sensible o deshabilitado: NO elegible", () => {
    expect(ubicar("reqExamen", "EXAMEN", "persona").motivo)
        .toBe("dato_sensible");
    const u = ubicacionRequerimiento({requerimiento: req("reqLic",
        "LICENCIA_CL"), tipo: tipo("LICENCIA_CL"), tipoEntidad: "persona",
    plantilla: plantilla({lic: {habilitado: false}})});
    expect(u).toMatchObject({nivel: "plantilla", elegible: false,
      motivo: "documento_deshabilitado"});
  });

  test("sin tipo documental: la ubicación se informa igual", () => {
    const u = ubicacionRequerimiento({requerimiento: {id: "reqLic"},
      tipo: null, tipoEntidad: "persona", plantilla: plantilla()});
    expect(u).toMatchObject({nivel: "plantilla", elegible: false,
      motivo: "sin_tipo"});
  });
});

describe("Recurso", () => {
  test("2° vínculo y 3° tipo, solo en carpetas de maquinarias", () => {
    expect(ubicar("reqSoap", "SOAP", "recurso"))
        .toMatchObject({nivel: "plantilla", elegible: true});
    const padron = ubicar("reqPadron", "PADRON", "recurso");
    expect(padron.nivel).toBe("tipo");
    expect(claves(padron)).toEqual(["padron"]);
    // Una Cédula no se busca en las carpetas de maquinarias.
    expect(ubicar("reqCi", "CEDULA_CL", "recurso").nivel).toBeNull();
  });
});

describe("tipo inactivo, solo reglas y carpeta libre", () => {
  test("el tipo rige en todos los niveles", () => {
    const base = {requerimiento: req("reqLic", "LICENCIA_CL"),
      tipoEntidad: "persona", plantilla: plantilla()};
    expect(ubicacionRequerimiento({...base, tipo: tipo("LICENCIA_CL",
        {estado: "inactivo"})}).motivo).toBe("tipo_inactivo");
    expect(ubicacionRequerimiento({...base, tipo: tipo("LICENCIA_CL",
        {soloReglas: true})}).motivo).toBe("solo_reglas");
    expect(ubicacionRequerimiento({...base, tipo: tipo("LICENCIA_CL"),
      libre: true})).toMatchObject({elegible: true, documentos: []});
  });
});

describe("consolidación: requerimiento de cada archivo", () => {
  test("documento sobre sección", () => {
    const p = plantilla();
    expect(requerimientoDeArchivo(p, "contratos", "anexo")).toBe("reqB");
    expect(requerimientoDeArchivo(p, "contratos", "contrato")).toBe("reqA");
    expect(requerimientoDeArchivo(p, "personal", "ci")).toBeNull();
    expect(requerimientoDeArchivo(p, "no_existe", "x")).toBeNull();
  });

  test("requerimientos vinculados en la plantilla", () => {
    expect([...requerimientosVinculados(plantilla())].sort()).toEqual(
        ["reqA", "reqB", "reqCrono", "reqExamen", "reqLic", "reqSoap"]);
  });
});
