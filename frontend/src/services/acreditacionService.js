import { apiClient } from "../api/apiClient";

export const acreditacionService = {
  async listarEntidades({ tipo, search, page, pageSize } = {}) {
    const params = new URLSearchParams();
    if (tipo) params.set("tipo", tipo);
    if (search) params.set("search", search);
    if (page) params.set("page", page);
    if (pageSize) params.set("pageSize", pageSize);
    const query = params.toString() ? `?${params.toString()}` : "";
    return apiClient(`/acreditaciones/entidades${query}`);
  },

  async previewRequerimientos({ entidadTipo, entidadId, perfilParticipacionId, fechaInicio }) {
    const params = new URLSearchParams();
    if (entidadTipo) params.set("entidadTipo", entidadTipo);
    if (entidadId) params.set("entidadId", entidadId);
    if (perfilParticipacionId) params.set("perfilParticipacionId", perfilParticipacionId);
    if (fechaInicio) params.set("fechaInicio", fechaInicio);
    const res = await apiClient(`/acreditaciones/preview-requerimientos?${params.toString()}`);
    return res.data;
  },

  async reemplazar(payload) {
    const res = await apiClient("/acreditaciones/reemplazar", {
      method: "POST",
      body: payload,
    });
    return res.data;
  },

  async previewNueva({ empresaId, perfilParticipacionId, fechaInicio, seleccion }) {
    const res = await apiClient("/acreditaciones/preview-nueva", {
      method: "POST",
      body: { empresaId, perfilParticipacionId, fechaInicio, seleccion },
    });
    return res.data;
  },

  async listarEntidadesDeEmpresa({ empresaId, tipo }) {
    const params = new URLSearchParams({ empresaId, tipo });
    const res = await apiClient(`/acreditaciones/entidades-empresa?${params.toString()}`);
    return res.data;
  },

  async asignarEntidad(payload) {
    const res = await apiClient("/acreditaciones/asignar", {
      method: "POST",
      body: payload,
    });
    return res.data;
  },

  async cambiarProyectoPersona(personaId, payload) {
    const res = await apiClient(`/acreditaciones/personas/${personaId}/cambiar-proyecto`, {
      method: "POST",
      body: payload,
    });
    return res.data;
  },

  async cambiarProyectoRecurso(recursoId, payload) {
    const res = await apiClient(`/acreditaciones/recursos/${recursoId}/cambiar-proyecto`, {
      method: "POST",
      body: payload,
    });
    return res.data;
  },
};
