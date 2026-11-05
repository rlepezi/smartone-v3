import { fuenteDocumentalService } from "./fuenteDocumentalService";
import {
  soportaSelectorCarpeta, obtenerCarpetaPredeterminada, estadoPermiso, pedirPermiso, listarDirectorio,
  obtenerArchivo, carpetaEn,
} from "./fuentes/carpetaLocal";

// Proveedor único de la fuente documental del Mandante: la misma interfaz para la carpeta local
// (File System Access, solo el piloto) y SharePoint (Microsoft Graph a través del backend). Las
// pantallas no necesitan saber qué fuente es.
//
//   const fuente = crearFuenteDocumental({ fuente, mandanteId, usuarioId });
//   await fuente.estado()          → { codigo, nombre }
//        codigo: "sin_fuente" | "configurada" (falta autorizar/probar en este equipo)
//                | "autorizada" (se puede leer aquí) | "sin_acceso" (configurada en otro equipo, o
//                SharePoint con error)
//   await fuente.listarHijos(id)   → { carpeta, hijos: [Item] }  (id null: la raíz / carpeta base)
//   await fuente.obtenerItem(id)   → Item
//   await fuente.contenido(id, { formato })  → Blob   (formato "pdf": Office → PDF, SharePoint)
//   await fuente.urlPreview(id, { formato }) → object URL (quien la usa la revoca)
//   await fuente.autorizar()       → solo local: pide el permiso del navegador (desde un clic).
//
// Item: { id, driveId, nombre, tipo: "carpeta" | "archivo", tamano, modificado, rutaRelativa }. En
// la fuente local el id ES la ruta relativa a la raíz ("" la raíz); en SharePoint es el itemId de
// Graph (estable al renombrar).

const nombreDe = (ruta) => String(ruta || "").split("/").filter(Boolean).pop() || "";
const unir = (a, b) => [a, b].filter(Boolean).join("/");

const SIN_FUENTE = {
  tipo: null,
  estado: async () => ({ codigo: "sin_fuente", nombre: null }),
  listarHijos: async () => { throw new Error("El Mandante no tiene fuente documental."); },
  obtenerItem: async () => { throw new Error("El Mandante no tiene fuente documental."); },
  contenido: async () => { throw new Error("El Mandante no tiene fuente documental."); },
  urlPreview: async () => { throw new Error("El Mandante no tiene fuente documental."); },
  autorizar: async () => false,
};

// ── Carpeta local ──
const proveedorLocal = ({ fuente, mandanteId, usuarioId }) => {
  // Raíz recordada en este navegador, si es la carpeta de la fuente.
  const raiz = async () => {
    if (!soportaSelectorCarpeta() || !usuarioId) return { handle: null, permiso: null };
    const reg = await obtenerCarpetaPredeterminada(usuarioId, mandanteId).catch(() => null);
    if (!reg || reg.handle.name !== fuente.etiqueta) return { handle: null, permiso: null };
    return { handle: reg.handle, permiso: await estadoPermiso(reg.handle).catch(() => "prompt") };
  };
  const raizLista = async () => {
    const r = await raiz();
    if (!r.handle || r.permiso !== "granted") {
      throw new Error(MENSAJE_LOCAL_NO_AUTORIZADA(fuente.etiqueta));
    }
    return r.handle;
  };
  const item = (nombre, ruta, carpeta, meta = {}) => ({
    id: ruta, driveId: null, nombre, tipo: carpeta ? "carpeta" : "archivo",
    tamano: carpeta ? null : meta.tamanoBytes ?? null, modificado: meta.ultimaModificacion ?? null, rutaRelativa: ruta,
  });
  return {
    tipo: "local",
    async estado() {
      const r = await raiz();
      return {
        codigo: !r.handle ? "sin_acceso" : r.permiso === "granted" ? "autorizada" : "configurada",
        nombre: fuente.etiqueta,
      };
    },
    async autorizar() {
      const r = await raiz();
      return r.handle ? pedirPermiso(r.handle).catch(() => false) : false;
    },
    async listarHijos(id = null) {
      const ruta = id || "";
      const contenido = await listarDirectorio(await raizLista(), ruta);
      if (!contenido) throw new Error(`No se encontró la carpeta «${ruta || fuente.etiqueta}».`);
      return {
        carpeta: item(nombreDe(ruta) || fuente.etiqueta, ruta, true),
        hijos: [
          ...contenido.carpetas.map((c) => item(c.nombre, unir(ruta, c.nombre), true)),
          ...contenido.archivos.map((a) => item(a.nombre, a.ruta, false, a)),
        ],
      };
    },
    async obtenerItem(id) {
      const handle = await raizLista();
      if (await carpetaEn(handle, id)) return item(nombreDe(id), id, true);
      const archivo = await obtenerArchivo(handle, id);
      if (!archivo) throw new Error(`No se encontró «${id}».`);
      return item(archivo.name, id, false, { tamanoBytes: archivo.size, ultimaModificacion: new Date(archivo.lastModified).toISOString() });
    },
    async contenido(id) {
      const archivo = await obtenerArchivo(await raizLista(), id);
      if (!archivo) throw new Error(`No se encontró «${id}».`);
      return archivo;
    },
    async urlPreview(id, opciones) {
      return URL.createObjectURL(await this.contenido(id, opciones));
    },
  };
};

// ── SharePoint ──
const proveedorSharePoint = ({ fuente, mandanteId }) => ({
  tipo: "sharepoint",
  async estado() {
    const codigo = fuente.estadoConexion === "conectada" ? "autorizada"
      : fuente.estadoConexion === "error" ? "sin_acceso" : "configurada";
    return { codigo, nombre: fuente.nombre || fuente.etiqueta };
  },
  async autorizar() {
    // Las credenciales son de la app: no hay nada que autorizar en este equipo.
    return true;
  },
  listarHijos: (id = null) => fuenteDocumentalService.sharePointHijos(mandanteId, id),
  obtenerItem: (id) => fuenteDocumentalService.sharePointItem(mandanteId, id),
  contenido: (id, { formato = null } = {}) => fuenteDocumentalService.sharePointContenido(mandanteId, id, { formato }),
  async urlPreview(id, opciones) {
    return URL.createObjectURL(await this.contenido(id, opciones));
  },
});

// fuente: la activa del Mandante (fuenteDocumentalService.activa / listar), o null.
export const crearFuenteDocumental = ({ fuente, mandanteId, usuarioId = null }) => {
  if (!fuente || fuente.estado === "inactiva") return SIN_FUENTE;
  return fuente.tipo === "sharepoint"
    ? proveedorSharePoint({ fuente, mandanteId })
    : proveedorLocal({ fuente, mandanteId, usuarioId });
};

export const MENSAJE_LOCAL_NO_AUTORIZADA = (nombre) =>
  `Los documentos de este Mandante están en la carpeta local «${nombre}», configurada en otro equipo. Autoriza tu copia de esa carpeta o pide que la fuente se configure en SharePoint.`;
