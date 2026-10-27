import { apiClient } from "../api/apiClient";
import { storageService } from "./storageService";
import { evidenciaRequerimientoService } from "./evidenciaRequerimientoService";

export const evidenciaService = {
  async listar({ mandanteId, estado, expedienteId } = {}) {
    const params = new URLSearchParams();
    if (mandanteId) params.set("mandanteId", mandanteId);
    if (estado) params.set("estado", estado);
    if (expedienteId) params.set("expedienteId", expedienteId);
    const query = params.toString() ? `?${params.toString()}` : "";
    const res = await apiClient(`/evidencias${query}`);
    return res.data;
  },

  // Flujo único para adjuntar un documento a un Requerimiento: sube el archivo a
  // Storage, registra la Evidencia del Expediente y la vincula al Requerimiento.
  // Lo usan el detalle del Expediente y el detalle de Proyecto.
  // Sube el archivo, crea la Evidencia (del sujeto de la instancia) y la enlaza a la instancia de
  // Requerimiento (expedienteRequerimientoId).
  async subirYVincular({ expedienteId, archivo, expedienteRequerimientoId, personaId, recursoId, fechaVencimiento }) {
    const { url, nombre, tipo } = await storageService.subirEvidencia(expedienteId, archivo);

    const payload = {
      expedienteId,
      archivoUrl: url,
      archivoNombre: nombre,
      archivoTipo: tipo,
      fechaVencimiento: fechaVencimiento || null,
    };
    if (personaId) payload.personaId = personaId;
    else if (recursoId) payload.recursoId = recursoId;

    const nueva = await this.crear(payload);
    await evidenciaRequerimientoService.crear({ evidenciaId: nueva.id, expedienteRequerimientoId });
    return nueva;
  },

  // Excepción manual a la purga por anonimización (solo superadmin, con motivo).
  async cancelarPurga(id, motivo) {
    const res = await apiClient(`/evidencias/${id}/cancelar-purga`, { method: "POST", body: { motivo } });
    return res.data;
  },

  async obtenerPorId(id) {
    const res = await apiClient(`/evidencias/${id}`);
    return res.data;
  },

  async crear(payload) {
    const res = await apiClient("/evidencias", {
      method: "POST",
      body: payload,
    });
    return res.data;
  },

  async actualizarEstado(id, estado) {
    const res = await apiClient(`/evidencias/${id}`, {
      method: "PUT",
      body: { estado },
    });
    return res.data;
  },
};
