import { apiClient } from "../api/apiClient";

// Ubicación documental en el expediente: configuración para el resolvedor (nodos de la plantilla,
// requerimientos del perfil y overrides), excepciones confirmadas por nodo y alias sugeridos.
export const ubicacionExpedienteService = {
  // { plantilla, nodos, requerimientosPerfil, aplicables: { requerimientoId: [nodoClave] }, overrides: [...] }.
  async config(expedienteId) {
    return (await apiClient(`/ubicacion-expediente/${expedienteId}`)).data;
  },

  // datos: { nodoClave, sujeto ("empresa" | personaId | recursoId), rutaReal }.
  // Devuelve { override, propuestaAlias: { nodoClave, nodo, alias } | null }.
  async confirmarOverride(expedienteId, datos) {
    return (await apiClient(`/ubicacion-expediente/${expedienteId}/overrides`, { method: "POST", body: datos })).data;
  },

  async desactivarOverride(expedienteId, id) {
    return (await apiClient(`/ubicacion-expediente/${expedienteId}/overrides/${encodeURIComponent(id)}/desactivar`, { method: "PATCH" })).data;
  },

  // { expedienteId, nodoClave, alias }: el superadmin lo aprueba en el acto; el evaluador lo deja pendiente.
  async sugerirAlias(datos) {
    return (await apiClient("/ubicacion-expediente/alias-sugeridos", { method: "POST", body: datos })).data;
  },

  async listarAliasSugeridos(mandanteId, estado = "pendiente") {
    return (await apiClient(`/ubicacion-expediente/alias-sugeridos?mandanteId=${encodeURIComponent(mandanteId)}&estado=${estado}`)).data;
  },

  // decision: "aprobado" | "rechazado" (solo superadmin).
  async resolverAliasSugerido(id, decision) {
    return (await apiClient(`/ubicacion-expediente/alias-sugeridos/${id}`, { method: "PATCH", body: { decision } })).data;
  },
};
