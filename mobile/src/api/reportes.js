import { apiGet } from "./client";

export const reportesApi = {
  resumen: (params) => apiGet("/reportes/resumen", params),
  detalle: (params) => apiGet("/reportes/detalle", params),
  participantesPorProyecto: (proyectoId) =>
    apiGet(`/reportes/proyectos/${proyectoId}/participantes`),
};
