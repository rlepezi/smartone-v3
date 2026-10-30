import { apiClient } from "../api/apiClient";

// Patrones aprendidos del mapeo documental (superadmin y evaluador). Los de Empresa y los
// estructurales se aprenden al guardar el mapeo de una carpeta; los de archivos de personas y
// maquinarias, con confirmar / quitar (el patrón lo calcula el backend desde el nombre del archivo).
export const patronService = {
  // filtros: { mandanteId, ambito?, objetivo?, requerimientoId?, estado? }.
  async listar(filtros) {
    const q = new URLSearchParams(Object.entries(filtros || {}).filter(([, v]) => v)).toString();
    return (await apiClient(`/patrones-requerimiento?${q}`)).data;
  },

  // datos: { carpetaEmpresaId, ambito: "persona" | "recurso", items: [{ requerimientoId, nombreArchivo, nombreSujeto }] }.
  async confirmar(datos) {
    return (await apiClient("/patrones-requerimiento/confirmar", { method: "POST", body: datos })).data;
  },

  // Activa o desactiva un patrón (queda en la Bitácora).
  async cambiarEstado(id, estado) {
    return (await apiClient(`/patrones-requerimiento/${id}/estado`, { method: "PATCH", body: { estado } })).data;
  },

  async quitar(datos) {
    return (await apiClient("/patrones-requerimiento/quitar", { method: "POST", body: datos })).data;
  },
};
