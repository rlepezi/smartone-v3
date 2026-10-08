const admin = require("firebase-admin");
const {FieldValue} = require("firebase-admin/firestore");
const proyectoRepository = require("../repositories/proyectoRepository");
const empresaRepository = require("../repositories/empresaRepository");
const personaRepository = require("../repositories/personaRepository");
const recursoRepository = require("../repositories/recursoRepository");
const participacionRepository =
    require("../repositories/participacionRepository");
const participacionPersonaService = require("./participacionPersonaService");
const participacionRecursoService = require("./participacionRecursoService");
const expedienteRepository = require("../repositories/expedienteRepository");
const expedienteService = require("./expedienteService");
const evaluacionRepository = require("../repositories/evaluacionRepository");
const perfilParticipacionRepository =
    require("../repositories/perfilParticipacionRepository");
const {aplicaRequerimientoASujeto} =
    require("../utils/aplicabilidadRequerimiento");
const {agruparSujetos} = require("../utils/sujetosParticipacion");
const requerimientoCalculoService = require("./requerimientoCalculoService");
const reutilizacionDocumentalService =
    require("./reutilizacionDocumentalService");
const usuarioRepository = require("../repositories/usuarioRepository");
const bitacoraLogger = require("../utils/bitacoraLogger");
const AppError = require("../utils/AppError");

const db = admin.firestore();

// "Acreditación" es una etiqueta de UI, no una entidad propia: mapea a
// Participación (Empresa) o a participacionPersonas/participacionRecursos
// (Persona/Recurso) + Expediente, según se documenta en el encabezado de
// cada método de esta clase.
const ENTIDADES_VALIDAS = ["persona", "maquinaria", "empresa"];

// Mismo criterio de alcance por Mandante que participacionService.
const ROLES_ALCANCE_FORZADO = ["mandante_admin", "mandante_lector"];

/**
 * Perfiles de Recurso pedidos en un payload: `perfilRecursoIds` (arreglo)
 * o `perfilRecursoId` (uno). null si no vino ninguno.
 * @param {Object} payload Payload de la petición.
 * @return {(Array<string>|null)} IDs pedidos o null.
 */
const perfilesDelPayload = (payload) => {
  if (Array.isArray(payload.perfilRecursoIds) &&
      payload.perfilRecursoIds.length) {
    return payload.perfilRecursoIds;
  }
  return payload.perfilRecursoId ? [payload.perfilRecursoId] : null;
};

/**
 * Reglas de negocio para "Reemplazar Acreditación": mueve una Persona,
 * Recurso (maquinaria) o Empresa de un Proyecto a otro, cerrando su
 * Participación (o sus documentos de participacionPersonas /
 * participacionRecursos) + Expediente actuales (nunca se eliminan, solo
 * cambian de estado) y creando los nuevos en el Proyecto destino,
 * reutilizando automáticamente las Evaluaciones vigentes que sigan
 * aplicando.
 *
 * Empresa se vincula a un Proyecto vía Participación (que lleva
 * `perfilParticipacionId` y es dueña del Expediente). Persona/Recurso se
 * vinculan a esa Participación con sus Perfiles de Recurso (por ID): su
 * cumplimiento se rastrea
 * con Evaluaciones (`personaId`/`recursoId` + `requerimientoId`) contra el
 * Expediente de la Empresa que los aporta en ese Proyecto. Por eso mover
 * una Persona/Maquinaria las mueve junto con su Empresa actual — si esa
 * Empresa no participa aún en el Proyecto destino, su Participación +
 * Expediente se crean automáticamente como parte de la misma operación.
 */
class AcreditacionService {
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
   * Servicio de la colección del sujeto.
   * @param {boolean} esPersona true para Persona, false para Maquinaria.
   * @return {Object} participacionPersonaService o
   *     participacionRecursoService.
   */
  _servicio(esPersona) {
    return esPersona ?
        participacionPersonaService : participacionRecursoService;
  }

  /**
   * Perfiles de Recurso actuales de un sujeto: los de su Participación
   * activa más reciente (para heredarlos al cambiarlo de Proyecto).
   * @param {boolean} esPersona Tipo del sujeto.
   * @param {string} sujetoId personaId o recursoId.
   * @return {Promise<(Array<string>|null)>} IDs, o null si no tiene
   *     ninguno activo.
   */
  async _perfilesActuales(esPersona, sujetoId) {
    const docs = await this._servicio(esPersona).repo
        .getActivosBySujeto(sujetoId);
    const sujetos = esPersona ?
        agruparSujetos(docs, []) : agruparSujetos([], docs);
    if (sujetos.length === 0) return null;
    const masReciente = sujetos.reduce((a, b) =>
      reutilizacionDocumentalService.aMillis(b.fechaInicio) >
          reutilizacionDocumentalService.aMillis(a.fechaInicio) ? b : a);
    return masReciente.perfilRecursoIds;
  }

  /**
   * Ejecuta el reemplazo de acreditación de una Persona, Recurso
   * (maquinaria) o Empresa hacia un nuevo Proyecto.
   * @param {Object} payload Datos del reemplazo (ver rutas para el
   *     detalle de campos por `entidadTipo`).
   * @param {Object} actor Usuario autenticado que ejecuta la acción.
   * @return {Promise<Object>} Resumen de lo cerrado/creado.
   */
  async reemplazar(payload, actor) {
    const {
      entidadTipo, entidadId, proyectoDestinoId, perfilParticipacionId,
      fechaInicio, fechaFin,
    } = payload;
    const perfilRecursoIds = perfilesDelPayload(payload);

    if (!ENTIDADES_VALIDAS.includes(entidadTipo)) {
      throw new AppError(
          400, "entidadTipo debe ser 'persona', 'maquinaria' o 'empresa'.",
      );
    }
    if (!entidadId) throw new AppError(400, "entidadId es obligatorio.");
    if (!proyectoDestinoId) {
      throw new AppError(400, "proyectoDestinoId es obligatorio.");
    }
    if (!fechaInicio) throw new AppError(400, "fechaInicio es obligatorio.");

    const proyecto = await proyectoRepository.getById(proyectoDestinoId);
    if (!proyecto) {
      throw new AppError(400, "El Proyecto destino indicado no existe.");
    }

    if (
      ROLES_ALCANCE_FORZADO.includes(actor.rol) &&
      proyecto.mandanteId !== actor.mandanteId
    ) {
      throw new AppError(
          403,
          "No tiene permisos para acreditar en proyectos de otro Mandante.",
      );
    }

    const mandanteId = proyecto.mandanteId;
    const fechaInicioDate = this._parseFecha(fechaInicio, "fechaInicio");
    let fechaFinDate = null;
    if (fechaFin) {
      fechaFinDate = this._parseFecha(fechaFin, "fechaFin");
      if (fechaFinDate < fechaInicioDate) {
        throw new AppError(
            400, "fechaFin no puede ser anterior a fechaInicio.",
        );
      }
    }

    // creadoPorNombre se denormaliza desde el perfil del actor — mismo
    // patrón que expedienteService.crearExpediente/evaluacionService.
    const creador = await usuarioRepository.getById(actor.uid);
    const creadoPorNombre = creador ?
        `${creador.nombre} ${creador.apellido}`.trim() :
        actor.email;

    if (entidadTipo === "empresa") {
      return this._reemplazarEmpresa({
        empresaId: entidadId, proyecto, mandanteId, perfilParticipacionId,
        fechaInicioDate, fechaFinDate, creadoPorNombre,
      }, actor);
    }

    return this._reemplazarPersonaOMaquinaria({
      entidadTipo, entidadId, proyecto, mandanteId, perfilParticipacionId,
      perfilRecursoIds, fechaInicioDate, fechaFinDate, creadoPorNombre,
    }, actor);
  }

