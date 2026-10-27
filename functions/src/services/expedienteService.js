const admin = require("firebase-admin");
const {FieldValue} = require("firebase-admin/firestore");
const expedienteRepository = require("../repositories/expedienteRepository");
const participacionRepository =
    require("../repositories/participacionRepository");
const requerimientoCalculoService =
    require("./requerimientoCalculoService");
const expedienteRequerimientoService =
    require("./expedienteRequerimientoService");
const usuarioRepository = require("../repositories/usuarioRepository");
const participacionPersonaRepository =
    require("../repositories/participacionPersonaRepository");
const participacionRecursoRepository =
    require("../repositories/participacionRecursoRepository");
const requerimientoRepository =
    require("../repositories/requerimientoRepository");
const expedienteEstadoRepository =
    require("../repositories/expedienteEstadoRepository");
const proyectoRepository = require("../repositories/proyectoRepository");
const {resumenVacio} = require("../utils/cumplimiento");
const bitacoraLogger = require("../utils/bitacoraLogger");
const bitacoraService = require("./bitacoraService");
const AppError = require("../utils/AppError");

const db = admin.firestore();

// DESVIACIÓN DOCUMENTADA (decisions.md, "Estado de Expediente derivado"):
// creado / en_revision / con_observaciones / aprobado se CALCULAN a partir
// del estado real de las Evaluaciones (ver calcularEstadoDerivado). Los demás
// cambios son decisiones manuales (ver decisions.md, "Ejecución y cierre de
// Expedientes"):
//  - aprobado → en_ejecucion ("Iniciar ejecución"): la Empresa acreditada ya
//    opera en el Proyecto. Desde ahí el estado YA NO se recalcula: si
//    aparecen pendientes, no cumple o vencidos, el Expediente muestra una
//    alerta pero conserva su estado.
//  - cualquiera salvo cerrado → cerrado ("Cerrar expediente", o automático
//    al finalizar/archivar el Proyecto): finaliza la Participación y sus
//    Personas/Maquinarias activas.
//  - correcciones (solo superadmin): en_ejecucion → aprobado y reabrir un
//    cerrado al estado que tenía antes del cierre.
// Todo cambio de estado escribe un documento en expedienteEstados en la
// misma transacción, y un evento en Bitácora.

// Estados que la derivación automática NUNCA pisa: una vez que el Expediente
// entró a ejecución o se cerró, es una decisión manual.
const ESTADOS_MANUALES = ["en_ejecucion", "cerrado"];

// Motivos de cierre de un Expediente ("otro" exige detalle).
const MOTIVOS_CIERRE = [
  "fin_proyecto", "salida_empresa", "cierre_administrativo", "otro",
];

// Estados del Proyecto en los que no se puede iniciar la ejecución.
const ESTADOS_PROYECTO_SIN_EJECUCION = [
  "finalizado", "archivado", "suspendido",
];

// Personas/Maquinarias activas que se finalizan dentro de la transacción del
// cierre (con el Expediente, su historial y la Participación caben bajo el
// límite de 400 operaciones). Si son más, se finalizan antes en lotes.
const MAX_SUJETOS_EN_TRANSACCION = 390;
const MAX_OPERACIONES_LOTE = 400;

// Roles cuyo acceso queda siempre acotado a su propio mandanteId. A
// diferencia de todos los módulos anteriores, "evaluador" aquí SÍ tiene
// permisos de escritura (transicionar estado) además de lectura, por eso
// queda deliberadamente fuera de este arreglo (igual que en Proyecto/
// Participación, donde evaluador ya era de lectura sin restricción).
const ROLES_ALCANCE_FORZADO = ["mandante_admin", "mandante_lector"];

/**
 * Reglas de negocio para el recurso Expediente: la entidad central del
 * proceso de acreditación. mandanteId, proyectoId, empresaId y
 * perfilParticipacionId se DERIVAN siempre de la Participación
 * referenciada — nunca se leen del payload del cliente.
 */
class ExpedienteService {
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
   * Convierte un valor (Firestore Timestamp, Date o string) a un objeto
   * Date de JavaScript.
   * @param {*} valor Valor a convertir.
   * @return {?Date} Fecha convertida, o null si el valor es nulo.
   */
  _aFecha(valor) {
    if (!valor) return null;
    if (typeof valor.toDate === "function") return valor.toDate();
    return new Date(valor);
  }

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
   * Obtiene un expediente por su ID, respetando el alcance del actor.
   * @param {string} id ID del expediente.
   * @param {Object} actor Usuario autenticado que ejecuta la acción.
   * @return {Promise<Object>} El expediente encontrado.
   */
  async getExpedienteById(id, actor) {
    if (!id || typeof id !== "string") {
      throw new AppError(400, "ID de expediente inválido.");
    }
    const expediente = await expedienteRepository.getById(id);
    if (!expediente) {
      throw new AppError(404, "Expediente no encontrado.");
    }
    if (
      ROLES_ALCANCE_FORZADO.includes(actor.rol) &&
      expediente.mandanteId !== actor.mandanteId
    ) {
      throw new AppError(404, "Expediente no encontrado.");
    }
    return expediente;
  }

  /**
   * Eventos recientes de Bitácora de un Expediente: los propios y los de su
   * Participación. Mismo mecanismo compartido (listarPorReferencias) que usan
   * Proyecto, Empresa, Persona y Recurso. Solo lectura, datos reales.
   * @param {string} id ID del expediente.
   * @param {Object} actor Usuario autenticado que ejecuta la acción.
   * @param {{limit: (string|number|undefined)}} [opciones] Máximo de
   *     eventos (por defecto 15, tope 500).
   * @return {Promise<Object[]>} Eventos, más reciente primero.
   */
  async obtenerEventos(id, actor, {limit} = {}) {
    const expediente = await this.getExpedienteById(id, actor);
    const referencias = [
      {entidad: "expediente", entidadId: id},
      {entidad: "participacion", entidadId: expediente.participacionId},
    ];
    return bitacoraService.listarPorReferencias(referencias, actor, {limit});
  }

