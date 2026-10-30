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
const bitacoraLogger = require("../utils/bitacoraLogger");
const AppError = require("../utils/AppError");
const expedienteRequerimientoRepository =
    require("../repositories/expedienteRequerimientoRepository");
const {campoDeResultado, claveSujeto} = require("../utils/cumplimiento");
const {resumirVencimientos} = require("../utils/vencimientos");
const {
  sujetoActivoEnParticipacion,
} = require("../utils/sujetosParticipacion");

const db = admin.firestore();

const RESULTADOS_VALIDOS = ["cumple", "no_cumple", "no_aplica", "pendiente"];

// DESVIACIÓN DOCUMENTADA (decisions.md, "Evidencia documental opcional"):
// la evidencia es opcional para cualquier resultado. Cómo se verificó
// queda registrado — "documental" (hay evidencia enlazada a la instancia),
// "presencial" (verificado en terreno) u "otro" —; un "cumple" sin
// documento exige justificación (ver _resolverMetodoVerificacion).
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
 * evaluar una instancia de Requerimiento (expedienteRequerimientos). Es
 * append-only — una Evaluación nunca se edita ni se borra, solo se crean
 * nuevas versiones. Estados: "vigente" | "reemplazada" | "anulada". Una sola
 * vigente por instancia: la nueva marca la anterior como "reemplazada" en la
 * misma transacción.
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
   *     deben incluir las reemplazadas y anuladas.
   * @param {Object} actor Usuario autenticado que ejecuta la acción.
   * @param {{personaId: (string|undefined), recursoId: (string|undefined),
   *     empresa: (boolean|undefined)}} [filtros] Opcional: solo las de un
   *     sujeto (la planilla carga sujeto por sujeto).
   * @return {Promise<Object[]>} Lista de evaluaciones.
   */
  async listarPorExpediente(expedienteId, incluirHistorial, actor,
      filtros = {}) {
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

    let sujeto = null;
    if (filtros.personaId) {
      sujeto = {campo: "personaId", valor: filtros.personaId};
    } else if (filtros.recursoId) {
      sujeto = {campo: "recursoId", valor: filtros.recursoId};
    } else if (filtros.empresa) {
      sujeto = {campo: "empresaId", valor: expediente.empresaId};
    }
    const todas = await evaluacionRepository.getByExpediente(
        expedienteId, sujeto,
    );
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
   * ¿Hay evidencia documental activa enlazada a esta instancia de
   * Requerimiento? El enlace (evidenciaRequerimientos) ya identifica al
   * sujeto: la evidencia de otra Persona nunca cuenta.
   * @param {string} expedienteRequerimientoId ID de la instancia.
   * @return {Promise<boolean>} true si existe al menos una.
   */
  async _tieneEvidenciaDocumental(expedienteRequerimientoId) {
    const vinculos = await evidenciaRequerimientoRepository
        .getActivosByInstancia(expedienteRequerimientoId);
    if (vinculos.length === 0) return false;
    const evidencias = await Promise.all(
        vinculos.map((v) => evidenciaRepository.getById(v.evidenciaId)),
    );
    return evidencias.some((e) => e && e.estado === "activo");
  }

  /**
   * Determina y valida el método de verificación de una Evaluación. La
   * evidencia es opcional para cualquier resultado:
   *  - "pendiente": sin método.
   *  - con evidencia enlazada: "documental" (o el indicado).
   *  - "cumple" sin evidencia: justificación (observaciones) obligatoria;
   *    el método es opcional ("presencial" u "otro" si se indica, o null).
   *  - "no_cumple" / "no_aplica" sin evidencia: el método puede ser null y
   *    la justificación no es obligatoria.
   * @param {{resultado: string, metodoVerificacion: ?string,
   *     observaciones: ?string, tieneEvidencia: boolean}} datos Datos.
   * @return {?string} Método final.
   */
  _resolverMetodoVerificacion({
    resultado, metodoVerificacion, observaciones, tieneEvidencia,
  }) {
    if (!RESULTADOS_RESUELTOS.includes(resultado)) return null;

    if (
      metodoVerificacion !== undefined && metodoVerificacion !== null &&
      metodoVerificacion !== "" &&
      !METODOS_VERIFICACION.includes(metodoVerificacion)
    ) {
      throw new AppError(
          400,
          `Método de verificación '${metodoVerificacion}' no válido. ` +
          `Valores permitidos: ${METODOS_VERIFICACION.join(", ")}.`,
      );
    }
    const metodo = metodoVerificacion ||
        (tieneEvidencia ? "documental" : null);
    if (metodo === "documental" && !tieneEvidencia) {
      throw new AppError(
          400,
          "El método 'documental' requiere evidencia enlazada a este " +
          "Requerimiento.",
      );
    }
    if (resultado === "cumple" && !tieneEvidencia) {
      if (!(observaciones || "").trim()) {
        throw new AppError(
            400,
            "Sin documento: la justificación (observaciones) es obligatoria " +
            "para un resultado 'cumple'.",
        );
      }
    }
    return metodo;
  }

  /**
   * Valida que el sujeto de la instancia siga existiendo, activo y
   * asignado a la Participación del Expediente.
   * @param {Object} instancia Instancia de Requerimiento.
   * @param {Object} expediente Expediente.
   * @return {Promise<void>}
   */
  async _validarSujeto(instancia, expediente) {
    if (instancia.tipoEntidad === "empresa") return;
    const esPersona = instancia.tipoEntidad === "persona";
    const sujetoId = esPersona ? instancia.personaId : instancia.recursoId;
    const sujeto = esPersona ?
        await personaRepository.getById(sujetoId) :
        await recursoRepository.getById(sujetoId);
    const etiqueta = esPersona ? "La Persona" : "La Maquinaria";
    if (!sujeto) throw new AppError(400, `${etiqueta} indicada no existe.`);
    if (sujeto.estado !== "activo") {
      throw new AppError(400, `${etiqueta} indicada no está activa.`);
    }
    const asignado = await sujetoActivoEnParticipacion(
        instancia.tipoEntidad, sujetoId, expediente.participacionId,
    );
    if (!asignado) {
      throw new AppError(
          400,
          `${etiqueta} indicada no está asignada a la Participación de ` +
          "este Expediente.",
      );
    }
  }

  /**
   * Rechaza evaluar o adjuntar evidencia sobre un Expediente cerrado o en
   * generación, o una instancia retirada.
   * @param {Object} expediente Expediente (o datos del snapshot).
   * @param {Object} instancia Instancia (o datos del snapshot).
   * @return {void}
   */
  exigirInstanciaEvaluable(expediente, instancia) {
    if (expediente.estado === "cerrado") {
      throw new AppError(
          409,
          "El Expediente está cerrado y no admite nuevas evaluaciones.",
      );
    }
    if (expediente.estadoGeneracion === "en_proceso") {
      throw new AppError(
          409,
          "El Expediente aún está generando sus Requerimientos: reintente la " +
          "generación antes de evaluar.",
      );
    }
    if (instancia.estado !== "activo") {
      throw new AppError(
          409, "Este Requerimiento fue retirado: ya no se puede evaluar.",
      );
    }
  }

  /**
   * Crea una nueva versión de Evaluación para una instancia de
   * Requerimiento (expedienteRequerimientoId, obligatorio). En UNA
   * transacción: la vigente anterior pasa a "reemplazada", se crea la
   * nueva, la instancia copia resultado / evaluacionVigenteId /
   * fechaVencimiento y se ajustan los contadores del Expediente. Nunca se
   * sobrescribe ni se borra una Evaluación. Opcionalmente enlaza Evidencias
   * ya enlazadas a la misma instancia como respaldo.
   * @param {Object} payload Datos de la nueva evaluación.
   * @param {Object} actor Usuario autenticado que ejecuta la acción.
   * @param {Object} [origenIA] Solo Revisiones IA (nunca del cliente):
   *     {resultadoRevisionId, procesamientoIds}; la evaluación queda con
   *     modalidad "ia_asistida" y esas referencias.
   *     `payload.revisionIAId` (opcional): revisión IA por requerimiento
   *     cuya propuesta se aplicó; se valida aquí y, en la misma transacción,
   *     la revisión pasa a "confirmada" con el ID de esta evaluación.
   * @return {Promise<Object>} La evaluación creada, con el detalle de
   *     qué Evidencias quedaron vinculadas y cuáles fueron rechazadas.
   */
  async crearEvaluacion(payload, actor, origenIA = null) {
    const {
      expedienteRequerimientoId, resultado, observaciones, evidenciaIds,
      fechaVencimiento, metodoVerificacion, revisionIAId,
    } = payload;

    if (!expedienteRequerimientoId || !resultado) {
      throw new AppError(
          400,
          "Faltan campos obligatorios: 'expedienteRequerimientoId' y " +
          "'resultado' son requeridos.",
      );
    }
    if (!RESULTADOS_VALIDOS.includes(resultado)) {
      throw new AppError(
          400,
          `Resultado '${resultado}' no válido. Valores permitidos: ` +
          `${RESULTADOS_VALIDOS.join(", ")}.`,
      );
    }

    const instancia = await expedienteRequerimientoRepository.getById(
        expedienteRequerimientoId,
    );
    if (!instancia) {
      throw new AppError(400, "El Requerimiento del Expediente no existe.");
    }
    const expediente = await expedienteRepository.getById(
        instancia.expedienteId,
    );
    if (!expediente) {
      throw new AppError(400, "El Expediente indicado no existe.");
    }
    this.exigirInstanciaEvaluable(expediente, instancia);
    await this._validarSujeto(instancia, expediente);
    // Diferido: revisionRequerimientoIAService también usa este servicio.
    const revisionIA = revisionIAId && !origenIA ?
      await require("./revisionRequerimientoIAService").validarParaConfirmar(
          revisionIAId, expedienteRequerimientoId, actor) : null;
    const revisionRef = revisionIA ? db.collection(
        require("../repositories/revisionRequerimientoIARepository")
            .COLLECTION).doc(revisionIA.id) : null;

    const tieneEvidencia =
        await this._tieneEvidenciaDocumental(expedienteRequerimientoId);
    const metodoFinal = this._resolverMetodoVerificacion({
      resultado, metodoVerificacion, observaciones, tieneEvidencia,
    });

    let fechaVencimientoDate = null;
    if (fechaVencimiento) {
      if (!instancia.requiereVencimiento) {
        throw new AppError(
            400, "Este Requerimiento no requiere fecha de vencimiento.",
        );
      }
      fechaVencimientoDate =
          this._parseFecha(fechaVencimiento, "fechaVencimiento");
    } else if (instancia.requiereVencimiento && resultado === "cumple") {
      throw new AppError(
          400,
          "Este Requerimiento exige fecha de vencimiento para un resultado " +
          "'cumple'.",
      );
    }

    // mandanteId SIEMPRE se deriva del Expediente — jamás del payload.
    const mandanteId = expediente.mandanteId;
    const evaluador = await usuarioRepository.getById(actor.uid);
    const evaluadorNombre = evaluador ?
        `${evaluador.nombre} ${evaluador.apellido}`.trim() :
        actor.email;

    // ID pre-generado: estable ante reintentos de la transacción.
    const nuevaRef = db.collection(evaluacionRepository.COLLECTION).doc();
    const instanciaRef =
        expedienteRequerimientoRepository.ref(expedienteRequerimientoId);
    const expedienteRef = db.collection(expedienteRepository.COLLECTION)
        .doc(expediente.id);
    const vigentesQuery = db.collection(evaluacionRepository.COLLECTION)
        .where("expedienteRequerimientoId", "==", expedienteRequerimientoId)
        .where("estado", "==", "vigente");
    let reemplazoEvaluacionId = null;

    const activasQuery = expedienteRequerimientoRepository.queryPorExpediente(
        expediente.id, "activo",
    );

    await db.runTransaction(async (tx) => {
      const [instanciaSnap, expedienteSnap, vigentesSnap, activasSnap,
        revisionSnap] = await Promise.all([
        tx.get(instanciaRef), tx.get(expedienteRef), tx.get(vigentesQuery),
        tx.get(activasQuery), revisionRef ? tx.get(revisionRef) : null,
      ]);
      const actual = instanciaSnap.data();
      this.exigirInstanciaEvaluable(expedienteSnap.data(), actual);
      if (revisionSnap && revisionSnap.data()?.estado !== "propuesta") {
        throw new AppError(409, "La revisión IA ya fue confirmada o " +
            "descartada.");
      }
      if (revisionRef) {
        tx.update(revisionRef, {
          estado: "confirmada", evaluacionId: nuevaRef.id,
          resultadoConfirmado: resultado,
          resueltaAt: FieldValue.serverTimestamp(), resueltaBy: actor.uid,
        });
      }

      reemplazoEvaluacionId = vigentesSnap.docs[0]?.id || null;
      vigentesSnap.docs.forEach((d) => tx.update(d.ref, {
        estado: "reemplazada",
        updatedAt: FieldValue.serverTimestamp(),
      }));
      tx.set(nuevaRef, {
        expedienteId: expediente.id,
        expedienteRequerimientoId,
        requerimientoId: instancia.requerimientoId,
        mandanteId,
        empresaId: instancia.empresaId || null,
        personaId: instancia.personaId || null,
        recursoId: instancia.recursoId || null,
        fechaVencimiento: fechaVencimientoDate,
        resultado,
        modalidad: origenIA || revisionIA ? "ia_asistida" : "manual",
        ...(revisionIA ? {revisionIAId: revisionIA.id} : {}),
        ...(origenIA ? {
          resultadoRevisionId: origenIA.resultadoRevisionId,
          procesamientoIds: origenIA.procesamientoIds || [],
        } : {}),
        metodoVerificacion: metodoFinal,
        observaciones: observaciones ? observaciones.trim() : null,
        evaluadorId: actor.uid,
        evaluadorNombre,
        estado: "vigente",
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      tx.update(instanciaRef, {
        resultado,
        evaluacionVigenteId: nuevaRef.id,
        fechaVencimiento: fechaVencimientoDate,
        updatedAt: FieldValue.serverTimestamp(),
      });
      const campoAnterior = campoDeResultado(actual.resultado);
      const campoNuevo = campoDeResultado(resultado);
      const contadores = {updatedAt: FieldValue.serverTimestamp()};
      if (campoAnterior !== campoNuevo) {
        const clave = claveSujeto(actual);
        contadores[`resumen.${campoAnterior}`] = FieldValue.increment(-1);
        contadores[`resumen.${campoNuevo}`] = FieldValue.increment(1);
        contadores[`resumenSujetos.${clave}.${campoAnterior}`] =
            FieldValue.increment(-1);
        contadores[`resumenSujetos.${clave}.${campoNuevo}`] =
            FieldValue.increment(1);
      }
      // Vencimientos: desde las instancias activas, con esta ya actualizada.
      const vencimientos = resumirVencimientos(activasSnap.docs.map((d) => (
        d.id === expedienteRequerimientoId ?
          {...d.data(), resultado, fechaVencimiento: fechaVencimientoDate} :
          d.data()
      )));
      // "Vencido" depende del día: no se guarda como contador (y se borra
      // el que hubiera quedado de una versión anterior).
      contadores["resumen.vencidos"] = FieldValue.delete();
      contadores["resumen.fechaVencimientoMasProxima"] =
          vencimientos.fechaVencimientoMasProxima;
      tx.update(expedienteRef, contadores);
    });

    const nuevaEvaluacion = await evaluacionRepository.getById(nuevaRef.id);

    await bitacoraLogger.registrarEvento({
      mandanteId,
      entidad: "evaluacion",
      entidadId: nuevaRef.id,
      accion: "creado",
      actor,
      detalle: {
        resultado, expedienteRequerimientoId,
        requerimientoId: instancia.requerimientoId,
        expedienteId: expediente.id, reemplazoEvaluacionId,
        personaId: instancia.personaId || null,
        recursoId: instancia.recursoId || null,
        metodoVerificacion: metodoFinal,
        ...(revisionIA ? {revisionIAId: revisionIA.id} : {}),
      },
    });
    if (revisionIA) {
      await bitacoraLogger.registrarEvento({
        mandanteId, entidad: "revisionesRequerimientoIA",
        entidadId: revisionIA.id, accion: "confirmada", actor,
        detalle: {evaluacionId: nuevaRef.id, resultado,
          resultadoPropuesto: revisionIA.resultadoPropuesto?.resultado || null,
          expedienteId: expediente.id, expedienteRequerimientoId},
      });
    }

    // El estado del Expediente se deriva de sus contadores.
    await expedienteService.recalcularEstado(expediente.id, actor);

    // Respaldo documental: fuera de la transacción a propósito — es mejor
    // esfuerzo por ítem (rechaza una Evidencia puntual sin fallar toda la
    // operación). Solo Evidencias enlazadas a ESTA instancia.
    const resultadoVinculos = {creados: [], rechazados: []};
    if (Array.isArray(evidenciaIds)) {
      const idsUnicos = [...new Set(evidenciaIds)];
      for (const evidenciaId of idsUnicos) {
        try {
          const vinculo = await evidenciaRequerimientoRepository
              .getByEvidenciaEInstancia(evidenciaId, expedienteRequerimientoId);
          if (!vinculo || vinculo.estado !== "activo") {
            resultadoVinculos.rechazados.push({
              evidenciaId,
              motivo: "No está enlazada a este Requerimiento del Expediente.",
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
