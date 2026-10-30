// Repositorio documental del Expediente (carpeta local o SharePoint): mapeo de carpetas, validación de
// la URL de SharePoint y formatos de archivo. Funciones puras. Las carpetas de personas y
// maquinarias se eligen a mano (mapeo y carpetaRelativa): ver utils/carpetasSujetos.js.

// Mapeo de carpetas sin asignar (personal, maquinarias y carpeta de cada requerimiento).
export const MAPEO_VACIO = { carpetaPersonas: null, carpetaRecursos: null, requerimientos: {} };

// Mismas reglas que el backend (utils/repositorioDocumental.js de functions): https y un sitio
// *.sharepoint.com. Devuelve el mensaje de error, o null si es válida.
export const validarUrlSharePoint = (valor) => {
  let url;
  try {
    url = new URL(String(valor || "").trim());
  } catch {
    return "La URL de SharePoint no es válida.";
  }
  if (url.protocol !== "https:") return "La URL de SharePoint debe comenzar con https://.";
  if (!url.hostname.toLowerCase().endsWith(".sharepoint.com")) return "La URL debe ser de un sitio *.sharepoint.com.";
  return null;
};

// Nombre visible de una URL de SharePoint: el último tramo de la ruta.
export const etiquetaDeUrl = (valor) => {
  try {
    const url = new URL(String(valor).trim());
    const tramos = decodeURIComponent(url.pathname).split("/").filter(Boolean);
    return tramos[tramos.length - 1] || url.hostname;
  } catch {
    return String(valor || "");
  }
};

// Texto del repositorio para resúmenes: "Carpeta local: X", "SharePoint" o null (sin vincular).
export const textoRepositorio = (r) => (!r ? null : r.tipo === "local" ? `Carpeta local: ${r.etiqueta}` : "SharePoint");

// Ícono/etiqueta por extensión.
export const extensionDe = (nombre) => (String(nombre).includes(".") ? String(nombre).split(".").pop().toLowerCase() : "");
export const EXTENSIONES_IMAGEN = ["jpg", "jpeg", "png", "webp", "gif"];
export const esPdf = (nombre) => extensionDe(nombre) === "pdf";
export const esImagen = (nombre) => EXTENSIONES_IMAGEN.includes(extensionDe(nombre));

export const formatTamano = (bytes) => {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024).toLocaleString("es-CL")} KB`;
  return `${(n / (1024 * 1024)).toLocaleString("es-CL", { maximumFractionDigits: 1 })} MB`;
};
