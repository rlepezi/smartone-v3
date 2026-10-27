import { apiClient } from "../api/apiClient";

// Repositorio documental de un Expediente (carpeta local o SharePoint). Es la misma configuración
// de carpeta que usa la pestaña Revisiones IA.
export const repositorioDocumentalService = {
  // { repositorioDocumental: { tipo, etiqueta, url, updatedAt, updatedByNombre } | null,
  //   modoEstructura, puedeEditar }.
  async obtener(expedienteId) {
    return (await apiClient(`/expedientes/${expedienteId}/repositorio-documental`)).data;
  },

  // Carpeta (ruta relativa a la raíz) de una persona o recurso del expediente; null la quita.
  async asignarCarpetaSujeto(expedienteId, { tipo, sujetoId, carpetaRelativa }) {
    return (await apiClient(`/expedientes/${expedienteId}/carpeta-sujeto`, { method: "PATCH", body: { tipo, sujetoId, carpetaRelativa } })).data;
  },

  // datos: { tipo: "local", etiqueta, mapeo? } | { mapeo } (solo el mapeo) | { tipo: "sharepoint", url, etiqueta? } | { tipo: null } (quitar).
  async actualizar(expedienteId, datos) {
    return (await apiClient(`/expedientes/${expedienteId}/repositorio-documental`, { method: "PATCH", body: datos })).data;
  },
};
