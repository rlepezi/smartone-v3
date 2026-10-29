import { apiClient } from "../api/apiClient";

const BASE = "/revisiones-requerimiento-ia";

// "Revisar con IA" por requerimiento (superadmin y evaluador). La IA solo propone: el evaluador aplica
// la propuesta al formulario y guarda la evaluación como siempre (con `revisionIAId`).
export const revisionRequerimientoIAService = {
  // { requerimientosHabilitados: [requerimientoId], propuestas: [revisión pendiente por requisito] }.
  async estado(expedienteId) {
    return (await apiClient(`${BASE}/expedientes/${expedienteId}/estado`)).data;
  },

  // Pauta de validación de cada requerimiento del expediente (todos los que leen el expediente):
  // { pautas: { requerimientoId: { estadoIA, tipo: { codigo, nombre } | null, reglas: [...] } } }.
  async pautas(expedienteId) {
    return (await apiClient(`/expedientes/${expedienteId}/revisiones-ia/pautas`)).data;
  },

  // filtros: { estado, resultado } → revisiones del expediente (más reciente primero).
  async listar(expedienteId, filtros = {}) {
    const q = new URLSearchParams(Object.entries(filtros).filter(([, v]) => v)).toString();
    return (await apiClient(`${BASE}/expedientes/${expedienteId}${q ? `?${q}` : ""}`)).data;
  },

  // datos: { expedienteRequerimientoId, origen, archivos: [{ nombre, rutaRelativa, mime, contenidoBase64, parte, ultimaModificacion }] }.
  async revisar(expedienteId, datos) {
    return (await apiClient(`${BASE}/expedientes/${expedienteId}/revisar`, { method: "POST", body: datos })).data;
  },

  async descartar(revisionId) {
    return (await apiClient(`${BASE}/${revisionId}/descartar`, { method: "POST", body: {} })).data;
  },
};
