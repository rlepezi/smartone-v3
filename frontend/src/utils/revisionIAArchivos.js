import { EXTENSIONES_ACEPTADAS, MAX_BYTES_ARCHIVO, MIME_DOCX, prepararArchivo } from "../services/fuentes/carpetaLocal";

// Archivos para "Revisar con IA" por requerimiento: se optimizan en el navegador (imágenes
// redimensionadas, un Word aporta una pieza por imagen) y nunca se guardan.
const MAX_BYTES_TOTAL = 15 * 1024 * 1024;
const MAX_PIEZAS = 6;
const MIMES = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", pdf: "application/pdf", docx: MIME_DOCX };
const extension = (nombre) => (nombre.includes(".") ? nombre.split(".").pop().toLowerCase() : "");

export const archivoAceptadoIA = (nombre) => EXTENSIONES_ACEPTADAS.includes(extension(nombre));

// archivos: [{ file, rutaRelativa }] → piezas [{ nombre, rutaRelativa, mime, contenidoBase64, parte,
// ultimaModificacion }]. Lanza con un mensaje en español si no se pueden revisar.
export const prepararPiezasIA = async (archivos) => {
  const piezas = [];
  for (const a of archivos) {
    if (!archivoAceptadoIA(a.file.name)) throw new Error(`${a.file.name}: use PDF, JPG, PNG, WebP o Word .docx.`);
    const partes = await prepararArchivo({ archivo: a.file, mime: MIMES[extension(a.file.name)] });
    partes.forEach((p) => piezas.push({
      nombre: a.file.name, rutaRelativa: a.rutaRelativa || null, mime: p.mime, contenidoBase64: p.contenidoBase64, parte: p.parte,
      ultimaModificacion: a.file.lastModified ? new Date(a.file.lastModified).toISOString() : null,
    }));
  }
  const pesos = piezas.map((p) => Math.floor((p.contenidoBase64.length * 3) / 4));
  const grande = piezas.find((p, i) => pesos[i] > MAX_BYTES_ARCHIVO);
  if (grande) throw new Error(`${grande.nombre} supera los 10 MB aun después de optimizarlo.`);
  if (pesos.reduce((s, x) => s + x, 0) > MAX_BYTES_TOTAL) throw new Error("Los archivos suman más de 15 MB.");
  if (piezas.length > MAX_PIEZAS) throw new Error(`Máximo ${MAX_PIEZAS} imágenes por revisión (un Word aporta una por imagen).`);
  if (!piezas.length) throw new Error("El Word no trae imágenes que revisar.");
  return piezas;
};
