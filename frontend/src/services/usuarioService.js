import { apiClient } from "../api/apiClient";

// Catálogo oficial de roles: espejo manual de
// functions/src/services/usuarioService.js (fuente única de verdad).
export const ROLES_USUARIO = [
  { value: "superadmin", label: "Super Administrador", requiereMandante: false },
  { value: "evaluador", label: "Evaluador", requiereMandante: false },
  { value: "admin_comercial", label: "Administrador Comercial", requiereMandante: false },
  { value: "mandante_admin", label: "Administrador de Mandante", requiereMandante: true },
  { value: "mandante_lector", label: "Lector de Mandante", requiereMandante: true },
];

export const usuarioService = {
  async listar({ mandanteId, estado } = {}) {
    const params = new URLSearchParams();
    if (mandanteId) params.set("mandanteId", mandanteId);
    if (estado) params.set("estado", estado);
    const query = params.toString() ? `?${params.toString()}` : "";
    const res = await apiClient(`/usuarios${query}`);
    return res.data;
  },

  async obtenerPorId(id) {
    const res = await apiClient(`/usuarios/${id}`);
    return res.data;
  },

  async crear(payload) {
    const res = await apiClient("/usuarios", {
      method: "POST",
      body: payload,
    });
    return res.data;
  },

  async actualizar(id, payload) {
    const res = await apiClient(`/usuarios/${id}`, {
      method: "PATCH",
      body: payload,
    });
    return res.data;
  },

  async desactivar(id) {
    const res = await apiClient(`/usuarios/${id}/desactivar`, {
      method: "POST",
    });
    return res.data;
  },

  async reactivar(id) {
    const res = await apiClient(`/usuarios/${id}/reactivar`, {
      method: "POST",
    });
    return res.data;
  },

  async resetPassword(id) {
    const res = await apiClient(`/usuarios/${id}/reset-password`, {
      method: "POST",
    });
    return res.data;
  },

  async revocarSesiones(id) {
    const res = await apiClient(`/usuarios/${id}/revocar-sesiones`, {
      method: "POST",
    });
    return res.data;
  },

  async obtenerResumenActividadHoy() {
    const res = await apiClient("/usuarios/actividad-hoy");
    return res.data;
  },

  async obtenerMetricas(id, { desde, hasta } = {}) {
    const params = new URLSearchParams();
    if (desde) params.set("desde", desde);
    if (hasta) params.set("hasta", hasta);
    const query = params.toString() ? `?${params.toString()}` : "";
    const res = await apiClient(`/usuarios/${id}/metricas${query}`);
    return res.data;
  },

  async obtenerActividad(id, { cursor, tipo } = {}) {
    const params = new URLSearchParams();
    if (cursor) params.set("cursor", cursor);
    if (tipo) params.set("tipo", tipo);
    const query = params.toString() ? `?${params.toString()}` : "";
    const res = await apiClient(`/usuarios/${id}/actividad${query}`);
    return res.data;
  },

  async obtenerSesiones(id, { cursor } = {}) {
    const params = new URLSearchParams();
    if (cursor) params.set("cursor", cursor);
    const query = params.toString() ? `?${params.toString()}` : "";
    const res = await apiClient(`/usuarios/${id}/sesiones${query}`);
    return res.data;
  },
};
