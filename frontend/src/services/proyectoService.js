import { apiClient } from "../api/apiClient";

// Catálogo de estados: espejo manual de
// functions/src/services/proyectoService.js (fuente única de verdad).
export const ESTADOS_PROYECTO = [
  { value: "planificado", label: "Planificado" },
  { value: "en_ejecucion", label: "En Ejecución" },
  { value: "suspendido", label: "Suspendido" },
  { value: "finalizado", label: "Finalizado" },
  { value: "archivado", label: "Archivado" },
];

export const proyectoService = {
  // `empresaId`: cada Proyecto trae además `participacionEmpresa` (relación vigente de esa Empresa).
  async listar({ mandanteId, estado, empresaId } = {}) {
    const params = new URLSearchParams();
    if (empresaId) params.set("empresaId", empresaId);
    if (mandanteId) params.set("mandanteId", mandanteId);
    if (estado) params.set("estado", estado);
    const query = params.toString() ? `?${params.toString()}` : "";
    const res = await apiClient(`/proyectos${query}`);
    return res.data;
  },

  async obtenerPorId(id) {
    const res = await apiClient(`/proyectos/${id}`);
    return res.data;
  },

  async crear(payload) {
    const res = await apiClient("/proyectos", {
      method: "POST",
      body: payload,
    });
    return res.data;
  },

  async actualizar(id, payload) {
    const res = await apiClient(`/proyectos/${id}`, {
      method: "PUT",
      body: payload,
    });
    return res.data;
  },

  async archivar(id) {
    const res = await apiClient(`/proyectos/${id}`, {
      method: "DELETE",
    });
    return res.data;
  },

  async obtenerResumen(id) {
    const res = await apiClient(`/proyectos/${id}/resumen`);
    return res.data;
  },

  async obtenerEventos(id, { limit } = {}) {
    const query = limit ? `?limit=${limit}` : "";
    const res = await apiClient(`/proyectos/${id}/eventos-recientes${query}`);
    return res.data;
  },

  async obtenerSiguienteCodigo(mandanteId) {
    const query = mandanteId ? `?mandanteId=${mandanteId}` : "";
    const res = await apiClient(`/proyectos/siguiente-codigo${query}`);
    return res.data;
  },
};
