const {detalleEstimacion, estimar} = require("../src/services/costoService");

const DOCX =
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const precios = {"modelo-x": {entrada: 2, salida: 10}};

describe("detalleEstimacion", () => {
  const archivos = [
    {mime: "image/jpeg"},
    {mime: "application/pdf", paginas: 2},
    {mime: DOCX},
  ];
  const d = detalleEstimacion(precios, "modelo-x", archivos);

  it("cuenta llamadas por formato (Word = 2 imágenes)", () => {
    expect(d.porFormato).toEqual({imagen: 1, pdf: 1, docx: 1});
    expect(d.llamadas).toBe(4);
    expect(d.tokensEntrada).toBe(2000 + 2500 * 2 + 2000 * 2);
    expect(d.tokensSalida).toBe(4 * 500);
  });

  it("calcula el costo total y por archivo", () => {
    const esperado = (11000 * 2 + 2000 * 10) / 1000000;
    expect(d.costoEstimadoUsd).toBeCloseTo(esperado, 6);
    expect(d.costoPorArchivoUsd).toBeCloseTo(esperado / 3, 6);
    expect(estimar(precios, "modelo-x", archivos)).toBe(d.costoEstimadoUsd);
  });

  it("sin precio del modelo el costo es 0 y precio null", () => {
    const sin = detalleEstimacion({}, "otro", archivos);
    expect(sin.precio).toBeNull();
    expect(sin.costoEstimadoUsd).toBe(0);
  });
});
