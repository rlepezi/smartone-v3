const admin = require("firebase-admin");
const {FieldValue} = require("firebase-admin/firestore");
const evaluacionRepository = require("../repositories/evaluacionRepository");
const evaluacionEvidenciaRepository =
    require("../repositories/evaluacionEvidenciaRepository");
const expedienteRepository = require("../repositories/expedienteRepository");
const expedienteService = require("./expedienteService");
const evidenciaRequerimientoRepository =
    require("../repositories/evidenciaRequerimientoRepository");
const evidenciaRepository = require("../repositories/evidenciaRepository");
const usuarioRepository = require("../repositories/usuarioRepository");
const personaRepository = require("../repositories/personaRepository");
const recursoRepository = require("../repositories/recursoRepository");
const asignacionRepository = require("../repositories/asignacionRepository");
const bitacoraLogger = require("../utils/bitacoraLogger");
const AppError = require("../utils/AppError");
const {
  aplicaRequerimientoASujeto, sujetoDeAsignacion,
} = require("../utils/aplicabilidadRequerimiento");
// TRANSICIÓN bloque 2: perfilRecursoId de la Asignación del sujeto.
const {resolverPerfilesRecurso} = require("../utils/transicionPerfilRecurso");

const db = admin.firestore();

const RESULTADOS_VALIDOS = ["cumple", "no_cumple", "no_aplica", "pendiente"];

// DESVIACIÓN DOCUMENTADA (decisions.md, "Evidencia documental opcional"):
// una Evaluación resuelta ya no exige evidencia documental. Cómo se
// verificó queda registrado de forma estructurada — "documental" (hay
// archivo adjunto al Requerimiento para ese sujeto), "presencial"
// (verificado en terreno) u "otro" — y sin documento la justificación
// (observaciones) es obligatoria, para no perder trazabilidad.
const METODOS_VERIFICACION = ["documental", "presencial", "otro"];
const RESULTADOS_RESUELTOS = ["cumple", "no_cumple", "no_aplica"];

// Roles cuyo acceso de LECTURA queda siempre acotado a su propio
// mandanteId. "evaluador" queda deliberadamente fuera: es quien más usa
// este módulo y no tiene restricción de Mandante, ni para leer ni para
// crear (la creación además ya está limitada a nivel de ruta a
// superadmin+evaluador, por eso crearEvaluacion no repite este chequeo).
const ROLES_ALCANCE_FORZADO = ["mandante_admin", "mandante_lector"];

/**
 * Reglas de negocio para el recurso Evaluación: registra el resultado de
 * evaluar un Requerimiento dentro de un Expediente. Es append-only — una
 * Evaluación nunca se edita ni se borra, solo se crean nuevas versiones.
 * Al crear una nueva Evaluación para un par (Expediente, Requerimiento)
 * que ya tenía una vigente, esa anterior pasa a "historica" en la misma
 * transacción atómica que crea la nueva.
 */
class EvaluacionService {
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
   * Lista las evaluaciones de un Expediente (vigentes por defecto, o
   * todas si se pide historial), respetando el alcance del actor.
   * @param {string} expedienteId ID del Expediente.
   * @param {boolean} incluirHistorial Si además de las vigentes se
   *     deben incluir las históricas.
   * @param {Object} actor Usuario autenticado que ejecuta la acción.
   * @return {Promise<Object[]>} Lista de evaluaciones.
   */
  async listarPorExpediente(expedienteId, incluirHistorial, actor) {
    if (!expedienteId || typeof expedienteId !== "string") {
      throw new AppError(400, "El query param 'expedienteId' es requerido.");
    }

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

    const todas = await evaluacionRepository.getByExpediente(expedienteId);
    const filtradas = incluirHistorial ?
        todas :
        todas.filter((e) => e.estado === "vigente");

    filtradas.sort((a, b) => {
      const fechaA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
      const fechaB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
      return fechaB - fechaA;
    });

    const vinculos = await evaluacionEvidenciaRepository.getByEvaluacionIds(
        filtradas.map((e) => e.id),
    );
    const evidenciasPorEvaluacion = {};
    vinculos.forEach((v) => {
      if (!evidenciasPorEvaluacion[v.evaluacionId]) {
        evidenciasPorEvaluacion[v.evaluacionId] = [];
      }
      evidenciasPorEvaluacion[v.evaluacionId].push(v.evidenciaId);
    });

    return filtradas.map((e) => ({
      ...e,
      evidenciaIds: evidenciasPorEvaluacion[e.id] || [],
    }));
  }

