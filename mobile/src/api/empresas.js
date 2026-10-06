import { apiGet } from "./client";

export const empresasApi = {
  listar: (params) => apiGet("/empresas", params),
  obtener: (id) => apiGet(`/empresas/${id}`),
  resumen: (id) => apiGet(`/empresas/${id}/resumen`),
  eventosRecientes: (id, limit) =>
    apiGet(`/empresas/${id}/eventos-recientes`, { limit }),
};
