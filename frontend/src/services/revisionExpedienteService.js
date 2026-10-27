import { apiClient } from "../api/apiClient";

// Revisiones IA dentro de un Expediente: configuración (carpeta y requerimientos habilitados para
// IA) y matriz de estado sujeto × requerimiento.
export const revisionExpedienteService = {
  // { config, plantilla, empresa, coincidenciaEmpresa, requerimientos, resumen, puedeEditar }.
  async obtenerConfig(expedienteId) {
    return (await apiClient(`/expedientes/${expedienteId}/revisiones-ia/config`)).data;
  },

  // cambios: { fuente?, carpetaNombre? (null = quitar), modoEstructura?, requerimientosIA? }.
  async guardarConfig(expedienteId, cambios) {
    return (await apiClient(`/expedientes/${expedienteId}/revisiones-ia/config`, { method: "PUT", body: cambios })).data;
  },

  // Propuestas de IA sin resolver, por instancia (requisitos de cada sujeto).
  async propuestas(expedienteId) {
    return (await apiClient(`/expedientes/${expedienteId}/revisiones-ia/propuestas`)).data;
  },

  // "Aceptar todas las propuestas que cumplen" → { aceptados, omitidos, errores }.
  async aceptarLote(expedienteId, resultadoIds) {
    return (await apiClient(`/expedientes/${expedienteId}/revisiones-ia/aceptar-lote`, { method: "POST", body: { resultadoIds } })).data;
  },

  // { columnas, filas: [{ clave, tipoEntidad, nombre, detalle, celdas }], contadores, hoy }.
  async matriz(expedienteId) {
    return (await apiClient(`/expedientes/${expedienteId}/revisiones-ia/matriz`)).data;
  },
};