  /**
   * Lista todas las evaluaciones vigentes alcanzables por el actor, sin
   * acotar a un Expediente específico — usado para vistas agregadas
   * (p. ej. el Dashboard). No embebe `evidenciaIds` (a esta escala solo
   * se necesita `resultado` para contar, no el detalle de respaldo).
   * @param {Object} actor Usuario autenticado que ejecuta la acción.
   * @return {Promise<Object[]>} Lista de evaluaciones vigentes.
   */
  async listarVigentes(actor) {
    const mandanteId = ROLES_ALCANCE_FORZADO.includes(actor.rol) ?
        actor.mandanteId :
        undefined;
    return evaluacionRepository.getVigentes({mandanteId});
  }

  /**
   * Lista las evaluaciones vigentes alcanzables por el actor, con filtros
   * opcionales de Proyecto/Empresa/Estado — usado por la vista global
   * "Evaluaciones" (todos los Expedientes en alcance, no uno puntual).
   * Sin filtros, el resultado es idéntico a listarVigentes.
   * @param {Object} actor Usuario autenticado que ejecuta la acción.
   * @param {{proyectoId: (string|undefined), empresaId: (string|undefined),
   *     estado: (string|undefined)}} filtros Filtros opcionales.
   * @return {Promise<Object[]>} Lista de evaluaciones vigentes filtradas.
   */
  async listarGlobal(actor, {proyectoId, empresaId, estado} = {}) {
    if (estado && !RESULTADOS_VALIDOS.includes(estado)) {
      throw new AppError(
          400,
          `Estado '${estado}' no válido. Valores permitidos: ` +
          `${RESULTADOS_VALIDOS.join(", ")}.`,
      );
    }

    let vigentes = await this.listarVigentes(actor);

    if (estado) {
      vigentes = vigentes.filter((ev) => ev.resultado === estado);
    }

    // La Evaluación solo guarda expedienteId (no proyectoId/empresaId
    // directos) — para filtrar por esos dos se resuelven los Expedientes
    // en alcance del actor (mismo patrón que reporteService) y se cruza
    // por expedienteId.
    if (proyectoId || empresaId) {
      const expedientes = await expedienteService.listarExpedientes(
          {}, actor,
      );
      const expedienteIdsValidos = new Set(
          expedientes
              .filter((e) =>
                (!proyectoId || e.proyectoId === proyectoId) &&
                (!empresaId || e.empresaId === empresaId),
              )
              .map((e) => e.id),
      );
      vigentes = vigentes.filter(
          (ev) => expedienteIdsValidos.has(ev.expedienteId),
      );
    }

    return vigentes;
  }

  /**
   * ¿Hay evidencia documental activa adjunta a este Requerimiento para
   * este sujeto (Empresa/Persona/Recurso) dentro del Expediente?
   * @param {string} expedienteId ID del Expediente.
   * @param {string} requerimientoId ID del Requerimiento.
   * @param {?string} personaId Persona evaluada, si aplica.
   * @param {?string} recursoId Recurso evaluado, si aplica.
   * @return {Promise<boolean>} true si existe al menos una.
   */
  async _tieneEvidenciaDocumental(
      expedienteId, requerimientoId, personaId, recursoId,
  ) {
    const [vinculos, evidencias] = await Promise.all([
      evidenciaRequerimientoRepository.getActivosByExpediente(expedienteId),
      evidenciaRepository.getActivasByExpediente(expedienteId),
    ]);
    const idsVinculados = new Set(
        vinculos
            .filter((v) => v.requerimientoId === requerimientoId)
            .map((v) => v.evidenciaId),
    );
    return evidencias.some((e) => {
      if (!idsVinculados.has(e.id)) return false;
      if (personaId) return e.personaId === personaId;
      if (recursoId) return e.recursoId === recursoId;
      return !e.personaId && !e.recursoId;
    });
  }

