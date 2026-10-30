// Imágenes incrustadas en un Word (.docx), leídas en el navegador. Un .docx es un ZIP; las fotos o
// escaneos pegados en el documento quedan en word/media/. Se lee el directorio central del ZIP y
// se descomprime cada imagen con DecompressionStream ("deflate-raw"), sin dependencias externas.
// Solo se toman formatos que el navegador puede dibujar (no EMF/WMF).

const EXTENSIONES_IMAGEN = ["png", "jpg", "jpeg", "gif", "bmp", "webp"];
const MAX_IMAGENES = 4;
const FIRMA_FIN_DIRECTORIO = 0x06054b50;
const FIRMA_DIRECTORIO = 0x02014b50;
const FIRMA_LOCAL = 0x04034b50;

const descomprimir = async (bytes, metodo) => {
  if (metodo === 0) return bytes;
  if (metodo !== 8) throw new Error("El documento Word usa una compresión no soportada.");
  const flujo = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(flujo).arrayBuffer());
};

// Entradas del ZIP: [{ nombre, metodo, tamanoComprimido, offsetLocal }].
const leerDirectorio = (vista) => {
  let fin = -1;
  for (let i = vista.byteLength - 22; i >= Math.max(0, vista.byteLength - 65557); i -= 1) {
    if (vista.getUint32(i, true) === FIRMA_FIN_DIRECTORIO) { fin = i; break; }
  }
  if (fin < 0) throw new Error("El archivo no es un documento Word (.docx) válido.");
  const total = vista.getUint16(fin + 10, true);
  let p = vista.getUint32(fin + 16, true);
  const decoder = new TextDecoder();
  const entradas = [];
  for (let i = 0; i < total; i += 1) {
    if (vista.getUint32(p, true) !== FIRMA_DIRECTORIO) break;
    const largoNombre = vista.getUint16(p + 28, true);
    entradas.push({
      metodo: vista.getUint16(p + 10, true),
      tamanoComprimido: vista.getUint32(p + 20, true),
      offsetLocal: vista.getUint32(p + 42, true),
      nombre: decoder.decode(new Uint8Array(vista.buffer, p + 46, largoNombre)),
    });
    p += 46 + largoNombre + vista.getUint16(p + 30, true) + vista.getUint16(p + 32, true);
  }
  return entradas;
};

const numeroDe = (nombre) => Number((nombre.match(/(\d+)\.[^.]+$/) || [])[1] || 0);

// → [Blob] con las imágenes del documento, en orden (image1, image2...). Error si no tiene.
export const imagenesDeDocx = async (archivo) => {
  const buffer = await archivo.arrayBuffer();
  const vista = new DataView(buffer);
  const imagenes = leerDirectorio(vista)
    .filter((e) => e.nombre.startsWith("word/media/") &&
      EXTENSIONES_IMAGEN.includes(e.nombre.split(".").pop().toLowerCase()))
    .sort((a, b) => numeroDe(a.nombre) - numeroDe(b.nombre))
    .slice(0, MAX_IMAGENES);
  if (!imagenes.length) {
    throw new Error("El documento Word no tiene imágenes que leer. Guárdelo como PDF e inténtelo de nuevo.");
  }
  return Promise.all(imagenes.map(async (e) => {
    if (vista.getUint32(e.offsetLocal, true) !== FIRMA_LOCAL) throw new Error("El documento Word está dañado.");
    const inicio = e.offsetLocal + 30 + vista.getUint16(e.offsetLocal + 26, true) + vista.getUint16(e.offsetLocal + 28, true);
    const datos = await descomprimir(new Uint8Array(buffer, inicio, e.tamanoComprimido), e.metodo);
    return new Blob([datos]);
  }));
};
