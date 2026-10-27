const {
  ejecutar, validarParametros, camposDe, catalogo,
} = require("../src/reglasIA/verificaciones");
const {validarRegla} = require("../src/reglasIA/reglas");
const {
  conDefaults, disponibleParaIA, validarCampos, validarEntidades,
} = require("../src/reglasIA/tiposDocumentales");

// Datos sintéticos: RUT de prueba válidos (DV módulo 11) y nombres ficticios.
const RUT_A = "11.111.111-1";
const RUT_B = "22.222.222-2";
const res = (clave, campos, contexto = {}, parametros = {}) =>
  ejecutar(clave, campos, contexto, parametros).resultado;

describe("verificaciones: regla común", () => {
  it("sin el campo requerido es no_determinable, nunca no_cumple", () => {
    for (const v of catalogo().filter((x) => x.clave !== "campo_presente")) {
      expect(res(v.clave, {}, {rut: RUT_A, nombre: "Ana Demo",
        fechaTerminoProyecto: "2027-01-01", patente: "BBCD12",
        rutEmpresa: RUT_B}, {diasMaximos: 30, tolerancia: "tokens"}))
          .toBe("no_determinable");
    }
  });
});

describe("coincide_rut", () => {
  it("cumple, no cumple y no determinable", () => {
    expect(res("coincide_rut", {rut: "11111111-1"}, {rut: RUT_A}))
        .toBe("cumple");
    expect(res("coincide_rut", {rut: {valor: RUT_B, confianza: 0.9}},
        {rut: RUT_A})).toBe("no_cumple");
    expect(res("coincide_rut", {rut: "11.111.111-2"}, {rut: RUT_A}))
        .toBe("no_determinable");
    expect(res("coincide_rut", {rut: RUT_A}, {})).toBe("no_determinable");
  });
});

describe("coincide_nombre", () => {
  it("por tokens no importa el orden ni los nombres de más", () => {
    expect(res("coincide_nombre", {nombre: "ANA MARÍA DEMO PRUEBA"},
        {nombre: "Ana Demo"}, {tolerancia: "tokens"})).toBe("cumple");
    expect(res("coincide_nombre", {nombre: "Demo Ana"}, {nombre: "Ana Demo"},
        {tolerancia: "tokens"})).toBe("cumple");
    expect(res("coincide_nombre", {nombre: "Luis Demo"}, {nombre: "Ana Demo"},
        {tolerancia: "tokens"})).toBe("no_cumple");
  });

  it("estricta exige el mismo nombre (sin tildes ni mayúsculas)", () => {
    expect(res("coincide_nombre", {nombre: "ANA DÉMO"}, {nombre: "ana demo"},
        {tolerancia: "estricta"})).toBe("cumple");
    expect(res("coincide_nombre", {nombre: "Ana María Demo"},
        {nombre: "Ana Demo"}, {tolerancia: "estricta"})).toBe("no_cumple");
  });
});

describe("fechas", () => {
  const ctx = {fechaEvaluacion: "2026-10-26"};
  it("vigente_a_fecha con y sin margen (acepta dd/mm/aaaa)", () => {
    expect(res("vigente_a_fecha", {fechaVencimiento: "26/10/2026"}, ctx))
        .toBe("cumple");
    expect(res("vigente_a_fecha", {fechaVencimiento: "2026-10-25"}, ctx))
        .toBe("no_cumple");
    expect(res("vigente_a_fecha", {fechaVencimiento: "2026-11-10"}, ctx,
        {diasMargen: 30})).toBe("no_cumple");
    expect(res("vigente_a_fecha", {fechaVencimiento: "31/02/2026"}, ctx))
        .toBe("no_determinable");
  });

  it("vigente_hasta_fin_proyecto", () => {
    expect(res("vigente_hasta_fin_proyecto", {fechaVencimiento: "2027-03-01"},
        {fechaTerminoProyecto: "2027-02-28"})).toBe("cumple");
    expect(res("vigente_hasta_fin_proyecto", {fechaVencimiento: "2027-01-01"},
        {fechaTerminoProyecto: "2027-02-28"})).toBe("no_cumple");
    expect(res("vigente_hasta_fin_proyecto", {fechaVencimiento: "2027-01-01"},
        {})).toBe("no_determinable");
  });

  it("antiguedad_maxima", () => {
    expect(res("antiguedad_maxima", {fechaEmision: "2026-10-01"}, ctx,
        {diasMaximos: 30})).toBe("cumple");
    expect(res("antiguedad_maxima", {fechaEmision: "2026-08-01"}, ctx,
        {diasMaximos: 30})).toBe("no_cumple");
  });
});

