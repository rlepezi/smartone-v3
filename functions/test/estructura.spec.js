// Plantilla de estructura de carpetas (Revisiones IA). Solo datos
// SINTÉTICOS: nombres, RUN y MRZ inventados.
const {
  quitarPrefijoNumerico, extraerNombreEmpresa, calzarSecciones,
  calzarDocumentos, extraerFechaDeNombre,
} = require("../src/utils/estructuraCalce");
const {
  detectarEmpresas, analizarArbol,
} = require("../src/utils/estructuraPlan");
const {validarPlantilla} = require("../src/utils/plantillaEstructura");
const {
  reglasCedula, digitoControlMrz,
} = require("../src/services/reglasService");
const PLANTILLA =
    require("../config/plantillas/transemel-carpeta-arranque-v1.json");
const {repositorio, empresaA, carpeta} = require("./fixtures/arbolSintetico");

const secciones = PLANTILLA.secciones;
const trabajadores = secciones.find((s) => s.clave === "trabajadores");
const TIPOS_IA = new Set(["CEDULA_CL", "LICENCIA_CL"]);
const archivos = (...nombres) => nombres.map((nombre) => ({nombre}));

describe("prefijo numérico y nombre de empresa", () => {
  test.each([
    ["1. TECNORED", "1", "TECNORED"],
    ["17.B-BOSCH_Proyecto_Linea_1x220_Charrua", "17.B",
      "BOSCH_Proyecto_Linea_1x220_Charrua"],
    ["21. SLV (Proyectos 2024)", "21", "SLV (Proyectos 2024)"],
    ["02. Carpeta de trabajadores", "02", "Carpeta de trabajadores"],
    ["1.- CONTRATO DE TRABAJO_Juan Perez", "1",
      "CONTRATO DE TRABAJO_Juan Perez"],
    ["8.-PSICOSENSOTECNICO Juan Perez", "8", "PSICOSENSOTECNICO Juan Perez"],
    ["4x4 curso", null, "4x4 curso"],
  ])("%s", (nombre, numero, resto) => {
    expect(quitarPrefijoNumerico(nombre)).toEqual({numero, resto});
  });

  test("nombre de empresa y proyecto", () => {
    expect(extraerNombreEmpresa("1. TECNORED"))
        .toEqual({nombreEmpresa: "TECNORED", textoProyecto: null});
    expect(extraerNombreEmpresa("17.B-BOSCH_Proyecto_Linea_1x220_Charrua"))
        .toEqual({nombreEmpresa: "BOSCH",
          textoProyecto: "Proyecto Linea 1x220 Charrua"});
    expect(extraerNombreEmpresa("21. SLV (Proyectos 2024)"))
        .toEqual({nombreEmpresa: "SLV", textoProyecto: "Proyectos 2024"});
  });
});

describe("detección de la raíz", () => {
  test("repositorio con 3 empresas numeradas (no son secciones)", () => {
    const r = detectarEmpresas(repositorio, secciones);
    expect(r.tipo).toBe("repositorio");
    expect(r.empresas.map((e) => e.nombre)).toEqual([
      "1. ALFA", "17.B-BETA_Proyecto_Linea_1x220_Norte",
      "21. GAMA (Proyectos 2024)",
    ]);
  });
  test("carpeta de empresa directa", () => {
    expect(detectarEmpresas(empresaA, secciones).tipo).toBe("empresa");
  });
  test("estructura no reconocida", () => {
    const raiz = carpeta("Otra cosa", [carpeta("Otra cosa/Fotos"),
      carpeta("Otra cosa/Varios")]);
    expect(detectarEmpresas(raiz, secciones)).toEqual({tipo: null,
      empresas: []});
  });
});

describe("calzarSecciones", () => {
  test("la misma sección con números distintos", () => {
    const a = calzarSecciones(archivos("03. Certificado de Mutualidad"),
        secciones);
    const b = calzarSecciones(archivos("04. Certificados Mutualidad"),
        secciones);
    expect(a[0].seccionClave).toBe("mutualidad");
    expect(b[0].seccionClave).toBe("mutualidad");
  });
  test("MIPER y Matriz IPER", () => {
    expect(calzarSecciones(archivos("09. MIPER (Matriz de Riesgos)"),
        secciones)[0].seccionClave).toBe("matriz_riesgos");
    expect(calzarSecciones(archivos("09. Matriz IPER"), secciones)[0]
        .seccionClave).toBe("matriz_riesgos");
  });
  test("carpeta sin calce", () => {
    expect(calzarSecciones(archivos("99. Fotos del asado"), secciones)[0]
        .seccionClave).toBeNull();
  });
  test("corrección manual", () => {
    expect(calzarSecciones(archivos("99. Fotos"), secciones,
        {"99. Fotos": "epp"})[0]).toMatchObject({seccionClave: "epp",
      metodo: "manual"});
  });
});

