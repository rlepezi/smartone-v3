// Fuente "carpeta local" de Revisiones IA: lee la carpeta elegida en el navegador SOLO con
// metadatos (ruta, nombre, tamaño, fecha) y la envía al backend, que la compara con la plantilla
// de estructura del Mandante (detección de empresas, secciones y documentos). Los archivos se leen
// recién al confirmar la revisión, y solo los que el plan marca para la IA. El backend no sabe de
// dónde vienen los archivos: más adelante SharePoint armará el mismo árbol.

import { imagenesDeDocx } from "./docxImagenes";

export const EXTENSIONES_ACEPTADAS = ["jpg", "jpeg", "png", "webp", "pdf", "docx"];
export const MIME_DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export const MAX_BYTES_ARCHIVO = 10 * 1024 * 1024;
const LADO_MAXIMO_IMAGEN = 1568;
const CALIDAD_JPEG = 0.85;

const extension = (nombre) => (nombre.includes(".") ? nombre.split(".").pop().toLowerCase() : "");
// Archivos de sistema que no se informan como omitidos.
const esOculto = (nombre) => nombre.startsWith(".") || ["thumbs.db", "desktop.ini"].includes(nombre.toLowerCase());

export const soportaSelectorCarpeta = () => typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";

export const MAX_PROFUNDIDAD = 6;

// Árbol: { nombre, ruta, carpetas: [nodo], archivos: [{ nombre, ruta, tamanoBytes,
// ultimaModificacion }] }. "ruta" es relativa a la carpeta elegida ("" para la raíz). Junto al
// árbol se devuelve un mapa ruta → File para leer después solo los archivos del plan.
const nodoVacio = (nombre, ruta) => ({ nombre, ruta, carpetas: [], archivos: [] });
const unir = (ruta, nombre) => (ruta ? `${ruta}/${nombre}` : nombre);
const metaDe = (file, ruta) => ({
  nombre: file.name, ruta, tamanoBytes: file.size,
  ultimaModificacion: file.lastModified ? new Date(file.lastModified).toISOString() : null,
});

// Mensaje en español para un error del navegador al leer una carpeta local (NotFoundError: se
// movió, se renombró o se eliminó; NotAllowedError: sin permiso).
export const mensajeErrorCarpeta = (error, nombre) => {
  if (error?.name === "NotFoundError") {
    return `No se encontró la carpeta «${nombre}»: se movió, se renombró o se eliminó. Vuelva a elegirla.`;
  }
  if (error?.name === "NotAllowedError" || error?.name === "SecurityError") {
    return `El navegador no dio permiso para leer la carpeta «${nombre}». Confirme el acceso.`;
  }
  return error?.message || "No se pudo leer la carpeta.";
};

// ¿La carpeta del handle sigue existiendo? false solo ante NotFoundError (se movió o se borró).
export const existeCarpeta = async (handle) => {
  try {
    // eslint-disable-next-line no-unused-vars
    for await (const _ of handle.entries()) break;
    return true;
  } catch (error) {
    return error?.name !== "NotFoundError";
  }
};

