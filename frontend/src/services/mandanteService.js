import { apiClient } from "../api/apiClient";

export const mandanteService = {
  async listar(estado) {
    const query = estado ? `?estado=${estado}` : "";
    const res = await apiClient(`/mandantes${query}`);
    return res.data;
  },

  async obtenerPorId(id) {
    const res = await apiClient(`/mandantes/${id}`);
    return res.data;
  },

  async crear(payload) {
    const res = await apiClient("/mandantes", {
      method: "POST",
      body: payload,
    });
    return res.data;
  },

  async actualizar(id, payload) {
    const res = await apiClient(`/mandantes/${id}`, {
      method: "PUT",
      body: payload,
    });
    return res.data;
  },

  async desactivar(id) {
    const res = await apiClient(`/mandantes/${id}`, {
      method: "DELETE",
    });
    return res.data;
  },
};