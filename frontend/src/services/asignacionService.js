import { apiClient } from "../api/apiClient";

export const asignacionService = {
  async listar({ mandanteId, estado, proyectoId, personaId, recursoId } = {}) {
    const params = new URLSearchParams();
    if (mandanteId) params.set("mandanteId", mandanteId);
    if (estado) params.set("estado", estado);
    if (proyectoId) params.set("proyectoId", proyectoId);
    if (personaId) params.set("personaId", personaId);
    if (recursoId) params.set("recursoId", recursoId);
    const query = params.toString() ? `?${params.toString()}` : "";
    const res = await apiClient(`/asignaciones${query}`);
    return res.data;
  },

  async obtenerPorId(id) {
    const res = await apiClient(`/asignaciones/${id}`);
    return res.data;
  },

  async crear(payload) {
    const res = await apiClient("/asignaciones", {
      method: "POST",
      body: payload,
    });
    return res.data;
  },

  // PUT transiciona el estado de la asignación (única operación de
  // escritura soportada además de crear).
  async transicionar(id, estado, payload = {}) {
    const res = await apiClient(`/asignaciones/${id}`, {
      method: "PUT",
      body: { ...payload, estado },
    });
    return res.data;
  },
};
