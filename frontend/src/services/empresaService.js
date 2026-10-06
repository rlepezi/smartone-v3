import { apiClient } from "../api/apiClient";

export const empresaService = {
  async listar(estado) {
    const query = estado ? `?estado=${estado}` : "";
    const res = await apiClient(`/empresas${query}`);
    return res.data;
  },

  async obtenerPorId(id) {
    const res = await apiClient(`/empresas/${id}`);
    return res.data;
  },

  async crear(payload) {
    const res = await apiClient("/empresas", {
      method: "POST",
      body: payload,
    });
    return res.data;
  },

  async actualizar(id, payload) {
    const res = await apiClient(`/empresas/${id}`, {
      method: "PUT",
      body: payload,
    });
    return res.data;
  },

  async desactivar(id) {
    const res = await apiClient(`/empresas/${id}`, {
      method: "DELETE",
    });
    return res.data;
  },

  async obtenerEventos(id, { limit } = {}) {
    const query = limit ? `?limit=${limit}` : "";
    const res = await apiClient(`/empresas/${id}/eventos-recientes${query}`);
    return res.data;
  },

  async obtenerResumen(id) {
    const res = await apiClient(`/empresas/${id}/resumen`);
    return res.data;
  },
};
