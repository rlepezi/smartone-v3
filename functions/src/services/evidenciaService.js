const evidenciaRepository = require("../repositories/evidenciaRepository");
const expedienteRepository = require("../repositories/expedienteRepository");
const personaRepository = require("../repositories/personaRepository");
const recursoRepository = require("../repositories/recursoRepository");
const {
  sujetoActivoEnParticipacion,
} = require("../utils/sujetosParticipacion");
const AppError = require("../utils/AppError");

const ESTADOS_VALIDOS = ["activo", "inactivo"];

// Roles cuyo acceso queda siempre acotado a su propio mandanteId (mismo
// criterio que el resto de módulos scoped por Mandante).
const ROLES_ALCANCE_FORZADO = ["mandante_admin", "mandante_lector"];

/**
 * Oculta el archivo de una Evidencia con acceso restringido (documento de
 * identidad de una Persona anonimizada) a quien no corresponde: solo
 * superadmin y el mandante_admin del Mandante de la Evidencia lo ven.
 * @param {Object} evidencia Evidencia.
 * @param {Object} actor Usuario autenticado.
 * @return {Object} La evidencia, con el archivo oculto si corresponde.
 */
function protegerEvidencia(evidencia, actor) {
  if (!evidencia.accesoRestringido) return evidencia;
  const autorizado = actor.rol === "superadmin" || (
    actor.rol === "mandante_admin" &&
    actor.mandanteId === evidencia.mandanteId
  );
  if (autorizado) return evidencia;
  return {
    ...evidencia, archivoUrl: null, archivoNombre: "Documento restringido",
  };
}

/**
 * Reglas de negocio para el recurso Evidencia. El backend nunca maneja los
 * bytes del archivo — el frontend sube directo a Firebase Storage y solo
 * envía la URL resultante. El mandanteId del documento se DERIVA siempre
 * del Expediente referenciado — nunca se lee del payload del cliente.
 */
class EvidenciaService {
  /**
   * Parsea y valida una fecha recibida del cliente.
   * @param {*} valor Valor a parsear.
   * @param {string} nombreCampo Nombre del campo, para el mensaje de error.
   * @return {Date} Fecha parseada.
   */
  _parseFecha(valor, nombreCampo) {
    const fecha = new Date(valor);
    if (isNaN(fecha.getTime())) {
      throw new AppError(400, `${nombreCampo} no es una fecha válida.`);
    }
    return fecha;
  }

  /**
   * Obtiene una evidencia por su ID, respetando el alcance del actor.
   * @param {string} id ID de la evidencia.
   * @param {Object} actor Usuario autenticado que ejecuta la acción.
   * @return {Promise<Object>} La evidencia encontrada.
   */
  async getEvidenciaById(id, actor) {
    if (!id || typeof id !== "string") {
      throw new AppError(400, "ID de evidencia inválido.");
    }
    const evidencia = await evidenciaRepository.getById(id);
    if (!evidencia) {
      throw new AppError(404, "Evidencia no encontrada.");
    }
    if (
      ROLES_ALCANCE_FORZADO.includes(actor.rol) &&
      evidencia.mandanteId !== actor.mandanteId
    ) {
      throw new AppError(404, "Evidencia no encontrada.");
    }
    return protegerEvidencia(evidencia, actor);
  }

  /**
   * Lista evidencias, forzando el alcance del actor cuando corresponde.
   * @param {Object} filtros Filtros de búsqueda.
   * @param {Object} actor Usuario autenticado que ejecuta la acción.
   * @return {Promise<Object[]>} Lista de evidencias.
   */
  async listarEvidencias(filtros, actor) {
    const filtrosFinales = {...filtros};
    if (ROLES_ALCANCE_FORZADO.includes(actor.rol)) {
      filtrosFinales.mandanteId = actor.mandanteId;
    }
    const lista = await evidenciaRepository.list(filtrosFinales);
    return lista.map((e) => protegerEvidencia(e, actor));
  }

  /**
   * Lista las evidencias activas de un Expediente específico, respetando
   * el alcance del actor.
   * @param {string} expedienteId ID del Expediente.
   * @param {Object} actor Usuario autenticado que ejecuta la acción.
   * @return {Promise<Object[]>} Lista de evidencias activas.
   */
  async listarActivasPorExpediente(expedienteId, actor) {
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
    const activas =
        await evidenciaRepository.getActivasByExpediente(expedienteId);
    return activas.map((e) => protegerEvidencia(e, actor));
  }

