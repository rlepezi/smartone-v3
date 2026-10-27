const {
  validarRun, normalizarRun, extraerRunDeNombreCarpeta, coincideNombre,
  validarMrzTd1, evaluarVigencia, calcularPropuesta, reglaClases,
  reglasCedula, reglasLicencia,
} = require("../src/services/reglasService");

// Ejemplo TD1 de la norma ICAO 9303 (parte 5), con dígitos de control
// correctos.
const MRZ_VALIDA = [
  "I<UTOD231458907<<<<<<<<<<<<<<<",
  "7408122F1204159UTO<<<<<<<<<<<6",
  "ERIKSSON<<ANNA<MARIA<<<<<<<<<<",
];

describe("validarRun", () => {
  test.each([
    "12345678-5", "12.345.678-5", "123456785", "9876543-3",
    "10000013-K", "10000013-k", "10.000.013-K", "10000004-0",
  ])("válido: %s", (run) => expect(validarRun(run)).toBe(true));

  test.each([
    "12345678-4", "12.345.678-K", "10000013-1", "abc", "", null, "1-9",
  ])("inválido: %s", (run) => expect(validarRun(run)).toBe(false));
});

describe("normalizarRun", () => {
  test("quita puntos y deja el DV en mayúscula", () => {
    expect(normalizarRun("10.000.013-k")).toBe("10000013-K");
    expect(normalizarRun("123456785")).toBe("12345678-5");
    expect(normalizarRun("hola")).toBeNull();
  });
});

describe("extraerRunDeNombreCarpeta", () => {
  test("RUT solo", () => {
    expect(extraerRunDeNombreCarpeta("12345678-5")).toBe("12345678-5");
  });
  test("RUT con puntos y nombre", () => {
    expect(extraerRunDeNombreCarpeta("12.345.678-5 Juan Pérez"))
        .toBe("12345678-5");
  });
  test("RUT de 7 dígitos con nombre", () => {
    expect(extraerRunDeNombreCarpeta("9876543-3 Juan Pérez"))
        .toBe("9876543-3");
  });
  test("sin RUT devuelve null", () => {
    expect(extraerRunDeNombreCarpeta("Juan Pérez")).toBeNull();
  });
});

describe("coincideNombre", () => {
  test("con y sin tildes", () => {
    expect(coincideNombre("José Pérez", "JOSE PEREZ")).toBe(true);
  });
  test("orden distinto", () => {
    expect(coincideNombre("Pérez José", "José Pérez")).toBe(true);
  });
  test("segundo nombre faltante", () => {
    expect(coincideNombre("José Pérez González",
        "José Andrés Pérez González")).toBe(true);
  });
  test("diferencia menor por Levenshtein", () => {
    expect(coincideNombre("Jose Perez Gonzalez", "Jose Peres Gonzalez"))
        .toBe(true);
  });
  test("nombres distintos", () => {
    expect(coincideNombre("Ana Soto", "Pedro Rojas")).toBe(false);
  });
});

describe("validarMrzTd1", () => {
  test("MRZ válida", () => {
    const r = validarMrzTd1(MRZ_VALIDA);
    expect(r.valida).toBe(true);
    expect(r.compuesto).toBe(true);
    expect(r.datos.fechaNacimiento).toBe("1974-08-12");
    expect(r.datos.fechaVencimiento).toBe("2012-04-15");
  });
  test("MRZ alterada (número de documento)", () => {
    const alterada = [MRZ_VALIDA[0].replace("D2314", "D2315"),
      MRZ_VALIDA[1], MRZ_VALIDA[2]];
    const r = validarMrzTd1(alterada);
    expect(r.documento).toBe(false);
    expect(r.valida).toBe(false);
  });
  test("solo el dígito compuesto alterado sigue siendo válida", () => {
    const alterada = [MRZ_VALIDA[0], MRZ_VALIDA[1].slice(0, 29) + "1",
      MRZ_VALIDA[2]];
    const r = validarMrzTd1(alterada);
    expect(r.valida).toBe(true);
    expect(r.compuesto).toBe(false);
  });
  test("formato inválido", () => {
    expect(validarMrzTd1(["ABC"]).formatoValido).toBe(false);
  });
});

