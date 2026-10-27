import { apiClient } from "../api/apiClient";

// Catálogo de estados: espejo manual de
// functions/src/services/expedienteService.js (fuente única de verdad).
// creado / en_revision / con_observaciones / aprobado son DERIVADOS de las Evaluaciones reales
// (el backend los recalcula solo); en_ejecucion y cerrado son decisiones manuales ("Iniciar
// ejecución" y "Cerrar expediente"), y el cierre también ocurre al finalizar el Proyecto.
export const ESTADOS_EXPEDIENTE = [
  { value: "creado", label: "Creado", color: "bg-primary-lighter text-primary-dark border-primary-light" },
  { value: "en_revision", label: "En Revisión", color: "bg-amber-50 text-amber-700 border-amber-200" },
  { value: "con_observaciones", label: "Con Observaciones", color: "bg-amber-50 text-amber-700 border-amber-200" },
  { value: "aprobado", label: "Aprobado", color: "bg-sage-lighter text-sage-darker border-sage-light" },
  { value: "en_ejecucion", label: "En Ejecución", color: "bg-sage-lighter text-sage-darker border-sage-light" },
  { value: "cerrado", label: "Cerrado", color: "bg-slate-100 text-slate-600 border-slate-200" },
];

// Motivos de cierre (espejo de MOTIVOS_CIERRE del backend). "otro" exige detalle.
export const MOTIVOS_CIERRE = [
  { value: "fin_proyecto", label: "Fin de proyecto" },
  { value: "salida_empresa", label: "Salida de la empresa" },
  { value: "cierre_administrativo", label: "Cierre administrativo" },
  { value: "otro", label: "Otro" },
];

export const etiquetaMotivoCierre = (motivo) =>
  MOTIVOS_CIERRE.find((m) => m.value === motivo)?.label || motivo || "";

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

  // Transiciones manuales de estado (ver functions/src/services/expedienteService.js).
  async iniciarEjecucion(id) {
    const res = await apiClient(`/expedientes/${id}/iniciar-ejecucion`, { method: "POST" });
    return res.data;
  },

  // { motivo, detalle }: devuelve el expediente y `cierre` ({ participacionFinalizada,
  // personas, maquinarias }).
  async cerrar(id, payload) {
    const res = await apiClient(`/expedientes/${id}/cerrar`, { method: "POST", body: payload });
    return res.data;
  },

  // Correcciones (solo superadmin), con motivo obligatorio: { detalle }.
  async volverAAprobado(id, payload) {
    const res = await apiClient(`/expedientes/${id}/volver-a-aprobado`, { method: "POST", body: payload });
    return res.data;
  },

  async reabrir(id, payload) {
    const res = await apiClient(`/expedientes/${id}/reabrir`, { method: "POST", body: payload });
    return res.data;
  },

  // Historial de estados (expedienteEstados), del más antiguo al más reciente.
  async historialEstados(id) {
    const res = await apiClient(`/expedientes/${id}/historial-estados`);
    return res.data;
  },

  // Vencimientos del Expediente (calculados al leer): { items, totales, umbralDias }.
  // estado: "vencidos" | "proximos" | "todos".
  async vencimientos(id, estado = "todos") {
    const res = await apiClient(`/expedientes/${id}/vencimientos?estado=${estado}`);
    return res.data;
  },

  // Instancias de Requerimiento del Expediente (expedienteRequerimientos), de un sujeto:
  // { empresa: true } | { personaId } | { recursoId }. estado: "activo" (por defecto),
  // "retirado" o "todos".
  async listarRequerimientos(id, { personaId, recursoId, empresa, estado } = {}) {
    const params = new URLSearchParams();
    if (personaId) params.set("personaId", personaId);
    if (recursoId) params.set("recursoId", recursoId);
    if (empresa) params.set("empresa", "true");
    if (estado) params.set("estado", estado);
    const query = params.toString() ? `?${params.toString()}` : "";
    const res = await apiClient(`/expedientes/${id}/requerimientos${query}`);
    return res.data;
  },

  // Reintenta la generación de instancias de un Expediente que quedó "en_proceso".
  async reintentarGeneracion(id) {
    const res = await apiClient(`/expedientes/${id}/generar`, { method: "POST" });
    return res.data;
  },

  // Regla manual del Expediente: agrega un Requerimiento para todos los sujetos de su tipo
  // (también los que se asignen después); quitarla retira sus instancias (sin borrarlas).
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