  /**
   * Lista expedientes, forzando el alcance del actor cuando corresponde.
   * @param {Object} filtros Filtros de búsqueda (mandanteId, estado).
   * @param {Object} actor Usuario autenticado que ejecuta la acción.
   * @param {{incluirConteo: boolean}} [opciones] Si incluirConteo es true,
   *     cada expediente trae `cantidadPersonas` y `cantidadMaquinarias`
   *     (ver _contarRecursos). Opcional para no cargar lecturas extra a los
   *     muchos otros usos de este listado.
   * @return {Promise<Object[]>} Lista de expedientes.
   */
  async listarExpedientes(filtros, actor, {incluirConteo = false} = {}) {
    const filtrosFinales = {...filtros};
    if (ROLES_ALCANCE_FORZADO.includes(actor.rol)) {
      filtrosFinales.mandanteId = actor.mandanteId;
    }
    const expedientes = await expedienteRepository.list(filtrosFinales);
    if (!incluirConteo || expedientes.length === 0) return expedientes;

    const contar = await this._contarRecursos(
        filtrosFinales.mandanteId || null,
    );
    return expedientes.map((e) => ({...e, ...contar(e)}));
  }

  /**
   * Prepara el conteo de recursos por Expediente: personaId y recursoId
   * DISTINTOS con documentos activos en participacionPersonas /
   * participacionRecursos de su Participación (una Persona con dos perfiles
   * cuenta una vez). Dos consultas para todo el listado (sin N+1),
   * agrupadas en memoria. Sin mandanteId (superadmin/evaluador sin filtro)
   * lee los activos globales; los roles acotados llegan con su mandanteId.
   * @param {?string} mandanteId Mandante al que acotar, o null.
   * @return {Promise<function(Object): {cantidadPersonas: number,
   *     cantidadMaquinarias: number}>} Función expediente -> conteo.
   */
  async _contarRecursos(mandanteId) {
    const [personas, recursos] = await Promise.all([
      participacionPersonaRepository.listActivosParaConteo({mandanteId}),
      participacionRecursoRepository.listActivosParaConteo({mandanteId}),
    ]);
    const distintos = (docs, campo) => {
      const mapa = new Map();
      docs.forEach((d) => {
        if (!mapa.has(d.participacionId)) {
          mapa.set(d.participacionId, new Set());
        }
        mapa.get(d.participacionId).add(d[campo]);
      });
      return mapa;
    };
    const personasPorParticipacion = distintos(personas, "personaId");
    const recursosPorParticipacion = distintos(recursos, "recursoId");
    return (expediente) => ({
      cantidadPersonas:
          personasPorParticipacion.get(expediente.participacionId)?.size || 0,
      cantidadMaquinarias:
          recursosPorParticipacion.get(expediente.participacionId)?.size || 0,
    });
  }

  /**
   * Crea un nuevo expediente a partir de una Participación activa y genera
   * sus instancias de Requerimiento (expedienteRequerimientos): la Empresa
   * y cada Persona/Maquinaria asignada. El Expediente nace con
   * `estadoGeneracion: "en_proceso"` y pasa a "completa" al terminar; si la
   * generación falla a medias queda "en_proceso" y se puede reintentar
   * (POST /expedientes/:id/generar) sin duplicar (IDs determinísticos).
   * @param {Object} payload Payload de la petición (solo se usa
   *     `participacionId`).
   * @param {Object} actor Usuario autenticado que ejecuta la acción.
   * @param {{interrumpirTrasLotes: (number|undefined)}} [opciones] Solo
   *     pruebas: simula una generación interrumpida.
   * @return {Promise<Object>} El expediente creado.
   */
  async crearExpediente(payload, actor, opciones = {}) {
    const {participacionId} = payload;

    if (!participacionId) {
      throw new AppError(400, "participacionId es obligatorio.");
    }

    const participacion = await participacionRepository.getById(
        participacionId,
    );
    if (!participacion) {
      throw new AppError(400, "La Participación indicada no existe.");
    }
    if (participacion.estado !== "activa") {
      throw new AppError(
          409, "La Participación indicada no está activa.",
      );
    }

    // Alcance del actor: corre antes de las demás validaciones de negocio.
    if (
      ROLES_ALCANCE_FORZADO.includes(actor.rol) &&
      participacion.mandanteId !== actor.mandanteId
    ) {
      throw new AppError(
          403,
          "No tiene permisos para crear expedientes de otro Mandante.",
      );
    }

    // Una Participación activa solo puede tener un Expediente en curso a
    // la vez (cualquier estado que no sea "cerrado" cuenta como "en curso").
    const existentes = await expedienteRepository.getByParticipacion(
        participacionId,
    );
    if (existentes.some((e) => e.estado !== "cerrado")) {
      throw new AppError(
          409,
          "Ya existe un Expediente en curso para esta Participación.",
      );
    }

    // Todos estos campos se DERIVAN de la Participación — nunca del
    // payload del cliente, aunque lo incluya.
    const {proyectoId, empresaId, mandanteId, perfilParticipacionId} =
        participacion;
    const creador = await usuarioRepository.getById(actor.uid);
    const creadoPorNombre = creador ?
        `${creador.nombre} ${creador.apellido}`.trim() :
        actor.email;

    const expedienteRef = db.collection(expedienteRepository.COLLECTION).doc();
    await expedienteRef.set(this.datosCabecera({
      participacionId, proyectoId, empresaId, mandanteId,
      perfilParticipacionId, creadoPorId: actor.uid || null, creadoPorNombre,
    }));

    let cambios = null;
    try {
      cambios = await this.generarInstancias(expedienteRef.id, actor,
          opciones);
    } catch (err) {
      // El Expediente queda "en_proceso": la interfaz ofrece reintentar.
      console.error(
          `Generación incompleta del Expediente ${expedienteRef.id}:`,
          err.message,
      );
    }

    const expedienteCreado = await expedienteRepository.getById(
        expedienteRef.id,
    );
    await bitacoraLogger.registrarEvento({
      mandanteId,
      entidad: "expediente",
      entidadId: expedienteRef.id,
      accion: "creado",
      actor,
      detalle: {
        participacionId,
        proyectoId,
        empresaId,
        estadoGeneracion: expedienteCreado.estadoGeneracion,
        requerimientosTotal: expedienteCreado.resumen?.activas || 0,
        requerimientosReutilizados: cambios?.reutilizadas || 0,
      },
    });
    return expedienteCreado;
  }

