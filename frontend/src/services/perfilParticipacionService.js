import { apiClient } from "../api/apiClient";

const cacheRequisitos = new Map();

export const perfilParticipacionService = {
  async listar({ mandanteId, estado } = {}) {
    const params = new URLSearchParams();
    if (mandanteId) params.set("mandanteId", mandanteId);
    if (estado) params.set("estado", estado);
    const query = params.toString() ? `?${params.toString()}` : "";
    const res = await apiClient(`/perfiles-participacion${query}`);
    return res.data;
  },

  async obtenerPorId(id) {
    const res = await apiClient(`/perfiles-participacion/${id}`);
    return res.data;
  },

  // Requerimientos aplicables al Perfil (mismo cálculo que el Expediente). Caché corta en
  // memoria: las tarjetas del Paso 3 y el sidebar del wizard piden el mismo dato y así
  // comparten una sola fuente y una sola petición.
  async listarRequerimientos(id) {
    const hit = cacheRequisitos.get(id);
    if (hit && Date.now() - hit.t < 30000) return hit.p;
    const p = apiClient(`/perfiles-participacion/${id}/requerimientos`).then((res) => res.data || []);
    cacheRequisitos.set(id, { t: Date.now(), p });
    p.catch(() => cacheRequisitos.delete(id));
    return p;
  },

  async obtenerResumen(id) {
    const res = await apiClient(`/perfiles-participacion/${id}/resumen`);
    return res.data;
  },

  async listarOtrosDelMandante(id) {
    const res = await apiClient(`/perfiles-participacion/${id}/otros-del-mandante`);
    return res.data;
  },

  async crear(payload) {
    const res = await apiClient("/perfiles-participacion", {
      method: "POST",
      body: payload,
    });
    return res.data;
  },

  async actualizar(id, payload) {
    const res = await apiClient(`/perfiles-participacion/${id}`, {
      method: "PUT",
      body: payload,
    });
    return res.data;
  },

  async desactivar(id) {
    const res = await apiClient(`/perfiles-participacion/${id}`, {
      method: "DELETE",
    });
    return res.data;
  },
};
