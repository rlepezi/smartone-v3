import { apiGet } from "./client";

export const evaluacionesApi = {
  listar: (params) => apiGet("/evaluaciones", params),
};
