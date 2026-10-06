import { apiClient } from "../api/apiClient";

export const personaService = {
  // Cuántos documentos de identidad quedarían marcados para eliminación y en cuántos días (solo superadmin).
  async impactoAnonimizacion(id) {
    const res = await apiClient(`/personas/${id}/impacto-anonimizacion`);
    return res.data;
  },

  // Documentos de identidad de una Persona anonimizada y su estado de purga (solo superadmin).
  async documentosPurga(id) {
    const res = await apiClient(`/personas/${id}/documentos-purga`);
    return res.data || [];
  },

  // Derecho de cancelación (Ley 21.719): anonimiza los datos personales. Solo superadmin; sin deshacer.
  async anonimizar(id, motivo) {
    const res = await apiClient(`/personas/${id}/anonimizar`, { method: "POST", body: { motivo } });
    return res.data;
  },

  async listar(estado, empresaId) {
    const params = new URLSearchParams();
    if (estado) params.set("estado", estado);
    if (empresaId) params.set("empresaId", empresaId);
    const query = params.toString() ? `?${params.toString()}` : "";
    const res = await apiClient(`/personas${query}`);
    return res.data;
  },

  async obtenerPorId(id) {
    const res = await apiClient(`/personas/${id}`);
    return res.data;
  },

  async crear(payload) {
    const res = await apiClient("/personas", {
      method: "POST",
      body: payload,
    });
    return res.data;
  },

  async actualizar(id, payload) {
    const res = await apiClient(`/personas/${id}`, {
      method: "PUT",
      body: payload,
    });
    return res.data;
  },

  async desactivar(id) {
    const res = await apiClient(`/personas/${id}`, {
      method: "DELETE",
    });
    return res.data;
  },

  async obtenerEventos(id, { limit } = {}) {
    const query = limit ? `?limit=${limit}` : "";
    const res = await apiClient(`/personas/${id}/eventos-recientes${query}`);
    return res.data;
  },

  async obtenerResumen(id) {
    const res = await apiClient(`/personas/${id}/resumen`);
    return res.data;
  },
};
