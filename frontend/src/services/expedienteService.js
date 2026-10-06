import { apiClient } from "../api/apiClient";

// Catálogo de estados: espejo manual de
// functions/src/services/expedienteService.js (fuente única de verdad).
// creado / en_revision / con_observaciones / aprobado son DERIVADOS de las Evaluaciones reales
// (el backend los recalcula solo); en_ejecucion y cerrado son decisiones manuales.
export const ESTADOS_EXPEDIENTE = [
  { value: "creado", label: "Creado", color: "bg-primary-lighter text-primary-dark border-primary-light" },
  { value: "en_revision", label: "En Revisión", color: "bg-amber-50 text-amber-700 border-amber-200" },
  { value: "con_observaciones", label: "Con Observaciones", color: "bg-amber-50 text-amber-700 border-amber-200" },
  { value: "aprobado", label: "Aprobado", color: "bg-sage-lighter text-sage-darker border-sage-light" },
  { value: "en_ejecucion", label: "En Ejecución", color: "bg-sage-lighter text-sage-darker border-sage-light" },
  { value: "cerrado", label: "Cerrado", color: "bg-slate-100 text-slate-600 border-slate-200" },
];

// Espejo manual de las ÚNICAS transiciones manuales del backend
// (functions/src/services/expedienteService.js).
export const TRANSICIONES_VALIDAS = {
  aprobado: ["en_ejecucion"],
  en_ejecucion: ["cerrado"],
  cerrado: [],
};

export const expedienteService = {
  // incluirConteo: cada expediente trae `cantidadPersonas` y `cantidadMaquinarias` (Asignaciones
  // activas), resueltos por el backend en la misma respuesta. Solo lo pide el listado de Expedientes.
  async listar({ mandanteId, estado, incluirConteo = false } = {}) {
    const params = new URLSearchParams();
    if (mandanteId) params.set("mandanteId", mandanteId);
    if (estado) params.set("estado", estado);
    if (incluirConteo) params.set("incluirConteo", "true");
    const query = params.toString() ? `?${params.toString()}` : "";
    const res = await apiClient(`/expedientes${query}`);
    return res.data;
  },

  async obtenerPorId(id) {
    const res = await apiClient(`/expedientes/${id}`);
    return res.data;
  },

  async crear(payload) {
    const res = await apiClient("/expedientes", {
      method: "POST",
      body: payload,
    });
    return res.data;
  },

  // Eventos de Bitácora del Expediente y de su Participación (mecanismo compartido de eventos).
  async obtenerEventos(id, { limit } = {}) {
    const query = limit ? `?limit=${limit}` : "";
    const res = await apiClient(`/expedientes/${id}/eventos-recientes${query}`);
    return res.data;
  },

  async transicionar(id, payload) {
    const res = await apiClient(`/expedientes/${id}/transicionar`, {
      method: "PUT",
      body: payload,
    });
    return res.data;
  },

  // Agrega/quita un Requerimiento puntual de un Expediente ya creado (fuera del snapshot
  // original del Perfil, RN-032). Se agrega para todos los sujetos de su tipoEntidad
  // ("Todos"), con origen "manual".
  async agregarRequerimiento(id, requerimientoId) {
    const res = await apiClient(`/expedientes/${id}/requerimientos`, {
      method: "POST",
      body: { requerimientoId },
    });
    return res.data;
  },

  async quitarRequerimiento(id, requerimientoId) {
    const res = await apiClient(`/expedientes/${id}/requerimientos/${requerimientoId}`, {
      method: "DELETE",
    });
    return res.data;
  },
};
