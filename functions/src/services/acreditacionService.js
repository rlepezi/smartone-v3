const admin = require("firebase-admin");
const {FieldValue} = require("firebase-admin/firestore");
const proyectoRepository = require("../repositories/proyectoRepository");
const empresaRepository = require("../repositories/empresaRepository");
const personaRepository = require("../repositories/personaRepository");
const recursoRepository = require("../repositories/recursoRepository");
const participacionRepository =
    require("../repositories/participacionRepository");
const asignacionRepository = require("../repositories/asignacionRepository");
const asignacionService = require("./asignacionService");
const expedienteRepository = require("../repositories/expedienteRepository");
const expedienteService = require("./expedienteService");
const evaluacionRepository = require("../repositories/evaluacionRepository");
const perfilParticipacionRepository =
    require("../repositories/perfilParticipacionRepository");
const perfilRecursoRepository =
    require("../repositories/perfilRecursoRepository");
const requerimientoCalculoService = require("./requerimientoCalculoService");
const reutilizacionDocumentalService =
    require("./reutilizacionDocumentalService");
const usuarioRepository = require("../repositories/usuarioRepository");
const bitacoraLogger = require("../utils/bitacoraLogger");
const AppError = require("../utils/AppError");

const db = admin.firestore();

// "Acreditación" es una etiqueta de UI, no una entidad propia: mapea a
// Participación (Empresa) o a Asignación (Persona/Recurso) + Expediente,
// según se documenta en el encabezado de cada método de esta clase.
const ENTIDADES_VALIDAS = ["persona", "maquinaria", "empresa"];

// Mismo criterio de alcance por Mandante que participacionService/
// asignacionService.
const ROLES_ALCANCE_FORZADO = ["mandante_admin", "mandante_lector"];

