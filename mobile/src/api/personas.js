import { apiGet } from "./client";

export const personasApi = {
  listar: (params) => apiGet("/personas", params),
  obtener: (id) => apiGet(`/personas/${id}`),
  resumen: (id) => apiGet(`/personas/${id}/resumen`),
  eventosRecientes: (id, limit) =>
    apiGet(`/personas/${id}/eventos-recientes`, { limit }),
};
