import { apiClient } from "../api/apiClient";

// Respaldo y restauración de la base de datos (solo superadmin; el backend rechaza a cualquier otro rol).
export const respaldoService = {
  async obtenerConfiguracion() {
    const res = await apiClient("/admin/respaldos/configuracion");
    return res.data;
  },

  // Devuelve { configuracion, advertencia }.
  async guardarConfiguracion(payload) {
    const res = await apiClient("/admin/respaldos/configuracion", { method: "PUT", body: payload });
    return res.data;
  },

  async probarAcceso(bucketDestino) {
    const res = await apiClient("/admin/respaldos/probar-acceso", { method: "POST", body: { bucketDestino } });
    return res.data;
  },

  // Historial de operaciones (el backend refresca el estado de las que están en curso).
  async listar() {
    const res = await apiClient("/admin/respaldos");
    return res.data || [];
  },

  async ejecutar() {
    const res = await apiClient("/admin/respaldos/ejecutar", { method: "POST" });
    return res.data;
  },

  async restaurar(id, { confirmacion, crearRespaldoSeguridad }) {
    const res = await apiClient(`/admin/respaldos/${id}/restaurar`, {
      method: "POST",
      body: { confirmacion, crearRespaldoSeguridad },
    });
    return res.data;
  },
};
