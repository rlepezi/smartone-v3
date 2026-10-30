import { validateRut, formatRutDisplay } from "./rutFormatters";

// RUT dentro de un texto libre (listados de trabajadores): misma forma que RE_RUT_CARPETA del
// backend (reglasService): con puntos o sin ellos, guion opcional, y SOLO si el dígito verificador
// es válido (módulo 11), para no confundir teléfonos u otros números.
const RE_RUT_TEXTO = /(?<![\d.])(\d{1,2}(?:\.\d{3}){2}|\d{7,8})\s?-?\s?([\dkK])(?![\dA-Za-z])/g;

// [{ inicio, fin, texto, rut: "12.345.678-9" }] en orden de aparición.
export const rutsEnTexto = (texto) => {
  const salida = [];
  const s = String(texto || "");
  for (const m of s.matchAll(RE_RUT_TEXTO)) {
    const candidato = `${m[1].replace(/\./g, "")}${m[2]}`;
    if (!validateRut(candidato)) continue;
    salida.push({ inicio: m.index, fin: m.index + m[0].length, texto: m[0], rut: formatRutDisplay(candidato) });
  }
  return salida;
};
