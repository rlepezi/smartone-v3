import { normalizarNombreMapeo } from "./normalizacionMapeo.js";
import { rutsEnTexto } from "./rutEnTexto.js";

// Nueva Empresa desde su carpeta: datos que se PROPONEN (el usuario siempre los revisa y confirma).
// Funciones PURAS, sin IA ni costo:
//  - nombre de fantasía desde el nombre de la carpeta;
//  - documento abierto por defecto y documentos a revisar;
//  - RUT de persona jurídica más frecuente y razón social cercana a ese RUT, desde el texto
//    extraíble de los documentos.

// Separadores de proyecto en el nombre de la carpeta: el nombre propuesto llega hasta el primero.
export const SEPARADORES_PROYECTO = ["_Proyecto", " (Proyectos", " - Proyecto", " Proyecto"];
// Palabras del nombre de un archivo que lo hacen preferible para ver los datos de la empresa.
export const PALABRAS_DOCUMENTO_EMPRESA = ["rut", "e rut", "sii", "inicio actividades", "escritura", "constitucion",
  "mutualidad", "certificado", "f30"];
// Sufijos societarios de una razón social.
const RE_SUFIJO_SOCIETARIO = /(?:\bS\.?\s?A\.?|\bSpA|\bLtda\.?|\bLimitada|\bE\.?I\.?R\.?L\.?|\bSociedad An[oó]nima)\s*$/i;
// Cuerpo mínimo de un RUT de persona jurídica (los de personas naturales suelen estar por debajo).
export const CUERPO_MIN_JURIDICO = 50000000;
export const MAX_DOCUMENTOS_ANALIZAR = 5;
// Formatos con texto que se revisan (PDF con texto, Word y planillas).
const REVISABLES = ["pdf", "docx", "xlsx", "xlsm", "xls", "csv"];
// Subcarpetas de primer nivel que se revisan: las de palabra clave y el cronograma (suele traer el
// nombre y el RUT de la empresa en sus celdas).
const PALABRAS_CARPETA = [...PALABRAS_DOCUMENTO_EMPRESA, "cronograma"];

// Prefijo de orden de una carpeta ("1. ", "21. ", "17.", "01 - "), conservando mayúsculas y tildes.
// A diferencia del mapeo, NO quita una letra tras el número ("17.B-BOSCH" → "B-BOSCH").
const RE_PREFIJO_ORDEN = /^\s*\d+(?:[.,]\d+)*\s*[.\-_)–]*\s*[-–]?\s*/;

const claveTexto = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/[^a-z0-9]+/g, " ").trim();

// Nombre de fantasía propuesto desde el nombre de la carpeta: sin prefijo de orden y hasta el
// primer separador de proyecto.
export const nombreDesdeCarpeta = (nombreCarpeta) => {
  let s = String(nombreCarpeta || "").replace(RE_PREFIJO_ORDEN, "");
  const minus = s.toLowerCase();
  const cortes = SEPARADORES_PROYECTO.map((sep) => minus.indexOf(sep.toLowerCase())).filter((i) => i > 0);
  if (cortes.length) s = s.slice(0, Math.min(...cortes));
  return s.replace(/[\s_\-–.,]+$/, "").trim();
};

const extension = (nombre) => (String(nombre).includes(".") ? String(nombre).split(".").pop().toLowerCase() : "");
const conPalabraClave = (nombre) => {
  const n = ` ${normalizarNombreMapeo(nombre, { archivo: true })} `;
  return PALABRAS_DOCUMENTO_EMPRESA.some((p) => n.includes(` ${p} `));
};

// Documento abierto por defecto entre los archivos de la raíz de la carpeta: el primero cuyo nombre
// tiene una palabra clave; si ninguno, el primer PDF. null si no hay.
export const documentoPreferido = (archivos) => (archivos || []).find((a) => conPalabraClave(a.nombre))
  || (archivos || []).find((a) => extension(a.nombre) === "pdf") || null;

// Subcarpetas de primer nivel cuyo nombre tiene una palabra clave (p. ej. "03. Certificado de
// Mutualidad"): sus archivos también se consideran (muchas carpetas no tienen archivos en la raíz).
export const carpetasConPalabraClave = (carpetas) => (carpetas || []).filter((c) => {
  const n = ` ${normalizarNombreMapeo(c.nombre)} `;
  return PALABRAS_CARPETA.some((p) => n.includes(` ${p} `));
});

