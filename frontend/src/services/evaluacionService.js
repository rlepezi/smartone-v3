import { apiClient } from "../api/apiClient";

// Catálogo de resultados: espejo manual de
// functions/src/services/evaluacionService.js (fuente única de verdad).
export const RESULTADOS_EVALUACION = [
  { value: "cumple", label: "Cumple" },
  { value: "no_cumple", label: "No Cumple" },
  { value: "no_aplica", label: "No Aplica" },
  { value: "pendiente", label: "Pendiente" },
];

export const evaluacionService = {
  async listarPorExpediente(expedienteId, incluirHistorial = false) {
    const params = new URLSearchParams({ expedienteId });
    if (incluirHistorial) params.set("incluirHistorial", "true");
    const res = await apiClient(`/evaluaciones?${params.toString()}`);
    return res.data;
  },

  async listarVigentes() {
    const res = await apiClient("/evaluaciones");
    return res.data;
  },

  async listarGlobal({ proyectoId, empresaId, estado } = {}) {
    const params = new URLSearchParams();
    if (proyectoId) params.set("proyectoId", proyectoId);
    if (empresaId) params.set("empresaId", empresaId);
    if (estado) params.set("estado", estado);
    const query = params.toString() ? `?${params.toString()}` : "";
    const res = await apiClient(`/evaluaciones${query}`);
    return res.data;
  },

  async crear(payload) {
    const res = await apiClient("/evaluaciones", {
      method: "POST",
      body: payload,
    });
    return res.data;
  },
};
