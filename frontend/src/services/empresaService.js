import { apiClient } from "../api/apiClient";

export const empresaService = {
  // `mandanteId`: solo las empresas asociadas a ese Mandante (empresaMandantes activo). El
  // alcance del usuario lo aplica siempre el backend.
  async listar(estado, { mandanteId } = {}) {
    const params = new URLSearchParams();
    if (estado) params.set("estado", estado);
    if (mandanteId) params.set("mandanteId", mandanteId);
    const query = params.toString() ? `?${params.toString()}` : "";
    const res = await apiClient(`/empresas${query}`);
    return res.data;
  },

  // Mandantes asociados (empresaMandantes) y su gestión. Asociar: superadmin/admin_comercial a
  // cualquier Mandante; mandante_admin solo al propio. Desasociar: superadmin/admin_comercial.
  async listarMandantes(id) {
    const res = await apiClient(`/empresas/${id}/mandantes`);
    return res.data;
  },

  async asociarMandante(id, mandanteId) {
    const res = await apiClient(`/empresas/${id}/mandantes`, { method: "POST", body: { mandanteId } });
    return res.data;
  },

  async desasociarMandante(id, mandanteId) {
    const res = await apiClient(`/empresas/${id}/mandantes/${mandanteId}`, { method: "DELETE" });
    return res.data;
  },

  async obtenerPorId(id) {
    const res = await apiClient(`/empresas/${id}`);
    return res.data;
  },

  async crear(payload) {
    const res = await apiClient("/empresas", {
      method: "POST",
      body: payload,
    });
    return res.data;
  },

  async actualizar(id, payload) {
    const res = await apiClient(`/empresas/${id}`, {
      method: "PUT",
      body: payload,
    });
    return res.data;
  },

  async desactivar(id) {
    const res = await apiClient(`/empresas/${id}`, {
      method: "DELETE",
    });
    return res.data;
  },

  async obtenerEventos(id, { limit } = {}) {
    const query = limit ? `?limit=${limit}` : "";
    const res = await apiClient(`/empresas/${id}/eventos-recientes${query}`);
    return res.data;
  },

  // Personas y Maquinarias con relación con la Empresa y sus Proyectos de asignación activa,
  // resueltos en el backend en una sola llamada: { empresa, filas }.
  async obtenerRecursos(id) {
    const res = await apiClient(`/empresas/${id}/recursos`);
    return res.data;
  },

  async obtenerResumen(id) {
    const res = await apiClient(`/empresas/${id}/resumen`);
    return res.data;
  },
};