describe("calzarDocumentos", () => {
  const r = calzarDocumentos(archivos(
      "1.- ANEXO CONTRATO DE TRABAJO_Juan Perez.pdf",
      "1.- CONTRATO DE TRABAJO_Juan Perez.pdf",
      "2.- C.I. Juan Perez 31-12-2031.pdf",
      "5.- ODI Juan Perez 29-06-2022.pdf",
      "5.- ODI Juan Perez 2024.pdf",
      "5.- ODI_Juan Perez.pdf",
      "6.- RHIOS Juan Perez.pdf",
      "12.-Certificado de competencia laboral Juan Perez.pdf",
      "12.-CERTIFICADO DE TITULO Juan Perez.pdf",
      "foto sin nombre.pdf",
  ), trabajadores.documentos);
  const nombres = (clave) => (r.porDocumento[clave] || []).map((a) => a.nombre);

  test("contrato contra anexo (excluir)", () => {
    expect(nombres("contrato"))
        .toEqual(["1.- CONTRATO DE TRABAJO_Juan Perez.pdf"]);
    expect(nombres("anexo_contrato"))
        .toEqual(["1.- ANEXO CONTRATO DE TRABAJO_Juan Perez.pdf"]);
  });
  test("C.I. es la cédula y RHIOS es el RIOHS", () => {
    expect(nombres("cedula")).toHaveLength(1);
    expect(nombres("riohs")).toHaveLength(1);
  });
  test("tres ODI con múltiple, sin advertencia", () => {
    expect(nombres("odi")).toHaveLength(3);
    expect(r.advertencias).toEqual([]);
  });
  test("dos archivos 12.- a documentos distintos", () => {
    expect(nombres("competencias")).toHaveLength(1);
    expect(nombres("titulo")).toHaveLength(1);
  });
  test("archivo no reconocido", () => {
    expect(r.noReconocidos.map((a) => a.nombre))
        .toEqual(["foto sin nombre.pdf"]);
  });
  test("varios archivos para un documento único", () => {
    const x = calzarDocumentos(archivos("C.I. a.pdf", "C.I. b.pdf"),
        trabajadores.documentos);
    expect(x.advertencias).toHaveLength(1);
  });
});

describe("plan de revisión", () => {
  const plan = analizarArbol(repositorio, PLANTILLA, {tiposIA: TIPOS_IA});
  const alfa = plan.empresas[0];

  test("los sensibles nunca van a la IA", () => {
    const enIA = plan.empresas.flatMap((e) => e.archivosIA)
        .map((a) => a.documentoClave);
    ["antecedentes", "examen_ocupacional", "psicosensotecnico",
      "examen_drogas", "psicosensometrico"].forEach((clave) => {
      expect(enIA).not.toContain(clave);
    });
    expect(alfa.archivosExcluidosIA.filter((a) =>
      a.motivo === "datos_sensibles")).toHaveLength(4);
  });
  test("solo cédula y licencia (tipos normalizados) van a la IA", () => {
    expect(alfa.archivosIA.map((a) => a.tipoDocumentalCodigo).sort())
        .toEqual(["CEDULA_CL", "LICENCIA_CL"]);
    expect(alfa.archivosIA.find((a) => a.documentoClave === "cedula")
        .fechaEnNombreArchivo).toBe("2031-12-31");
  });
  test("la misma persona en trabajadores y conductores se consolida", () => {
    const claves = new Set(alfa.entidades.map((e) => e.entidadClave));
    expect(alfa.entidades).toHaveLength(2);
    expect(claves.size).toBe(1);
    expect(new Set(alfa.archivosIA.map((a) => a.entidadClave)).size).toBe(1);
  });
  test("completitud: no reconocida, faltante y no aplica", () => {
    const estado = (clave) => alfa.secciones.find((s) =>
      s.seccionClave === clave && !s.entidadCarpeta)?.estado;
    expect(alfa.secciones.find((s) =>
      s.seccionCarpeta === "99. Fotos del asado").estado)
        .toBe("no_reconocida");
    expect(estado("procedimientos")).toBe("faltante");
    expect(estado("epp")).toBe("no_aplica");
    expect(estado("mutualidad")).toBe("completo");
  });
});