// Árbol desde un handle (showDirectoryPicker o carpeta predeterminada). Un archivo o subcarpeta
// que el navegador no puede leer (p. ej. archivos de OneDrive "solo en línea", temporales de Office
// o algo borrado durante la lectura) se omite y queda en `noLeidos` [{ ruta, nombre }], en vez de
// abortar toda la lectura. Si la carpeta raíz ya no existe, lanza un error en español.
export const leerArbol = async (raiz) => {
  const archivos = new Map();
  const noLeidos = [];
  const recorrer = async (handle, nodo, nivel) => {
    for await (const [nombre, entrada] of handle.entries()) {
      if (esOculto(nombre)) continue;
      const ruta = unir(nodo.ruta, nombre);
      if (entrada.kind === "file") {
        try {
          const file = await entrada.getFile();
          nodo.archivos.push(metaDe(file, ruta));
          archivos.set(ruta, file);
        } catch {
          noLeidos.push({ ruta, nombre });
        }
      } else if (nivel < MAX_PROFUNDIDAD) {
        const hijo = nodoVacio(nombre, ruta);
        try {
          await recorrer(entrada, hijo, nivel + 1);
          nodo.carpetas.push(hijo);
        } catch {
          noLeidos.push({ ruta, nombre: `${nombre}/` });
        }
      }
    }
  };
  const arbol = nodoVacio(raiz.name, "");
  try {
    await recorrer(raiz, arbol, 1);
  } catch (error) {
    throw Object.assign(new Error(mensajeErrorCarpeta(error, raiz.name)), { codigo: error?.name || null });
  }
  return { arbol, archivos, carpetaRaizNombre: raiz.name, noLeidos };
};

// Árbol desde <input type="file" webkitdirectory> (respaldo): cada File trae
// webkitRelativePath "Raiz/…/archivo".
export const leerArbolDesdeInput = (fileList) => {
  const lista = [...(fileList || [])];
  if (!lista.length) return null;
  const carpetaRaizNombre = (lista[0].webkitRelativePath || lista[0].name).split("/")[0];
  const arbol = nodoVacio(carpetaRaizNombre, "");
  const archivos = new Map();
  lista.forEach((file) => {
    const partes = (file.webkitRelativePath || file.name).split("/").slice(1);
    if (!partes.length || esOculto(partes[partes.length - 1]) || partes.length > MAX_PROFUNDIDAD) return;
    let nodo = arbol;
    partes.slice(0, -1).forEach((carpeta) => {
      let hijo = nodo.carpetas.find((c) => c.nombre === carpeta);
      if (!hijo) {
        hijo = nodoVacio(carpeta, unir(nodo.ruta, carpeta));
        nodo.carpetas.push(hijo);
      }
      nodo = hijo;
    });
    const ruta = partes.join("/");
    nodo.archivos.push(metaDe(file, ruta));
    archivos.set(ruta, file);
  });
  return { arbol, archivos, carpetaRaizNombre };
};

// Carpeta predeterminada (Configuración IA → Fuentes documentales): el handle de la carpeta se
// guarda en IndexedDB de ESTE navegador, por usuario y Mandante. Nunca se guarda en Firestore ni
// se envía al backend; por seguridad el navegador no expone la ruta (C:\...), solo el nombre. Para
// volver a leerla, el navegador pide confirmar el permiso. Si IndexedDB no está disponible (modo
// privado, datos bloqueados), las funciones lo informan y se sigue sin carpeta predeterminada.
const BD = "smartone-revisiones-ia";
const ALMACEN = "carpetas";
const ID_SELECTOR = "smartone-revisiones";

export const clavePredeterminada = (usuarioId, mandanteId) => `revisionesIA:carpeta:${usuarioId}:${mandanteId}`;

const abrirBd = () => new Promise((resolve, reject) => {
  const pedido = indexedDB.open(BD, 1);
  pedido.onupgradeneeded = () => pedido.result.createObjectStore(ALMACEN);
  pedido.onsuccess = () => resolve(pedido.result);
  pedido.onerror = () => reject(pedido.error);
});

const conAlmacen = async (modo, operacion) => {
  const bd = await abrirBd();
  try {
    return await new Promise((resolve, reject) => {
      const pedido = operacion(bd.transaction(ALMACEN, modo).objectStore(ALMACEN));
      pedido.onsuccess = () => resolve(pedido.result);
      pedido.onerror = () => reject(pedido.error);
    });
  } finally {
    bd.close();
  }
};

// { handle, configuradaEn (ISO) } o null. Lanza si IndexedDB no está disponible.
export const obtenerCarpetaPredeterminada = async (usuarioId, mandanteId) => {
  if (!soportaSelectorCarpeta() || !usuarioId || !mandanteId) return null;
  const valor = await conAlmacen("readonly", (almacen) => almacen.get(clavePredeterminada(usuarioId, mandanteId)));
  return valor?.handle ? valor : null;
};

