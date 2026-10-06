import { apiClient } from "../api/apiClient";

export const relacionLaboralService = {
  async listarPorPersona(personaId) {
    const res = await apiClient(`/relaciones-laborales?personaId=${personaId}`);
    return res.data;
  },

  async cambiarEmpresa(personaId, payload) {
    const res = await apiClient(`/relaciones-laborales/personas/${personaId}/cambiar-empresa`, {
      method: "POST",
      body: payload,
    });
    return res.data;
  },
};