describe("extraerFechaDeNombre", () => {
  test.each([
    ["C.I. x 31-12-2031.pdf", "2031-12-31"],
    ["ODI x 29-06-2022.pdf", "2022-06-29"],
    ["ODI x 2024.pdf", "2024"],
    ["ODI x.pdf", null],
  ])("%s", (nombre, esperado) => {
    expect(extraerFechaDeNombre(nombre)).toBe(esperado);
  });
});

describe("plantilla Transemel v1", () => {
  test("es válida", () => {
    const p = validarPlantilla(PLANTILLA);
    expect(p.secciones.find((s) => s.clave === "trabajadores").documentos
        .find((d) => d.clave === "cedula").tipoDocumentalCodigo)
        .toBe("CEDULA_CL");
  });
  test("rechaza claves repetidas", () => {
    expect(() => validarPlantilla({...PLANTILLA,
      secciones: [secciones[0], secciones[0]]})).toThrow(/repetida/);
  });
});

describe("CI-05: RUN en la MRZ", () => {
  // MRZ TD1 sintética con dígitos de control válidos y el RUN en los datos
  // opcionales de la línea 2.
  const relleno = (s, n) => (s + "<".repeat(n)).slice(0, n);
  const mrz = (run) => {
    const doc = "123456789";
    const l1 = relleno(`INCHL${doc}${digitoControlMrz(doc)}`, 30);
    let l2 = `900101${digitoControlMrz("900101")}M301231` +
        `${digitoControlMrz("301231")}CHL${relleno(run, 11)}`;
    l2 += digitoControlMrz(l1.slice(5, 30) + l2.slice(0, 7) +
        l2.slice(8, 15) + l2.slice(18, 29));
    return [l1, l2, relleno("PEREZ<<JUAN", 30)];
  };
  const datos = (mrzLineas, run = "12.345.678-5") => ({
    run, nombres: "JUAN", apellidos: "PEREZ", fechaNacimiento: "1990-01-01",
    legibilidad: 0.9, ladosPresentes: ["ambos"],
    cedula: {fechaVencimiento: "2030-12-31", numeroDocumento: "123.456.789",
      mrz: mrzLineas},
  });
  const ci05 = (d) => reglasCedula({datos: d, persona: null,
    hoy: "2026-10-20"}).find((r) => r.regla === "CI-05");

  test("RUN de la MRZ igual al del anverso: cumple", () => {
    expect(ci05(datos(mrz("12345678<5"))).resultado).toBe("cumple");
  });
  test("RUN distinto: no cumple", () => {
    expect(ci05(datos(mrz("12345678<5"), "9.876.543-3")).resultado)
        .toBe("no_cumple");
  });
  test("MRZ alterada: revisión", () => {
    const alterada = mrz("12345678<5");
    alterada[0] = alterada[0].replace("12345", "12346");
    expect(ci05(datos(alterada)).resultado).toBe("revision");
  });
  test("un solo archivo con lado ambos cumple CI-06", () => {
    const r = reglasCedula({datos: datos(mrz("12345678<5")), persona: null,
      hoy: "2026-10-20"}).find((x) => x.regla === "CI-06");
    expect(r.resultado).toBe("cumple");
  });
  test("CI-07 informativa si la fecha del nombre no coincide", () => {
    const r = reglasCedula({datos: datos(mrz("12345678<5")), persona: null,
      hoy: "2026-10-20", fechasEnNombre: ["2031-12-31"]});
    expect(r.find((x) => x.regla === "CI-07").resultado).toBe("informativa");
    const igual = reglasCedula({datos: datos(mrz("12345678<5")),
      persona: null, hoy: "2026-10-20", fechasEnNombre: ["2030-12-31"]});
    expect(igual.find((x) => x.regla === "CI-07")).toBeUndefined();
  });
});
