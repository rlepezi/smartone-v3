import { apiClient } from "../api/apiClient";

export const reporteService = {
  async obtenerResumen({ proyectoId, diasVencimiento } = {}) {
    const params = new URLSearchParams();
    if (proyectoId) params.set("proyectoId", proyectoId);
    if (diasVencimiento) params.set("diasVencimiento", diasVencimiento);
    const query = params.toString() ? `?${params.toString()}` : "";
    const res = await apiClient(`/reportes/resumen${query}`);
    return res.data;
  },

  async obtenerDetalle({ tipo, proyectoId, diasVencimiento } = {}) {
    const params = new URLSearchParams();
    params.set("tipo", tipo);
    if (proyectoId) params.set("proyectoId", proyectoId);
    if (diasVencimiento) params.set("diasVencimiento", diasVencimiento);
    const res = await apiClient(`/reportes/detalle?${params.toString()}`);
    return res.data;
  },

  async obtenerParticipantesPorProyecto(proyectoId) {
    const res = await apiClient(`/reportes/proyectos/${proyectoId}/participantes`);
    return res.data;
  },
};
