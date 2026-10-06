import { apiClient } from "../api/apiClient";

export const evidenciaRequerimientoService = {
  async listarPorExpediente(expedienteId) {
    const res = await apiClient(
      `/evidencia-requerimientos?expedienteId=${expedienteId}`
    );
    return res.data;
  },

  async crear(payload) {
    const res = await apiClient("/evidencia-requerimientos", {
      method: "POST",
      body: payload,
    });
    return res.data;
  },

  async actualizarEstado(id, estado) {
    const res = await apiClient(`/evidencia-requerimientos/${id}`, {
      method: "PUT",
      body: { estado },
    });
    return res.data;
  },
};