  /**
   * Mueve la Persona (sus documentos activos de participacionPersonas) a
   * otro Proyecto — puerta de entrada corta a la misma operación que
   * `reemplazar` ya resuelve para `entidadTipo: "persona"`: delega en
   * `reemplazar()` sin reimplementar nada, solo resuelve el único dato que
   * ese endpoint no exige y este sí puede omitir: los Perfiles de Recurso,
   * heredados de su Participación activa más reciente cuando el llamador
   * no los indica (válidos solo si el Proyecto destino es del mismo
   * Mandante).
   * @param {string} personaId ID de la Persona.
   * @param {{proyectoDestinoId: string,
   *     perfilParticipacionId: (string|undefined),
   *     perfilRecursoIds: (string[]|undefined), fechaInicio: string}}
   *     payload Datos del cambio de Proyecto.
   * @param {Object} actor Usuario autenticado que ejecuta la acción.
   * @return {Promise<Object>} Mismo resumen que retorna `reemplazar` para
   *     `entidadTipo: "persona"`.
   */
  async cambiarProyectoPersona(personaId, payload, actor) {
    if (!personaId) throw new AppError(400, "personaId es obligatorio.");
    const {proyectoDestinoId, perfilParticipacionId, fechaInicio} = payload;
    const perfilRecursoIds = perfilesDelPayload(payload) ||
        await this._perfilesActuales(true, personaId);
    if (!perfilRecursoIds) {
      throw new AppError(
          400,
          "Debe indicar el Perfil de Recurso: esta Persona no tiene ninguna " +
          "participación activa de la que heredarlo.",
      );
    }

    return this.reemplazar({
      entidadTipo: "persona",
      entidadId: personaId,
      proyectoDestinoId,
      perfilParticipacionId,
      perfilRecursoIds,
      fechaInicio,
    }, actor);
  }

  /**
   * Mueve un Recurso (maquinaria) a otro Proyecto — análogo a
   * `cambiarProyectoPersona`, delegando en el mismo `reemplazar()` con
   * `entidadTipo: "maquinaria"`. Si no se indica el Perfil de Recurso, se
   * hereda el de su Participación activa más reciente.
   * @param {string} recursoId ID del Recurso.
   * @param {{proyectoDestinoId: string,
   *     perfilParticipacionId: (string|undefined),
   *     perfilRecursoId: (string|undefined), fechaInicio: string}}
   *     payload Datos del cambio de Proyecto.
   * @param {Object} actor Usuario autenticado que ejecuta la acción.
   * @return {Promise<Object>} Mismo resumen que retorna `reemplazar` para
   *     `entidadTipo: "maquinaria"`.
   */
  async cambiarProyectoRecurso(recursoId, payload, actor) {
    if (!recursoId) throw new AppError(400, "recursoId es obligatorio.");
    const {proyectoDestinoId, perfilParticipacionId, fechaInicio} = payload;
    const perfilRecursoIds = perfilesDelPayload(payload) ||
        await this._perfilesActuales(false, recursoId);
    if (!perfilRecursoIds) {
      throw new AppError(
          400,
          "Debe indicar el Perfil de Recurso: esta Maquinaria no tiene " +
          "ninguna participación activa de la que heredarlo.",
      );
    }

    return this.reemplazar({
      entidadTipo: "maquinaria",
      entidadId: recursoId,
      proyectoDestinoId,
      perfilParticipacionId,
      perfilRecursoIds,
      fechaInicio,
    }, actor);
  }

  /**
   * Valida una Persona o Recurso (existencia, estado activo, Empresa
   * asociada activa) y sus Perfiles de Recurso contra el catálogo del
   * Mandante indicado (mismo Mandante, activos, del tipo correcto).
   * Compartido entre `reemplazar` y `asignarEntidadAProyecto`.
   * @param {{entidadTipo: string, entidadId: string, mandanteId: string,
   *     perfilRecursoIds: (Array<string>|null)}} datos Datos a validar.
   * @return {Promise<{entidad: Object, empresaId: string,
   *     perfilRecursoIds: string[]}>} La entidad validada, el `empresaId`
   *     al que pertenece (Persona/Recurso se mueven siempre junto con su
   *     Empresa actual) y los perfiles normalizados.
   */
  async _validarEntidadYPerfiles({
    entidadTipo, entidadId, mandanteId, perfilRecursoIds,
  }) {
    const esPersona = entidadTipo === "persona";
    const etiquetaEntidad = esPersona ? "La Persona" : "El Recurso";

    const entidad = esPersona ?
        await personaRepository.getById(entidadId) :
        await recursoRepository.getById(entidadId);
    if (!entidad) {
      throw new AppError(400, `${etiquetaEntidad} indicada no existe.`);
    }
    if (entidad.estado !== "activo") {
      throw new AppError(400, `${etiquetaEntidad} indicada no está activa.`);
    }

    const empresaId = entidad.empresaId;
    if (!empresaId) {
      throw new AppError(
          400, `${etiquetaEntidad} indicada no tiene una Empresa asociada.`,
      );
    }
    const empresa = await empresaRepository.getById(empresaId);
    if (!empresa || empresa.estado !== "activo") {
      throw new AppError(400, "La Empresa asociada no está activa.");
    }

    const perfiles = await this._servicio(esPersona).validarPerfiles(
        perfilRecursoIds || [], mandanteId,
    );
    return {entidad, empresaId, perfilRecursoIds: perfiles};
  }