describe("otras verificaciones", () => {
  it("campo_presente: la ausencia es lo que se verifica", () => {
    expect(res("campo_presente", {folio: "123"}, {}, {campo: "folio"}))
        .toBe("cumple");
    expect(res("campo_presente", {}, {}, {campo: "folio"})).toBe("no_cumple");
    expect(res("campo_presente", {}, {}, {})).toBe("no_determinable");
  });

  it("coincide_patente y coincide_empresa", () => {
    expect(res("coincide_patente", {patente: "BB-CD 12"}, {patente: "BBCD12"}))
        .toBe("cumple");
    expect(res("coincide_patente", {patente: "XYZW99"}, {patente: "BBCD12"}))
        .toBe("no_cumple");
    expect(res("coincide_empresa", {rutEmpleador: RUT_B}, {rutEmpresa: RUT_B}))
        .toBe("cumple");
    expect(res("coincide_empresa", {rutEmpleador: RUT_A}, {rutEmpresa: RUT_B}))
        .toBe("no_cumple");
  });
});

describe("validarParametros", () => {
  it("completa defaults y valida rangos y opciones", () => {
    expect(validarParametros("vigente_a_fecha", {}).valor)
        .toEqual({diasMargen: 0});
    expect(validarParametros("antiguedad_maxima", {}).ok).toBe(false);
    expect(validarParametros("antiguedad_maxima", {diasMaximos: "90"}).valor)
        .toEqual({diasMaximos: 90});
    expect(validarParametros("coincide_nombre", {tolerancia: "otra"}).ok)
        .toBe(false);
    expect(validarParametros("noexiste", {}).ok).toBe(false);
  });

  it("campo_presente exige el campo del parámetro", () => {
    expect(camposDe("campo_presente", {campo: "folio"})).toEqual(["folio"]);
    expect(camposDe("coincide_rut", {})).toEqual(["rut"]);
  });
});

describe("validarRegla", () => {
  it("determinística: verificación, entidades compatibles y parámetros", () => {
    const r = validarRegla({nombre: " RUT coincide ", tipo: "deterministica",
      verificacion: "coincide_rut", entidades: ["persona"]});
    expect(r.ok).toBe(true);
    expect(r.valor).toMatchObject({nombre: "RUT coincide",
      camposRequeridos: ["rut"], instruccionIA: null});
    expect(validarRegla({nombre: "x", tipo: "deterministica",
      verificacion: "coincide_patente", entidades: ["persona"]}).ok)
        .toBe(false);
  });

  it("interpretativa: instrucción de al menos 20 caracteres", () => {
    expect(validarRegla({nombre: "Es cédula", tipo: "interpretativa",
      instruccionIA: "Muy corta", entidades: ["persona"]}).ok).toBe(false);
    const r = validarRegla({nombre: "Es cédula", tipo: "interpretativa",
      instruccionIA: "Verifica que el documento sea una cédula chilena.",
      entidades: ["persona"], camposRequeridos: []});
    expect(r.ok).toBe(true);
    expect(r.valor.verificacion).toBeNull();
  });
});

describe("tipos documentales", () => {
  it("sin entidades ni campos se leen los base (persona)", () => {
    const t = conDefaults({codigo: "CEDULA_CL", estado: "activo"});
    expect(t.entidades).toEqual(["persona"]);
    expect(t.campos.map((c) => c.clave)).toContain("fechaVencimiento");
    expect(conDefaults({codigo: "OTRO_TIPO"}).entidades).toEqual(["persona"]);
  });

  it("disponible solo si activo, piloto/activo y de la entidad", () => {
    const base = {codigo: "CEDULA_CL", estado: "activo", estadoIA: "piloto"};
    expect(disponibleParaIA(base, "persona")).toBe(true);
    expect(disponibleParaIA(base, "recurso")).toBe(false);
    expect(disponibleParaIA({...base, estadoIA: "no_normalizado"})).toBe(false);
    expect(disponibleParaIA({...base, estado: "inactivo"})).toBe(false);
  });

  it("valida entidades y campos", () => {
    expect(validarEntidades(["persona", "maquinaria"]).ok).toBe(false);
    expect(validarCampos([{clave: "rut", etiqueta: "RUT", tipo: "rut"},
      {clave: "rut", etiqueta: "Otro", tipo: "texto"}]).ok).toBe(false);
    expect(validarCampos([{clave: "1x", etiqueta: "X", tipo: "texto"}]).ok)
        .toBe(false);
  });
});
