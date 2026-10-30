import { apiGet } from "./client";

export const expedientesApi = {
  listar: (params) => apiGet("/expedientes", params),
  obtener: (id) => apiGet(`/expedientes/${id}`),
  // Instancias de Requerimiento de un sujeto: { empresa: true } | { personaId } | { recursoId }.
  requerimientos: (id, { personaId, recursoId, empresa } = {}) =>
    apiGet(`/expedientes/${id}/requerimientos`, personaId ? { personaId }
      : recursoId ? { recursoId } : empresa ? { empresa: "true" } : {}),
};