/**
 * Reglas de negocio para "Reemplazar Acreditación": mueve una Persona,
 * Recurso (maquinaria) o Empresa de un Proyecto a otro, cerrando su
 * Participación/Asignación + Expediente actuales (nunca se eliminan,
 * solo cambian de estado) y creando los nuevos en el Proyecto destino,
 * reutilizando automáticamente las Evaluaciones vigentes que sigan
 * aplicando. No introduce una colección nueva: reutiliza Participación,
 * Asignación, Expediente y Evaluación tal como ya existen.
 *
 * Empresa se vincula a un Proyecto vía Participación (que lleva
 * `perfilParticipacionId` y es dueña del Expediente). Persona/Recurso se
 * vinculan vía Asignación (sin perfil propio): su cumplimiento se rastrea
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
      rol, fechaInicio, fechaFin,
    } = payload;

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
      rol, fechaInicioDate, fechaFinDate, creadoPorNombre,
    }, actor);
  }

  /**
   * Mueve la Participación/Asignación activa de una Persona a otro
   * Proyecto — puerta de entrada corta a la misma operación que
   * `reemplazar` ya resuelve para `entidadTipo: "persona"` (cierra la
   * Asignación activa, mueve junto con su Empresa actual, reutiliza
   * documentación vigente): delega en `reemplazar()` sin reimplementar
   * nada, solo resuelve el único dato que ese endpoint no exige y este sí
   * puede omitir: `rol`, heredado de la Asignación activa actual de la
   * Persona cuando el llamador no lo indica explícitamente.
   * @param {string} personaId ID de la Persona.
   * @param {{proyectoDestinoId: string,
   *     perfilParticipacionId: (string|undefined), rol: (string|undefined),
   *     fechaInicio: string}} payload Datos del cambio de Proyecto.
   * @param {Object} actor Usuario autenticado que ejecuta la acción.
   * @return {Promise<Object>} Mismo resumen que retorna `reemplazar` para
   *     `entidadTipo: "persona"`.
   */
  async cambiarProyectoPersona(personaId, payload, actor) {
    if (!personaId) throw new AppError(400, "personaId es obligatorio.");
    const {proyectoDestinoId, perfilParticipacionId, fechaInicio} = payload;
    let rol = payload.rol;

    if (!rol) {
      const activas = await asignacionRepository.getActivasByPersona(
          personaId,
      );
      rol = activas[0]?.rol || null;
    }
    if (!rol) {
      throw new AppError(
          400,
          "El campo 'rol' es obligatorio: esta Persona no tiene ninguna " +
          "Asignación activa de la que heredarlo.",
      );
    }

    return this.reemplazar({
      entidadTipo: "persona",
      entidadId: personaId,
      proyectoDestinoId,
      perfilParticipacionId,
      rol,
      fechaInicio,
    }, actor);
  }

  /**
   * Mueve la Participación/Asignación activa de un Recurso (maquinaria) a
   * otro Proyecto — análogo a `cambiarProyectoPersona`, delegando en el
   * mismo `reemplazar()` con `entidadTipo: "maquinaria"`. A diferencia de
   * Persona, no hereda ni pide ningún "rol": la clasificación de la
   * Maquinaria vive en el propio Recurso (`tipo`), no en la Asignación.
   * @param {string} recursoId ID del Recurso.
   * @param {{proyectoDestinoId: string,
   *     perfilParticipacionId: (string|undefined), fechaInicio: string}}
   *     payload Datos del cambio de Proyecto.
   * @param {Object} actor Usuario autenticado que ejecuta la acción.
   * @return {Promise<Object>} Mismo resumen que retorna `reemplazar` para
   *     `entidadTipo: "maquinaria"`.
   */
  async cambiarProyectoRecurso(recursoId, payload, actor) {
    if (!recursoId) throw new AppError(400, "recursoId es obligatorio.");
    const {proyectoDestinoId, perfilParticipacionId, fechaInicio} = payload;

    return this.reemplazar({
      entidadTipo: "maquinaria",
      entidadId: recursoId,
      proyectoDestinoId,
      perfilParticipacionId,
      fechaInicio,
    }, actor);
  }

  /**
   * Valida una Persona o Recurso (existencia, estado activo, Empresa
   * asociada activa) y su rol/clasificación contra el catálogo de Perfil
   * de Recurso del Mandante indicado. Compartido entre `reemplazar`
   * (Reemplazar Acreditación) y `asignarEntidadAProyecto` (Nueva
   * Acreditación) — ambos flujos validan exactamente lo mismo antes de
   * tocar la Asignación, para no duplicar esta lógica.
   * @param {{entidadTipo: string, entidadId: string, mandanteId: string,
   *     rol: ?string}} datos Datos a validar.
   * @return {Promise<{entidad: Object, empresaId: string}>} La entidad
   *     validada y el `empresaId` al que pertenece (Persona/Recurso se
   *     mueven siempre junto con su Empresa actual, no es seleccionable).
   */
  async _validarEntidadYRol({entidadTipo, entidadId, mandanteId, rol}) {
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

    if (esPersona) {
      if (!rol) {
        throw new AppError(
            400, "El campo 'rol' es obligatorio para esta Persona.",
        );
      }
      const perfilRol = await perfilRecursoRepository.getActivoByNombre(
          mandanteId, "persona", rol,
      );
      if (!perfilRol) {
        throw new AppError(
            400,
            `El rol '${rol}' no está configurado como activo para este ` +
            "Mandante.",
        );
      }
    } else {
      const perfilTipo = await perfilRecursoRepository.getActivoByNombre(
          mandanteId, "recurso", entidad.tipo,
      );
      if (!perfilTipo) {
        throw new AppError(
            400,
            `La clasificación '${entidad.tipo}' del Recurso no está ` +
            "configurada como activa para este Mandante.",
        );
      }
    }

    return {entidad, empresaId};
  }

  /**
   * Cierra, dentro de una transacción ya abierta, la Asignación activa
   * más reciente de una Persona/Recurso (en cualquier Proyecto) y crea
   * la nueva en el Proyecto destino. No toca Participación ni
   * Expediente — eso lo resuelve cada llamador según su propio flujo
   * (`reemplazar` arma Participación/Expediente inline en la misma
   * transacción; `asignarEntidadAProyecto` ya los tiene resueltos
   * aparte). Única implementación de "mover" compartida entre ambos
   * flujos.
   * @param {FirebaseFirestore.Transaction} transaction Transacción activa.
   * @param {{esPersona: boolean, entidadId: string,
   *     asignacionRef: FirebaseFirestore.DocumentReference,
   *     proyectoDestinoId: string, empresaId: string, mandanteId: string,
   *     participacionId: string, rol: ?string, fechaInicioDate: Date,
   *     fechaFinDate: ?Date}} datos Datos de la nueva Asignación y de la
   *     entidad a mover. `participacionId` es de trazabilidad (a qué
   *     Participación destino queda ligada esta Asignación) — no participa
   *     de ninguna validación de negocio, solo se persiste tal cual.
   * @return {Promise<{asignacionAnteriorId: ?string,
   *     proyectoOrigenId: ?string}>} IDs de lo cerrado, si había algo.
   */
  async _moverAsignacion(transaction, {
    esPersona, entidadId, asignacionRef, proyectoDestinoId, empresaId,
    mandanteId, participacionId, rol, fechaInicioDate, fechaFinDate,
  }) {
    const activaQuery = db.collection(asignacionRepository.COLLECTION)
        .where(esPersona ? "personaId" : "recursoId", "==", entidadId)
        .where("estado", "==", "activa");
    const activaSnapshot = await transaction.get(activaQuery);

    let origenDoc = null;
    let origenFechaInicioMillis = -1;
    activaSnapshot.docs.forEach((doc) => {
      const millis =
          reutilizacionDocumentalService.aMillis(doc.data().fechaInicio);
      if (millis > origenFechaInicioMillis) {
        origenDoc = doc;
        origenFechaInicioMillis = millis;
      }
    });

    let asignacionAnteriorId = null;
    let proyectoOrigenId = null;
    if (origenDoc) {
      asignacionAnteriorId = origenDoc.id;
      proyectoOrigenId = origenDoc.data().proyectoId;
      // Misma regla de fechas que relacionLaboralService.cambiarEmpresa:
      // la Asignación cerrada queda con `fechaTermino` en el momento del
      // cambio, no solo `estado: "finalizada"` sin fecha.
      transaction.update(origenDoc.ref, {
        estado: "finalizada",
        fechaTermino: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    transaction.set(asignacionRef, {
      proyectoId: proyectoDestinoId,
      empresaId,
      mandanteId,
      participacionId,
      personaId: esPersona ? entidadId : null,
      recursoId: esPersona ? null : entidadId,
      rol: esPersona ? rol : null,
      estado: "activa",
      fechaInicio: fechaInicioDate,
      fechaTermino: fechaFinDate,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return {asignacionAnteriorId, proyectoOrigenId};
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
   * mueven junto con su Empresa actual — cierra su Asignación activa (en
   * cualquier Proyecto) y crea la nueva en el Proyecto destino, bajo la
   * Participación de esa misma Empresa allí (creándola junto a su
   * Expediente si la Empresa aún no participaba en el Proyecto destino).
   * @param {Object} datos Datos ya validados/resueltos por `reemplazar`.
   * @param {Object} actor Usuario autenticado que ejecuta la acción.
   * @return {Promise<Object>} Resumen de lo cerrado/creado.
   */
  async _reemplazarPersonaOMaquinaria({
    entidadTipo, entidadId, proyecto, mandanteId, perfilParticipacionId,
    rol, fechaInicioDate, fechaFinDate, creadoPorNombre,
  }, actor) {
    const proyectoDestinoId = proyecto.id;
    const esPersona = entidadTipo === "persona";

    const {empresaId} = await this._validarEntidadYRol(
        {entidadTipo, entidadId, mandanteId, rol},
    );

    const duplicado = esPersona ?
        await asignacionRepository.getActivaByPersonaYProyecto(
            entidadId, proyectoDestinoId,
        ) :
        await asignacionRepository.getActivaByRecursoYProyecto(
            entidadId, proyectoDestinoId,
        );
    if (duplicado) {
      throw new AppError(
          409,
          `Ya existe una Asignación activa para esta ` +
          `${esPersona ? "Persona" : "Recurso"} en el Proyecto destino.`,
      );
    }

    // Participación de la Empresa en el Proyecto destino: se reutiliza si
    // ya existe (junto con su Expediente en curso), o se crea junto con
    // su Expediente si la Empresa aún no participaba allí.
    const participacionExistente =
        await participacionRepository.getActivaByProyectoYEmpresa(
            proyectoDestinoId, empresaId,
        );

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
          (r) => r.tipoEntidad === "empresa",
      );
      reutilizablesEmpresa =
          await reutilizacionDocumentalService.buscarReutilizablesEmpresa(
              empresaId, requerimientosEmpresa, fechaInicioDate,
          );
    }

    const tipoEntidad = esPersona ? "persona" : "recurso";
    const requerimientosEntidad = requerimientosAplicablesDestino.filter(
        (r) => r.tipoEntidad === tipoEntidad,
    );
    const reutilizablesEntidad = esPersona ?
        await reutilizacionDocumentalService.buscarReutilizablesPersona(
            entidadId, requerimientosEntidad, fechaInicioDate,
        ) :
        await reutilizacionDocumentalService.buscarReutilizablesRecurso(
            entidadId, requerimientosEntidad, fechaInicioDate,
        );

    const asignacionRef = db.collection(asignacionRepository.COLLECTION).doc();
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

    // Conocido de antemano (participacionRef.id se genera sincrónicamente,
    // participacionExistente ya se resolvió arriba) — se le pasa a
    // `_moverAsignacion` para que la Asignación quede trazada a la
    // Participación destino específica, no solo a proyectoId+empresaId.
    const participacionDestinoId = crearParticipacionNueva ?
        participacionRef.id :
        participacionExistente.id;

    let asignacionAnteriorId = null;

    // Transacción: cierra la Asignación activa anterior de la
    // Persona/Recurso (si existe, en cualquier Proyecto — vía
    // `_moverAsignacion`, compartido con `asignarEntidadAProyecto`) y
    // crea la nueva Asignación, junto con la Participación/Expediente de
    // la Empresa en el Proyecto destino cuando corresponde, y las
    // Evaluaciones reutilizadas.
    await db.runTransaction(async (transaction) => {
      const {asignacionAnteriorId: idAnterior} = await this._moverAsignacion(
          transaction,
          {
            esPersona, entidadId, asignacionRef, proyectoDestinoId,
            empresaId, mandanteId, participacionId: participacionDestinoId,
            rol, fechaInicioDate, fechaFinDate,
          },
      );
      asignacionAnteriorId = idAnterior;

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
          participacionId: crearParticipacionNueva ?
              participacionRef.id :
              participacionExistente.id,
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

    const participacionNuevaId = participacionDestinoId;

    await bitacoraLogger.registrarEvento({
      mandanteId,
      entidad: "asignacion",
      entidadId: asignacionRef.id,
      accion: "reemplazo_acreditacion",
      actor,
      detalle: {
        entidadTipo,
        entidadId,
        empresaId,
        proyectoDestinoId,
        asignacionAnteriorId,
        asignacionNuevaId: asignacionRef.id,
        participacionNuevaId,
        participacionEsNueva: crearParticipacionNueva,
        expedienteId: expedienteRef.id,
        expedienteEsNuevo: !expedienteDestino,
        requerimientosTotal: requerimientosEntidad.length,
        requerimientosReutilizados: reutilizablesEntidad.length,
      },
    });

    // Estado derivado (creado/en_revision/...): puede haber Evaluaciones
    // reutilizadas y sujetos nuevos que cambian los pares a evaluar.
    await expedienteService.recalcularEstado(expedienteRef.id, actor);

    return {
      asignacionAnteriorId,
      asignacionNuevaId: asignacionRef.id,
      participacionNuevaId,
      participacionEsNueva: crearParticipacionNueva,
      expedienteId: expedienteRef.id,
      expedienteEsNuevo: !expedienteDestino,
      requerimientosTotal: requerimientosEntidad.length,
      requerimientosReutilizados: reutilizablesEntidad.length,
    };
  }

  /**
   * Asigna una Persona o Recurso (maquinaria) a un Proyecto para el flujo
   * de creación normal ("Nueva Acreditación"): si la entidad ya tiene una
   * Asignación activa en OTRO Proyecto, la mueve — cierra la anterior y
   * crea la nueva, vía `_moverAsignacion`, el mismo mecanismo que usa
   * `reemplazar` para Persona/Maquinaria — en vez de intentar crear una
   * Asignación duplicada. Si no tiene ninguna, delega directamente en
   * `asignacionService.crearAsignacion`, sin reimplementar esa
   * validación. A diferencia de `reemplazar`, este método NO toca
   * Participación ni Expediente: la Participación del Proyecto destino
   * ya la resolvió el wizard antes de llamar acá (la crea aparte,
   * `participacionService.crearParticipacion`), y el Expediente —con su
   * propio motor de reutilización para Persona/Recurso, ver
   * `expedienteService.crearExpediente`— se crea después, una sola vez
   * para toda la selección del paso "Personas y Maquinarias".
   * @param {{entidadTipo: string, entidadId: string,
   *     proyectoDestinoId: string, empresaId: string, rol: ?string,
   *     fechaInicio: string, fechaFin: ?string}} payload Datos de la
   *     Asignación a crear o mover.
   * @param {Object} actor Usuario autenticado que ejecuta la acción.
   * @return {Promise<Object>} La Asignación resultante, con `movida`
   *     (`true` si se cerró una anterior, `false` si fue creación simple).
   */
  async asignarEntidadAProyecto(payload, actor) {
    const {
      entidadTipo, entidadId, proyectoDestinoId, empresaId, rol,
      fechaInicio, fechaFin,
    } = payload;

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

    const activas = esPersona ?
        await asignacionRepository.getActivasByPersona(entidadId) :
        await asignacionRepository.getActivasByRecurso(entidadId);
    const tieneOtraActiva = activas.some(
        (a) => a.proyectoId !== proyectoDestinoId,
    );

    if (!tieneOtraActiva) {
      const asignacion = await asignacionService.crearAsignacion({
        proyectoId: proyectoDestinoId,
        empresaId,
        personaId: esPersona ? entidadId : undefined,
        recursoId: esPersona ? undefined : entidadId,
        rol: esPersona ? rol : undefined,
        fechaInicio,
        fechaTermino: fechaFin,
      }, actor);
      return {...asignacion, movida: false};
    }

    const proyecto = await proyectoRepository.getById(proyectoDestinoId);
    if (!proyecto) {
      throw new AppError(400, "El Proyecto destino indicado no existe.");
    }
    const mandanteId = proyecto.mandanteId;

    // Misma validación que `reemplazar` para Persona/Maquinaria (rol/
    // clasificación contra Perfil de Recurso) — se vuelve a resolver acá
    // porque este camino NO pasa por `asignacionService.crearAsignacion`.
    await this._validarEntidadYRol({entidadTipo, entidadId, mandanteId, rol});

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

    // Trazabilidad únicamente (ver doc de `_moverAsignacion`): la
    // Participación del Proyecto destino ya la creó el wizard antes de
    // llegar acá (ver comentario de este método), así que debería existir
    // siempre — pero si por algún motivo no está, se persiste `null` en
    // vez de romper un camino que ya funcionaba.
    const participacionDestino =
        await participacionRepository.getActivaByProyectoYEmpresa(
            proyectoDestinoId, empresaId,
        );

    const asignacionRef = db.collection(asignacionRepository.COLLECTION).doc();
    let asignacionAnteriorId = null;
    let proyectoOrigenId = null;

    await db.runTransaction(async (transaction) => {
      const resultado = await this._moverAsignacion(transaction, {
        esPersona, entidadId, asignacionRef, proyectoDestinoId, empresaId,
        mandanteId, participacionId: participacionDestino?.id || null,
        rol, fechaInicioDate, fechaFinDate,
      });
      asignacionAnteriorId = resultado.asignacionAnteriorId;
      proyectoOrigenId = resultado.proyectoOrigenId;
    });

    // Mismo rastro de auditoría que `reemplazar` para Persona/Maquinaria
    // (misma `accion`, mismos campos de detalle) — es la misma operación
    // de negocio, solo iniciada desde otro punto de entrada.
    await bitacoraLogger.registrarEvento({
      mandanteId,
      entidad: "asignacion",
      entidadId: asignacionRef.id,
      accion: "reemplazo_acreditacion",
      actor,
      detalle: {
        entidadTipo,
        entidadId,
        empresaId,
        proyectoOrigenId,
        proyectoDestinoId,
        asignacionAnteriorId,
        asignacionNuevaId: asignacionRef.id,
      },
    });

    // Origen y destino cambian cuántos sujetos hay que evaluar (estado
    // derivado del Expediente).
    await expedienteService.recalcularPorProyectoEmpresa(
        proyectoDestinoId, empresaId, actor,
    );
    if (proyectoOrigenId) {
      await expedienteService.recalcularPorProyectoEmpresa(
          proyectoOrigenId, empresaId, actor,
      );
    }

    const asignacionCreada = await asignacionRepository.getById(
        asignacionRef.id,
    );
    return {...asignacionCreada, movida: true};
  }

  /**
   * Lista las Personas o Recursos (maquinaria) activos de una Empresa,
   * con su Asignación activa actual (en cualquier Proyecto) si tienen
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
      const activas = esPersona ?
          await asignacionRepository.getActivasByPersona(e.id) :
          await asignacionRepository.getActivasByRecurso(e.id);

      let participacionActiva = null;
      if (activas.length > 0) {
        const proyecto = await resolverProyecto(activas[0].proyectoId);
        // El Proyecto pudo haber sido eliminado dejando la Asignación/
        // Participación huérfana (dato inconsistente, no un caso normal)
        // — nunca se muestra el ID crudo como si fuera un nombre.
        participacionActiva = {
          proyectoId: activas[0].proyectoId,
          proyectoNombre: proyecto?.nombre || "Proyecto no disponible",
        };
      }

      return {...e, participacionActiva};
    }));
  }

  /**
   * Lista Personas, Recursos (maquinaria) o Empresas con su historial de
   * participaciones/asignaciones (activas/finalizadas), para el Paso 2
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
      const asignaciones = await asignacionRepository.list({personaId: p.id});
      return {
        id: p.id,
        nombre: `${p.nombre} ${p.apellido}`.trim(),
        rut: p.rut,
        cargo: p.cargoActivo || null,
        empresaId: p.empresaId || null,
        participacionesActivas:
            asignaciones.filter((a) => a.estado === "activa").length,
        participacionesFinalizadas:
            asignaciones.filter((a) => a.estado === "finalizada").length,
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
      const asignaciones = await asignacionRepository.list({recursoId: r.id});
      return {
        id: r.id,
        nombre: r.nombre,
        rut: r.patente || null,
        cargo: r.tipo || null,
        empresaId: r.empresaId || null,
        participacionesActivas:
            asignaciones.filter((a) => a.estado === "activa").length,
        participacionesFinalizadas:
            asignaciones.filter((a) => a.estado === "finalizada").length,
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
   *     perfilParticipacionId: string, fechaInicio: string}} filtros
   *     Datos necesarios para calcular el mismo snapshot que tomaría
   *     `reemplazar`.
   * @return {Promise<Object>} Conteos totales y por bloque
   *     (empresa/persona/maquinaria).
   */
  async previewRequerimientos({
    entidadTipo, entidadId, perfilParticipacionId, fechaInicio,
  } = {}) {
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
      total: requerimientosAplicables.length,
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
   *     fechaInicio: string, seleccion: Array<{tipo: string, id: string}>}}
   *     filtros Datos del wizard: Empresa, Perfil elegido, fecha de inicio
   *     de la Participación, y la selección de Personas/Recursos armada
   *     hasta el momento (paso "Personas y Maquinarias").
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

    for (const item of lista) {
      if (item.tipo === "persona") {
        const persona = await personaRepository.getById(item.id);
        const reutilizables =
            await reutilizacionDocumentalService.buscarReutilizablesPersona(
                item.id, porNivel.persona, fechaInicioDate,
            );
        reutilizadosPersonas += reutilizables.length;
        detallePorEntidad.push({
          tipo: "persona",
          id: item.id,
          nombre: persona ?
              `${persona.nombre} ${persona.apellido}`.trim() :
              item.id,
          totalRequerimientos: porNivel.persona.length,
          reutilizables: reutilizables.length,
          requisitos: this._detalleRequisitos(porNivel.persona, reutilizables),
        });
      } else if (item.tipo === "recurso" || item.tipo === "maquinaria") {
        const recurso = await recursoRepository.getById(item.id);
        const reutilizables =
            await reutilizacionDocumentalService.buscarReutilizablesRecurso(
                item.id, porNivel.maquinaria, fechaInicioDate,
            );
        reutilizadosMaquinarias += reutilizables.length;
        detallePorEntidad.push({
          tipo: "maquinaria",
          id: item.id,
          nombre: recurso ? recurso.nombre : item.id,
          totalRequerimientos: porNivel.maquinaria.length,
          reutilizables: reutilizables.length,
          requisitos:
              this._detalleRequisitos(porNivel.maquinaria, reutilizables),
        });
      }
    }

    const personasCount = lista.filter((i) => i.tipo === "persona").length;
    const maquinariasCount = lista.filter(
        (i) => i.tipo === "recurso" || i.tipo === "maquinaria",
    ).length;

    const empresaBloque = {
      total: porNivel.empresa.length,
      reutilizables: reutilizablesEmpresa.length,
      requisitos:
          this._detalleRequisitos(porNivel.empresa, reutilizablesEmpresa),
    };
    const personasBloque = {
      total: porNivel.persona.length * personasCount,
      reutilizables: reutilizadosPersonas,
    };
    const maquinariasBloque = {
      total: porNivel.maquinaria.length * maquinariasCount,
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
