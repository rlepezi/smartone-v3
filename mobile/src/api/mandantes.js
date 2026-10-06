import { apiGet } from "./client";

export const mandantesApi = {
  listar: (params) => apiGet("/mandantes", params),
  obtener: (id) => apiGet(`/mandantes/${id}`),
};
