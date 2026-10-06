const perfilParticipacionRepository =
    require("../repositories/perfilParticipacionRepository");
const perfilRequerimientoRepository =
    require("../repositories/perfilRequerimientoRepository");
const requerimientoRepository =
    require("../repositories/requerimientoRepository");
const participacionRepository =
    require("../repositories/participacionRepository");
const expedienteRepository = require("../repositories/expedienteRepository");
const mandanteRepository = require("../repositories/mandanteRepository");
const requerimientoCalculoService = require("./requerimientoCalculoService");
const bitacoraLogger = require("../utils/bitacoraLogger");
const AppError = require("../utils/AppError");

const NOTA_AYUDA_MAX_LENGTH = 200;

const ESTADOS_VALIDOS = ["activo", "inactivo"];

// Roles cuyo acceso queda siempre acotado a su propio mandanteId (mismo
// criterio que proyectoService.js). evaluador NO está acá: lee sin
// restricción de mandante, pero no puede escribir (eso se filtra en las
// rutas).
const ROLES_ALCANCE_FORZADO = ["mandante_admin", "mandante_lector"];

/**
 * Reglas de negocio para el recurso Perfil de Participación.
 */
class PerfilParticipacionService {
  /**
   * Resuelve el mandanteId a aplicar según el alcance del actor, forzando
   * el propio para los roles acotados a su Mandante.
   * @param {Object} actor Usuario autenticado que ejecuta la acción.
   * @param {?string} mandanteIdSolicitado mandanteId solicitado.
   * @return {?string} mandanteId resuelto.
   */
  _aplicarScopeActor(actor, mandanteIdSolicitado) {
    if (ROLES_ALCANCE_FORZADO.includes(actor.rol)) {
      return actor.mandanteId;
    }
    return mandanteIdSolicitado ?? null;
  }

  /**
   * Obtiene un perfil de participación por su ID, respetando el alcance
   * del actor.
   * @param {string} id ID del perfil.
   * @param {Object} actor Usuario autenticado que ejecuta la acción.
   * @return {Promise<Object>} El perfil encontrado.
   */
  async getPerfilById(id, actor) {
    if (!id || typeof id !== "string") {
      throw new AppError(400, "ID de perfil de participación inválido.");
    }
    const perfil = await perfilParticipacionRepository.getById(id);
    if (!perfil) {
      throw new AppError(404, "Perfil de participación no encontrado.");
    }
    if (
      ROLES_ALCANCE_FORZADO.includes(actor.rol) &&
      perfil.mandanteId !== actor.mandanteId
    ) {
      throw new AppError(404, "Perfil de participación no encontrado.");
    }
    return perfil;
  }

  /**
   * Lista perfiles de participación, forzando el alcance del actor cuando
   * corresponde.
   * @param {Object} filtros Filtros de búsqueda (mandanteId, estado).
   * @param {Object} actor Usuario autenticado que ejecuta la acción.
   * @return {Promise<Object[]>} Lista de perfiles.
   */
  async listarPerfiles(filtros, actor) {
    const filtrosFinales = {...filtros};
    if (ROLES_ALCANCE_FORZADO.includes(actor.rol)) {
      filtrosFinales.mandanteId = actor.mandanteId;
    }
    return await perfilParticipacionRepository.list(filtrosFinales);
  }

  /**
   * Normaliza el texto de ayuda opcional del perfil (mostrado como guía en
   * el wizard de Nueva Acreditación).
   * @param {*} valor Valor recibido.
   * @return {?string} Texto recortado o null si viene vacío.
   */
  _normalizarNotaAyuda(valor) {
    if (valor === undefined || valor === null) return null;
    if (typeof valor !== "string") {
      throw new AppError(400, "El campo 'notaAyuda' debe ser texto.");
    }
    const texto = valor.trim();
    if (texto.length > NOTA_AYUDA_MAX_LENGTH) {
      throw new AppError(
          400,
          `'notaAyuda' no puede superar ${NOTA_AYUDA_MAX_LENGTH} caracteres.`,
      );
    }
    return texto || null;
  }

