import { apiClient } from "../api/apiClient";

// Carpetas de empresa: cada subcarpeta de la fuente documental del Mandante (una empresa en un
// proyecto), con su mapeo documental. La carpeta del expediente se lee con el resolvedor
// (repositorioDocumentalService.obtener → { origen, repositorioDocumental, carpetaEmpresa }).
export const carpetaEmpresaService = {
  // Carpetas del Mandante (o de una fuente), con empresa, proyecto, expediente y avance
  // { ubicados, total } del mapeo.
  async listar({ mandanteId, fuenteId } = {}) {
    const params = new URLSearchParams();
    if (mandanteId) params.set("mandanteId", mandanteId);
    if (fuenteId) params.set("fuenteId", fuenteId);
    const q = params.toString();
    return (await apiClient(`/carpetas-empresa${q ? `?${q}` : ""}`)).data;
  },

  // Sin escribir: ¿la carpeta sirve para la empresa en el proyecto? (paso 1 de Nueva Acreditación,
  // antes de crear el expediente). datos: { mandanteId, empresaId, proyectoId, ruta | url }.
  async verificar(datos) {
    return (await apiClient("/carpetas-empresa/verificar", { method: "POST", body: datos })).data;
  },

  // Find-or-create + validación + vínculo. datos: { expedienteId, ruta | url }.
  async vincular(datos) {
    return (await apiClient("/carpetas-empresa/vincular", { method: "POST", body: datos })).data;
  },

  // cambios: { carpetaPersonas?, carpetaRecursos?, mapeo?: { requerimientoId: [{ ruta, tipo }] | null } }.
  async actualizar(id, cambios) {
    return (await apiClient(`/carpetas-empresa/${id}`, { method: "PATCH", body: cambios })).data;
  },

  // La carpeta queda libre (conserva su mapeo).
  async desvincular(expedienteId) {
    return (await apiClient(`/expedientes/${expedienteId}/desvincular-carpeta`, { method: "POST" })).data;
  },

  // Mapeo documental: registra una subcarpeta de la fuente como Carpeta de empresa (sin proyecto).
  // datos: { mandanteId, ruta, empresaId }.
  async registrar(datos) {
    return (await apiClient("/carpetas-empresa/registrar", { method: "POST", body: datos })).data;
  },

  // Requerimientos asignables de una carpeta: { conExpediente, requerimientos: [{ id, nombre,
  // nombreCorto }], total }.
  async requerimientos(id) {
    return (await apiClient(`/carpetas-empresa/${id}/requerimientos`)).data;
  },
};
