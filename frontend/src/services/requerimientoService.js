import { apiClient } from "../api/apiClient";

// Catálogo de tipos de entidad de un Requerimiento (`tipoEntidad`): espejo
// manual de functions/src/services/requerimientoService.js (fuente única de
// verdad). "recurso" se muestra como "Maquinaria".
export const TIPOS_ENTIDAD = [
  { value: "empresa", label: "Empresa" },
  { value: "persona", label: "Persona" },
  { value: "recurso", label: "Maquinaria" },
];

export const etiquetaTipoEntidad = (tipo) =>
  TIPOS_ENTIDAD.find((t) => t.value === tipo)?.label || tipo || "";

export const NOMBRE_CORTO_MAX = 40;

// Cada Requerimiento pertenece a un Mandante. Crear y editar envían el Requerimiento junto con su
// aplicabilidad — { perfilParticipacionIds: [...], perfilRecursoIds: null | [...] } (null = "Todos") —
// y el backend lo guarda todo en una sola transacción.
export const requerimientoService = {
  // Requerimientos de UN Mandante (obligatorio para superadmin/evaluador; los roles de Mandante
  // quedan fijos en el suyo). Cada uno trae su `aplicabilidad`.
  async listar({ mandanteId, estado, tipoEntidad } = {}) {
    const params = new URLSearchParams();
    if (mandanteId) params.set("mandanteId", mandanteId);
    if (estado) params.set("estado", estado);
    if (tipoEntidad) params.set("tipoEntidad", tipoEntidad);
    const query = params.toString() ? `?${params.toString()}` : "";
    const res = await apiClient(`/requerimientos${query}`);
    return res.data;
  },

  // Mapa id -> nombre de los Requerimientos de los Mandantes indicados (uno por Mandante, nunca
  // el catálogo completo). Para pantallas que solo tienen el requerimientoId (ej. Evaluaciones).
  async nombresDeMandantes(mandanteIds = []) {
    const ids = [...new Set(mandanteIds.filter(Boolean))];
    const listas = await Promise.all(ids.map((mandanteId) => this.listar({ mandanteId }).catch(() => [])));
    const mapa = {};
    listas.flat().forEach((r) => { mapa[r.id] = r.nombre; });
    return mapa;
  },

  async obtenerPorId(id) {
    const res = await apiClient(`/requerimientos/${id}`);
    return res.data;
  },

  async crear(payload) {
    const res = await apiClient("/requerimientos", {
      method: "POST",
      body: payload,
    });
    return res.data;
  },

  async actualizar(id, payload) {
    const res = await apiClient(`/requerimientos/${id}`, {
      method: "PUT",
      body: payload,
    });
    return res.data;
  },
};
