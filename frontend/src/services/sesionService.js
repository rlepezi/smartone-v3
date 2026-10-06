import { apiClient } from "../api/apiClient";

export const sesionService = {
  async iniciar(plataforma = "web") {
    const res = await apiClient("/sesiones/iniciar", {
      method: "POST",
      body: { plataforma },
    });
    return res.data;
  },

  async latido(sesionId) {
    const res = await apiClient(`/sesiones/${sesionId}/latido`, {
      method: "POST",
    });
    return res.data;
  },

  async cerrar(sesionId) {
    const res = await apiClient(`/sesiones/${sesionId}/cerrar`, {
      method: "POST",
    });
    return res.data;
  },
};
