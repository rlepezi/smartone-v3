import { apiClient } from "../api/apiClient";

// Administración de tipos documentales de Revisiones IA (superadmin).
export const tipoDocumentalService = {
  // Tipos con métricas (concordancia, costo promedio) y los requerimientos que los usan.
  async listar() {
    const res = await apiClient("/tipos-documentales");
    return res.data;
  },

  // cambios: { estadoIA, modeloPreferido, umbralLegibilidad, entidades, campos }.
  async actualizar(id, cambios) {
    const res = await apiClient(`/tipos-documentales/${id}`, { method: "PUT", body: cambios });
    return res.data;
  },

  // Habilita o deshabilita el tipo: estado "activo" | "inactivo".
  async cambiarEstado(id, estado) {
    const res = await apiClient(`/tipos-documentales/${id}/estado`, { method: "PATCH", body: { estado } });
    return res.data;
  },

  // { grupos: [{ descripcion, apariciones, mandantes, ultimoVisto }], truncado }.
  async porNormalizar() {
    const res = await apiClient("/tipos-documentales/por-normalizar");
    return res.data;
  },
};
