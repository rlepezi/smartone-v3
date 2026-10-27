const evidenciaRequerimientoRepository =
    require("../repositories/evidenciaRequerimientoRepository");
const evidenciaRepository = require("../repositories/evidenciaRepository");
const expedienteRepository = require("../repositories/expedienteRepository");
const expedienteRequerimientoRepository =
    require("../repositories/expedienteRequerimientoRepository");
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
   * Crea un nuevo vínculo entre una Evidencia y una instancia de
   * Requerimiento (expedienteRequerimientoId) de su mismo Expediente y del
   * mismo sujeto: la evidencia de una Persona nunca respalda la exigencia
   * de otra. Se rechaza sobre un Expediente cerrado o en generación, o una
   * instancia retirada.
   * @param {Object} payload evidenciaId y expedienteRequerimientoId.
   * @param {Object} actor Usuario autenticado que ejecuta la acción.
   * @return {Promise<Object>} El vínculo creado.
   */
  async crearVinculo(payload, actor) {
    const {evidenciaId, expedienteRequerimientoId} = payload;

    if (!evidenciaId || !expedienteRequerimientoId) {
      throw new AppError(
          400,
          "Faltan campos obligatorios: 'evidenciaId' y " +
          "'expedienteRequerimientoId' son requeridos.",
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

    const instancia = await expedienteRequerimientoRepository.getById(
        expedienteRequerimientoId,
    );
    if (!instancia || instancia.expedienteId !== evidencia.expedienteId) {
      throw new AppError(
          400,
          "El Requerimiento indicado no pertenece al Expediente de la " +
          "Evidencia.",
      );
    }
    const mismoSujeto =
        (evidencia.personaId || null) === (instancia.personaId || null) &&
        (evidencia.recursoId || null) === (instancia.recursoId || null);
    if (!mismoSujeto) {
      throw new AppError(
          400,
          "La Evidencia es de otro sujeto: no puede respaldar este " +
          "Requerimiento.",
      );
    }

    const expediente = await expedienteRepository.getById(
        instancia.expedienteId,
    );
    if (!expediente) {
      throw new AppError(400, "El Expediente asociado no existe.");
    }
    require("./evaluacionService").exigirInstanciaEvaluable(
        expediente, instancia,
    );

    const existente = await evidenciaRequerimientoRepository
        .getByEvidenciaEInstancia(evidenciaId, expedienteRequerimientoId);
    if (existente) {
      throw new AppError(
          409,
          "Ya existe un vínculo entre esta Evidencia y este Requerimiento.",
      );
    }

    return await evidenciaRequerimientoRepository.create({
      evidenciaId,
      expedienteRequerimientoId,
      expedienteId: instancia.expedienteId,
      mandanteId: evidencia.mandanteId,
      estado: "activo",
    });
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
