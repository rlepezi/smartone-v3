import { apiClient } from "../api/apiClient";

// Configuración → Inteligencia Artificial (solo superadmin). La API key se envía una vez y nunca
// vuelve: el backend solo devuelve sus últimos 4 caracteres.
export const configuracionIAService = {
  async obtener() {
    const res = await apiClient("/configuracion-ia");
    return res.data;
  },

  async guardarApiKey(apiKey) {
    const res = await apiClient("/configuracion-ia/api-key", { method: "PUT", body: { apiKey } });
    return res.data;
  },

  async desactivar() {
    const res = await apiClient("/configuracion-ia/desactivar", { method: "POST" });
    return res.data;
  },

  async probar() {
    const res = await apiClient("/configuracion-ia/probar", { method: "POST" });
    return res.data;
  },

  async actualizar({ modeloPorDefecto, preciosPorModelo, limiteGastoMensualUsd }) {
    const res = await apiClient("/configuracion-ia", {
      method: "PUT",
      body: { modeloPorDefecto, preciosPorModelo, limiteGastoMensualUsd },
    });
    return res.data;
  },

  async gastoMes() {
    const res = await apiClient("/configuracion-ia/gasto-mes");
    return res.data;
  },
};