  /**
   * Crea una nueva evidencia, validando el Expediente y, si corresponde,
   * la Persona o el Recurso al que aplica.
   * @param {Object} payload Datos de la nueva evidencia.
   * @param {Object} actor Usuario autenticado que ejecuta la acción.
   * @param {Object} [referenciaLocal] Solo Revisiones IA (nunca del
   *     cliente): {rutaRelativa, hashSha256, sesionId} de un archivo que se
   *     revisó desde una carpeta local y NO se almacena; la Evidencia queda
   *     con origen "carpeta_local" y sin archivoUrl.
   * @return {Promise<Object>} La evidencia creada.
   */
  async crearEvidencia(payload, actor, referenciaLocal = null) {
    const {
      expedienteId, personaId, recursoId,
      archivoUrl, archivoNombre, archivoTipo, fechaVencimiento,
    } = payload;

    if (!expedienteId || (!archivoUrl && !referenciaLocal) ||
        !archivoNombre) {
      throw new AppError(
          400,
          "Faltan campos obligatorios: 'expedienteId', 'archivoUrl' y " +
          "'archivoNombre' son requeridos.",
      );
    }

    if (personaId && recursoId) {
      throw new AppError(
          400,
          "No se puede indicar 'personaId' y 'recursoId' simultáneamente.",
      );
    }

    const expediente = await expedienteRepository.getById(expedienteId);
    if (!expediente) {
      throw new AppError(400, "El Expediente indicado no existe.");
    }
    if (expediente.estado === "cerrado") {
      throw new AppError(
          409,
          "El Expediente está cerrado y no admite nuevas evidencias.",
      );
    }
    if (expediente.estadoGeneracion === "en_proceso") {
      throw new AppError(
          409,
          "El Expediente aún está generando sus Requerimientos: reintente la " +
          "generación antes de adjuntar evidencias.",
      );
    }

    // Alcance del actor: un mandante_admin/mandante_lector solo puede
    // adjuntar evidencias a Expedientes de su propio Mandante.
    if (
      ROLES_ALCANCE_FORZADO.includes(actor.rol) &&
      expediente.mandanteId !== actor.mandanteId
    ) {
      throw new AppError(
          403,
          "No tiene permisos para adjuntar evidencias a expedientes de " +
          "otro Mandante.",
      );
    }

    // mandanteId SIEMPRE se deriva del Expediente — jamás se lee del
    // payload del cliente.
    const mandanteId = expediente.mandanteId;

    if (personaId) {
      const persona = await personaRepository.getById(personaId);
      if (!persona) {
        throw new AppError(400, "La Persona indicada no existe.");
      }
      if (persona.estado !== "activo") {
        throw new AppError(400, "La Persona indicada no está activa.");
      }
      if (!(await sujetoActivoEnParticipacion(
          "persona", personaId, expediente.participacionId))) {
        throw new AppError(
            400,
            "La Persona indicada no está asignada a la Participación de " +
            "este Expediente.",
        );
      }
    }

    if (recursoId) {
      const recurso = await recursoRepository.getById(recursoId);
      if (!recurso) {
        throw new AppError(400, "El Recurso indicado no existe.");
      }
      if (recurso.estado !== "activo") {
        throw new AppError(400, "El Recurso indicado no está activo.");
      }
      if (!(await sujetoActivoEnParticipacion(
          "recurso", recursoId, expediente.participacionId))) {
        throw new AppError(
            400,
            "El Recurso indicado no está asignado a la Participación de " +
            "este Expediente.",
        );
      }
    }

    const nuevaEvidencia = {
      expedienteId,
      mandanteId,
      personaId: personaId || null,
      recursoId: recursoId || null,
      archivoUrl: archivoUrl || null,
      archivoNombre,
      archivoTipo: archivoTipo || null,
      fechaVencimiento: fechaVencimiento ?
          this._parseFecha(fechaVencimiento, "fechaVencimiento") :
          null,
      estado: "activo",
      // "adjunto": archivo en Storage. "referencia": queda en la carpeta
      // original (Revisiones IA); no se sube. Sin el campo (evidencias
      // anteriores) cuenta como adjunto.
      archivoEstado: referenciaLocal ? "referencia" : "adjunto",
      ...(referenciaLocal ? {
        origen: "carpeta_local",
        referenciaArchivo: {
          rutaRelativa: referenciaLocal.rutaRelativa,
          hashSha256: referenciaLocal.hashSha256,
          sesionId: referenciaLocal.sesionId,
        },
      } : {}),
    };

    return await evidenciaRepository.create(nuevaEvidencia);
  }

  /**
   * Cambia el estado (activo/inactivo) de una evidencia existente. Nunca
   * se borra físicamente.
   * @param {string} id ID de la evidencia.
   * @param {Object} payload Payload de la petición (solo se usa `estado`).
   * @param {Object} actor Usuario autenticado que ejecuta la acción.
   * @return {Promise<Object|null>} La evidencia actualizada.
   */
  async actualizarEstadoEvidencia(id, payload, actor) {
    await this.getEvidenciaById(id, actor); // Verifica existencia y alcance

    if (!ESTADOS_VALIDOS.includes(payload.estado)) {
      throw new AppError(
          400,
          `Estado '${payload.estado}' no válido. ` +
          `Valores permitidos: ${ESTADOS_VALIDOS.join(", ")}.`,
      );
    }

    return await evidenciaRepository.update(id, {estado: payload.estado});
  }
}

module.exports = new EvidenciaService();
