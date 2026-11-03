import { apiGet } from "./client";

export const personasApi = {
  listar: (params) => apiGet("/personas", params),
  obtener: (id) => apiGet(`/personas/${id}`),
  resumen: (id) => apiGet(`/personas/${id}/resumen`),
  // Relaciones con Empresas (empresaPersonas), vigente y anteriores, con empresaNombre.
  relaciones: (id) => apiGet(`/personas/${id}/relaciones`),
  eventosRecientes: (id, limit) =>
    apiGet(`/personas/${id}/eventos-recientes`, { limit }),
};