  /**
   * "Mover" un sujeto, dentro de una transacción ya abierta: finaliza sus
   * documentos activos de la Participación más reciente (en cualquier
   * Proyecto) y los que tenga en otras Participaciones del Proyecto
   * destino, y prepara los documentos nuevos en la Participación destino
   * (uno por Perfil de Recurso). No toca Participación ni Expediente — eso
   * lo resuelve cada llamador. Única implementación de "mover" compartida
   * por `reemplazar` y `asignarEntidadAProyecto`. Todas las lecturas
   * ocurren antes de cualquier escritura (requisito de Firestore).
   * @param {FirebaseFirestore.Transaction} transaction Transacción activa.
   * @param {{esPersona: boolean, entidadId: string,
   *     participacion: Object, perfilRecursoIds: string[],
   *     fechaInicioDate: Date, fechaFinDate: ?Date}} datos Datos del
   *     movimiento. `participacion` es la destino ({id, proyectoId,
   *     empresaId, mandanteId}).
   * @return {Promise<{finalizados: Object[], altas: Object[],
   *     proyectoOrigenId: ?string}>} Lo cerrado y lo creado.
   */
  async _moverSujeto(transaction, {
    esPersona, entidadId, participacion, perfilRecursoIds, fechaInicioDate,
    fechaFinDate,
  }) {
    const servicio = this._servicio(esPersona);
    const snap = await transaction.get(
        servicio.repo.queryActivosSujeto(entidadId),
    );
    const activos = snap.docs.map((d) => ({id: d.id, ref: d.ref, ...d.data()}));

    // Participación de origen: la de fechaInicio más reciente.
    let origenParticipacionId = null;
    let origenMillis = -1;
    activos.forEach((a) => {
      const millis = reutilizacionDocumentalService.aMillis(a.fechaInicio);
      if (millis > origenMillis) {
        origenMillis = millis;
        origenParticipacionId = a.participacionId;
      }
    });
    const aFinalizar = activos.filter((a) =>
      a.participacionId === origenParticipacionId ||
      (a.proyectoId === participacion.proyectoId &&
          a.participacionId !== participacion.id));
    const proyectoOrigenId = aFinalizar.find(
        (a) => a.participacionId === origenParticipacionId,
    )?.proyectoId || null;

    aFinalizar.forEach((a) => transaction.update(a.ref, {
      estado: "finalizada",
      fechaTermino: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }));

    const campo = esPersona ? "personaId" : "recursoId";
    const altas = perfilRecursoIds.map((perfilRecursoId) => ({
      ref: servicio.repo.coleccion().doc(),
      data: servicio.repo.datosAlta({
        mandanteId: participacion.mandanteId,
        participacionId: participacion.id,
        proyectoId: participacion.proyectoId,
        empresaId: participacion.empresaId,
        [campo]: entidadId,
        perfilRecursoId,
        fechaInicio: fechaInicioDate,
        fechaTermino: fechaFinDate || null,
        estado: "activa",
      }),
    }));
    altas.forEach(({ref, data}) => transaction.set(ref, data));

    return {
      finalizados: aFinalizar.map(({ref, ...resto}) => resto),
      altas,
      proyectoOrigenId,
    };
  }

