import { normalizarNombre } from "./texto";

// Orden fijo de los chips de Perfiles de Participación; los demás van después, por nombre.
const ORDEN_PERFILES = ["permanente", "temporal", "convenio"];

const posicionPerfil = (nombre) => {
  const i = ORDEN_PERFILES.indexOf(normalizarNombre(nombre));
  return i === -1 ? ORDEN_PERFILES.length : i;
};

export const ordenarPerfilesParticipacion = (perfiles) => [...(perfiles || [])].sort((a, b) =>
  posicionPerfil(a.nombre) - posicionPerfil(b.nombre) || String(a.nombre).localeCompare(String(b.nombre), "es"));
