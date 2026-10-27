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

// "Se cerrarán N expedientes" (RN-014): aviso al finalizar o archivar un Proyecto.
export const textoCierreExpedientes = (cantidad) => (cantidad > 0
  ? `Se cerrarán ${cantidad} ${cantidad === 1 ? "expediente" : "expedientes"} de este proyecto (con su participación y sus personas y maquinarias asignadas).`
  : "El proyecto no tiene expedientes abiertos.");

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

  // Cantidad de Expedientes no cerrados: se cierran al finalizar o archivar el Proyecto.
  async expedientesAbiertos(id) {
    const res = await apiClient(`/proyectos/${id}/expedientes-abiertos`);
    return res.data?.cantidad ?? 0;
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
};
