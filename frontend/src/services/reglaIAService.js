import { apiClient } from "../api/apiClient";

const conParams = (endpoint, params) => {
  const q = new URLSearchParams(Object.entries(params || {}).filter(([, v]) => v)).toString();
  return q ? `${endpoint}?${q}` : endpoint;
};

const REQ = "/reglas-ia/requerimientos";

// Biblioteca de reglas de revisión IA y reglas IA de cada requerimiento (solo superadmin).
export const reglaIAService = {
  // filtros: { tipo, entidad, estado, texto } → reglas con `uso` (requerimientos que la usan).
  async listar(filtros) {
    return (await apiClient(conParams("/reglas-ia", filtros))).data;
  },

  // Catálogo de verificaciones determinísticas con el esquema de sus parámetros.
  async verificaciones() {
    return (await apiClient("/reglas-ia/verificaciones")).data;
  },

  // Regla con sus versiones anteriores.
  async obtener(id) {
    return (await apiClient(`/reglas-ia/${id}`)).data;
  },

  // datos: { nombre, descripcion, tipo, verificacion, instruccionIA, camposRequeridos, parametros, entidades }.
  async crear(datos) {
    return (await apiClient("/reglas-ia", { method: "POST", body: datos })).data;
  },

  // "Guardar para todos": nueva versión.
  async actualizar(id, datos) {
    return (await apiClient(`/reglas-ia/${id}`, { method: "PUT", body: datos })).data;
  },

  // "Duplicar": regla nueva "(copia)" con `datos` (o igual a la original sin datos).
  async duplicar(id, datos = null) {
    return (await apiClient(`/reglas-ia/${id}/duplicar`, { method: "POST", body: datos || {} })).data;
  },

  // estado: "activa" | "inactiva".
  async cambiarEstado(id, estado) {
    return (await apiClient(`/reglas-ia/${id}/estado`, { method: "PATCH", body: { estado } })).data;
  },

  // ---- Reglas IA de un requerimiento ----

  // { entidad: { total, habilitados } } de los requerimientos activos.
  async cobertura() {
    return (await apiClient(`${REQ}/cobertura`)).data;
  },

  // { requerimiento, tipo, tiposDisponibles, vinculos, pruebas, pruebaVigente, transiciones }.
  async obtenerRequerimiento(id) {
    return (await apiClient(`${REQ}/${id}`)).data;
  },


  // estadoIA: "en_definicion" | "en_prueba" | "habilitado".
  async cambiarEstadoIA(id, estadoIA) {
    return (await apiClient(`${REQ}/${id}/estado`, { method: "PATCH", body: { estadoIA } })).data;
  },

  // datos: { reglaId, severidad, parametros }.
  async agregarRegla(id, datos) {
    return (await apiClient(`${REQ}/${id}/reglas`, { method: "POST", body: datos })).data;
  },

  // datos: { severidad?, parametros?, activa? }.
  async actualizarVinculo(id, vinculoId, datos) {
    return (await apiClient(`${REQ}/${id}/reglas/${vinculoId}`, { method: "PATCH", body: datos })).data;
  },

  // Quita la regla del requerimiento (el vínculo queda inactivo; no se borra).
  async quitarVinculo(id, vinculoId) {
    return (await apiClient(`${REQ}/${id}/reglas/${vinculoId}/quitar`, { method: "POST", body: {} })).data;
  },

  async ordenar(id, ids) {
    return (await apiClient(`${REQ}/${id}/orden`, { method: "PUT", body: { ids } })).data;
  },

  // Copia las reglas de otro requerimiento → configuración + { copiadas, omitidas }.
  async copiarDe(id, origenId) {
    return (await apiClient(`${REQ}/${id}/copiar`, { method: "POST", body: { origenId } })).data;
  },

  // datos: { archivos: [{ nombre, rutaRelativa, mime, contenidoBase64, parte }], contexto }.
  async probar(id, datos) {
    return (await apiClient(`${REQ}/${id}/probar`, { method: "POST", body: datos })).data;
  },

  // Modelo de IA del requerimiento (null = el del tipo, si hay, o el modelo por defecto).
  async asignarModelo(id, modelo) {
    return (await apiClient(`${REQ}/${id}/modelo`, { method: "PUT", body: { modelo } })).data;
  },

  // Campos que la IA lee además de los de las reglas ([{ clave, etiqueta, tipo }]; [] = solo los
  // de las reglas). Reemplazan a los del tipo documental.
  async asignarCamposAdicionales(id, campos) {
    return (await apiClient(`${REQ}/${id}/campos-adicionales`, { method: "PUT", body: { campos } })).data;
  },

  // Reglas sugeridas [{ verificacion, nombre, etiqueta }] → agregadas al requerimiento como
  // bloqueantes: se reutiliza la regla activa de la biblioteca con esa verificación (sin listas
  // propias, p. ej. carpeta_presente con nombres de carpeta) o, si no hay, se crea.
  async agregarSugeridas(requerimiento, sugeridas) {
    const id = requerimiento.id;
    const biblioteca = await this.listar({ tipo: "deterministica", entidad: requerimiento.tipoEntidad, estado: "activa" });
    const sinListas = (b) => !Object.values(b.parametros || {}).some((v) => Array.isArray(v) && v.length);
    let config = null;
    for (const r of sugeridas) {
      const regla = biblioteca.find((b) => b.verificacion === r.verificacion && sinListas(b))
        || await this.crear({
          nombre: r.nombre, descripcion: r.etiqueta, tipo: "deterministica",
          verificacion: r.verificacion, entidades: [requerimiento.tipoEntidad], parametros: {},
        });
      config = await this.agregarRegla(id, { reglaId: regla.id, severidad: "bloqueante" });
    }
    return config || this.obtenerRequerimiento(id);
  },
};
