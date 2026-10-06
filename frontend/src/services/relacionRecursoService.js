import { apiClient } from "../api/apiClient";

export const relacionRecursoService = {
  async listarPorRecurso(recursoId) {
    const res = await apiClient(`/recursos/${recursoId}/relaciones`);
    return res.data;
  },

  async cambiarEmpresa(recursoId, payload) {
    const res = await apiClient(`/recursos/${recursoId}/cambiar-empresa`, {
      method: "POST",
      body: payload,
    });
    return res.data;
  },
};
