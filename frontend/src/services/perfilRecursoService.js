import { apiClient } from "../api/apiClient";

export const perfilRecursoService = {
  // incluirConteo: cada perfil trae `cantidadRequerimientos` (lo resuelve el
  // backend en la misma respuesta). Solo lo pide el listado de Perfiles de Recurso.
  async listar({ mandanteId, tipo, estado, incluirConteo = false } = {}) {
    const params = new URLSearchParams();
    if (mandanteId) params.set("mandanteId", mandanteId);
    if (tipo) params.set("tipo", tipo);
    if (estado) params.set("estado", estado);
    if (incluirConteo) params.set("incluirConteo", "true");
    const query = params.toString() ? `?${params.toString()}` : "";
    const res = await apiClient(`/perfiles-recurso${query}`);
    return res.data;
  },

  async obtenerPorId(id) {
    const res = await apiClient(`/perfiles-recurso/${id}`);
    return res.data;
  },

  async crear(payload) {
    const res = await apiClient("/perfiles-recurso", {
      method: "POST",
      body: payload,
    });
    return res.data;
  },

  async actualizar(id, payload) {
    const res = await apiClient(`/perfiles-recurso/${id}`, {
      method: "PUT",
      body: payload,
    });
    return res.data;
  },

  async desactivar(id) {
    const res = await apiClient(`/perfiles-recurso/${id}`, {
      method: "DELETE",
    });
    return res.data;
  },
};
