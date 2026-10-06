const evidenciaRequerimientoRepository =
    require("../repositories/evidenciaRequerimientoRepository");
const evidenciaRepository = require("../repositories/evidenciaRepository");
const expedienteRepository = require("../repositories/expedienteRepository");
const AppError = require("../utils/AppError");

const ESTADOS_VALIDOS = ["activo", "inactivo"];

// Roles cuyo acceso queda siempre acotado a su propio mandanteId. Igual
// que en el resto de módulos, "evaluador" queda deliberadamente fuera: el
// spec le da permiso explícito para crear vínculos sin restricción de
// mandanteId (aunque no pueda subir Evidencias nuevas).
const ROLES_ALCANCE_FORZADO = ["mandante_admin", "mandante_lector"];

/**
 * Reglas de negocio para el recurso Evidencia-Requerimiento: vincula una
 * Evidencia con un Requerimiento aplicable a su Expediente. El
 * expedienteId del documento se DERIVA siempre de la Evidencia
 * referenciada — nunca se lee del payload del cliente.
 */
class EvidenciaRequerimientoService {
  /**
   * Obtiene un vínculo por su ID, respetando el alcance del actor.
   * @param {string} id ID del vínculo.
   * @param {Object} actor Usuario autenticado que ejecuta la acción.
   * @return {Promise<Object>} El vínculo encontrado.
   */
  async getVinculoById(id, actor) {
    if (!id || typeof id !== "string") {
      throw new AppError(400, "ID de vínculo inválido.");
    }
    const vinculo = await evidenciaRequerimientoRepository.getById(id);
    if (!vinculo) {
      throw new AppError(404, "Vínculo no encontrado.");
    }
    if (
      ROLES_ALCANCE_FORZADO.includes(actor.rol) &&
      vinculo.mandanteId !== actor.mandanteId
    ) {
      throw new AppError(404, "Vínculo no encontrado.");
    }
    return vinculo;
  }

  /**
   * Lista los vínculos activos de un Expediente, respetando el alcance
   * del actor.
   * @param {string} expedienteId ID del Expediente.
   * @param {Object} actor Usuario autenticado que ejecuta la acción.
   * @return {Promise<Object[]>} Lista de vínculos activos.
   */
  async listarActivosPorExpediente(expedienteId, actor) {
    const expediente = await expedienteRepository.getById(expedienteId);
    if (!expediente) {
      throw new AppError(404, "Expediente no encontrado.");
    }
    if (
      ROLES_ALCANCE_FORZADO.includes(actor.rol) &&
      expediente.mandanteId !== actor.mandanteId
    ) {
      throw new AppError(404, "Expediente no encontrado.");
    }
    return await evidenciaRequerimientoRepository
        .getActivosByExpediente(expedienteId);
  }

  /**
   * Crea un nuevo vínculo entre una Evidencia y un Requerimiento aplicable
   * al Expediente de esa Evidencia.
   * @param {Object} payload Datos del nuevo vínculo.
   * @param {Object} actor Usuario autenticado que ejecuta la acción.
   * @return {Promise<Object>} El vínculo creado.
   */
  async crearVinculo(payload, actor) {
    const {evidenciaId, requerimientoId} = payload;

    if (!evidenciaId || !requerimientoId) {
      throw new AppError(
          400,
          "Faltan campos obligatorios: 'evidenciaId' y " +
          "'requerimientoId' son requeridos.",
      );
    }

    const evidencia = await evidenciaRepository.getById(evidenciaId);
    if (!evidencia) {
      throw new AppError(400, "La Evidencia indicada no existe.");
    }

    // mandanteId ya viene denormalizado y correctamente derivado en la
    // Evidencia — no hace falta volver a derivarlo desde el Expediente.
    if (
      ROLES_ALCANCE_FORZADO.includes(actor.rol) &&
      evidencia.mandanteId !== actor.mandanteId
    ) {
      throw new AppError(
          403,
          "No tiene permisos para vincular evidencias de otro Mandante.",
      );
    }

    const expedienteId = evidencia.expedienteId;
    const expediente = await expedienteRepository.getById(expedienteId);
    if (!expediente) {
      throw new AppError(400, "El Expediente asociado no existe.");
    }

    const aplicable = (expediente.requerimientosAplicables || [])
        .some((r) => r.requerimientoId === requerimientoId);
    if (!aplicable) {
      throw new AppError(
          400,
          "El Requerimiento indicado no aplica a este Expediente.",
      );
    }

    const existente = await evidenciaRequerimientoRepository
        .getByEvidenciaYRequerimiento(evidenciaId, requerimientoId);
    if (existente) {
      throw new AppError(
          409,
          "Ya existe un vínculo entre esta Evidencia y este Requerimiento.",
      );
    }

    const nuevoVinculo = {
      evidenciaId,
      requerimientoId,
      expedienteId,
      mandanteId: evidencia.mandanteId,
      estado: "activo",
    };

    return await evidenciaRequerimientoRepository.create(nuevoVinculo);
  }

  /**
   * Cambia el estado (activo/inactivo) de un vínculo existente. Es el
   * único campo editable — la relación en sí es inmutable.
   * @param {string} id ID del vínculo.
   * @param {Object} payload Payload de la petición (solo se usa `estado`).
   * @param {Object} actor Usuario autenticado que ejecuta la acción.
   * @return {Promise<Object|null>} El vínculo actualizado.
   */
  async actualizarVinculo(id, payload, actor) {
    await this.getVinculoById(id, actor); // Verifica existencia y alcance

    if (!ESTADOS_VALIDOS.includes(payload.estado)) {
      throw new AppError(
          400,
          `Estado '${payload.estado}' no válido. ` +
          `Valores permitidos: ${ESTADOS_VALIDOS.join(", ")}.`,
      );
    }

    return await evidenciaRequerimientoRepository.update(id, {
      estado: payload.estado,
    });
  }
}

module.exports = new EvidenciaRequerimientoService();
