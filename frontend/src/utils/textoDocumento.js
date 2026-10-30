// Texto extraíble de un documento, en el navegador (sin IA ni costo): PDF con pdf.js, .docx con
// docx-preview y planillas (.xlsx, .xlsm, .xls, .csv) con utils/planillas, todo con import dinámico (no
// pesan en la carga inicial). Un PDF escaneado no trae
// texto: se informa sin texto (para leerlo está el botón de IA). Devuelve el texto por líneas.

import { textoPlanilla } from "./planillas.js";

const PLANILLAS = ["xlsx", "xlsm", "xls", "csv"];
const extension = (nombre) => (String(nombre).includes(".") ? String(nombre).split(".").pop().toLowerCase() : "");
const MAX_PAGINAS = 30;

let pdfjsCargado = null;
// pdf.js con su worker como recurso de Vite (URL propia del build).
const cargarPdfjs = () => {
  pdfjsCargado = pdfjsCargado || Promise.all([
    import("pdfjs-dist"),
    import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
  ]).then(([pdfjs, worker]) => {
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    return pdfjs;
  });
  return pdfjsCargado;
};

// Líneas de una página: agrupa los fragmentos por su posición vertical, de arriba hacia abajo.
const lineasDePagina = (items) => {
  const filas = new Map();
  items.filter((it) => typeof it.str === "string").forEach((it) => {
    const y = Math.round(it.transform?.[5] ?? 0);
    const clave = [...filas.keys()].find((k) => Math.abs(k - y) <= 2) ?? y;
    filas.set(clave, [...(filas.get(clave) || []), { x: it.transform?.[4] ?? 0, s: it.str }]);
  });
  return [...filas.entries()].sort((a, b) => b[0] - a[0])
    .map(([, partes]) => partes.sort((a, b) => a.x - b.x).map((p) => p.s).join(" ").replace(/\s+/g, " ").trim())
    .filter(Boolean);
};

const textoPdf = async (archivo) => {
  const pdfjs = await cargarPdfjs();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await archivo.arrayBuffer()) }).promise;
  const lineas = [];
  for (let n = 1; n <= Math.min(doc.numPages, MAX_PAGINAS); n++) {
    const pagina = await doc.getPage(n);
    lineas.push(...lineasDePagina((await pagina.getTextContent()).items));
  }
  await doc.destroy();
  return { lineas, paginas: doc.numPages };
};

const textoDocx = async (archivo) => {
  const { renderAsync } = await import("docx-preview");
  const contenedor = document.createElement("div");
  await renderAsync(archivo, contenedor, contenedor, { inWrapper: false, breakPages: false });
  const lineas = [...contenedor.querySelectorAll("p, tr")]
    .map((el) => (el.tagName === "TR" ? [...el.children].map((c) => c.textContent.trim()).join(" ") : el.textContent))
    .map((t) => t.replace(/\s+/g, " ").trim()).filter(Boolean);
  return { lineas, paginas: null };
};

// { texto, lineas, conTexto, paginas } de un File. Formatos sin texto (imágenes) o con error: sin texto.
export const extraerTextoDocumento = async (archivo) => {
  const ext = extension(archivo?.name);
  try {
    const r = ext === "pdf" ? await textoPdf(archivo) : ext === "docx" ? await textoDocx(archivo)
      : PLANILLAS.includes(ext) ? { lineas: await textoPlanilla(archivo), paginas: null } : { lineas: [], paginas: null };
    const texto = r.lineas.join("\n");
    return { texto, lineas: r.lineas, conTexto: texto.replace(/\s/g, "").length >= 20, paginas: r.paginas };
  } catch {
    return { texto: "", lineas: [], conTexto: false, paginas: null };
  }
};