  /**
   * Datos de la cabecera de un Expediente nuevo (sin instancias aún).
   * @param {Object} campos participacionId, proyectoId, empresaId,
   *     mandanteId, perfilParticipacionId, creadoPorId, creadoPorNombre.
   * @return {Object} Documento del Expediente.
   */
  datosCabecera(campos) {
    return {
      ...campos,
      estado: "creado",
      estadoGeneracion: "en_proceso",
      requerimientosManuales: [],
      resumen: resumenVacio(),
      resumenSujetos: {},
      fechaCierre: null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };
  }

  /**
   * Genera (o completa) las instancias de un Expediente, recalcula sus
   * contadores desde cero, lo marca "completa" y deriva su estado.
   * Idempotente: reintentar no duplica.
   * @param {string} id ID del Expediente.
   * @param {Object} actor Usuario.
   * @param {Object} [opciones] Ver crearExpediente.
   * @return {Promise<Object>} Cambios aplicados por la sincronización.
   */
  async generarInstancias(id, actor, opciones = {}) {
    const cambios = await expedienteRequerimientoService.sincronizar(
        id, actor, {...opciones, motivo: "generacion"},
    );
    await expedienteRequerimientoService.recalcularResumen(id);
    await expedienteRepository.update(id, {estadoGeneracion: "completa"});
    await this.recalcularEstado(id, actor);
    return cambios;
  }

  /**
   * Reintenta la generación de un Expediente (la interfaz lo ofrece
   * mientras esté "en_proceso").
   * @param {string} id ID del Expediente.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object>} El Expediente actualizado.
   */
  async reintentarGeneracion(id, actor) {
    const expediente = await this.getExpedienteById(id, actor);
    if (expediente.estado === "cerrado") {
      throw new AppError(409, "El Expediente está cerrado.");
    }
    await this.generarInstancias(id, actor);
    return expedienteRepository.getById(id);
  }

  /**
   * Repara los contadores de un Expediente recalculándolos desde sus
   * instancias activas.
   * @param {string} id ID del Expediente.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object>} El Expediente actualizado.
   */
  async repararResumen(id, actor) {
    await this.getExpedienteById(id, actor);
    await expedienteRequerimientoService.recalcularResumen(id);
    await this.recalcularEstado(id, actor);
    return expedienteRepository.getById(id);
  }

  /**
   * Instancias de Requerimiento de un Expediente (opcionalmente de un
   * sujeto), respetando el alcance del actor.
   * @param {string} id ID del Expediente.
   * @param {Object} filtros personaId / recursoId / empresa / estado.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object[]>} Instancias.
   */
  async listarRequerimientos(id, filtros, actor) {
    await this.getExpedienteById(id, actor);
    return expedienteRequerimientoService.listarDeExpediente(id, filtros);
  }

  /**
   * Deriva el estado de un Expediente desde sus contadores (función pura).
   * Sobre las instancias ACTIVAS: "evaluadas" son las que tienen resultado
   * cumple / no_cumple / no_aplica ("pendiente" — evaluada así o sin
   * evaluar — no cuenta).
   *   - ninguna evaluada                     -> "creado"
   *   - algunas sin evaluar                  -> "en_revision"
   *   - todas evaluadas, algún "No Cumple"   -> "con_observaciones"
   *   - todas evaluadas, sin "No Cumple"     -> "aprobado"
   * @param {?Object} resumen Contadores del Expediente.
   * @return {{estado: string, total: number, evaluados: number,
   *     noCumple: number}} Estado derivado y conteos usados.
   */
  calcularEstadoDerivado(resumen) {
    const r = resumen || resumenVacio();
    const total = r.activas || 0;
    const noCumple = r.noCumple || 0;
    const evaluados = (r.cumple || 0) + noCumple + (r.noAplica || 0);
    let estado;
    if (evaluados === 0) estado = "creado";
    else if (evaluados < total) estado = "en_revision";
    else if (noCumple > 0) estado = "con_observaciones";
    else estado = "aprobado";
    return {estado, total, evaluados, noCumple};
  }

