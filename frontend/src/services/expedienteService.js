import { apiClient } from "../api/apiClient";

// Catálogo de estados: espejo manual de functions/src/services/expedienteService.js (fuente única
// de verdad). El estado es el AVANCE de la evaluación y lo calcula el backend: creado (nada
// evaluado), en_ejecucion (faltan requisitos), completado (todo evaluado; el resultado va aparte,
// con el % de cumplimiento) y completado_pendientes (estuvo completado y apareció algo por evaluar;
// la interfaz también lo muestra así si hay documentos vencidos). cerrado es manual.
export const ESTADOS_EXPEDIENTE = [
  { value: "creado", label: "Creado", color: "bg-primary-lighter text-primary-dark border-primary-light" },
  { value: "en_ejecucion", label: "En ejecución", color: "bg-blue-50 text-blue-700 border-blue-200" },
  { value: "completado", label: "Completado", color: "bg-sage-lighter text-sage-darker border-sage-light" },
  { value: "completado_pendientes", label: "Completado con pendientes", color: "bg-amber-50 text-amber-700 border-amber-200" },
  { value: "cerrado", label: "Cerrado", color: "bg-slate-100 text-slate-600 border-slate-200" },
];

// Etiqueta de un estado, incluidos los del modelo anterior (aparecen en el historial).
const ETIQUETAS_ESTADO_ANTERIOR = {
  en_revision: "En revisión", con_observaciones: "Con observaciones", aprobado: "Aprobado",
};
export const etiquetaEstadoExpediente = (estado) =>
  ESTADOS_EXPEDIENTE.find((e) => e.value === estado)?.label || ETIQUETAS_ESTADO_ANTERIOR[estado] || estado || "—";

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

  // Acciones manuales (ver functions/src/services/expedienteService.js). "Inicio en faena" es una
  // marca (fechaInicioEjecucion), no un estado.
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

  // Correcciones (solo superadmin), con motivo obligatorio: { detalle }. volverAAprobado quita la
  // marca de inicio en faena (el endpoint conserva su nombre).
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
