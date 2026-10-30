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

  // datos: { expedienteRequerimientoId, origen, archivos: [{ nombre, rutaRelativa, mime, contenidoBase64, parte, ultimaModificacion }],
  // lote?: true, loteId? } (en lote, el consumo queda como "revision_lote").
  async revisar(expedienteId, datos) {
    return (await apiClient(`${BASE}/expedientes/${expedienteId}/revisar`, { method: "POST", body: datos })).data;
  },

  // Antes de un lote: items [{ expedienteRequerimientoId, archivos: [{ mime, paginas? }] }] →
  // { documentos, archivos, porEntidad, costoEstimadoUsd, modelos, faltanPrecios, limiteMensualUsd,
  //   gastoMesUsd, disponibleUsd, alcanza }.
  async estimarLote(expedienteId, items) {
    return (await apiClient(`${BASE}/expedientes/${expedienteId}/lote/estimar`, { method: "POST", body: { items } })).data;
  },

  // Confirmación en bloque → { aplicadas, omitidas: [{ revisionId, motivo }], errores }.
  async confirmarLote(expedienteId, revisionIds) {
    return (await apiClient(`${BASE}/expedientes/${expedienteId}/lote/confirmar`, { method: "POST", body: { revisionIds } })).data;
  },

  async descartar(revisionId) {
    return (await apiClient(`${BASE}/${revisionId}/descartar`, { method: "POST", body: {} })).data;
  },
};