  /**
   * Lista los Requerimientos aplicables a un Perfil: exactamente el mismo
   * cálculo que congela el Expediente al crearse (requerimientoCalculoService),
   * para que el conteo y el detalle mostrados antes de elegir el Perfil nunca
   * difieran de lo que realmente se generará. Solo lectura.
   * @param {string} id ID del perfil.
   * @param {Object} actor Usuario autenticado que ejecuta la acción.
   * @return {Promise<Object[]>} Requerimientos aplicables, por orden.
   */
  async listarRequerimientosAplicables(id, actor) {
    await this.getPerfilById(id, actor);
    const lista = await requerimientoCalculoService
        .calcularRequerimientosAplicables(id);
    return lista.sort((a, b) => (a.orden ?? 9999) - (b.orden ?? 9999));
  }

  /**
   * Crea un nuevo perfil de participación.
   * @param {Object} payload Datos del nuevo perfil.
   * @param {Object} actor Usuario autenticado que ejecuta la acción.
   * @return {Promise<Object>} El perfil creado.
   */
  async crearPerfil(payload, actor) {
    // TODO: instrumentar auditoría si se decide más adelante.
    const {nombre, descripcion} = payload;
    const notaAyuda = this._normalizarNotaAyuda(payload.notaAyuda);

    if (!nombre) {
      throw new AppError(400, "El campo 'nombre' es requerido.");
    }

    const mandanteId = this._aplicarScopeActor(actor, payload.mandanteId);
    if (!mandanteId) {
      throw new AppError(400, "mandanteId es obligatorio.");
    }
    const mandante = await mandanteRepository.getById(mandanteId);
    if (!mandante) {
      throw new AppError(400, "El Mandante indicado no existe.");
    }
    if (mandante.estado !== "activo") {
      throw new AppError(400, "El Mandante indicado no está activo.");
    }

    const duplicado = await perfilParticipacionRepository.getByNombre(
        mandanteId, nombre,
    );
    if (duplicado) {
      throw new AppError(
          409,
          `Ya existe un perfil de participación con el nombre '${nombre}' ` +
          "en este Mandante.",
      );
    }

    const nuevoPerfil = {
      mandanteId,
      nombre: nombre.trim(),
      descripcion: descripcion ? descripcion.trim() : null,
      notaAyuda,
      estado: "activo",
    };

    const creado = await perfilParticipacionRepository.create(nuevoPerfil);

    await bitacoraLogger.registrarEvento({
      mandanteId,
      entidad: "perfil_participacion",
      entidadId: creado.id,
      accion: "creado",
      actor,
      detalle: {nombre: nuevoPerfil.nombre},
    });

    return creado;
  }

  /**
   * Actualiza los campos editables de un perfil de participación
   * existente.
   * @param {string} id ID del perfil.
   * @param {Object} payload Campos a actualizar.
   * @param {Object} actor Usuario autenticado que ejecuta la acción.
   * @return {Promise<Object|null>} El perfil actualizado.
   */
  async actualizarPerfil(id, payload, actor) {
    // getPerfilById ya aplica el alcance del actor (404 si es de otro
    // Mandante).
    const existente = await this.getPerfilById(id, actor);

    // mandanteId no es editable después de creado (campo identidad, igual
    // que en Proyecto).
    const allowedFields = ["nombre", "descripcion", "notaAyuda", "estado"];
    const updateData = {};
    for (const key of allowedFields) {
      if (payload[key] !== undefined) {
        updateData[key] = payload[key];
      }
    }

    if (updateData.nombre && updateData.nombre !== existente.nombre) {
      const duplicado = await perfilParticipacionRepository.getByNombre(
          existente.mandanteId, updateData.nombre,
      );
      if (duplicado && duplicado.id !== id) {
        throw new AppError(
            409,
            `Ya existe un perfil de participación con el nombre ` +
            `'${updateData.nombre}' en este Mandante.`,
        );
      }
      updateData.nombre = updateData.nombre.trim();
    }

    if (updateData.notaAyuda !== undefined) {
      updateData.notaAyuda = this._normalizarNotaAyuda(updateData.notaAyuda);
    }

    if (updateData.descripcion !== undefined) {
      updateData.descripcion = updateData.descripcion ?
          updateData.descripcion.trim() : null;
    }

    if (updateData.estado && !ESTADOS_VALIDOS.includes(updateData.estado)) {
      throw new AppError(400, `Estado '${updateData.estado}' no válido.`);
    }

    const actualizado = await perfilParticipacionRepository.update(
        id, updateData,
    );

    // La transición de estado se registra aparte (mismo criterio que
    // Usuario/Expediente): un cambio de estado es semánticamente
    // distinto de una edición de nombre/descripción, aunque ambos pasen
    // por este mismo método.
    const estadoCambio = updateData.estado !== undefined &&
        updateData.estado !== existente.estado;
    if (estadoCambio) {
      await bitacoraLogger.registrarEvento({
        mandanteId: existente.mandanteId,
        entidad: "perfil_participacion",
        entidadId: id,
        accion: "transicion_estado",
        actor,
        detalle: {
          estadoAnterior: existente.estado,
          estadoNuevo: updateData.estado,
        },
      });
    }

    const otrosCambios = Object.keys(updateData).filter((k) => k !== "estado");
    if (otrosCambios.length > 0) {
      const detalle = {};
      otrosCambios.forEach((campo) => {
        detalle[campo] = {anterior: existente[campo], nuevo: updateData[campo]};
      });
      await bitacoraLogger.registrarEvento({
        mandanteId: existente.mandanteId,
        entidad: "perfil_participacion",
        entidadId: id,
        accion: "actualizado",
        actor,
        detalle,
      });
    }

    return actualizado;
  }

