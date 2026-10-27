import { apiClient } from "../api/apiClient";

// Caché en memoria de consultas de Mandantes que comparten los formularios (ver
// useMandanteContexto): una sola consulta por sesión de navegador y por clave, en vez de una por
// pantalla. Se vacía al crear, editar o desactivar un Mandante y al recargar la página.
const cache = new Map();

export const mandanteService = {
  async listar(estado) {
    const query = estado ? `?estado=${estado}` : "";
    const res = await apiClient(`/mandantes${query}`);
    return res.data;
  },

  async obtenerPorId(id) {
    const res = await apiClient(`/mandantes/${id}`);
    return res.data;
  },

  // Devuelve la promesa de `cargar()` guardada bajo `clave`; si falla, no queda en caché.
  enCache(clave, cargar) {
    if (!cache.has(clave)) {
      const promesa = cargar();
      cache.set(clave, promesa);
      promesa.catch(() => { if (cache.get(clave) === promesa) cache.delete(clave); });
    }
    return cache.get(clave);
  },

  vaciarCache() {
    cache.clear();
  },

  async crear(payload) {
    const res = await apiClient("/mandantes", {
      method: "POST",
      body: payload,
    });
    cache.clear();
    return res.data;
  },

  async actualizar(id, payload) {
    const res = await apiClient(`/mandantes/${id}`, {
      method: "PUT",
      body: payload,
    });
    cache.clear();
    return res.data;
  },

  async desactivar(id) {
    const res = await apiClient(`/mandantes/${id}`, {
      method: "DELETE",
    });
    cache.clear();
    return res.data;
  },
};