// Documentos a revisar (máximo 5): los de palabra clave y luego los PDF, Word y planillas.
export const documentosParaAnalizar = (archivos) => {
  const lista = archivos || [];
  const revisables = (a) => REVISABLES.includes(extension(a.nombre));
  const salida = [...lista.filter((a) => revisables(a) && conPalabraClave(a.nombre)), ...lista.filter(revisables)];
  return [...new Map(salida.map((a) => [a.ruta || a.nombre, a])).values()].slice(0, MAX_DOCUMENTOS_ANALIZAR);
};

const cuerpoRut = (rut) => Number(String(rut).replace(/[^\dkK]/g, "").slice(0, -1)) || 0;

// RUT válidos (DV módulo 11) de los textos con cuántas veces aparecen y si son de persona jurídica,
// ordenados por frecuencia. textos: [{ texto, documento }].
export const rutsCandidatos = (textos) => {
  const porRut = new Map();
  (textos || []).forEach(({ texto, documento }) => rutsEnTexto(texto).forEach(({ rut }) => {
    const c = porRut.get(rut) || { rut, veces: 0, juridico: cuerpoRut(rut) >= CUERPO_MIN_JURIDICO, documentos: [] };
    c.veces += 1;
    if (documento && !c.documentos.includes(documento)) c.documentos.push(documento);
    porRut.set(rut, c);
  }));
  return [...porRut.values()].sort((a, b) => b.veces - a.veces || Number(b.juridico) - Number(a.juridico));
};

// RUT propuesto: el de persona jurídica más frecuente; con empate o sin ninguno jurídico, null.
export const propuestaRut = (candidatos) => {
  const juridicos = (candidatos || []).filter((c) => c.juridico);
  if (!juridicos.length) return null;
  const max = juridicos[0].veces;
  const top = juridicos.filter((c) => c.veces === max);
  return top.length === 1 ? top[0] : null;
};

// Líneas que terminan en un sufijo societario (candidatas a razón social).
export const razonesSocialesCandidatas = (texto) => [...new Set(String(texto || "").split(/\r?\n/)
  .map((l) => l.replace(/\s+/g, " ").trim())
  .filter((l) => l.length >= 4 && l.length <= 150 && RE_SUFIJO_SOCIETARIO.test(l))
  // Sin el rótulo previo ("Razón social: X S.A." → "X S.A.").
  .map((l) => l.replace(/^.*?(?:raz[oó]n social|nombre|contribuyente|empresa|empleador)\s*[:-]\s*/i, "").trim()))];

// Razón social propuesta: la candidata en la misma línea que el RUT propuesto o en una adyacente y
// que contiene el nombre de fantasía. Si no hay exactamente una, null.
export const propuestaRazonSocial = ({ textos, rut, nombreFantasia }) => {
  if (!rut) return null;
  const tokensRut = [rut, rut.replace(/\./g, ""), rut.replace(/[.-]/g, "")];
  const nombre = claveTexto(nombreFantasia);
  const encontradas = new Map();
  (textos || []).forEach(({ texto, documento }) => {
    const lineas = String(texto || "").split(/\r?\n/);
    lineas.forEach((linea, i) => {
      if (!tokensRut.some((t) => linea.replace(/\s/g, "").includes(t))) return;
      [i - 1, i, i + 1].filter((j) => j >= 0 && j < lineas.length).forEach((j) => {
        razonesSocialesCandidatas(lineas[j]).forEach((r) => {
          const limpia = r.replace(tokensRut[0], "").replace(/\s+/g, " ").trim();
          if (!nombre || ` ${claveTexto(limpia)} `.includes(` ${nombre} `)) {
            encontradas.set(claveTexto(limpia), { razonSocial: limpia, documento });
          }
        });
      });
    });
  });
  return encontradas.size === 1 ? [...encontradas.values()][0] : null;
};

// Carpetas de empresa LIBRES de una empresa para una acreditación: sin expediente y sin proyecto o
// del mismo proyecto. carpetas: listado de carpetaEmpresaService.listar.
export const carpetasLibresDeEmpresa = (carpetas, empresaId, proyectoId = null) => (carpetas || [])
  .filter((c) => c.empresaId === empresaId && c.estado !== "inactiva" && !c.expedienteId
    && (!c.proyectoId || (proyectoId && c.proyectoId === proyectoId)));
