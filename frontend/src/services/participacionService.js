import { apiClient } from "../api/apiClient";

export const participacionService = {
  async listar({ mandanteId, estado, proyectoId, empresaId } = {}) {
    const params = new URLSearchParams();
    if (mandanteId) params.set("mandanteId", mandanteId);
    if (estado) params.set("estado", estado);
    if (proyectoId) params.set("proyectoId", proyectoId);
    if (empresaId) params.set("empresaId", empresaId);
    const query = params.toString() ? `?${params.toString()}` : "";
    const res = await apiClient(`/participaciones${query}`);
    return res.data;
  },

  // Eventos de Bitácora de la Participación y de sus Expedientes (mecanismo compartido).
  async obtenerEventos(id, { limit } = {}) {
    const query = limit ? `?limit=${limit}` : "";
    const res = await apiClient(`/participaciones/${id}/eventos-recientes${query}`);
    return res.data;
  },

  async obtenerPorId(id) {
    const res = await apiClient(`/participaciones/${id}`);
    return res.data;
  },

  async crear(payload) {
    const res = await apiClient("/participaciones", {
      method: "POST",
      body: payload,
    });
    return res.data;
  },

  // PUT transiciona el estado de la participación (única operación de
  // escritura soportada además de crear).
  async transicionar(id, estado, payload = {}) {
    const res = await apiClient(`/participaciones/${id}`, {
      method: "PUT",
      body: { ...payload, estado },
    });
    return res.data;
  },
};
