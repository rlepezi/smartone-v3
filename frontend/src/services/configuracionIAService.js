import { apiClient } from "../api/apiClient";

// Filtro de consumo para las llamadas sin Mandante ("Interno / sin Mandante").
export const MANDANTE_INTERNO = "interno";
export const ETIQUETA_SIN_MANDANTE = "Interno / sin Mandante";

// Origen de cada llamada a la IA (registro consumosIA).
export const ORIGEN_CONSUMO_IA = {
  revision_carpeta: "Revisión de carpetas",
  prueba_reglas: "Probar reglas",
  revision_requerimiento: "Revisar con IA (expediente)",
  revision_lote: "Revisión en lote (expediente)",
  probar_conexion: "Probar conexión",
};

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

  // Consumo del período por Mandante. desde / hasta: "aaaa-mm-dd" (sin ellos, el mes actual).
  // mandanteId: un Mandante (agrega su desglose por origen, tipo documental y mes) o
  // MANDANTE_INTERNO para los consumos sin Mandante.
  async resumenConsumo({ desde, hasta, mandanteId } = {}) {
    const query = new URLSearchParams(Object.entries({ desde, hasta, mandanteId }).filter(([, v]) => v)).toString();
    const res = await apiClient(`/configuracion-ia/consumo/resumen${query ? `?${query}` : ""}`);
    return res.data;
  },
};