  /**
   * Determina y valida el método de verificación de una Evaluación:
   * "pendiente" no lo lleva; una resuelta usa el indicado, o "documental"
   * si hay evidencia adjunta. Sin evidencia exige método presencial/otro
   * y una justificación (observaciones) no vacía.
   * @param {Object} datos Campos de la Evaluación a crear.
   * @return {Promise<?string>} Método final, o null si es "pendiente".
   */
  async _resolverMetodoVerificacion({
    resultado, metodoVerificacion, observaciones, expedienteId,
    requerimientoId, personaId, recursoId,
  }) {
    if (!RESULTADOS_RESUELTOS.includes(resultado)) return null;

    if (
      metodoVerificacion !== undefined && metodoVerificacion !== null &&
      !METODOS_VERIFICACION.includes(metodoVerificacion)
    ) {
      throw new AppError(
          400,
          `Método de verificación '${metodoVerificacion}' no válido. ` +
          `Valores permitidos: ${METODOS_VERIFICACION.join(", ")}.`,
      );
    }

    const tieneEvidencia = await this._tieneEvidenciaDocumental(
        expedienteId, requerimientoId, personaId, recursoId,
    );
    const metodo = metodoVerificacion || (tieneEvidencia ? "documental" : null);

    if (!metodo) {
      throw new AppError(
          400,
          "Indique cómo se verificó este Requerimiento (método " +
          "'presencial' u 'otro', con su justificación) o adjunte " +
          "evidencia documental.",
      );
    }
    if (metodo === "documental" && !tieneEvidencia) {
      throw new AppError(
          400,
          "El método 'documental' requiere evidencia adjunta a este " +
          "Requerimiento.",
      );
    }
    if (metodo !== "documental" && !(observaciones || "").trim()) {
      throw new AppError(
          400,
          "La justificación (observaciones) es obligatoria cuando no hay " +
          "evidencia documental.",
      );
    }
    return metodo;
  }

