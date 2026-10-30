import { apiClient } from "../api/apiClient";

const post = async (endpoint, body) => (await apiClient(endpoint, { method: "POST", body })).data;
const get = async (endpoint) => (await apiClient(endpoint)).data;
const conParams = (endpoint, params) => {
  const query = new URLSearchParams(Object.entries(params || {}).filter(([, v]) => v)).toString();
  return query ? `${endpoint}?${query}` : endpoint;
};

// Revisiones IA: sesiones, archivos, consolidación y resolución (la UI lee el progreso en vivo
// directo de Firestore; ver useSesionRevisionEnVivo).
export const revisionIAService = {
  // { configurada, modelo, preciosConfigurados, sharepoint: { nombre, estadoConexion } | null }.
  estado: (mandanteId) => get(conParams("/revisiones-ia/estado", { mandanteId })),

  // Tipos documentales activos (selector "Validación con IA" del Requerimiento).
  // Tipos disponibles para IA (activos, estado IA piloto o activo); con entidad, solo los de esa
  // entidad ("persona" | "empresa" | "recurso").
  listarTiposDocumentales: (entidad = null) => get(conParams("/revisiones-ia/tipos-documentales", { entidad })),

  // archivos: [{ mime, tamanoBytes, paginas? }] → { costoEstimadoUsd, modelo }.
  estimar: (mandanteId, archivos) => post("/revisiones-ia/estimar", { mandanteId, archivos }),

  // Plan de revisión contra la plantilla activa (no persiste): empresas, completitud, personas y
  // archivos para la IA. calcesManuales: { empresaCarpeta: { nombreCarpeta: seccionClave | "" } };
  // enlaces: { empresaCarpeta: { empresaId, expedienteId } }.
  // modoEstructura: "plantilla" (por defecto) | "libre" (sin plantilla: todo archivo legible va a la IA).
  // Desde un Expediente: { expedienteId, requerimientoIds, omitirValidados } (empresa y expediente
  // fijos, solo sus personas y los tipos de esos requerimientos).
  analizar: ({ mandanteId, arbol, calcesManuales, enlaces, modoEstructura, expedienteId, requerimientoIds, omitirValidados }) =>
    post("/revisiones-ia/estructura/analizar", {
      mandanteId, arbol, calcesManuales, enlaces, modoEstructura, expedienteId, requerimientoIds, omitirValidados,
    }),

  // payload: { mandanteId, nombre, carpetaRaizNombre, modo, modoEstructura, arbol, calcesManuales,
  // enlaces } → { sesion, archivosIA }.
  crearSesion: (payload) => post("/revisiones-ia/sesiones", payload),

  enviarArchivo: (sesionId, { entidadClave, archivoMeta, contenidoBase64 }) =>
    post(`/revisiones-ia/sesiones/${sesionId}/archivos`, { entidadClave, archivoMeta, contenidoBase64 }),

  // Consolida una entidad (persona) al terminar sus archivos.
  consolidar: (sesionId, entidadClave) => post(`/revisiones-ia/sesiones/${sesionId}/carpetas/consolidar`, { entidadClave }),

  finalizar: (sesionId) => post(`/revisiones-ia/sesiones/${sesionId}/finalizar`),

  cancelar: (sesionId) => post(`/revisiones-ia/sesiones/${sesionId}/cancelar`),

  // filtros: { mandanteId, fuente, estado, origen (modulo | expediente), desde, hasta (aaaa-mm-dd),
  // cursor } → { items, cursor }.
  listar: (filtros) => get(conParams("/revisiones-ia/sesiones", filtros)),

  // { sesion, resultados, procesamientos, completitud }.
  detalle: (sesionId) => get(`/revisiones-ia/sesiones/${sesionId}`),

  // accion: "aceptar" | "corregir" | "descartar". Con expedienteId, solo evalúa en ese expediente.
  // fechaVencimiento (aaaa-mm-dd): solo al corregir, si la IA no la leyó o la leyó mal.
  resolver: (resultadoId, { accion, resultadoFinal, observacion, expedienteId, fechaVencimiento }) =>
    post(`/revisiones-ia/resultados/${resultadoId}/resolver`, {
      accion, resultadoFinal, observacion, expedienteId, fechaVencimiento: fechaVencimiento || undefined,
    }),

  // Pestaña Consumo de Configuración IA (superadmin y mandante_admin).
  consumo: (mandanteId) => get(conParams("/revisiones-ia/consumo", { mandanteId })),
};