  /**
   * Recalcula y persiste el estado derivado de un Expediente (ver
   * calcularEstadoDerivado). No toca los estados manuales
   * ("en_ejecucion"/"cerrado") ni un Expediente en generación. Nunca debe
   * hacer fallar la operación que lo dispara: los errores se registran.
   * @param {string} id ID del expediente.
   * @param {Object} actor Usuario que originó el cambio (para la bitácora).
   * @return {Promise<?Object>} El expediente (actualizado si cambió).
   */
  async recalcularEstado(id, actor) {
    try {
      const actorNombre = await this._nombreActor(actor);
      const ref = db.collection(expedienteRepository.COLLECTION).doc(id);
      let cambio = null;
      await db.runTransaction(async (tx) => {
        cambio = null;
        const snap = await tx.get(ref);
        if (!snap.exists) return;
        const expediente = {id: snap.id, ...snap.data()};
        if (ESTADOS_MANUALES.includes(expediente.estado) ||
            expediente.estadoGeneracion === "en_proceso") {
          return;
        }
        const {estado} = this.calcularEstadoDerivado(expediente.resumen);
        if (estado === expediente.estado) return;
        this._aplicarCambioEstado(tx, expediente, {
          estadoNuevo: estado, origen: "automatico", actor, actorNombre,
        });
        cambio = {expediente, estadoNuevo: estado};
      });
      if (cambio) {
        await this._registrarCambioEnBitacora(cambio.expediente,
            cambio.estadoNuevo, {origen: "automatico"}, actor);
      }
      return await expedienteRepository.getById(id);
    } catch (err) {
      console.error(`Error al recalcular el estado del Expediente ${id}:`, err);
      return null;
    }
  }

  /**
   * Nombre del actor, para el historial de estados.
   * @param {?Object} actor Usuario.
   * @return {Promise<?string>} Nombre, o el email si no hay perfil.
   */
  async _nombreActor(actor) {
    if (!actor?.uid) return actor?.email || null;
    const usuario = await usuarioRepository.getById(actor.uid);
    return usuario ? `${usuario.nombre} ${usuario.apellido}`.trim() :
      actor.email || null;
  }

