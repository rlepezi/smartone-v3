import { apiClient } from "../api/apiClient";

// Catálogo de tipos de entidad de un Requerimiento (`tipoEntidad`): espejo
// manual de functions/src/services/requerimientoService.js (fuente única de
// verdad). "recurso" se muestra como "Maquinaria".
export const TIPOS_ENTIDAD = [
  { value: "empresa", label: "Empresa" },
  { value: "persona", label: "Persona" },
  { value: "recurso", label: "Maquinaria" },
];

export const etiquetaTipoEntidad = (tipo) =>
  TIPOS_ENTIDAD.find((t) => t.value === tipo)?.label || tipo || "";

export const NOMBRE_CORTO_MAX = 40;

export const requerimientoService = {
  async listar({ estado, tipoEntidad } = {}) {
    const params = new URLSearchParams();
    if (estado) params.set("estado", estado);
    if (tipoEntidad) params.set("tipoEntidad", tipoEntidad);
    const query = params.toString() ? `?${params.toString()}` : "";
    const res = await apiClient(`/requerimientos${query}`);
    return res.data;
  },

  // Uso por Mandante: { [requerimientoId]: mandanteIds[] } (vínculos activos Perfil-Requerimiento).
  async obtenerUso() {
    const res = await apiClient("/requerimientos/uso");
    return res.data || {};
  },

  async obtenerPorId(id) {
    const res = await apiClient(`/requerimientos/${id}`);
    return res.data;
  },

  async crear(payload) {
    const res = await apiClient("/requerimientos", {
      method: "POST",
      body: payload,
    });
    return res.data;
  },

  async actualizar(id, payload) {
    const res = await apiClient(`/requerimientos/${id}`, {
      method: "PUT",
      body: payload,
    });
    return res.data;
  },

  async desactivar(id) {
    const res = await apiClient(`/requerimientos/${id}`, {
      method: "DELETE",
    });
    return res.data;
  },
};
