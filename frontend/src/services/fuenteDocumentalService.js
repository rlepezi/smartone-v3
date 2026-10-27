import { apiClient } from "../api/apiClient";

// Fuentes documentales por Mandante (hoy: configuración de SharePoint). Las respuestas nunca traen
// el client secret: solo `secretUltimos4`.
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
};