  /**
   * Aplica un cambio de estado dentro de una transacción: actualiza el
   * Expediente (con los campos extra) y escribe su documento de historial.
   * @param {FirebaseFirestore.Transaction} tx Transacción.
   * @param {Object} expediente Expediente leído en la transacción (con id).
   * @param {{estadoNuevo: string, origen: string, motivo: (string|undefined),
   *     detalle: (string|undefined), actor: (Object|undefined),
   *     actorNombre: (string|undefined), extra: (Object|undefined)}} cambio
   *     Cambio a aplicar.
   * @return {void}
   */
  _aplicarCambioEstado(tx, expediente, cambio) {
    const ref = db.collection(expedienteRepository.COLLECTION)
        .doc(expediente.id);
    tx.update(ref, {
      ...(cambio.extra || {}),
      estado: cambio.estadoNuevo,
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.set(expedienteEstadoRepository.nuevaRef(),
        expedienteEstadoRepository.datos({
          expediente,
          estadoNuevo: cambio.estadoNuevo,
          origen: cambio.origen,
          motivo: cambio.motivo,
          detalle: cambio.detalle,
          actorUid: cambio.actor?.uid,
          actorNombre: cambio.actorNombre,
        }));
  }

  /**
   * Registra un cambio de estado en Bitácora (con mandanteId).
   * @param {Object} expediente Expediente antes del cambio.
   * @param {string} estadoNuevo Estado nuevo.
   * @param {Object} datos origen, motivo, detalle y extras para el detalle.
   * @param {Object} actor Usuario.
   * @return {Promise<void>}
   */
  async _registrarCambioEnBitacora(expediente, estadoNuevo, datos, actor) {
    await bitacoraLogger.registrarEvento({
      mandanteId: expediente.mandanteId,
      entidad: "expediente",
      entidadId: expediente.id,
      accion: "transicion_estado",
      actor,
      detalle: {
        estadoAnterior: expediente.estado,
        estadoNuevo,
        automatico: datos.origen === "automatico",
        ...datos,
      },
    });
  }

  /**
   * Sincroniza las instancias y recalcula el estado de un Expediente
   * abierto (mejor esfuerzo: nunca hace fallar la operación que lo dispara).
   * @param {Object} expediente Expediente.
   * @param {Object} actor Usuario que originó el cambio.
   * @param {string} motivo Motivo para la bitácora.
   * @return {Promise<?Object>} Cambios aplicados, o null si falló.
   */
  async _sincronizarYRecalcular(expediente, actor, motivo) {
    try {
      if (expediente.estado === "cerrado" ||
          expediente.estadoGeneracion === "en_proceso") {
        return null;
      }
      const cambios = await expedienteRequerimientoService.sincronizar(
          expediente.id, actor, {motivo},
      );
      await this.recalcularEstado(expediente.id, actor);
      return cambios;
    } catch (err) {
      console.error(
          `Error al sincronizar el Expediente ${expediente.id}:`, err,
      );
      return null;
    }
  }

  /**
   * Sincroniza los Expedientes abiertos de una Empresa en un Proyecto: las
   * Personas/Maquinarias asignadas y sus Perfiles de Recurso determinan qué
   * instancias aplican (asignar, agregar o quitar un perfil, finalizar).
   * @param {string} proyectoId ID del Proyecto.
   * @param {string} empresaId ID de la Empresa.
   * @param {Object} actor Usuario que originó el cambio.
   * @return {Promise<?Object>} Cambios del Expediente abierto (o null).
   */
  async recalcularPorProyectoEmpresa(proyectoId, empresaId, actor) {
    try {
      const expedientes = await expedienteRepository.getByEmpresa(empresaId);
      let resultado = null;
      for (const e of expedientes) {
        if (e.proyectoId !== proyectoId || e.estado === "cerrado") continue;
        // eslint-disable-next-line no-await-in-loop
        resultado = await this._sincronizarYRecalcular(e, actor,
            "asignaciones");
      }
      return resultado;
    } catch (err) {
      console.error("Error al sincronizar Expedientes por asignación:", err);
      return null;
    }
  }

  /**
   * Lee un Expediente dentro de una transacción.
   * @param {FirebaseFirestore.Transaction} tx Transacción.
   * @param {string} id ID del Expediente.
   * @return {Promise<Object>} Expediente con id.
   */
  async _leerEnTransaccion(tx, id) {
    const snap = await tx.get(
        db.collection(expedienteRepository.COLLECTION).doc(id),
    );
    if (!snap.exists) throw new AppError(404, "Expediente no encontrado.");
    return {id: snap.id, ...snap.data()};
  }

  /**
   * "Iniciar ejecución": aprobado → en_ejecucion. El Proyecto no puede estar
   * finalizado, archivado ni suspendido. Fija fechaInicioEjecucion.
   * @param {string} id ID del Expediente.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object>} El Expediente actualizado.
   */
  async iniciarEjecucion(id, actor) {
    // Se re-deriva antes: la decisión nunca se toma sobre un estado viejo.
    await this.recalcularEstado(id, actor);
    await this.getExpedienteById(id, actor);
    const actorNombre = await this._nombreActor(actor);
    let anterior;
    await db.runTransaction(async (tx) => {
      const expediente = await this._leerEnTransaccion(tx, id);
      const proyectoSnap = await tx.get(
          db.collection(proyectoRepository.COLLECTION)
              .doc(expediente.proyectoId),
      );
      if (expediente.estado !== "aprobado") {
        throw new AppError(
            409,
            "Solo un Expediente Aprobado puede pasar a En Ejecución " +
            `(estado actual: '${expediente.estado}').`,
        );
      }
      const estadoProyecto = proyectoSnap.data()?.estado;
      if (ESTADOS_PROYECTO_SIN_EJECUCION.includes(estadoProyecto)) {
        throw new AppError(
            409,
            `El Proyecto está '${estadoProyecto}': no se puede iniciar la ` +
            "ejecución.",
        );
      }
      this._aplicarCambioEstado(tx, expediente, {
        estadoNuevo: "en_ejecucion", origen: "manual", actor, actorNombre,
        extra: {fechaInicioEjecucion: FieldValue.serverTimestamp()},
      });
      anterior = expediente;
    });
    await this._registrarCambioEnBitacora(anterior, "en_ejecucion",
        {origen: "manual"}, actor);
    return expedienteRepository.getById(id);
  }

  /**
   * Valida el motivo de cierre.
   * @param {string} motivo Motivo.
   * @param {?string} detalle Detalle (obligatorio si el motivo es "otro").
   * @return {{motivo: string, detalle: ?string}} Valores normalizados.
   */
  _validarMotivoCierre(motivo, detalle) {
    if (!MOTIVOS_CIERRE.includes(motivo)) {
      throw new AppError(
          400,
          `Motivo de cierre no válido. Valores permitidos: ` +
          `${MOTIVOS_CIERRE.join(", ")}.`,
      );
    }
    const texto = typeof detalle === "string" ? detalle.trim() : "";
    if (motivo === "otro" && !texto) {
      throw new AppError(400, "Indique el detalle del cierre (motivo 'otro').");
    }
    return {motivo, detalle: texto || null};
  }

  /**
   * "Cerrar expediente" (manual): desde cualquier estado salvo cerrado.
   * @param {string} id ID del Expediente.
   * @param {{motivo: string, detalle: (string|undefined)}} payload Motivo.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object>} El Expediente cerrado y lo finalizado.
   */
  async cerrar(id, payload, actor) {
    const {motivo, detalle} =
        this._validarMotivoCierre(payload?.motivo, payload?.detalle);
    await this.getExpedienteById(id, actor);
    const resultado = await this._cerrar(
        id, {motivo, detalle, origen: "manual"}, actor,
    );
    return {
      ...(await expedienteRepository.getById(id)),
      cierre: resultado,
    };
  }

  /**
   * Consulta de los documentos activos de un sujeto de la Participación.
   * @param {Object} repo participacionPersona/RecursoRepository.
   * @param {string} participacionId ID de la Participación.
   * @return {FirebaseFirestore.Query} Consulta.
   */
  _queryActivosParticipacion(repo, participacionId) {
    return repo.coleccion()
        .where("participacionId", "==", participacionId)
        .where("estado", "==", "activa");
  }

  /**
   * Cierra un Expediente: en UNA transacción fija estado, fechaCierre y
   * motivo, escribe el historial, finaliza la Participación si sigue
   * vigente y finaliza sus Personas/Maquinarias activas (fechaTermino hoy).
   * No borra nada. Idempotente con `ignorarSiCerrado`.
   * @param {string} id ID del Expediente.
   * @param {{motivo: string, detalle: ?string, origen: string}} cierre
   *     Motivo y origen.
   * @param {Object} actor Usuario que originó el cierre.
   * @param {{ignorarSiCerrado: (boolean|undefined)}} [opciones] Opciones.
   * @return {Promise<?Object>} {participacionFinalizada, personas,
   *     maquinarias}, o null si ya estaba cerrado (con ignorarSiCerrado).
   */
  async _cerrar(id, cierre, actor, opciones = {}) {
    const previo = await expedienteRepository.getById(id);
    if (!previo) throw new AppError(404, "Expediente no encontrado.");
    if (previo.estado === "cerrado") {
      if (opciones.ignorarSiCerrado) return null;
      throw new AppError(409, "El Expediente ya está cerrado.");
    }
    const finalizadosPrevios = await this._finalizarSujetosSiSonMuchos(
        previo.participacionId,
    );
    const actorNombre = await this._nombreActor(actor);

    let lectura = null;
    await db.runTransaction(async (tx) => {
      lectura = null;
      const expediente = await this._leerEnTransaccion(tx, id);
      const participacionRef = db.collection(participacionRepository.COLLECTION)
          .doc(expediente.participacionId);
      const [participacionSnap, personasSnap, recursosSnap] =
          await Promise.all([
            tx.get(participacionRef),
            tx.get(this._queryActivosParticipacion(
                participacionPersonaRepository, expediente.participacionId)),
            tx.get(this._queryActivosParticipacion(
                participacionRecursoRepository, expediente.participacionId)),
          ]);
      if (expediente.estado === "cerrado") {
        if (opciones.ignorarSiCerrado) return;
        throw new AppError(409, "El Expediente ya está cerrado.");
      }

      this._aplicarCambioEstado(tx, expediente, {
        estadoNuevo: "cerrado", origen: cierre.origen,
        motivo: cierre.motivo, detalle: cierre.detalle, actor, actorNombre,
        extra: {
          fechaCierre: FieldValue.serverTimestamp(),
          motivoCierre: cierre.motivo,
          detalleCierre: cierre.detalle || null,
        },
      });
      const participacion = participacionSnap.exists ?
        {id: participacionSnap.id, ...participacionSnap.data()} : null;
      const finalizarParticipacion = participacion &&
          participacion.estado !== "finalizada";
      if (finalizarParticipacion) {
        tx.update(participacionRef, {
          estado: "finalizada",
          fechaTermino: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
      const finalizar = (snap) => snap.docs.map((d) => {
        tx.update(d.ref, {
          estado: "finalizada",
          fechaTermino: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        return {id: d.id, ...d.data()};
      });
      lectura = {
        expediente,
        participacion: finalizarParticipacion ? participacion : null,
        personas: finalizar(personasSnap),
        recursos: finalizar(recursosSnap),
      };
    });
    if (!lectura) return null;

    await this._registrarCambioEnBitacora(lectura.expediente, "cerrado", {
      origen: cierre.origen, motivo: cierre.motivo,
      detalle: cierre.detalle || null,
    }, actor);
    if (lectura.participacion) {
      await bitacoraLogger.registrarEvento({
        mandanteId: lectura.participacion.mandanteId,
        entidad: "participacion",
        entidadId: lectura.participacion.id,
        accion: "transicion_estado",
        actor,
        detalle: {
          proyectoId: lectura.participacion.proyectoId,
          empresaId: lectura.participacion.empresaId,
          estadoAnterior: lectura.participacion.estado,
          estadoNuevo: "finalizada",
          motivo: "cierre_expediente",
          expedienteId: id,
        },
      });
    }
    const personas = [...finalizadosPrevios.personas, ...lectura.personas];
    const recursos = [...finalizadosPrevios.recursos, ...lectura.recursos];
    await require("./participacionPersonaService")
        .registrarFinalizados(lectura.personas, actor);
    await require("./participacionRecursoService")
        .registrarFinalizados(lectura.recursos, actor);
    return {
      participacionFinalizada: Boolean(lectura.participacion),
      personas: new Set(personas.map((p) => p.personaId)).size,
      maquinarias: new Set(recursos.map((r) => r.recursoId)).size,
    };
  }

  /**
   * Si la Participación tiene más Personas/Maquinarias activas de las que
   * caben en la transacción del cierre, las finaliza antes en lotes de 400
   * (idempotente: solo toca las que siguen activas).
   * @param {string} participacionId ID de la Participación.
   * @return {Promise<{personas: Object[], recursos: Object[]}>} Finalizados.
   */
  async _finalizarSujetosSiSonMuchos(participacionId) {
    const [personasSnap, recursosSnap] = await Promise.all([
      this._queryActivosParticipacion(
          participacionPersonaRepository, participacionId).get(),
      this._queryActivosParticipacion(
          participacionRecursoRepository, participacionId).get(),
    ]);
    const docs = [...personasSnap.docs, ...recursosSnap.docs];
    if (docs.length <= MAX_SUJETOS_EN_TRANSACCION) {
      return {personas: [], recursos: []};
    }
    for (let i = 0; i < docs.length; i += MAX_OPERACIONES_LOTE) {
      const batch = db.batch();
      docs.slice(i, i + MAX_OPERACIONES_LOTE).forEach((d) => batch.update(
          d.ref, {
            estado: "finalizada",
            fechaTermino: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          },
      ));
      // eslint-disable-next-line no-await-in-loop
      await batch.commit();
    }
    return {
      personas: personasSnap.docs.map((d) => ({id: d.id, ...d.data()})),
      recursos: recursosSnap.docs.map((d) => ({id: d.id, ...d.data()})),
    };
  }

  /**
   * Cierre automático (RN-014): al finalizar o archivar un Proyecto se
   * cierran todos sus Expedientes no cerrados con motivo "fin_proyecto".
   * Un Expediente por transacción (cada una bajo 400 operaciones); los ya
   * cerrados se saltan, así que reintentar no duplica nada.
   * @param {string} proyectoId ID del Proyecto.
   * @param {Object} actor Usuario que cambió el estado del Proyecto.
   * @return {Promise<{cerrados: number, fallidos: Object[]}>} Resultado.
   */
  async cerrarPorProyecto(proyectoId, actor) {
    const expedientes = await expedienteRepository.getByProyecto(proyectoId);
    const resultado = {cerrados: 0, fallidos: []};
    for (const e of expedientes) {
      if (e.estado === "cerrado") continue;
      try {
        // eslint-disable-next-line no-await-in-loop
        const cierre = await this._cerrar(e.id, {
          motivo: "fin_proyecto", detalle: null, origen: "automatico",
        }, actor, {ignorarSiCerrado: true});
        if (cierre) resultado.cerrados++;
      } catch (err) {
        console.error(`Error al cerrar el Expediente ${e.id}:`, err);
        resultado.fallidos.push({id: e.id, error: err.message});
      }
    }
    return resultado;
  }

  /**
   * Cantidad de Expedientes no cerrados de un Proyecto (aviso previo a
   * finalizarlo o archivarlo).
   * @param {string} proyectoId ID del Proyecto.
   * @return {Promise<number>} Expedientes abiertos.
   */
  async contarAbiertosDeProyecto(proyectoId) {
    const expedientes = await expedienteRepository.getByProyecto(proyectoId);
    return expedientes.filter((e) => e.estado !== "cerrado").length;
  }

  /**
   * Valida el detalle obligatorio de una corrección.
   * @param {*} detalle Texto recibido.
   * @return {string} Detalle normalizado.
   */
  _exigirDetalle(detalle) {
    const texto = typeof detalle === "string" ? detalle.trim() : "";
    if (!texto) {
      throw new AppError(400, "Indique el motivo de la corrección.");
    }
    return texto;
  }

  /**
   * Corrección (superadmin): en_ejecucion → aprobado. Borra
   * fechaInicioEjecucion y retoma el recálculo automático.
   * @param {string} id ID del Expediente.
   * @param {{detalle: string}} payload Motivo de la corrección.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object>} El Expediente actualizado.
   */
  async volverAAprobado(id, payload, actor) {
    const detalle = this._exigirDetalle(payload?.detalle);
    await this.getExpedienteById(id, actor);
    const actorNombre = await this._nombreActor(actor);
    let anterior;
    await db.runTransaction(async (tx) => {
      const expediente = await this._leerEnTransaccion(tx, id);
      if (expediente.estado !== "en_ejecucion") {
        throw new AppError(
            409, "Solo un Expediente En Ejecución puede volver a Aprobado.",
        );
      }
      this._aplicarCambioEstado(tx, expediente, {
        estadoNuevo: "aprobado", origen: "manual", motivo: "correccion",
        detalle, actor, actorNombre,
        extra: {fechaInicioEjecucion: null},
      });
      anterior = expediente;
    });
    await this._registrarCambioEnBitacora(anterior, "aprobado",
        {origen: "manual", motivo: "correccion", detalle}, actor);
    // Vuelve a la fase de evaluación: el estado se recalcula con la regla
    // automática (puede quedar en otro estado si cambiaron las evaluaciones).
    return await this.recalcularEstado(id, actor) ||
        expedienteRepository.getById(id);
  }

  /**
   * Corrección (superadmin): reabre un Expediente cerrado al estado que
   * tenía antes del cierre (según expedienteEstados; si no hay historial,
   * el que dan sus evaluaciones). NO reactiva la Participación ni las
   * Personas/Maquinarias finalizadas.
   * @param {string} id ID del Expediente.
   * @param {{detalle: string}} payload Motivo de la corrección.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object>} El Expediente reabierto.
   */
  async reabrir(id, payload, actor) {
    const detalle = this._exigirDetalle(payload?.detalle);
    await this.getExpedienteById(id, actor);
    const actorNombre = await this._nombreActor(actor);
    let anterior;
    let estadoNuevo;
    await db.runTransaction(async (tx) => {
      const expediente = await this._leerEnTransaccion(tx, id);
      const ultimoCierre = await tx.get(
          expedienteEstadoRepository.queryUltimoCierre(id),
      );
      if (expediente.estado !== "cerrado") {
        throw new AppError(409, "El Expediente no está cerrado.");
      }
      const previo = ultimoCierre.docs[0]?.data().estadoAnterior;
      estadoNuevo = previo && previo !== "cerrado" ? previo :
        this.calcularEstadoDerivado(expediente.resumen).estado;
      this._aplicarCambioEstado(tx, expediente, {
        estadoNuevo, origen: "manual", motivo: "reapertura", detalle, actor,
        actorNombre,
        extra: {fechaCierre: null, motivoCierre: null, detalleCierre: null},
      });
      anterior = expediente;
    });
    await this._registrarCambioEnBitacora(anterior, estadoNuevo,
        {origen: "manual", motivo: "reapertura", detalle}, actor);
    return await this.recalcularEstado(id, actor) ||
        expedienteRepository.getById(id);
  }

  /**
   * Historial de estados de un Expediente, del más antiguo al más reciente.
   * @param {string} id ID del Expediente.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object[]>} Cambios de estado.
   */
  async historialEstados(id, actor) {
    await this.getExpedienteById(id, actor);
    return expedienteEstadoRepository.listByExpediente(id);
  }

  /**
   * Exige un Expediente abierto y con la generación completa.  /**
   * Exige un Expediente abierto y con la generación completa.
   * @param {Object} expediente Expediente.
   * @return {void}
   */
  _exigirEditable(expediente) {
    if (expediente.estado === "cerrado") {
      throw new AppError(409, "El Expediente está cerrado.");
    }
    if (expediente.estadoGeneracion === "en_proceso") {
      throw new AppError(
          409,
          "El Expediente aún está generando sus Requerimientos: reintente la " +
          "generación antes de continuar.",
      );
    }
  }

  /**
   * Agrega un Requerimiento manual al Expediente: guarda la REGLA en
   * `requerimientosManuales` ({requerimientoId, tipoEntidad}) y sincroniza,
   * lo que crea las instancias para todos los sujetos del tipo (también
   * para los que se asignen después), con reutilización documental. Sus
   * instancias (origen "agregado_manual") nunca se retiran por cambios de
   * configuración; sí cuando el sujeto deja la Participación.
   * @param {string} id ID del expediente.
   * @param {string} requerimientoId ID del Requerimiento del catálogo.
   * @param {Object} actor Usuario autenticado que ejecuta la acción.
   * @return {Promise<Object>} El expediente actualizado.
   */
  async agregarRequerimiento(id, requerimientoId, actor) {
    if (!requerimientoId) {
      throw new AppError(400, "requerimientoId es obligatorio.");
    }
    const expediente = await this.getExpedienteById(id, actor);
    this._exigirEditable(expediente);

    const requerimiento = await requerimientoRepository.getById(
        requerimientoId,
    );
    // Un Requerimiento de otro Mandante se trata como inexistente.
    if (!requerimiento ||
        requerimiento.mandanteId !== expediente.mandanteId) {
      throw new AppError(404, "Requerimiento no encontrado.");
    }
    if (requerimiento.estado !== "activo") {
      throw new AppError(400, "El Requerimiento indicado no está activo.");
    }
    const manuales = expediente.requerimientosManuales || [];
    if (manuales.some((m) => m.requerimientoId === requerimientoId)) {
      throw new AppError(
          409, "Este Requerimiento ya fue agregado a este Expediente.",
      );
    }
    const configurados =
        await requerimientoCalculoService.calcularRequerimientosAplicables(
            expediente.perfilParticipacionId,
        );
    if (configurados.some((r) => r.requerimientoId === requerimientoId)) {
      throw new AppError(
          409,
          "Este Requerimiento ya aplica a este Expediente por la " +
          "configuración del Perfil.",
      );
    }

    await expedienteRepository.update(id, {
      requerimientosManuales: [
        ...manuales,
        {requerimientoId, tipoEntidad: requerimiento.tipoEntidad},
      ],
    });
    const cambios = await expedienteRequerimientoService.sincronizar(
        id, actor, {motivo: "requerimiento_agregado"},
    );
    await bitacoraLogger.registrarEvento({
      mandanteId: expediente.mandanteId,
      entidad: "expediente",
      entidadId: id,
      accion: "requerimiento_agregado",
      actor,
      detalle: {
        requerimientoId, nombre: requerimiento.nombre,
        tipoEntidad: requerimiento.tipoEntidad, ...cambios,
      },
    });
    return await this.recalcularEstado(id, actor) ||
        await expedienteRepository.getById(id);
  }

  /**
   * Quita un Requerimiento agregado manualmente: elimina la regla de
   * `requerimientosManuales` y sincroniza, lo que retira sus instancias
   * (nunca se borran, ni sus evaluaciones ni evidencias). Los
   * Requerimientos de la configuración del Perfil se gestionan desde sus
   * vínculos, no acá.
   * @param {string} id ID del expediente.
   * @param {string} requerimientoId ID del Requerimiento a quitar.
   * @param {Object} actor Usuario autenticado que ejecuta la acción.
   * @return {Promise<Object>} El expediente actualizado.
   */
  async quitarRequerimiento(id, requerimientoId, actor) {
    if (!requerimientoId) {
      throw new AppError(400, "requerimientoId es obligatorio.");
    }
    const expediente = await this.getExpedienteById(id, actor);
    this._exigirEditable(expediente);
    const manuales = expediente.requerimientosManuales || [];
    if (!manuales.some((m) => m.requerimientoId === requerimientoId)) {
      throw new AppError(
          404,
          "Este Requerimiento no fue agregado manualmente a este Expediente.",
      );
    }

    await expedienteRepository.update(id, {
      requerimientosManuales: manuales.filter(
          (m) => m.requerimientoId !== requerimientoId,
      ),
    });
    const cambios = await expedienteRequerimientoService.sincronizar(
        id, actor, {motivo: "requerimiento_quitado"},
    );
    await bitacoraLogger.registrarEvento({
      mandanteId: expediente.mandanteId,
      entidad: "expediente",
      entidadId: id,
      accion: "requerimiento_quitado",
      actor,
      detalle: {requerimientoId, ...cambios},
    });
    return await this.recalcularEstado(id, actor) ||
        await expedienteRepository.getById(id);
  }

  /**
   * Sincroniza los Expedientes ABIERTOS de un Perfil de Participación
   * después de crear, modificar o desactivar vínculos de
   * perfilRequerimientos: crea las instancias que faltan (con
   * reutilización), retira las que dejan de aplicar y reactiva las que
   * vuelven a aplicar. Los cerrados no se tocan. Mejor esfuerzo por
   * Expediente: si uno falla no bloquea a los demás.
   * @param {string} perfilParticipacionId ID del Perfil de Participación.
   * @param {string[]} requerimientoIds Requerimientos afectados (solo para
   *     la bitácora; la sincronización es completa e idempotente).
   * @param {Object} actor Usuario autenticado que ejecuta la acción.
   * @return {Promise<void>}
   */
  async sincronizarRequerimientosDePerfil(
      perfilParticipacionId, requerimientoIds, actor,
  ) {
    const expedientes =
        await expedienteRepository.getByPerfil(perfilParticipacionId);
    for (const expediente of expedientes) {
      if (expediente.estado === "cerrado") continue;
      // eslint-disable-next-line no-await-in-loop
      await this._sincronizarYRecalcular(expediente, actor, "configuracion");
    }
  }
}

module.exports = new ExpedienteService();
