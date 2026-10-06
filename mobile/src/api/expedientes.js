import { apiGet } from "./client";

export const expedientesApi = {
  listar: (params) => apiGet("/expedientes", params),
  obtener: (id) => apiGet(`/expedientes/${id}`),
};
