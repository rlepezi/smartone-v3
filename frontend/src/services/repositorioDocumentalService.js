import { apiClient } from "../api/apiClient";

// Repositorio documental de un Expediente, leído en el backend con resolverCarpetaExpediente: la
// Carpeta de empresa del expediente o, si no tiene, la configuración anterior (legado).
export const repositorioDocumentalService = {
  // { origen: "carpetaEmpresa" | "legado" | "ninguna",
  //   repositorioDocumental: { tipo, etiqueta, ruta, url, carpetaEmpresaId, fuenteId,
  //     mapeo: { carpetaPersonas, carpetaRecursos, requerimientos: { id: [{ ruta, tipo, origen }] } },
  //     updatedAt, updatedByNombre } | null,
  //   carpetaEmpresa: { id, ruta, empresaNombre, proyectoNombre, estadoMapeo, ... } | null,
  //   modoEstructura, puedeEditar }.
  // Con Carpeta de empresa, actualizar({ mapeo }) escribe en la carpeta y { tipo: null } la desvincula.
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