export const guardarCarpetaPredeterminada = async (usuarioId, mandanteId, handle) => {
  const valor = { handle, configuradaEn: new Date().toISOString() };
  await conAlmacen("readwrite", (almacen) => almacen.put(valor, clavePredeterminada(usuarioId, mandanteId)));
  return valor;
};

// Quita SOLO el registro del navegador (nunca archivos).
export const quitarCarpetaPredeterminada = (usuarioId, mandanteId) =>
  conAlmacen("readwrite", (almacen) => almacen.delete(clavePredeterminada(usuarioId, mandanteId)));

// Carpeta de la empresa de un Expediente (pestaña "Revisiones IA"): mismo almacén, otra clave. En
// Firestore solo queda su nombre.
export const claveExpediente = (usuarioId, expedienteId) => `revisionesIA:expediente:${usuarioId}:${expedienteId}`;

export const obtenerCarpetaExpediente = async (usuarioId, expedienteId) => {
  if (!soportaSelectorCarpeta() || !usuarioId || !expedienteId) return null;
  const valor = await conAlmacen("readonly", (almacen) => almacen.get(claveExpediente(usuarioId, expedienteId)));
  return valor?.handle ? valor : null;
};

export const guardarCarpetaExpediente = async (usuarioId, expedienteId, handle) => {
  const valor = { handle, configuradaEn: new Date().toISOString() };
  await conAlmacen("readwrite", (almacen) => almacen.put(valor, claveExpediente(usuarioId, expedienteId)));
  return valor;
};

export const quitarCarpetaExpediente = (usuarioId, expedienteId) =>
  conAlmacen("readwrite", (almacen) => almacen.delete(claveExpediente(usuarioId, expedienteId)));

// Carpeta elegida en el asistente Nueva Acreditación, ANTES de que exista el expediente: clave
// temporal por usuario y sesión del asistente. Al crear el expediente se traspasa a su clave
// definitiva (claveExpediente) y la temporal se borra.
const PREFIJO_WIZARD = "revisionesIA:wizard:";
export const claveWizard = (usuarioId, sesionId) => `${PREFIJO_WIZARD}${usuarioId}:${sesionId}`;

export const guardarCarpetaWizard = async (usuarioId, sesionId, handle) => {
  const valor = { handle, configuradaEn: new Date().toISOString() };
  await conAlmacen("readwrite", (almacen) => almacen.put(valor, claveWizard(usuarioId, sesionId)));
  return valor;
};

export const obtenerCarpetaWizard = async (usuarioId, sesionId) => {
  if (!soportaSelectorCarpeta() || !usuarioId || !sesionId) return null;
  const valor = await conAlmacen("readonly", (almacen) => almacen.get(claveWizard(usuarioId, sesionId)));
  return valor?.handle ? valor : null;
};

export const quitarCarpetaWizard = (usuarioId, sesionId) =>
  conAlmacen("readwrite", (almacen) => almacen.delete(claveWizard(usuarioId, sesionId)));

// Pasa la carpeta del asistente al expediente recién creado y borra la clave temporal. true si
// había carpeta que traspasar.
export const traspasarCarpetaWizard = async (usuarioId, sesionId, expedienteId) => {
  const valor = await obtenerCarpetaWizard(usuarioId, sesionId);
  if (!valor) return false;
  await guardarCarpetaExpediente(usuarioId, expedienteId, valor.handle);
  await quitarCarpetaWizard(usuarioId, sesionId);
  return true;
};

