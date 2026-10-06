import { apiGet } from "./client";

export const recursosApi = {
  listar: (params) => apiGet("/recursos", params),
  obtener: (id) => apiGet(`/recursos/${id}`),
  tipos: () => apiGet("/recursos/tipos"),
  relaciones: (id) => apiGet(`/recursos/${id}/relaciones`),
  eventosRecientes: (id, limit) =>
    apiGet(`/recursos/${id}/eventos-recientes`, { limit }),
};