describe("evaluarVigencia", () => {
  test("vencido", () => {
    expect(evaluarVigencia("2026-10-01", "2026-10-19", 30)).toBe("vencido");
  });
  test("por vencer dentro de los días de alerta", () => {
    expect(evaluarVigencia("2026-11-10", "2026-10-19", 30))
        .toBe("por_vencer");
  });
  test("vigente", () => {
    expect(evaluarVigencia("2027-10-19", "2026-10-19", 30)).toBe("vigente");
  });
  test("sin fecha", () => {
    expect(evaluarVigencia(null, "2026-10-19")).toBeNull();
  });
});

describe("calcularPropuesta", () => {
  const r = (resultado) => ({regla: "X", resultado});
  test("algún no_cumple manda", () => {
    expect(calcularPropuesta([r("cumple"), r("revision"), r("no_cumple")]))
        .toBe("no_cumple");
  });
  test("revision sin no_cumple", () => {
    expect(calcularPropuesta([r("cumple"), r("revision")]))
        .toBe("revision_humana");
  });
  test("cumple con informativas y no_aplica", () => {
    expect(calcularPropuesta([r("cumple"), r("informativa"), r("no_aplica")]))
        .toBe("cumple");
  });
});

describe("LC-04 clases", () => {
  test("calzan", () => {
    expect(reglaClases(["B", "D"], ["D"]).resultado).toBe("cumple");
  });
  test("no calzan", () => {
    expect(reglaClases(["B"], ["D", "A2"]).resultado).toBe("no_cumple");
  });
  test("sin configuración", () => {
    expect(reglaClases(["B"], null).resultado).toBe("no_aplica");
    expect(reglaClases(["B"], []).resultado).toBe("no_aplica");
  });
});

describe("reglas por tipo", () => {
  const persona = {run: "12345678-5", nombre: "Juan Pérez Soto"};
  test("cédula completa cumple", () => {
    const reglas = reglasCedula({
      datos: {
        run: "12.345.678-5", nombres: "JUAN", apellidos: "PÉREZ SOTO",
        fechaNacimiento: null, legibilidad: 0.95,
        ladosPresentes: ["anverso", "reverso"],
        cedula: {fechaVencimiento: "2030-01-01", numeroDocumento: null,
          mrz: null},
      },
      persona, hoy: "2026-10-19",
    });
    // Sin MRZ, CI-05 queda en revisión.
    expect(reglas.find((x) => x.regla === "CI-05").resultado)
        .toBe("revision");
    expect(calcularPropuesta(reglas)).toBe("revision_humana");
    expect(reglas.find((x) => x.regla === "CI-02").resultado).toBe("cumple");
  });
  test("conflicto de RUN fuerza revisión", () => {
    const reglas = reglasLicencia({
      datos: {
        run: "12345678-5", legibilidad: 0.9,
        licencia: {clases: ["B"], fechaProximoControl: "2030-01-01"},
      },
      persona, hoy: "2026-10-19", clasesAceptadas: ["B"],
      conflictos: [{campo: "run", valores: ["12345678-5", "9876543-3"]}],
    });
    expect(reglas.find((x) => x.regla === "LC-01").resultado)
        .toBe("revision");
    expect(reglas.find((x) => x.regla === "LC-05").resultado)
        .toBe("informativa");
  });
  test("licencia vencida no cumple", () => {
    const reglas = reglasLicencia({
      datos: {
        run: "12345678-5", legibilidad: 0.9,
        licencia: {clases: ["B"], fechaProximoControl: "2025-01-01"},
      },
      persona, hoy: "2026-10-19",
    });
    expect(calcularPropuesta(reglas)).toBe("no_cumple");
  });
});
