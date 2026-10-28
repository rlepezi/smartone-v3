// Estado del Expediente derivado del avance de la evaluación (datos
// sintéticos; sin Firestore).
jest.mock("firebase-admin", () => ({firestore: () => ({})}));
jest.mock("firebase-admin/firestore", () => ({
  FieldValue: {serverTimestamp: () => "TS"},
}));
[
  "../src/repositories/expedienteRepository",
  "../src/repositories/participacionRepository",
  "../src/services/requerimientoCalculoService",
  "../src/services/expedienteRequerimientoService",
  "../src/repositories/usuarioRepository",
  "../src/repositories/participacionPersonaRepository",
  "../src/repositories/participacionRecursoRepository",
  "../src/repositories/requerimientoRepository",
  "../src/repositories/expedienteEstadoRepository",
  "../src/repositories/proyectoRepository",
  "../src/utils/bitacoraLogger",
  "../src/services/bitacoraService",
].forEach((m) => jest.mock(m, () => ({})));

const servicio = require("../src/services/expedienteService");

const resumen = (activas, cumple = 0, noCumple = 0, noAplica = 0) =>
  ({activas, cumple, noCumple, noAplica, pendiente: activas - cumple -
    noCumple - noAplica});
const estado = (r, fueCompletado) =>
  servicio.calcularEstadoDerivado(r, {fueCompletado}).estado;

describe("calcularEstadoDerivado", () => {
  it("creado sin nada evaluado (o sin requisitos)", () => {
    expect(estado(resumen(5))).toBe("creado");
    expect(estado(resumen(0))).toBe("creado");
    expect(estado(null)).toBe("creado");
  });

  it("en ejecución con evaluados y pendientes", () => {
    expect(estado(resumen(5, 2))).toBe("en_ejecucion");
    expect(estado(resumen(5, 0, 1))).toBe("en_ejecucion");
  });

  it("completado con todo evaluado, cumpla o no", () => {
    expect(estado(resumen(5, 5))).toBe("completado");
    expect(estado(resumen(5, 3, 1, 1))).toBe("completado");
    expect(estado(resumen(5, 0, 5))).toBe("completado");
  });

  it("completado con pendientes si ya estuvo completado y falta algo", () => {
    expect(estado(resumen(6, 5), true)).toBe("completado_pendientes");
    expect(estado(resumen(6, 0), true)).toBe("completado_pendientes");
    expect(estado(resumen(6, 6), true)).toBe("completado");
  });
});

describe("_derivar", () => {
  it("fija fechaCompletado solo la primera vez", () => {
    expect(servicio._derivar({resumen: resumen(2, 2)}))
        .toEqual({estado: "completado", extra: {fechaCompletado: "TS"}});
    expect(servicio._derivar({resumen: resumen(2, 2), fechaCompletado: "x"}))
        .toEqual({estado: "completado", extra: {}});
    expect(servicio._derivar({resumen: resumen(3, 2), fechaCompletado: "x"}))
        .toEqual({estado: "completado_pendientes", extra: {}});
  });
});
