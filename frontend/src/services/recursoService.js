import { apiClient } from "../api/apiClient";

export const recursoService = {
  async listar(estado, empresaId) {
    const params = new URLSearchParams();
    if (estado) params.set("estado", estado);
    if (empresaId) params.set("empresaId", empresaId);
    const query = params.toString() ? `?${params.toString()}` : "";
    const res = await apiClient(`/recursos${query}`);
    return res.data;
  },

  async listarTipos() {
    const res = await apiClient("/recursos/tipos");
    return res.data;
  },

  async obtenerPorId(id) {
    const res = await apiClient(`/recursos/${id}`);
    return res.data;
  },

  async crear(payload) {
    const res = await apiClient("/recursos", {
      method: "POST",
      body: payload,
    });
    return res.data;
  },

  async actualizar(id, payload) {
    const res = await apiClient(`/recursos/${id}`, {
      method: "PUT",
      body: payload,
    });
    return res.data;
  },

  async desactivar(id) {
    const res = await apiClient(`/recursos/${id}`, {
      method: "DELETE",
    });
    return res.data;
  },

  async obtenerEventos(id, { limit } = {}) {
    const query = limit ? `?limit=${limit}` : "";
    const res = await apiClient(`/recursos/${id}/eventos-recientes${query}`);
    return res.data;
  },
};
