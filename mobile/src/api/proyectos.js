import { apiGet } from "./client";

export const proyectosApi = {
  listar: (params) => apiGet("/proyectos", params),
  obtener: (id) => apiGet(`/proyectos/${id}`),
  resumen: (id) => apiGet(`/proyectos/${id}/resumen`),
  eventosRecientes: (id, limit) =>
    apiGet(`/proyectos/${id}/eventos-recientes`, { limit }),
};
