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

  // Panel de la página de Reportes: todas las secciones en una respuesta. Fechas aaaa-mm-dd.
  async obtenerPanel({ mandanteId, desde, hasta, proyectoId, perfilParticipacionId, empresaId } = {}) {
    const params = new URLSearchParams();
    Object.entries({ mandanteId, desde, hasta, proyectoId, perfilParticipacionId, empresaId })
      .forEach(([clave, valor]) => { if (valor) params.set(clave, valor); });
    const query = params.toString() ? `?${params.toString()}` : "";
    const res = await apiClient(`/reportes/panel${query}`);
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