  /**
   * Crea una nueva versión de Evaluación para un (Expediente,
   * Requerimiento), versionando atómicamente la vigente anterior (si
   * existía) a "historica", y opcionalmente vincula Evidencias ya
   * asociadas a ese Requerimiento como respaldo.
   * @param {Object} payload Datos de la nueva evaluación.
   * @param {Object} actor Usuario autenticado que ejecuta la acción.
   * @return {Promise<Object>} La evaluación creada, con el detalle de
   *     qué Evidencias quedaron vinculadas y cuáles fueron rechazadas.
   */
  async crearEvaluacion(payload, actor) {
    const {
      expedienteId, requerimientoId, resultado, observaciones, evidenciaIds,
      personaId, recursoId, fechaVencimiento, metodoVerificacion,
    } = payload;

    if (!expedienteId || !requerimientoId || !resultado) {
      throw new AppError(
          400,
          "Faltan campos obligatorios: 'expedienteId', 'requerimientoId' " +
          "y 'resultado' son requeridos.",
      );
    }
    if (!RESULTADOS_VALIDOS.includes(resultado)) {
      throw new AppError(
          400,
          `Resultado '${resultado}' no válido. Valores permitidos: ` +
          `${RESULTADOS_VALIDOS.join(", ")}.`,
      );
    }

    const expediente = await expedienteRepository.getById(expedienteId);
    if (!expediente) {
      throw new AppError(400, "El Expediente indicado no existe.");
    }
    if (expediente.estado === "cerrado") {
      throw new AppError(
          409,
          "El Expediente está cerrado y no admite nuevas evaluaciones.",
      );
    }

    // El Requerimiento aplicable se resuelve desde el SNAPSHOT del
    // Expediente (RN-032), nunca del documento Requerimiento en vivo — el
    // snapshot ya incluye tipoEntidad/perfilRecursoIds/
    // requiereVencimiento tal como estaban al crear el Expediente.
    const requerimientoAplicable = (expediente.requerimientosAplicables || [])
        .find((r) => r.requerimientoId === requerimientoId);
    if (!requerimientoAplicable) {
      throw new AppError(
          400,
          "El Requerimiento indicado no aplica a este Expediente.",
      );
    }
    const tipoEntidad = requerimientoAplicable.tipoEntidad;

    // Si el Requerimiento está acotado a Perfiles de Recurso específicos,
    // el sujeto debe tener una Asignación activa en el Proyecto cuyo Perfil
    // esté entre ellos (regla única: aplicaRequerimientoASujeto).
    const validarPerfilDelSujeto = async (asignacionActiva, mensaje) => {
      if (!requerimientoAplicable.perfilRecursoIds) return;
      const [conPerfil] = asignacionActiva ?
        await resolverPerfilesRecurso([asignacionActiva]) : [null];
      if (!conPerfil || !aplicaRequerimientoASujeto(
          requerimientoAplicable, sujetoDeAsignacion(conPerfil))) {
        throw new AppError(400, mensaje);
      }
    };

    // Validación cruzada según el tipo del Requerimiento (RN nueva): cada
    // tipo exige exactamente la referencia que le corresponde, nunca la
    // otra.
    if (tipoEntidad === "empresa") {
      if (personaId || recursoId) {
        throw new AppError(
            400,
            "Este Requerimiento es de nivel 'empresa': no admite " +
            "'personaId' ni 'recursoId'.",
        );
      }
    } else if (tipoEntidad === "persona") {
      if (!personaId) {
        throw new AppError(
            400,
            "Este Requerimiento es de nivel 'persona': 'personaId' es " +
            "obligatorio.",
        );
      }
      if (recursoId) {
        throw new AppError(
            400,
            "No se puede indicar 'recursoId' para un Requerimiento de " +
            "nivel 'persona'.",
        );
      }
      const persona = await personaRepository.getById(personaId);
      if (!persona) {
        throw new AppError(400, "La Persona indicada no existe.");
      }
      if (persona.estado !== "activo") {
        throw new AppError(400, "La Persona indicada no está activa.");
      }
      if (persona.empresaId !== expediente.empresaId) {
        throw new AppError(
            400,
            "La Persona indicada no pertenece a la Empresa de este " +
            "Expediente.",
        );
      }
      if (requerimientoAplicable.perfilRecursoIds) {
        await validarPerfilDelSujeto(
            await asignacionRepository.getActivaByPersonaYProyecto(
                personaId, expediente.proyectoId,
            ),
            "Esta persona no tiene el rol requerido para este Requerimiento.",
        );
      }
    } else if (tipoEntidad === "recurso") {
      if (!recursoId) {
        throw new AppError(
            400,
            "Este Requerimiento es de nivel 'maquinaria': 'recursoId' " +
            "es obligatorio.",
        );
      }
      if (personaId) {
        throw new AppError(
            400,
            "No se puede indicar 'personaId' para un Requerimiento de " +
            "nivel 'maquinaria'.",
        );
      }
      if (requerimientoAplicable.perfilRecursoIds) {
        await validarPerfilDelSujeto(
            await asignacionRepository.getActivaByRecursoYProyecto(
                recursoId, expediente.proyectoId,
            ),
            "Esta maquinaria no tiene la clasificación requerida para este " +
            "Requerimiento.",
        );
      }
      const recurso = await recursoRepository.getById(recursoId);
      if (!recurso) {
        throw new AppError(400, "El Recurso indicado no existe.");
      }
      if (recurso.estado !== "activo") {
        throw new AppError(400, "El Recurso indicado no está activo.");
      }
      if (recurso.empresaId !== expediente.empresaId) {
        throw new AppError(
            400,
            "El Recurso indicado no pertenece a la Empresa de este " +
            "Expediente.",
        );
      }
    }

    const metodoFinal = await this._resolverMetodoVerificacion({
      resultado, metodoVerificacion, observaciones, expedienteId,
      requerimientoId, personaId, recursoId,
    });

    let fechaVencimientoDate = null;
    if (fechaVencimiento) {
      if (!requerimientoAplicable.requiereVencimiento) {
        throw new AppError(
            400, "Este Requerimiento no requiere fecha de vencimiento.",
        );
      }
      fechaVencimientoDate =
          this._parseFecha(fechaVencimiento, "fechaVencimiento");
    }

    // mandanteId SIEMPRE se deriva del Expediente — jamás se lee del
    // payload del cliente.
    const mandanteId = expediente.mandanteId;

    // evaluadorNombre se denormaliza desde el perfil del actor —
    // req.user nunca trae nombre/apellido (solo uid/email/rol/mandanteId).
    const evaluador = await usuarioRepository.getById(actor.uid);
    const evaluadorNombre = evaluador ?
        `${evaluador.nombre} ${evaluador.apellido}`.trim() :
        actor.email;

    // ID pre-generado antes de entrar a la transacción: estable ante
    // reintentos por contención y referenciable después para vincular
    // Evidencias.
    const nuevaRef = db.collection("evaluaciones").doc();

    // Se registra fuera del closure de la transacción (que puede
    // reintentarse por contención) para saber, una sola vez ya
    // confirmada, si esta Evaluación reemplazó una vigente anterior —
    // dato que va en el detalle de la bitácora.
    let reemplazoEvaluacionId = null;

    await db.runTransaction(async (transaction) => {
      // La llave de unicidad/versionamiento depende del nivel: a nivel
      // "empresa" sigue siendo (expedienteId, requerimientoId) — sin
      // cambios, porque a ese nivel personaId/recursoId son SIEMPRE null
      // en todos los documentos, así que no filtrar por ellos ya
      // encuentra sin ambigüedad al único vigente posible. A nivel
      // "persona"/"recurso" se agrega el filtro correspondiente, para
      // que evaluar a una Persona/Recurso distinto sobre el MISMO
      // Requerimiento no pise la vigente de otra.
      let vigenteQuery = db.collection("evaluaciones")
          .where("expedienteId", "==", expedienteId)
          .where("requerimientoId", "==", requerimientoId)
          .where("estado", "==", "vigente");
      if (tipoEntidad === "persona") {
        vigenteQuery = vigenteQuery.where("personaId", "==", personaId);
      } else if (tipoEntidad === "recurso") {
        vigenteQuery = vigenteQuery.where("recursoId", "==", recursoId);
      }
      vigenteQuery = vigenteQuery.limit(1);
      const vigenteSnapshot = await transaction.get(vigenteQuery);

      if (!vigenteSnapshot.empty) {
        reemplazoEvaluacionId = vigenteSnapshot.docs[0].id;
        transaction.update(vigenteSnapshot.docs[0].ref, {
          estado: "historica",
          updatedAt: FieldValue.serverTimestamp(),
        });
      }

      transaction.set(nuevaRef, {
        expedienteId,
        requerimientoId,
        mandanteId,
        personaId: personaId || null,
        recursoId: recursoId || null,
        fechaVencimiento: fechaVencimientoDate,
        resultado,
        modalidad: "manual",
        metodoVerificacion: metodoFinal,
        observaciones: observaciones ? observaciones.trim() : null,
        evaluadorId: actor.uid,
        evaluadorNombre,
        estado: "vigente",
        createdAt: FieldValue.serverTimestamp(),
      });
    });

    const nuevaEvaluacion = await evaluacionRepository.getById(nuevaRef.id);

    await bitacoraLogger.registrarEvento({
      mandanteId,
      entidad: "evaluacion",
      entidadId: nuevaRef.id,
      accion: "creado",
      actor,
      detalle: {
        resultado, requerimientoId, expedienteId, reemplazoEvaluacionId,
        personaId: personaId || null, recursoId: recursoId || null,
        metodoVerificacion: metodoFinal,
      },
    });

    // El estado del Expediente se deriva de sus Evaluaciones (ver
    // expedienteService.calcularEstadoDerivado): se actualiza acá mismo.
    await expedienteService.recalcularEstado(expedienteId, actor);

    // Vinculado de Evidencias: fuera de la transacción a propósito — es
    // mejor esfuerzo por ítem (rechaza una Evidencia puntual sin fallar
    // toda la operación), semántica incompatible con "todo o nada".
    const resultadoVinculos = {creados: [], rechazados: []};
    if (Array.isArray(evidenciaIds)) {
      const idsUnicos = [...new Set(evidenciaIds)];
      for (const evidenciaId of idsUnicos) {
        try {
          const vinculo = await evidenciaRequerimientoRepository
              .getByEvidenciaYRequerimiento(evidenciaId, requerimientoId);
          if (!vinculo || vinculo.estado !== "activo") {
            resultadoVinculos.rechazados.push({
              evidenciaId,
              motivo: "No está vinculada a este Requerimiento.",
            });
            continue;
          }
          const nuevoVinculo = await evaluacionEvidenciaRepository.create({
            evaluacionId: nuevaRef.id,
            evidenciaId,
          });
          resultadoVinculos.creados.push(nuevoVinculo.id);
        } catch (err) {
          resultadoVinculos.rechazados.push({
            evidenciaId,
            motivo: err.message || "Error inesperado al vincular.",
          });
        }
      }
    }

    return {...nuevaEvaluacion, evidencias: resultadoVinculos};
  }
}

module.exports = new EvaluacionService();
