import { apiGet } from "./client";

export const participacionesApi = {
  listar: (params) => apiGet("/participaciones", params),
  obtener: (id) => apiGet(`/participaciones/${id}`),
};
