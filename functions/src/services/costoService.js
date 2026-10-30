// Costo de la extracción con IA, desde los precios por modelo de
// configuracionIA (USD por millón de tokens). Funciones puras.

// Tokens supuestos para estimar antes de procesar (ajustables acá).
const TOKENS_ENTRADA_IMAGEN = 2000;
const TOKENS_ENTRADA_POR_PAGINA_PDF = 2500;
const TOKENS_SALIDA_POR_ARCHIVO = 500;
// Un Word (.docx) se envía como una llamada por imagen incrustada; lo
// típico en una cédula es anverso y reverso.
const IMAGENES_POR_DOCX = 2;
const MIME_DOCX =
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const MILLON = 1000000;

/**
 * Precio de un modelo.
 * @param {Object} preciosPorModelo {modelo: {entrada, salida}}.
 * @param {string} modelo ID del modelo.
 * @return {?{entrada: number, salida: number}} Precio o null.
 */
function precioDe(preciosPorModelo, modelo) {
  return (preciosPorModelo || {})[modelo] || null;
}

/**
 * Indica si faltan precios para un modelo (sin modelo, sin precio, o con
 * entrada o salida no mayores que 0). Con precios faltantes no se estima ni
 * se inicia una revisión.
 * @param {Object} preciosPorModelo Precios por modelo.
 * @param {?string} modelo ID del modelo.
 * @return {boolean} true si faltan.
 */
function faltanPrecios(preciosPorModelo, modelo) {
  const precio = modelo ? precioDe(preciosPorModelo, modelo) : null;
  return !precio || !(Number(precio.entrada) > 0) ||
      !(Number(precio.salida) > 0);
}

/**
 * Costo real de una llamada.
 * @param {Object} preciosPorModelo Precios por modelo.
 * @param {string} modelo ID del modelo.
 * @param {number} tokensEntrada Tokens de entrada.
 * @param {number} tokensSalida Tokens de salida.
 * @return {number} Costo en USD (0 si el modelo no tiene precio).
 */
function calcular(preciosPorModelo, modelo, tokensEntrada, tokensSalida) {
  const precio = precioDe(preciosPorModelo, modelo);
  if (!precio) return 0;
  const costo = (tokensEntrada * precio.entrada +
      tokensSalida * precio.salida) / MILLON;
  return Math.round(costo * 1000000) / 1000000;
}

/**
 * Costo estimado de un conjunto de archivos.
 * @param {Object} preciosPorModelo Precios por modelo.
 * @param {string} modelo ID del modelo.
 * @param {Array<{mime: string, paginas: (number|undefined)}>} archivos
 *     Archivos (PDF sin `paginas` cuenta como 1 página).
 * @return {number} Costo estimado en USD.
 */
function estimar(preciosPorModelo, modelo, archivos) {
  return detalleEstimacion(preciosPorModelo, modelo, archivos)
      .costoEstimadoUsd;
}

/**
 * Detalle de la estimación: llamadas a la IA, tokens supuestos por formato,
 * precio del modelo y costo total y por archivo.
 * @param {Object} preciosPorModelo Precios por modelo.
 * @param {string} modelo Modelo.
 * @param {Array<{mime: string, paginas: (number|undefined)}>} archivos
 *     Archivos.
 * @return {Object} {modelo, precio, archivos, llamadas, porFormato,
 *     tokensEntrada, tokensSalida, costoEstimadoUsd, costoPorArchivoUsd,
 *     supuestos}.
 */
function detalleEstimacion(preciosPorModelo, modelo, archivos) {
  const lista = archivos || [];
  const porFormato = {imagen: 0, pdf: 0, docx: 0};
  let entrada = 0;
  let llamadas = 0;
  lista.forEach((a) => {
    if (a.mime === "application/pdf") {
      porFormato.pdf++;
      llamadas++;
      entrada += TOKENS_ENTRADA_POR_PAGINA_PDF *
          Math.max(Number(a.paginas) || 1, 1);
    } else if (a.mime === MIME_DOCX) {
      porFormato.docx++;
      llamadas += IMAGENES_POR_DOCX;
      entrada += TOKENS_ENTRADA_IMAGEN * IMAGENES_POR_DOCX;
    } else {
      porFormato.imagen++;
      llamadas++;
      entrada += TOKENS_ENTRADA_IMAGEN;
    }
  });
  const salida = llamadas * TOKENS_SALIDA_POR_ARCHIVO;
  const costo = calcular(preciosPorModelo, modelo, entrada, salida);
  const precio = precioDe(preciosPorModelo, modelo);
  return {
    modelo,
    precio: precio ? {entrada: Number(precio.entrada),
      salida: Number(precio.salida)} : null,
    archivos: lista.length, llamadas, porFormato,
    tokensEntrada: entrada, tokensSalida: salida,
    costoEstimadoUsd: costo,
    costoPorArchivoUsd: lista.length ?
      Math.round((costo / lista.length) * 1000000) / 1000000 : 0,
    supuestos: {tokensImagen: TOKENS_ENTRADA_IMAGEN,
      tokensPaginaPdf: TOKENS_ENTRADA_POR_PAGINA_PDF,
      tokensSalida: TOKENS_SALIDA_POR_ARCHIVO,
      imagenesPorDocx: IMAGENES_POR_DOCX},
  };
}

module.exports = {
  TOKENS_ENTRADA_IMAGEN, TOKENS_ENTRADA_POR_PAGINA_PDF,
  TOKENS_SALIDA_POR_ARCHIVO, IMAGENES_POR_DOCX, precioDe, faltanPrecios,
  calcular, estimar, detalleEstimacion,
};