  /**
   * Desactiva un perfil de participación existente.
   * @param {string} id ID del perfil.
   * @param {Object} actor Usuario autenticado que ejecuta la acción.
   * @return {Promise<Object|null>} El perfil desactivado.
   */
  async desactivarPerfil(id, actor) {
    return this.actualizarPerfil(id, {estado: "inactivo"}, actor);
  }

  /**
   * Calcula el resumen de uso de un Perfil de Participación: cantidad de
   * Requerimientos vinculados (activos y distintos: un Requerimiento con
   * varios vínculos por Perfil de Recurso cuenta una vez) — total y
   * desglosados por `tipoEntidad` (empresa/persona/recurso) —,
   * Participaciones activas, y Expedientes generados a partir de él.
   * @param {string} id ID del perfil.
   * @param {Object} actor Usuario autenticado que ejecuta la acción.
   * @return {Promise<{requerimientosVinculados: number,
   *     requerimientosPorTipo: {empresa: number, persona: number,
   *     recurso: number}, participacionesActivas: number,
   *     expedientesGenerados: number}>} El resumen calculado.
   */
  async obtenerResumen(id, actor) {
    // getPerfilById ya valida existencia y aplica el alcance del actor.
    await this.getPerfilById(id, actor);

    const [vinculos, participaciones, expedientes, catalogoActivo] =
        await Promise.all([
          perfilRequerimientoRepository.getActivosByPerfil(id),
          participacionRepository.listByPerfil(id),
          expedienteRepository.getByPerfil(id),
          requerimientoRepository.list({estado: "activo"}),
        ]);

    const requerimientosPorId = {};
    catalogoActivo.forEach((r) => {
      requerimientosPorId[r.id] = r;
    });

    const requerimientosPorTipo = {empresa: 0, persona: 0, recurso: 0};
    const distintos = new Set(vinculos.map((v) => v.requerimientoId));
    distintos.forEach((requerimientoId) => {
      const tipo = requerimientosPorId[requerimientoId]?.tipoEntidad;
      if (tipo && tipo in requerimientosPorTipo) {
        requerimientosPorTipo[tipo]++;
      }
    });

    return {
      requerimientosVinculados: distintos.size,
      requerimientosPorTipo,
      participacionesActivas:
          participaciones.filter((p) => p.estado === "activa").length,
      expedientesGenerados: expedientes.length,
    };
  }

  /**
   * Lista los OTROS perfiles de participación del mismo Mandante,
   * excluyendo el propio. Reutiliza `listarPerfiles` (que ya aplica el
   * alcance del actor) — el mandanteId siempre llega resuelto desde el
   * perfil actual (nunca desde un valor enviado por el cliente).
   * @param {string} mandanteId ID del Mandante.
   * @param {string} excluirId ID del perfil a excluir del resultado.
   * @param {Object} actor Usuario autenticado que ejecuta la acción.
   * @return {Promise<Object[]>} Lista de otros perfiles del Mandante.
   */
  async listarOtrosDelMandante(mandanteId, excluirId, actor) {
    const perfiles = await this.listarPerfiles({mandanteId}, actor);
    return perfiles.filter((p) => p.id !== excluirId);
  }
}

module.exports = new PerfilParticipacionService();
