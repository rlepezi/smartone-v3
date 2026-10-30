import { apiClient } from "../api/apiClient";

// Vencimientos de documentos de todos los Expedientes abiertos en el alcance del usuario
// (Dashboard). estado: "vencidos" | "proximos". Devuelve { items, total, cursor }.
export const vencimientoService = {
  async listar({ mandanteId, estado = "vencidos", limit = 10, cursor } = {}) {
    const params = new URLSearchParams({ estado, limit: String(limit) });
    if (mandanteId) params.set("mandanteId", mandanteId);
    if (cursor) params.set("cursor", cursor);
    const res = await apiClient(`/vencimientos?${params.toString()}`);
    return res.data;
  },
};
