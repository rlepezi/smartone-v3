import { obtenerCarpetaPredeterminada, estadoPermiso, listarDirectorio } from "./carpetaLocal";
import { validarCarpetaEmpresa } from "../../utils/carpetaEmpresa";

// Vinculación automática de la carpeta del expediente desde la carpeta principal del Mandante
// (Fuentes documentales). Devuelve { nombre, handle } SOLO si hay exactamente una subcarpeta que
// pasa la validación estricta de la Empresa; con 0 o 2+ coincidencias, sin carpeta principal o
// sin el permiso ya concedido (no se pide: no hay clic del usuario) devuelve null y quien llama
// muestra la lista.
export const subcarpetaUnicaDeEmpresa = async ({ usuarioId, mandanteId, empresa }) => {
  if (!empresa) return null;
  const reg = await obtenerCarpetaPredeterminada(usuarioId, mandanteId).catch(() => null);
  if (!reg) return null;
  if ((await estadoPermiso(reg.handle).catch(() => "prompt")) !== "granted") return null;
  const contenido = await listarDirectorio(reg.handle, "").catch(() => null);
  const coincidentes = (contenido?.carpetas || []).filter((c) => validarCarpetaEmpresa(c.nombre, empresa).valida);
  if (coincidentes.length !== 1) return null;
  const { nombre } = coincidentes[0];
  return { nombre, handle: await reg.handle.getDirectoryHandle(nombre) };
};

// ¿Se puede vincular sola? Solo si no hay carpeta configurada, o si la configurada es esa misma
// (este navegador aún no la conoce). Nunca reemplaza otra carpeta ya configurada.
export const puedeVincularSola = (unica, configurada) =>
  Boolean(unica) && (!configurada || configurada === unica.nombre);
