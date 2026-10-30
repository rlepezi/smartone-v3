import { apiClient } from "../api/apiClient";

// Instancias de Requerimiento (expedienteRequerimientos) de un sujeto en todos sus Expedientes
// (fichas de Empresa, Persona y Maquinaria). El alcance por Mandante lo aplica el backend.
export const expedienteRequerimientoService = {
  // { personaId } | { recursoId } | { empresaId }; estado "activo" (por defecto) o "todos".
  async listarPorSujeto({ personaId, recursoId, empresaId, estado } = {}) {
    const params = new URLSearchParams();
    if (personaId) params.set("personaId", personaId);
    if (recursoId) params.set("recursoId", recursoId);
    if (empresaId) params.set("empresaId", empresaId);
    if (estado) params.set("estado", estado);
    const res = await apiClient(`/expediente-requerimientos?${params.toString()}`);
    return res.data;
  },
};
