import { apiClient } from "../api/apiClient";

// Plantilla de estructura de carpetas del Mandante (Revisiones IA): qué secciones y documentos se
// esperan en la carpeta de arranque de cada empresa y cómo reconocerlos.
export const plantillaEstructuraService = {
  // Plantilla activa del Mandante, o null.
  async obtenerActiva(mandanteId) {
    const res = await apiClient(`/plantillas-estructura?mandanteId=${encodeURIComponent(mandanteId)}`);
    return res.data;
  },

  // origen: "transemel" (plantilla incluida) | "json" (con `plantilla`).
  async importar({ mandanteId, origen, plantilla }) {
    const res = await apiClient("/plantillas-estructura/importar", { method: "POST", body: { mandanteId, origen, plantilla } });
    return res.data;
  },

  // Guarda la plantilla completa (nombre, profundidadSubcontratos, secciones); sube la versión.
  async actualizar(id, plantilla) {
    const res = await apiClient(`/plantillas-estructura/${id}`, { method: "PUT", body: plantilla });
    return res.data;
  },

  // cambios: [{ nivel: "seccion" | "archivoSeccion" | "documento", seccionClave, elementoClave?,
  // habilitado }] → { plantilla, estadoEfectivo, alcance }. Una sola versión nueva.
  async guardarHabilitacion(id, cambios) {
    const res = await apiClient(`/plantillas-estructura/${id}/habilitacion`, { method: "PATCH", body: { cambios } });
    return res.data;
  },

  // accion: "habilitar_todo" | "deshabilitar_todo"; sin seccionClave, toda la plantilla.
  async habilitacionMasiva(id, accion, seccionClave) {
    const res = await apiClient(`/plantillas-estructura/${id}/habilitacion/masiva`, { method: "POST", body: { accion, seccionClave } });
    return res.data;
  },

  // Alcance de validación (documentos habilitados, modalidad, reglas y advertencias).
  async alcance(id) {
    const res = await apiClient(`/plantillas-estructura/${id}/alcance`);
    return res.data;
  },

  async desactivar(id) {
    const res = await apiClient(`/plantillas-estructura/${id}/desactivar`, { method: "POST" });
    return res.data;
  },
};
