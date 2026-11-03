import { apiClient } from "../api/apiClient";

// Mapeo documental: vínculo N:N entre los nodos de la plantilla del Mandante y sus requerimientos
// (solo superadmin vincula; los demás roles leen).
export const mapeoRequerimientoService = {
  // Vínculos del Mandante (todos los estados): [{ nodoClave, requerimientoId, nivel, estado, motivoInactivo }].
  async listar(mandanteId) {
    return (await apiClient(`/mapeo-requerimientos?mandanteId=${encodeURIComponent(mandanteId)}`)).data;
  },

  // { requerimientoId, nodos: [{ nodoClave, tipoNodo, ruta, nivel, estado, alias, multiple, datosSensibles }] }.
  async porRequerimiento(requerimientoId) {
    return (await apiClient(`/mapeo-requerimientos/requerimientos/${requerimientoId}`)).data;
  },

  async vincular({ mandanteId, nodoClave, requerimientoId }) {
    return (await apiClient("/mapeo-requerimientos/vincular", { method: "POST", body: { mandanteId, nodoClave, requerimientoId } })).data;
  },

  async desvincular({ mandanteId, nodoClave, requerimientoId }) {
    return (await apiClient("/mapeo-requerimientos/desvincular", { method: "POST", body: { mandanteId, nodoClave, requerimientoId } })).data;
  },
};