// Limpieza defensiva al abrir el asistente: borra las carpetas temporales de este usuario de otras
// sesiones del asistente (abandonadas) y, de cualquier usuario, las de más de `horas`.
export const limpiarCarpetasWizard = async (usuarioId, sesionActual, horas = 24) => {
  if (!soportaSelectorCarpeta()) return;
  const limite = Date.now() - horas * 60 * 60 * 1000;
  const bd = await abrirBd();
  try {
    await new Promise((resolve, reject) => {
      const tx = bd.transaction(ALMACEN, "readwrite");
      const cursor = tx.objectStore(ALMACEN).openCursor();
      cursor.onsuccess = () => {
        const c = cursor.result;
        if (!c) return;
        const clave = String(c.key);
        if (clave.startsWith(PREFIJO_WIZARD)) {
          const antigua = Date.parse(c.value?.configuradaEn || "") < limite;
          const deOtraSesion = usuarioId && clave.startsWith(`${PREFIJO_WIZARD}${usuarioId}:`) &&
            clave !== claveWizard(usuarioId, sesionActual);
          if (antigua || deOtraSesion) c.delete();
        }
        c.continue();
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    bd.close();
  }
};

// Repositorio documental del Expediente (pestaña Documentación y panel de documentos): misma carpeta
// y misma clave que la pestaña Revisiones IA. Elige la carpeta y la deja recordada. null si cancela.
export const vincularCarpetaExpediente = async (usuarioId, expedienteId, inicio = null) => {
  const handle = await seleccionarCarpeta(inicio);
  return handle ? guardarCarpetaExpediente(usuarioId, expedienteId, handle) : null;
};

// Carpeta (handle) en una ruta relativa ("a/b"), o null si no existe. Solo lectura.
const carpetaEn = async (raiz, rutaRelativa) => {
  let actual = raiz;
  for (const parte of String(rutaRelativa || "").split("/").filter(Boolean)) {
    try {
      actual = await actual.getDirectoryHandle(parte);
    } catch {
      return null;
    }
  }
  return actual;
};

// Contenido directo de una carpeta: { carpetas: [{ nombre, ruta }], archivos: [{ nombre, ruta,
// tamanoBytes, ultimaModificacion }] }, en orden alfabético; null si la carpeta no existe.
export const listarDirectorio = async (raiz, rutaRelativa = "") => {
  const carpeta = await carpetaEn(raiz, rutaRelativa);
  if (!carpeta) return null;
  const carpetas = [];
  const archivos = [];
  for await (const [nombre, entrada] of carpeta.entries()) {
    if (esOculto(nombre)) continue;
    const ruta = unir(rutaRelativa, nombre);
    if (entrada.kind === "directory") carpetas.push({ nombre, ruta });
    else archivos.push(metaDe(await entrada.getFile(), ruta));
  }
  const orden = (a, b) => a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base", numeric: true });
  return { carpetas: carpetas.sort(orden), archivos: archivos.sort(orden) };
};

// Primer y segundo nivel de carpetas (sin archivos): [{ nombre, ruta, carpetas: [{ nombre, ruta }] }].
export const leerDosNiveles = async (raiz) => {
  const primero = await listarDirectorio(raiz, "");
  return Promise.all((primero?.carpetas || []).map(async (c) => ({
    ...c, carpetas: (await listarDirectorio(raiz, c.ruta))?.carpetas || [],
  })));
};

// Archivo (File) en una ruta relativa, o null si no existe.
export const obtenerArchivo = async (raiz, rutaRelativa) => {
  const partes = String(rutaRelativa || "").split("/").filter(Boolean);
  const nombre = partes.pop();
  const carpeta = await carpetaEn(raiz, partes.join("/"));
  if (!carpeta || !nombre) return null;
  try {
    return await (await carpeta.getFileHandle(nombre)).getFile();
  } catch {
    return null;
  }
};

// "granted" | "prompt" | "denied".
export const estadoPermiso = async (handle) => handle.queryPermission({ mode: "read" });

// Pide el permiso (debe llamarse desde un clic). true si quedó concedido.
export const pedirPermiso = async (handle) => (await handle.requestPermission({ mode: "read" })) === "granted";

// Abre el selector para elegir la carpeta predeterminada. null si el usuario cancela.
export const seleccionarCarpeta = async (inicio = null) => {
  try {
    return await window.showDirectoryPicker({ id: ID_SELECTOR, mode: "read", ...(inicio ? { startIn: inicio } : {}) });
  } catch (error) {
    if (error?.name === "AbortError") return null;
    throw error;
  }
};

// Vista rápida de una carpeta con permiso: subcarpetas de primer nivel y archivos válidos en ellas.
export const vistaRapida = async (handle) => {
  let subcarpetas = 0;
  let archivosValidos = 0;
  for await (const [, entrada] of handle.entries()) {
    if (entrada.kind !== "directory") continue;
    subcarpetas += 1;
    for await (const [nombre, hijo] of entrada.entries()) {
      if (hijo.kind === "file" && EXTENSIONES_ACEPTADAS.includes(extension(nombre))) archivosValidos += 1;
    }
  }
  return { subcarpetas, archivosValidos };
};

// Lee una carpeta ya elegida (p. ej. la predeterminada) como árbol. null si el permiso no está
// concedido y el usuario no lo da (pedirlo requiere un clic).
export const leerCarpeta = async (handle) => {
  if ((await estadoPermiso(handle)) !== "granted" && !(await pedirPermiso(handle))) return null;
  return leerArbol(handle);
};

// Con showDirectoryPicker (Chrome, Edge). Abre en la carpeta indicada (la predeterminada). null si
// el usuario cancela.
export const elegirConSelector = async (inicio = null) => {
  const raiz = await seleccionarCarpeta(inicio);
  return raiz ? leerArbol(raiz) : null;
};

// SHA-256 (hex) del archivo ORIGINAL, antes de cualquier transformación.
export const hashSha256 = async (archivo) => {
  const digest = await crypto.subtle.digest("SHA-256", await archivo.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
};

const blobABase64 = (blob) => new Promise((resolve, reject) => {
  const lector = new FileReader();
  lector.onload = () => resolve(String(lector.result).split(",")[1] || "");
  lector.onerror = () => reject(lector.error);
  lector.readAsDataURL(blob);
});

// Imagen redimensionada a 1568 px en el lado largo y exportada como JPEG 0.85 (menos costo y
// tamaño). Si ya es más chica, igual se re-codifica como JPEG.
const redimensionarImagen = async (archivo) => {
  const bitmap = await createImageBitmap(archivo);
  const escala = Math.min(1, LADO_MAXIMO_IMAGEN / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * escala);
  canvas.height = Math.round(bitmap.height * escala);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("No se pudo procesar la imagen."))), "image/jpeg", CALIDAD_JPEG);
  });
};

// Piezas listas para enviar: [{ contenidoBase64, mime, hashSha256, parte }]. El hash es del
// original; la imagen va redimensionada como JPEG y el PDF tal cual. Un Word (.docx) da una pieza
// por imagen incrustada (parte 1, 2...), cada una con el hash de esa imagen.
export const prepararArchivo = async ({ archivo, mime }) => {
  if (mime === MIME_DOCX) {
    const imagenes = await imagenesDeDocx(archivo);
    return Promise.all(imagenes.map(async (imagen, i) => ({
      contenidoBase64: await blobABase64(await redimensionarImagen(imagen)),
      mime: "image/jpeg", hashSha256: await hashSha256(imagen), parte: i + 1,
    })));
  }
  const hash = await hashSha256(archivo);
  if (mime === "application/pdf") {
    return [{ contenidoBase64: await blobABase64(archivo), mime, hashSha256: hash, parte: null }];
  }
  const jpeg = await redimensionarImagen(archivo);
  return [{ contenidoBase64: await blobABase64(jpeg), mime: "image/jpeg", hashSha256: hash, parte: null }];
};