  /**
   * Reemplaza la acreditación de una Empresa: cierra su Participación
   * activa (en cualquier Proyecto) + el Expediente en curso de esa
   * Participación, y crea la nueva Participación + Expediente en el
   * Proyecto destino.
   * @param {Object} datos Datos ya validados/resueltos por `reemplazar`.
   * @param {Object} actor Usuario autenticado que ejecuta la acción.
   * @return {Promise<Object>} Resumen de lo cerrado/creado.
   */
  async _reemplazarEmpresa({
    empresaId, proyecto, mandanteId, perfilParticipacionId,
    fechaInicioDate, fechaFinDate, creadoPorNombre,
  }, actor) {
    const proyectoDestinoId = proyecto.id;

    if (!perfilParticipacionId) {
      throw new AppError(400, "perfilParticipacionId es obligatorio.");
    }

    const empresa = await empresaRepository.getById(empresaId);
    if (!empresa) throw new AppError(400, "La Empresa indicada no existe.");
    if (empresa.estado !== "activo") {
      throw new AppError(400, "La Empresa indicada no está activa.");
    }

    const perfil = await perfilParticipacionRepository.getById(
        perfilParticipacionId,
    );
    if (!perfil) {
      throw new AppError(
          400, "El Perfil de Participación indicado no existe.",
      );
    }
    if (perfil.mandanteId !== mandanteId) {
      throw new AppError(
          400, "El perfil seleccionado pertenece a otro Mandante.",
      );
    }
    if (perfil.estado !== "activo") {
      throw new AppError(
          400, "El Perfil de Participación indicado no está activo.",
      );
    }

    const duplicado =
        await participacionRepository.getActivaByProyectoYEmpresa(
            proyectoDestinoId, empresaId,
        );
    if (duplicado) {
      throw new AppError(
          409,
          "Ya existe una Participación activa para esta Empresa en el " +
          "Proyecto destino.",
      );
    }

    const requerimientosAplicables =
        await requerimientoCalculoService.calcularRequerimientosAplicables(
            perfilParticipacionId,
        );
    const requerimientosEmpresa = requerimientosAplicables.filter(
        (r) => r.tipoEntidad === "empresa",
    );
    const reutilizables =
        await reutilizacionDocumentalService.buscarReutilizablesEmpresa(
            empresaId, requerimientosEmpresa, fechaInicioDate,
        );

    const participacionRef =
        db.collection(participacionRepository.COLLECTION).doc();
    const expedienteRef =
        db.collection(expedienteRepository.COLLECTION).doc();
    const evaluacionRefs = reutilizables.map(
        () => db.collection(evaluacionRepository.COLLECTION).doc(),
    );

    let participacionAnteriorId = null;
    let expedienteAnteriorId = null;

    // Transacción: cierra la Participación activa anterior de la Empresa
    // (si existe, en cualquier Proyecto) + su Expediente en curso, y crea
    // la nueva Participación + Expediente + Evaluaciones reutilizadas.
    // Mismo patrón que relacionLaboralService.cambiarEmpresa: la consulta
    // de "activa a cerrar" se hace vía transaction.get para que el cierre
    // sea atómico con la creación.
    await db.runTransaction(async (transaction) => {
      const activasQuery = db.collection(participacionRepository.COLLECTION)
          .where("empresaId", "==", empresaId)
          .where("estado", "==", "activa");
      const activasSnapshot = await transaction.get(activasQuery);

      let origenDoc = null;
      let origenFechaInicioMillis = -1;
      activasSnapshot.docs.forEach((doc) => {
        const millis =
            reutilizacionDocumentalService.aMillis(doc.data().fechaInicio);
        if (millis > origenFechaInicioMillis) {
          origenDoc = doc;
          origenFechaInicioMillis = millis;
        }
      });

      if (origenDoc) {
        participacionAnteriorId = origenDoc.id;
        transaction.update(origenDoc.ref, {
          estado: "finalizada",
          updatedAt: FieldValue.serverTimestamp(),
        });

        const expedientesQuery = db.collection(expedienteRepository.COLLECTION)
            .where("participacionId", "==", origenDoc.id);
        const expedientesSnapshot = await transaction.get(expedientesQuery);
        const enCursoDoc = expedientesSnapshot.docs.find(
            (d) => d.data().estado !== "cerrado",
        );
        if (enCursoDoc) {
          expedienteAnteriorId = enCursoDoc.id;
          transaction.update(enCursoDoc.ref, {
            estado: "cerrado",
            fechaCierre: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
      }

      transaction.set(participacionRef, {
        proyectoId: proyectoDestinoId,
        empresaId,
        perfilParticipacionId,
        mandanteId,
        estado: "activa",
        fechaInicio: fechaInicioDate,
        fechaTermino: fechaFinDate,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      transaction.set(expedienteRef, {
        participacionId: participacionRef.id,
        proyectoId: proyectoDestinoId,
        empresaId,
        mandanteId,
        perfilParticipacionId,
        estado: "creado",
        requerimientosAplicables,
        fechaCierre: null,
        creadoPorNombre,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      reutilizacionDocumentalService.registrarReutilizadas(
          transaction, evaluacionRefs, reutilizables,
          {expedienteId: expedienteRef.id, mandanteId, actor, creadoPorNombre},
      );
    });

    await bitacoraLogger.registrarEvento({
      mandanteId,
      entidad: "participacion",
      entidadId: participacionRef.id,
      accion: "reemplazo_acreditacion",
      actor,
      detalle: {
        entidadTipo: "empresa",
        entidadId: empresaId,
        proyectoDestinoId,
        participacionAnteriorId,
        participacionNuevaId: participacionRef.id,
        expedienteAnteriorId,
        expedienteNuevoId: expedienteRef.id,
        requerimientosTotal: requerimientosAplicables.length,
        requerimientosReutilizados: reutilizables.length,
      },
    });

    return {
      participacionAnteriorId,
      participacionNuevaId: participacionRef.id,
      expedienteAnteriorId,
      expedienteNuevoId: expedienteRef.id,
      requerimientosTotal: requerimientosAplicables.length,
      requerimientosReutilizados: reutilizables.length,
    };
  }

  /**
   * Reemplaza la acreditación de una Persona o Recurso (maquinaria): se
   * mueven junto con su Empresa actual — finaliza sus documentos activos
   * (ver `_moverSujeto`) y crea los nuevos en el Proyecto destino, bajo la
   * Participación de esa misma Empresa allí (creándola junto a su
   * Expediente si la Empresa aún no participaba en el Proyecto destino).
   * Si el sujeto ya estaba activo en el Proyecto destino con OTRA Empresa,
   * esos documentos se finalizan y se crean los nuevos (cambio de empresa
   * dentro del Proyecto); si ya estaba con la MISMA Participación, se
   * rechaza.
   * @param {Object} datos Datos ya validados/resueltos por `reemplazar`.
   * @param {Object} actor Usuario autenticado que ejecuta la acción.
   * @return {Promise<Object>} Resumen de lo cerrado/creado.
   */
  async _reemplazarPersonaOMaquinaria({
    entidadTipo, entidadId, proyecto, mandanteId, perfilParticipacionId,
    perfilRecursoIds: perfilesPedidos, fechaInicioDate, fechaFinDate,
    creadoPorNombre,
  }, actor) {
    const proyectoDestinoId = proyecto.id;
    const esPersona = entidadTipo === "persona";
    const servicio = this._servicio(esPersona);

    const {empresaId, perfilRecursoIds} = await this._validarEntidadYPerfiles(
        {entidadTipo, entidadId, mandanteId, perfilRecursoIds: perfilesPedidos},
    );

    // Participación de la Empresa en el Proyecto destino: se reutiliza si
    // ya existe (junto con su Expediente en curso), o se crea junto con
    // su Expediente si la Empresa aún no participaba allí.
    const participacionExistente =
        await participacionRepository.getActivaByProyectoYEmpresa(
            proyectoDestinoId, empresaId,
        );

    if (participacionExistente) {
      const yaEnDestino = await servicio.repo.list({
        [servicio.campo]: entidadId,
        participacionId: participacionExistente.id,
        estado: "activa",
      });
      if (yaEnDestino.length > 0) {
        throw new AppError(
            409,
            `Esta ${servicio.etiqueta} ya está acreditada con esta Empresa ` +
            "en el Proyecto destino.",
        );
      }
    }

    let expedienteDestino = null;
    let requerimientosAplicablesDestino;
    let perfilParticipacionDestinoId;
    const crearParticipacionNueva = !participacionExistente;

    if (participacionExistente) {
      perfilParticipacionDestinoId =
          participacionExistente.perfilParticipacionId;
      const expedientes = await expedienteRepository.getByParticipacion(
          participacionExistente.id,
      );
      expedienteDestino =
          expedientes.find((e) => e.estado !== "cerrado") || null;
      requerimientosAplicablesDestino = expedienteDestino ?
          expedienteDestino.requerimientosAplicables :
          await requerimientoCalculoService.calcularRequerimientosAplicables(
              perfilParticipacionDestinoId,
          );
    } else {
      if (!perfilParticipacionId) {
        throw new AppError(
            400,
            "La Empresa no tiene una Participación activa en el Proyecto " +
            "destino: perfilParticipacionId es obligatorio para crearla.",
        );
      }
      const perfil = await perfilParticipacionRepository.getById(
          perfilParticipacionId,
      );
      if (!perfil) {
        throw new AppError(
            400, "El Perfil de Participación indicado no existe.",
        );
      }
      if (perfil.mandanteId !== mandanteId) {
        throw new AppError(
            400, "El perfil seleccionado pertenece a otro Mandante.",
        );
      }
      if (perfil.estado !== "activo") {
        throw new AppError(
            400, "El Perfil de Participación indicado no está activo.",
        );
      }
      perfilParticipacionDestinoId = perfilParticipacionId;
      requerimientosAplicablesDestino =
          await requerimientoCalculoService.calcularRequerimientosAplicables(
              perfilParticipacionId,
          );
    }

    // Reutilización nivel "empresa": solo tiene sentido si el Expediente
    // destino es nuevo — si ya existía (la Empresa ya participaba en el
    // Proyecto destino), sus Evaluaciones de empresa ya están resueltas y
    // no dependen de esta Persona/Recurso puntual.
    let reutilizablesEmpresa = [];
    if (!expedienteDestino) {
      const requerimientosEmpresa = requerimientosAplicablesDestino.filter(
          (r) => aplicaRequerimientoASujeto(r, {tipoEntidad: "empresa"}),
      );
      reutilizablesEmpresa =
          await reutilizacionDocumentalService.buscarReutilizablesEmpresa(
              empresaId, requerimientosEmpresa, fechaInicioDate,
          );
    }

    // Requerimientos del sujeto: regla única con sus Perfiles de Recurso.
    const sujeto = {
      tipoEntidad: esPersona ? "persona" : "recurso", perfilRecursoIds,
    };
    const requerimientosEntidad = requerimientosAplicablesDestino.filter(
        (r) => aplicaRequerimientoASujeto(r, sujeto),
    );
    const reutilizablesEntidad = esPersona ?
        await reutilizacionDocumentalService.buscarReutilizablesPersona(
            entidadId, requerimientosEntidad, fechaInicioDate,
        ) :
        await reutilizacionDocumentalService.buscarReutilizablesRecurso(
            entidadId, requerimientosEntidad, fechaInicioDate,
        );

    const participacionRef = crearParticipacionNueva ?
        db.collection(participacionRepository.COLLECTION).doc() :
        null;
    const expedienteRef = expedienteDestino ?
        db.collection(expedienteRepository.COLLECTION)
            .doc(expedienteDestino.id) :
        db.collection(expedienteRepository.COLLECTION).doc();
    const evaluacionRefsEmpresa = reutilizablesEmpresa.map(
        () => db.collection(evaluacionRepository.COLLECTION).doc(),
    );
    const evaluacionRefsEntidad = reutilizablesEntidad.map(
        () => db.collection(evaluacionRepository.COLLECTION).doc(),
    );

    const participacionDestino = crearParticipacionNueva ?
      {
        id: participacionRef.id, proyectoId: proyectoDestinoId, empresaId,
        mandanteId,
      } :
      participacionExistente;

    let movimiento;

    // Transacción: finaliza lo activo del sujeto (vía `_moverSujeto`,
    // compartido con `asignarEntidadAProyecto`) y crea sus documentos
    // nuevos, junto con la Participación/Expediente de la Empresa en el
    // Proyecto destino cuando corresponde, y las Evaluaciones reutilizadas.
    await db.runTransaction(async (transaction) => {
      movimiento = await this._moverSujeto(transaction, {
        esPersona, entidadId, participacion: participacionDestino,
        perfilRecursoIds, fechaInicioDate, fechaFinDate,
      });

      if (crearParticipacionNueva) {
        transaction.set(participacionRef, {
          proyectoId: proyectoDestinoId,
          empresaId,
          perfilParticipacionId: perfilParticipacionDestinoId,
          mandanteId,
          estado: "activa",
          fechaInicio: fechaInicioDate,
          fechaTermino: fechaFinDate,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }

      if (!expedienteDestino) {
        transaction.set(expedienteRef, {
          participacionId: participacionDestino.id,
          proyectoId: proyectoDestinoId,
          empresaId,
          mandanteId,
          perfilParticipacionId: perfilParticipacionDestinoId,
          estado: "creado",
          requerimientosAplicables: requerimientosAplicablesDestino,
          fechaCierre: null,
          creadoPorNombre,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }

      reutilizacionDocumentalService.registrarReutilizadas(
          transaction, evaluacionRefsEmpresa, reutilizablesEmpresa,
          {expedienteId: expedienteRef.id, mandanteId, actor, creadoPorNombre},
      );
      reutilizacionDocumentalService.registrarReutilizadas(
          transaction, evaluacionRefsEntidad, reutilizablesEntidad,
          {expedienteId: expedienteRef.id, mandanteId, actor, creadoPorNombre},
      );
    });

    const anterioresIds = movimiento.finalizados.map((d) => d.id);
    const nuevosIds = movimiento.altas.map(({ref}) => ref.id);
    await servicio.registrarFinalizados(movimiento.finalizados, actor);
    await servicio.registrarAltas(movimiento.altas, actor, {
      origen: "reemplazo_acreditacion",
    });
    await bitacoraLogger.registrarEvento({
      mandanteId,
      entidad: servicio.entidadBitacora,
      entidadId: nuevosIds[0],
      accion: "reemplazo_acreditacion",
      actor,
      detalle: {
        entidadTipo,
        entidadId,
        empresaId,
        proyectoOrigenId: movimiento.proyectoOrigenId,
        proyectoDestinoId,
        anterioresIds,
        nuevosIds,
        participacionNuevaId: participacionDestino.id,
        participacionEsNueva: crearParticipacionNueva,
        expedienteId: expedienteRef.id,
        expedienteEsNuevo: !expedienteDestino,
        requerimientosTotal: requerimientosEntidad.length,
        requerimientosReutilizados: reutilizablesEntidad.length,
      },
    });

    // Estado derivado (creado/en_revision/...): puede haber Evaluaciones
    // reutilizadas y sujetos nuevos que cambian los pares a evaluar. El
    // origen también cambia (perdió un sujeto).
    await expedienteService.recalcularEstado(expedienteRef.id, actor);
    const origenes = new Set(movimiento.finalizados.map(
        (d) => `${d.proyectoId}|${d.empresaId}`,
    ));
    for (const clave of origenes) {
      const [proyectoId, empresaOrigenId] = clave.split("|");
      // eslint-disable-next-line no-await-in-loop
      await expedienteService.recalcularPorProyectoEmpresa(
          proyectoId, empresaOrigenId, actor,
      );
    }

    return {
      anterioresIds,
      nuevosIds,
      participacionNuevaId: participacionDestino.id,
      participacionEsNueva: crearParticipacionNueva,
      expedienteId: expedienteRef.id,
      expedienteEsNuevo: !expedienteDestino,
      requerimientosTotal: requerimientosEntidad.length,
      requerimientosReutilizados: reutilizablesEntidad.length,
    };
  }

  /**
   * Asigna una Persona o Recurso (maquinaria) a un Proyecto para el flujo
   * de creación normal ("Nueva Acreditación"): si la entidad ya está activa
   * en OTRO Proyecto, la mueve — finaliza lo anterior y crea lo nuevo, vía
   * `_moverSujeto`, el mismo mecanismo que usa `reemplazar` — en vez de
   * duplicarla. Si no, delega directamente en el servicio de la colección
   * (`crear`), sin reimplementar sus validaciones. Este método NO toca
   * Participación ni Expediente: la Participación del Proyecto destino ya
   * la resolvió el wizard antes de llamar acá, y el Expediente —con su
   * propio motor de reutilización— se crea después, una sola vez para toda
   * la selección del paso "Personas y Maquinarias".
   * @param {{entidadTipo: string, entidadId: string,
   *     proyectoDestinoId: string, empresaId: string,
   *     perfilRecursoIds: (string[]|undefined),
   *     perfilRecursoId: (string|undefined), fechaInicio: string,
   *     fechaFin: ?string}} payload Datos de la asignación.
   * @param {Object} actor Usuario autenticado que ejecuta la acción.
   * @return {Promise<{documentos: Object[], movida: boolean}>} Los
   *     documentos creados y si se cerró algo anterior.
   */
  async asignarEntidadAProyecto(payload, actor) {
    const {
      entidadTipo, entidadId, proyectoDestinoId, empresaId,
      fechaInicio, fechaFin,
    } = payload;
    const perfilesPedidos = perfilesDelPayload(payload);

    if (!["persona", "maquinaria"].includes(entidadTipo)) {
      throw new AppError(
          400, "entidadTipo debe ser 'persona' o 'maquinaria'.",
      );
    }
    if (!entidadId) throw new AppError(400, "entidadId es obligatorio.");
    if (!proyectoDestinoId) {
      throw new AppError(400, "proyectoDestinoId es obligatorio.");
    }
    if (!empresaId) throw new AppError(400, "empresaId es obligatorio.");
    if (!fechaInicio) throw new AppError(400, "fechaInicio es obligatorio.");

    const esPersona = entidadTipo === "persona";
    const servicio = this._servicio(esPersona);

    const activos = await servicio.repo.getActivosBySujeto(entidadId);
    const tieneOtraActiva = activos.some(
        (a) => a.proyectoId !== proyectoDestinoId,
    );

    if (!tieneOtraActiva) {
      const documentos = await servicio.crear({
        proyectoId: proyectoDestinoId,
        empresaId,
        [servicio.campo]: entidadId,
        perfilRecursoIds: perfilesPedidos,
        fechaInicio,
        fechaTermino: fechaFin,
      }, actor);
      return {documentos, movida: false};
    }

    const proyecto = await proyectoRepository.getById(proyectoDestinoId);
    if (!proyecto) {
      throw new AppError(400, "El Proyecto destino indicado no existe.");
    }
    if (ROLES_ALCANCE_FORZADO.includes(actor.rol) &&
        proyecto.mandanteId !== actor.mandanteId) {
      throw new AppError(
          403,
          "No tiene permisos para acreditar en proyectos de otro Mandante.",
      );
    }
    const mandanteId = proyecto.mandanteId;

    const {perfilRecursoIds} = await this._validarEntidadYPerfiles({
      entidadTipo, entidadId, mandanteId, perfilRecursoIds: perfilesPedidos,
    });

    const fechaInicioDate = this._parseFecha(fechaInicio, "fechaInicio");
    let fechaFinDate = null;
    if (fechaFin) {
      fechaFinDate = this._parseFecha(fechaFin, "fechaFin");
      if (fechaFinDate < fechaInicioDate) {
        throw new AppError(
            400, "fechaFin no puede ser anterior a fechaInicio.",
        );
      }
    }

    // La Participación del Proyecto destino ya la creó el wizard antes de
    // llegar acá.
    const participacionDestino =
        await participacionRepository.getActivaByProyectoYEmpresa(
            proyectoDestinoId, empresaId,
        );
    if (!participacionDestino) {
      throw new AppError(
          400,
          "La Empresa indicada no tiene una Participación activa en este " +
          "Proyecto.",
      );
    }

    let movimiento;
    await db.runTransaction(async (transaction) => {
      movimiento = await this._moverSujeto(transaction, {
        esPersona, entidadId, participacion: participacionDestino,
        perfilRecursoIds, fechaInicioDate, fechaFinDate,
      });
    });

    const anterioresIds = movimiento.finalizados.map((d) => d.id);
    const nuevosIds = movimiento.altas.map(({ref}) => ref.id);
    await servicio.registrarFinalizados(movimiento.finalizados, actor);
    await servicio.registrarAltas(movimiento.altas, actor);
    // Mismo rastro de auditoría que `reemplazar` (misma `accion`): es la
    // misma operación de negocio, iniciada desde otro punto de entrada.
    await bitacoraLogger.registrarEvento({
      mandanteId,
      entidad: servicio.entidadBitacora,
      entidadId: nuevosIds[0],
      accion: "reemplazo_acreditacion",
      actor,
      detalle: {
        entidadTipo,
        entidadId,
        empresaId,
        proyectoOrigenId: movimiento.proyectoOrigenId,
        proyectoDestinoId,
        anterioresIds,
        nuevosIds,
      },
    });

    // Origen y destino cambian cuántos sujetos hay que evaluar (estado
    // derivado del Expediente).
    await expedienteService.recalcularPorProyectoEmpresa(
        proyectoDestinoId, empresaId, actor,
    );
    const origenes = new Set(movimiento.finalizados.map(
        (d) => `${d.proyectoId}|${d.empresaId}`,
    ));
    for (const clave of origenes) {
      const [proyectoId, empresaOrigenId] = clave.split("|");
      // eslint-disable-next-line no-await-in-loop
      await expedienteService.recalcularPorProyectoEmpresa(
          proyectoId, empresaOrigenId, actor,
      );
    }

    const documentos = await Promise.all(
        nuevosIds.map((id) => servicio.repo.getById(id)),
    );
    return {documentos, movida: true};
  }

  /**
   * Lista las Personas o Recursos (maquinaria) activos de una Empresa,
   * con su participación activa actual (en cualquier Proyecto) si tienen
   * una — para el Paso "Personas y Maquinarias" del wizard de Nueva
   * Acreditación, que necesita avisar si alguien ya está participando en
   * otro Proyecto antes de que el usuario lo seleccione.
   * @param {{empresaId: string, tipo: string}} filtros Empresa y tipo
   *     ('persona' | 'maquinaria') a listar.
   * @return {Promise<Object[]>} Personas/Recursos con
   *     `participacionActiva: {proyectoId, proyectoNombre} | null`.
   */
  async listarEntidadesDeEmpresa({empresaId, tipo} = {}) {
    if (!empresaId) throw new AppError(400, "empresaId es obligatorio.");
    if (!["persona", "maquinaria"].includes(tipo)) {
      throw new AppError(
          400, "El query param 'tipo' debe ser 'persona' o 'maquinaria'.",
      );
    }
    const esPersona = tipo === "persona";

    const entidades = esPersona ?
        await personaRepository.list({estado: "activo", empresaId}) :
        await recursoRepository.list({estado: "activo", empresaId});

    const proyectosCache = {};
    const resolverProyecto = async (proyectoId) => {
      if (!(proyectoId in proyectosCache)) {
        proyectosCache[proyectoId] =
            await proyectoRepository.getById(proyectoId);
      }
      return proyectosCache[proyectoId];
    };

    return Promise.all(entidades.map(async (e) => {
      const activas = await this._servicio(esPersona).repo
          .getActivosBySujeto(e.id);

      let participacionActiva = null;
      if (activas.length > 0) {
        const proyecto = await resolverProyecto(activas[0].proyectoId);
        // El Proyecto pudo haber sido eliminado dejando la Participación
        // huérfana (dato inconsistente, no un caso normal) — nunca se
        // muestra el ID crudo como si fuera un nombre.
        participacionActiva = {
          participacionId: activas[0].participacionId,
          proyectoId: activas[0].proyectoId,
          proyectoNombre: proyecto?.nombre || "Proyecto no disponible",
          perfilRecursoIds: [...new Set(activas
              .filter((a) => a.participacionId === activas[0].participacionId)
              .map((a) => a.perfilRecursoId))],
        };
      }

      return {...e, participacionActiva};
    }));
  }

  /**
   * Lista Personas, Recursos (maquinaria) o Empresas con su historial de
   * participaciones (activas/finalizadas), para el Paso 2
   * del wizard de Reemplazar Acreditación. Filtra por texto (nombre/RUT/
   * cargo) y pagina en memoria — igual de simple que el resto del
   * catálogo (`personaRepository`/`recursoRepository`/`empresaRepository`
   * no exponen búsqueda ni paginación propias).
   * @param {{tipo: string, search: (string|undefined),
   *     page: (number|undefined), pageSize: (number|undefined)}} filtros
   *     Filtros de búsqueda.
   * @return {Promise<{data: Object[], total: number, page: number,
   *     pageSize: number}>} Página de resultados.
   */
  async listarEntidades({tipo, search = "", page = 1, pageSize = 10} = {}) {
    if (!ENTIDADES_VALIDAS.includes(tipo)) {
      throw new AppError(
          400, "El query param 'tipo' debe ser 'persona', 'maquinaria' o " +
          "'empresa'.",
      );
    }

    let filas;
    if (tipo === "empresa") {
      filas = await this._listarFilasEmpresa();
    } else if (tipo === "persona") {
      filas = await this._listarFilasPersona();
    } else {
      filas = await this._listarFilasRecurso();
    }

    const termino = search.trim().toLowerCase();
    const filtradas = termino ?
        filas.filter((f) => [f.nombre, f.rut, f.cargo]
            .filter(Boolean)
            .some((v) => v.toLowerCase().includes(termino))) :
        filas;

    const paginaActual = Math.max(1, page);
    const inicio = (paginaActual - 1) * pageSize;

    return {
      data: filtradas.slice(inicio, inicio + pageSize),
      total: filtradas.length,
      page: paginaActual,
      pageSize,
    };
  }

  /**
   * Construye las filas de Persona para `listarEntidades`.
   * @return {Promise<Object[]>} Filas de Persona.
   */
  async _listarFilasPersona() {
    const personas = await personaRepository.list({estado: "activo"});
    return Promise.all(personas.map(async (p) => {
      const docs = await this._servicio(true).repo
          .list({personaId: p.id});
      // Una Participación cuenta una vez aunque tenga varios perfiles.
      const distintas = (estado) => new Set(docs
          .filter((d) => d.estado === estado)
          .map((d) => d.participacionId)).size;
      return {
        id: p.id,
        nombre: `${p.nombre} ${p.apellido}`.trim(),
        rut: p.rut,
        cargo: p.cargoActivo || null,
        empresaId: p.empresaId || null,
        participacionesActivas: distintas("activa"),
        participacionesFinalizadas: distintas("finalizada"),
        estado: p.estado,
      };
    }));
  }

  /**
   * Construye las filas de Recurso (maquinaria) para `listarEntidades`.
   * @return {Promise<Object[]>} Filas de Recurso.
   */
  async _listarFilasRecurso() {
    const recursos = await recursoRepository.list({estado: "activo"});
    return Promise.all(recursos.map(async (r) => {
      const docs = await this._servicio(false).repo
          .list({recursoId: r.id});
      // Una Participación cuenta una vez aunque tenga varios perfiles.
      const distintas = (estado) => new Set(docs
          .filter((d) => d.estado === estado)
          .map((d) => d.participacionId)).size;
      return {
        id: r.id,
        nombre: r.nombre,
        rut: r.patente || null,
        cargo: r.tipo || null,
        empresaId: r.empresaId || null,
        participacionesActivas: distintas("activa"),
        participacionesFinalizadas: distintas("finalizada"),
        estado: r.estado,
      };
    }));
  }

  /**
   * Construye las filas de Empresa para `listarEntidades`.
   * @return {Promise<Object[]>} Filas de Empresa.
   */
  async _listarFilasEmpresa() {
    const empresas = await empresaRepository.list({estado: "activo"});
    return Promise.all(empresas.map(async (e) => {
      const participaciones = await participacionRepository.list(
          {empresaId: e.id},
      );
      return {
        id: e.id,
        nombre: e.razonSocial,
        rut: e.rut,
        cargo: null,
        empresaId: e.id,
        participacionesActivas:
            participaciones.filter((p) => p.estado === "activa").length,
        participacionesFinalizadas:
            participaciones.filter((p) => p.estado === "finalizada").length,
        estado: e.estado,
      };
    }));
  }

  /**
   * Previsualiza, sin escribir nada, cuántos Requerimientos aplicarían al
   * reemplazar una acreditación y cuántos de ellos quedarían pre-cumplidos
   * por reutilización documental — usado por el Paso 5 del wizard.
   * @param {{entidadTipo: string, entidadId: string,
   *     perfilParticipacionId: string, fechaInicio: string,
   *     perfilRecursoIds: (string[]|undefined)}} filtros Datos necesarios
   *     para calcular el mismo snapshot que tomaría `reemplazar`. Para
   *     Persona/Maquinaria, los Requerimientos de su nivel se filtran con
   *     la regla única de aplicabilidad según sus Perfiles de Recurso (los
   *     indicados o, si no vienen, los de su Participación activa).
   * @return {Promise<Object>} Conteos totales y por bloque
   *     (empresa/persona/maquinaria).
   */
  async previewRequerimientos(filtros = {}) {
    const {
      entidadTipo, entidadId, perfilParticipacionId, fechaInicio,
    } = filtros;
    if (!ENTIDADES_VALIDAS.includes(entidadTipo)) {
      throw new AppError(
          400, "entidadTipo debe ser 'persona', 'maquinaria' o 'empresa'.",
      );
    }
    if (!fechaInicio) throw new AppError(400, "fechaInicio es obligatorio.");
    if (!perfilParticipacionId) {
      throw new AppError(400, "perfilParticipacionId es obligatorio.");
    }
    const fechaInicioDate = this._parseFecha(fechaInicio, "fechaInicio");

    let empresaId = entidadId;
    if (entidadTipo !== "empresa") {
      const entidad = entidadTipo === "persona" ?
          await personaRepository.getById(entidadId) :
          await recursoRepository.getById(entidadId);
      if (!entidad) throw new AppError(400, "La entidad indicada no existe.");
      empresaId = entidad.empresaId;
    }

    const requerimientosAplicables =
        await requerimientoCalculoService.calcularRequerimientosAplicables(
            perfilParticipacionId,
        );
    const porNivel = this._agruparPorTipo(requerimientosAplicables);
    if (entidadTipo !== "empresa") {
      const esPersona = entidadTipo === "persona";
      const perfilRecursoIds = perfilesDelPayload(filtros) ||
          await this._perfilesActuales(esPersona, entidadId) || [];
      const sujeto = {
        tipoEntidad: esPersona ? "persona" : "recurso", perfilRecursoIds,
      };
      const nivel = esPersona ? "persona" : "maquinaria";
      porNivel[nivel] = porNivel[nivel].filter(
          (r) => aplicaRequerimientoASujeto(r, sujeto),
      );
    }

    const reutilizablesEmpresa =
        await reutilizacionDocumentalService.buscarReutilizablesEmpresa(
            empresaId, porNivel.empresa, fechaInicioDate,
        );
    const reutilizablesPersona = entidadTipo === "persona" ?
        await reutilizacionDocumentalService.buscarReutilizablesPersona(
            entidadId, porNivel.persona, fechaInicioDate,
        ) :
        [];
    const reutilizablesMaquinaria = entidadTipo === "maquinaria" ?
        await reutilizacionDocumentalService.buscarReutilizablesRecurso(
            entidadId, porNivel.maquinaria, fechaInicioDate,
        ) :
        [];

    const bloque = (nivel, reutilizables) => ({
      total: porNivel[nivel].length,
      reutilizados: reutilizables.length,
      pendientes: porNivel[nivel].length - reutilizables.length,
    });

    return {
      empresa: bloque("empresa", reutilizablesEmpresa),
      persona: bloque("persona", reutilizablesPersona),
      maquinaria: bloque("maquinaria", reutilizablesMaquinaria),
      total: porNivel.empresa.length + porNivel.persona.length +
          porNivel.maquinaria.length,
      reutilizados:
          reutilizablesEmpresa.length + reutilizablesPersona.length +
          reutilizablesMaquinaria.length,
    };
  }

  /**
   * Agrupa entradas del snapshot por tipo de entidad. Las claves de salida
   * conservan "maquinaria" (no "recurso") porque son la forma de la
   * respuesta de las vistas previas que consume el frontend.
   * @param {Object[]} requerimientos Entradas del snapshot.
   * @return {{empresa: Object[], persona: Object[], maquinaria: Object[]}}
   *     Entradas agrupadas.
   */
  _agruparPorTipo(requerimientos) {
    const porNivel = {empresa: [], persona: [], maquinaria: []};
    const clave = {
      empresa: "empresa", persona: "persona", recurso: "maquinaria",
    };
    requerimientos.forEach((r) => {
      if (clave[r.tipoEntidad]) porNivel[clave[r.tipoEntidad]].push(r);
    });
    return porNivel;
  }

  /**
   * Estado documento a documento de los Requerimientos de una entidad, a
   * partir de las Evaluaciones reutilizables ya encontradas (mismos datos
   * que producen los conteos: no hay una segunda búsqueda).
   * @param {Object[]} requerimientos Requerimientos aplicables del nivel.
   * @param {Object[]} reutilizables Evaluaciones originales reutilizables.
   * @return {Object[]} [{requerimientoId, nombre, estado, vigenteHasta}].
   */
  _detalleRequisitos(requerimientos, reutilizables) {
    const porRequerimiento = {};
    reutilizables.forEach((ev) => {
      porRequerimiento[ev.requerimientoId] = ev;
    });
    return requerimientos.map((r) => {
      const ev = porRequerimiento[r.requerimientoId];
      const millis = ev ?
          reutilizacionDocumentalService.aMillis(ev.fechaVencimiento) : 0;
      return {
        requerimientoId: r.requerimientoId,
        nombre: r.nombre,
        estado: ev ? "reutilizado" : "pendiente",
        vigenteHasta: millis ? new Date(millis).toISOString() : null,
      };
    });
  }

  /**
   * Previsualiza, sin escribir nada, el conteo agregado de Requerimientos
   * aplicables y reutilizables para el flujo de creación normal ("Nueva
   * Acreditación"), donde se acredita una Empresa junto con un conjunto de
   * Personas/Recursos seleccionados de una vez — a diferencia de
   * `previewRequerimientos`, que evalúa una única entidad en el flujo de
   * Reemplazo. Reutiliza el mismo motor (`reutilizacionDocumentalService`)
   * y la misma regla de vigencia, sin duplicar cálculo.
   * @param {{empresaId: string, perfilParticipacionId: string,
   *     fechaInicio: string, seleccion: Array<{tipo: string, id: string,
   *     perfilRecursoIds: string[]}>}} filtros Datos del wizard: Empresa,
   *     Perfil elegido, fecha de inicio de la Participación, y la selección
   *     de Personas/Recursos con sus Perfiles de Recurso (paso "Personas y
   *     Maquinarias"). Los Requerimientos de cada sujeto se filtran con la
   *     regla única de aplicabilidad: la vista previa muestra exactamente lo
   *     que se va a generar.
   * @return {Promise<Object>} Conteos por bloque (empresa/personas/
   *     maquinarias), total, y detalle por entidad seleccionada.
   */
  async previewNueva({
    empresaId, perfilParticipacionId, fechaInicio, seleccion,
  } = {}) {
    if (!empresaId) throw new AppError(400, "empresaId es obligatorio.");
    if (!perfilParticipacionId) {
      throw new AppError(400, "perfilParticipacionId es obligatorio.");
    }
    if (!fechaInicio) throw new AppError(400, "fechaInicio es obligatorio.");
    const fechaInicioDate = this._parseFecha(fechaInicio, "fechaInicio");
    const lista = Array.isArray(seleccion) ? seleccion : [];

    const requerimientosAplicables =
        await requerimientoCalculoService.calcularRequerimientosAplicables(
            perfilParticipacionId,
        );
    const porNivel = this._agruparPorTipo(requerimientosAplicables);

    const reutilizablesEmpresa =
        await reutilizacionDocumentalService.buscarReutilizablesEmpresa(
            empresaId, porNivel.empresa, fechaInicioDate,
        );

    const detallePorEntidad = [];
    let reutilizadosPersonas = 0;
    let reutilizadosMaquinarias = 0;

    let totalPersonas = 0;
    let totalMaquinarias = 0;
    const propiosDe = (item, tipoEntidad) => {
      const sujeto = {
        tipoEntidad, perfilRecursoIds: perfilesDelPayload(item) || [],
      };
      return requerimientosAplicables.filter(
          (r) => aplicaRequerimientoASujeto(r, sujeto),
      );
    };

    for (const item of lista) {
      if (item.tipo === "persona") {
        const persona = await personaRepository.getById(item.id);
        const propios = propiosDe(item, "persona");
        totalPersonas += propios.length;
        const reutilizables =
            await reutilizacionDocumentalService.buscarReutilizablesPersona(
                item.id, propios, fechaInicioDate,
            );
        reutilizadosPersonas += reutilizables.length;
        detallePorEntidad.push({
          tipo: "persona",
          id: item.id,
          nombre: persona ?
              `${persona.nombre} ${persona.apellido}`.trim() :
              item.id,
          totalRequerimientos: propios.length,
          reutilizables: reutilizables.length,
          requisitos: this._detalleRequisitos(propios, reutilizables),
        });
      } else if (item.tipo === "recurso" || item.tipo === "maquinaria") {
        const recurso = await recursoRepository.getById(item.id);
        const propios = propiosDe(item, "recurso");
        totalMaquinarias += propios.length;
        const reutilizables =
            await reutilizacionDocumentalService.buscarReutilizablesRecurso(
                item.id, propios, fechaInicioDate,
            );
        reutilizadosMaquinarias += reutilizables.length;
        detallePorEntidad.push({
          tipo: "maquinaria",
          id: item.id,
          nombre: recurso ? recurso.nombre : item.id,
          totalRequerimientos: propios.length,
          reutilizables: reutilizables.length,
          requisitos: this._detalleRequisitos(propios, reutilizables),
        });
      }
    }


    const empresaBloque = {
      total: porNivel.empresa.length,
      reutilizables: reutilizablesEmpresa.length,
      requisitos:
          this._detalleRequisitos(porNivel.empresa, reutilizablesEmpresa),
    };
    const personasBloque = {
      total: totalPersonas,
      reutilizables: reutilizadosPersonas,
    };
    const maquinariasBloque = {
      total: totalMaquinarias,
      reutilizables: reutilizadosMaquinarias,
    };

    return {
      empresa: empresaBloque,
      personas: personasBloque,
      maquinarias: maquinariasBloque,
      total: {
        total:
            empresaBloque.total + personasBloque.total +
            maquinariasBloque.total,
        reutilizables:
            empresaBloque.reutilizables + personasBloque.reutilizables +
            maquinariasBloque.reutilizables,
      },
      detallePorEntidad,
    };
  }
}

module.exports = new AcreditacionService();
