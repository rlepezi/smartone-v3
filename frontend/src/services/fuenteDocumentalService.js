import { apiClient } from "../api/apiClient";

// Fuentes documentales por Mandante: la raíz del árbol de carpetas (una subcarpeta por empresa y
// proyecto). Una sola activa por Mandante: SharePoint (superadmin y mandante_admin) o carpeta local
// (solo superadmin; el handle vive en el navegador). Las respuestas nunca traen el client secret:
// solo `secretUltimos4`. Todas traen `etiqueta` y `url` uniformes.
export const fuenteDocumentalService = {
  async listar(mandanteId) {
    const res = await apiClient(`/fuentes-documentales?mandanteId=${encodeURIComponent(mandanteId)}`);
    return res.data;
  },

  // datos: { mandanteId, nombre, tenantId, clientId, clientSecret, siteUrl, biblioteca, rutaBase }.
  async crear(datos) {
    const res = await apiClient("/fuentes-documentales", { method: "POST", body: datos });
    return res.data;
  },

  // Sin clientSecret (vacío) se conserva el anterior.
  async actualizar(id, datos) {
    const res = await apiClient(`/fuentes-documentales/${id}`, { method: "PUT", body: datos });
    return res.data;
  },

  async desactivar(id) {
    const res = await apiClient(`/fuentes-documentales/${id}/desactivar`, { method: "POST" });
    return res.data;
  },

  async reactivar(id) {
    const res = await apiClient(`/fuentes-documentales/${id}/reactivar`, { method: "POST" });
    return res.data;
  },

  // Fuente activa del Mandante (o null): para vincular Carpetas de empresa y leer la del expediente.
  async activa(mandanteId) {
    const q = mandanteId ? `?mandanteId=${encodeURIComponent(mandanteId)}` : "";
    return (await apiClient(`/fuentes-documentales/activa${q}`)).data;
  },

  // Registra o cambia la carpeta local (nombre de la carpeta raíz). Con SharePoint activo responde
  // 409 codigo "SHAREPOINT_ACTIVA" (detalle.fuenteId); con Carpetas de empresa activas,
  // "FUENTE_CON_CARPETAS".
  async guardarLocal(mandanteId, etiqueta) {
    return (await apiClient(`/fuentes-documentales/local/${encodeURIComponent(mandanteId)}`, { method: "PUT", body: { etiqueta } })).data;
  },
};
