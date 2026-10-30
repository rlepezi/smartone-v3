import { apiClient } from "../api/apiClient";

export const perfilRequerimientoService = {
  async listar({ mandanteId, perfilParticipacionId, estado } = {}) {
    const params = new URLSearchParams();
    if (mandanteId) params.set("mandanteId", mandanteId);
    if (perfilParticipacionId) params.set("perfilParticipacionId", perfilParticipacionId);
    if (estado) params.set("estado", estado);
    const query = params.toString() ? `?${params.toString()}` : "";
    const res = await apiClient(`/perfil-requerimientos${query}`);
    return res.data;
  },

  async obtenerMatriz(perfilParticipacionId) {
    const res = await apiClient(`/perfil-requerimientos/matriz/${perfilParticipacionId}`);
    return res.data;
  },

  async actualizar(id, payload) {
    const res = await apiClient(`/perfil-requerimientos/${id}`, {
      method: "PUT",
      body: payload,
    });
    return res.data;
  },

  // Fija en un solo paso el estado deseado de varios pares Perfil de Participación + Requerimiento:
  // cambios = [{ perfilParticipacionId, requerimientoId, activo, perfilRecursoIds: null | [ids] }]
  // (null = "Todos"). El backend calcula altas/reactivaciones/bajas, las escribe en un batch y
  // sincroniza una sola vez los Expedientes abiertos.
  async sincronizar(cambios) {
    const res = await apiClient("/perfil-requerimientos/sincronizar", {
      method: "POST",
      body: { cambios },
    });
    return res.data;
  },

  async reordenar(items) {
    const res = await apiClient("/perfil-requerimientos/reordenar", {
      method: "PUT",
      body: { items },
    });
    return res.data;
  },
};
