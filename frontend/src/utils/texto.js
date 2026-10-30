// Texto normalizado para comparar nombres: minúsculas, sin tildes, con trim y espacios colapsados.
// Mismo criterio que functions/src/utils/nombreRequerimiento.js (normalizarNombre).
// Nombres de Empresas y Proyectos: siempre en MAYÚSCULAS (también lo fuerza el backend).
export const aMayusculas = (texto) => (typeof texto === "string" ? texto.toLocaleUpperCase("es-CL") : texto);

export const normalizarNombre = (texto) => String(texto || "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .trim()
  .replace(/\s+/g, " ");
