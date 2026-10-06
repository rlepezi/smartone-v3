import { apiClient } from "../api/apiClient";

export const bitacoraService = {
  async listar({ mandanteId, entidad, entidadId, limit } = {}) {
    const params = new URLSearchParams();
    if (mandanteId) params.set("mandanteId", mandanteId);
    if (entidad) params.set("entidad", entidad);
    if (entidadId) params.set("entidadId", entidadId);
    if (limit) params.set("limit", limit);
    const query = params.toString() ? `?${params.toString()}` : "";
    const res = await apiClient(`/bitacora${query}`);
    return res.data;
  },
};
