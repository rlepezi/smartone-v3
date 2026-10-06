import { apiGet } from "./client";

export const asignacionesApi = {
  listar: (params) => apiGet("/asignaciones", params),
  obtener: (id) => apiGet(`/asignaciones/${id}`),
};
