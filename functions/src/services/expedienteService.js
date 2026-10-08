const admin = require("firebase-admin");
const {FieldValue} = require("firebase-admin/firestore");
const expedienteRepository = require("../repositories/expedienteRepository");
const participacionRepository =
    require("../repositories/participacionRepository");
const requerimientoCalculoService =
    require("./requerimientoCalculoService");
const reutilizacionDocumentalService =
    require("./reutilizacionDocumentalService");
const usuarioRepository = require("../repositories/usuarioRepository");
const participacionPersonaRepository =
    require("../repositories/participacionPersonaRepository");
const participacionRecursoRepository =
    require("../repositories/participacionRecursoRepository");
const evaluacionRepository = require("../repositories/evaluacionRepository");
const requerimientoRepository =
    require("../repositories/requerimientoRepository");
const perfilRequerimientoRepository =
    require("../repositories/perfilRequerimientoRepository");
const {aplicaRequerimientoASujeto} =
    require("../utils/aplicabilidadRequerimiento");
const {sujetosActivosDeParticipacion} =
    require("../utils/sujetosParticipacion");
const bitacoraLogger = require("../utils/bitacoraLogger");
const bitacoraService = require("./bitacoraService");
const AppError = require("../utils/AppError");

const db = admin.firestore();

// Resultados que cuentan como "ya evaluado" al derivar el estado del
// Expediente. "pendiente" es un resultado explícito y válido en
// Evaluación (ver evaluacionService.RESULTADOS_VALIDOS) pero, por
// definición, significa que todavía no se resolvió — no cuenta acá.
const RESULTADOS_QUE_CIERRAN_EVALUACION = ["cumple", "no_cumple", "no_aplica"];

// DESVIACIÓN DOCUMENTADA (decisions.md, "Estado de Expediente derivado"):
// creado / en_revision / con_observaciones / aprobado se CALCULAN a partir
// del estado real de las Evaluaciones (ver calcularEstadoDerivado) — ya no
// se transicionan a mano ni existen "Preparación Documental", "En
// Corrección" ni "Reevaluación" como pasos formales. Solo estas dos
// transiciones siguen siendo decisiones operacionales manuales (no
// derivables de datos de evaluación): aprobado → en_ejecucion (además de
// la Inducción HSEQ) y en_ejecucion → cerrado (fin de proyecto/participación).
// "cerrado" es terminal.
const TRANSICIONES_VALIDAS = {
  aprobado: ["en_ejecucion"],
  en_ejecucion: ["cerrado"],
  cerrado: [],
};

// Estados que la derivación automática NUNCA pisa: una vez que el Expediente
// entró a ejecución o se cerró, es una decisión manual.
const ESTADOS_MANUALES = ["en_ejecucion", "cerrado"];

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
   * Crea un nuevo expediente a partir de una Participación activa,
   * derivando todos sus campos de referencia y generando el snapshot de
   * Requerimientos aplicables (RN-032).
   * @param {Object} payload Payload de la petición (solo se usa
   *     `participacionId`).
   * @param {Object} actor Usuario autenticado que ejecuta la acción.
   * @return {Promise<Object>} El expediente creado.
   */
  async crearExpediente(payload, actor) {
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
    const enCurso = existentes.find((e) => e.estado !== "cerrado");
    if (enCurso) {
      throw new AppError(
          409,
          "Ya existe un Expediente en curso para esta Participación.",
      );
    }

    // Todos estos campos se DERIVAN de la Participación — nunca del
    // payload del cliente, aunque lo incluya.
    const {proyectoId, empresaId, mandanteId, perfilParticipacionId} =
        participacion;

    // RN-032: snapshot de los Requerimientos aplicables al momento de
    // crear el Expediente. Fijo para siempre — un cambio posterior en la
    // configuración de Perfil-Requerimiento NO afecta expedientes ya
    // creados (principio de versionamiento). Motor de cálculo compartido
    // con acreditacionService (reemplazo de acreditación), para no
    // duplicar esta lógica.
    const requerimientosAplicables =
        await requerimientoCalculoService.calcularRequerimientosAplicables(
            perfilParticipacionId,
        );

    // Motor de reutilización documental (mismo usado por
    // acreditacionService.reemplazar, vía reutilizacionDocumentalService):
    // si alguna Persona/Recurso ya asignado a esta Participación, o la
    // propia Empresa, tiene Evaluaciones "cumple" vigentes de un
    // Expediente anterior, este Expediente nace con esos Requerimientos
    // ya cubiertos — sin evaluación manual. Si todavía no hay
    // Personas/Maquinarias
    // (paso opcional del wizard), simplemente no hay nada que reutilizar a
    // nivel persona/maquinaria, sin error.
    const requerimientosEmpresaNivel = requerimientosAplicables.filter(
        (r) => aplicaRequerimientoASujeto(r, {tipoEntidad: "empresa"}),
    );

    const sujetos = await sujetosActivosDeParticipacion(participacionId);
    const personasAsignadas = sujetos.filter((s) => s.personaId);
    const recursosAsignados = sujetos.filter((s) => s.recursoId);
    // Requerimientos que aplican a cada sujeto según sus Perfiles de Recurso
    // (unión sin duplicados para una Persona con varios perfiles).
    const aplicablesA = (s) => requerimientosAplicables.filter(
        (r) => aplicaRequerimientoASujeto(r, s),
    );

    const fechaInicioParticipacion = this._aFecha(participacion.fechaInicio);

    const reutilizablesEmpresa =
        await reutilizacionDocumentalService.buscarReutilizablesEmpresa(
            empresaId, requerimientosEmpresaNivel, fechaInicioParticipacion,
        );

    let requerimientosTotal = requerimientosEmpresaNivel.length;

    const reutilizablesPersonas = [];
    for (const a of personasAsignadas) {
      const propios = aplicablesA(a);
      requerimientosTotal += propios.length;
      const encontrados =
          await reutilizacionDocumentalService.buscarReutilizablesPersona(
              a.personaId, propios, this._aFecha(a.fechaInicio),
          );
      reutilizablesPersonas.push(...encontrados);
    }

    const reutilizablesRecursos = [];
    for (const a of recursosAsignados) {
      const propios = aplicablesA(a);
      requerimientosTotal += propios.length;
      const encontrados =
          await reutilizacionDocumentalService.buscarReutilizablesRecurso(
              a.recursoId, propios, this._aFecha(a.fechaInicio),
          );
      reutilizablesRecursos.push(...encontrados);
    }

    const reutilizables = [
      ...reutilizablesEmpresa, ...reutilizablesPersonas,
      ...reutilizablesRecursos,
    ];

    // creadoPorNombre se denormaliza desde el perfil del actor — mismo
    // patrón que evaluadorNombre en evaluacionService.js (req.user nunca
    // trae nombre/apellido, solo uid/email/rol/mandanteId). Campo
    // adicional, no reemplaza createdAt; los Expedientes creados antes
    // de este cambio simplemente no lo tienen (sin backfill).
    const creador = await usuarioRepository.getById(actor.uid);
    const creadoPorNombre = creador ?
        `${creador.nombre} ${creador.apellido}`.trim() :
        actor.email;

    // Expediente + Evaluaciones reutilizadas se crean en una única
    // transacción (mismo patrón que acreditacionService.reemplazar): no
    // debe quedar un Expediente creado sin sus reutilizaciones, ni
    // viceversa.
    const expedienteRef = db.collection(expedienteRepository.COLLECTION).doc();
    const evaluacionRefs = reutilizables.map(
        () => db.collection(evaluacionRepository.COLLECTION).doc(),
    );

    await db.runTransaction(async (transaction) => {
      transaction.set(expedienteRef, {
        participacionId,
        proyectoId,
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

    // Las Evaluaciones reutilizadas pueden dejarlo ya "en_revision"/etc.
    const expedienteCreado =
        await this.recalcularEstado(expedienteRef.id, actor) ||
        await expedienteRepository.getById(expedienteRef.id);

    await bitacoraLogger.registrarEvento({
      mandanteId,
      entidad: "expediente",
      entidadId: expedienteCreado.id,
      accion: "creado",
      actor,
      detalle: {
        participacionId,
        proyectoId,
        empresaId,
        requerimientosTotal,
        requerimientosReutilizados: reutilizables.length,
      },
    });

    return expedienteCreado;
  }

  /**
   * Deriva el estado de un Expediente a partir de sus Evaluaciones reales
   * (función pura, sin acceso a datos). Cuenta cada par Requerimiento ×
   * sujeto aplicable (empresa: 1; persona/recurso: uno por cada sujeto
   * activo en la Participación al que el Requerimiento aplica según
   * aplicaRequerimientoASujeto; una Persona con varios perfiles cuenta una
   * vez por Requerimiento) — mismo criterio de expansión que el frontend,
   * no el largo crudo de `requerimientosAplicables`.
   *   - ninguno evaluado            -> "creado"
   *   - algunos sin evaluar         -> "en_revision"
   *   - todos evaluados, algún "No Cumple" -> "con_observaciones"
   *   - todos evaluados, sin "No Cumple"   -> "aprobado"
   * @param {Object[]} requerimientos Snapshot `requerimientosAplicables`.
   * @param {Object[]} sujetos Sujetos activos de la Participación del
   *     Expediente (ver utils/sujetosParticipacion.js).
   * @param {Object[]} evaluaciones Evaluaciones del Expediente (cualquier
   *     estado; solo se consideran las "vigente").
   * @return {{estado: string, total: number, evaluados: number,
   *     noCumple: number}} Estado derivado y conteos usados.
   */
  calcularEstadoDerivado(requerimientos, sujetos, evaluaciones) {
    const vigentesPorClave = new Map();
    evaluaciones
        .filter((e) => e.estado === "vigente")
        .forEach((e) => {
          const sujeto = e.personaId ? `p:${e.personaId}` :
            e.recursoId ? `r:${e.recursoId}` : "e";
          vigentesPorClave.set(`${e.requerimientoId}|${sujeto}`, e);
        });

    const claves = [];
    requerimientos.forEach((r) => {
      if (aplicaRequerimientoASujeto(r, {tipoEntidad: "empresa"})) {
        claves.push(`${r.requerimientoId}|e`);
        return;
      }
      sujetos
          .filter((s) => aplicaRequerimientoASujeto(r, s))
          .forEach((a) => claves.push(a.personaId ?
            `${r.requerimientoId}|p:${a.personaId}` :
            `${r.requerimientoId}|r:${a.recursoId}`));
    });

    let evaluados = 0;
    let noCumple = 0;
    claves.forEach((clave) => {
      const ev = vigentesPorClave.get(clave);
      if (!ev || !RESULTADOS_QUE_CIERRAN_EVALUACION.includes(ev.resultado)) {
        return;
      }
      evaluados++;
      if (ev.resultado === "no_cumple") noCumple++;
    });

    const total = claves.length;
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
   * ("en_ejecucion"/"cerrado"). Se invoca después de todo cambio que pueda
   * moverlo: crear Evaluación, agregar/quitar Requerimiento, cambiar
   * Personas/Maquinarias asignadas. Nunca debe hacer fallar la operación
   * que lo dispara: los
   * errores se registran y se propaga el Expediente sin cambios.
   * @param {string} id ID del expediente.
   * @param {Object} actor Usuario que originó el cambio (para la bitácora).
   * @return {Promise<?Object>} El expediente (actualizado si cambió).
   */
  async recalcularEstado(id, actor) {
    try {
      const expediente = await expedienteRepository.getById(id);
      if (!expediente || ESTADOS_MANUALES.includes(expediente.estado)) {
        return expediente;
      }
      const [sujetos, evaluaciones] = await Promise.all([
        sujetosActivosDeParticipacion(expediente.participacionId),
        evaluacionRepository.getByExpediente(id),
      ]);
      const {estado} = this.calcularEstadoDerivado(
          expediente.requerimientosAplicables || [], sujetos, evaluaciones,
      );
      if (estado === expediente.estado) return expediente;

      const actualizado = await expedienteRepository.update(id, {estado});
      await bitacoraLogger.registrarEvento({
        mandanteId: expediente.mandanteId,
        entidad: "expediente",
        entidadId: id,
        accion: "transicion_estado",
        actor,
        detalle: {
          estadoAnterior: expediente.estado, estadoNuevo: estado,
          automatico: true,
        },
      });
      return actualizado;
    } catch (err) {
      console.error(`Error al recalcular el estado del Expediente ${id}:`, err);
      return null;
    }
  }

  /**
   * Recalcula el estado de los Expedientes de una Empresa en un Proyecto
   * (las Personas/Maquinarias asignadas cambian cuántos pares
   * Requerimiento × sujeto hay que evaluar).
   * @param {string} proyectoId ID del Proyecto.
   * @param {string} empresaId ID de la Empresa.
   * @param {Object} actor Usuario que originó el cambio.
   * @return {Promise<void>}
   */
  async recalcularPorProyectoEmpresa(proyectoId, empresaId, actor) {
    try {
      const expedientes = await expedienteRepository.getByEmpresa(empresaId);
      await Promise.all(
          expedientes
              .filter((e) => e.proyectoId === proyectoId)
              .map((e) => this.recalcularEstado(e.id, actor)),
      );
    } catch (err) {
      console.error("Error al recalcular Expedientes por asignación:", err);
    }
  }

  /**
   * Transiciona MANUALMENTE el estado de un expediente: solo las dos
   * decisiones operacionales que no se derivan de datos de evaluación
   * (aprobado → en_ejecucion, en_ejecucion → cerrado). Los demás estados
   * los calcula recalcularEstado. "cerrado" es terminal: no admite
   * ninguna transición ni edición de otros campos.
   * @param {string} id ID del expediente.
   * @param {Object} payload Payload de la petición (`estado` requerido,
   *     `fechaCierre` opcional).
   * @param {Object} actor Usuario autenticado que ejecuta la acción.
   * @return {Promise<Object|null>} El expediente actualizado.
   */
  async transicionarEstado(id, payload, actor) {
    // Antes de validar, se re-deriva el estado guardado: así "aprobado →
    // en_ejecucion" nunca se decide sobre un estado desactualizado.
    await this.recalcularEstado(id, actor);
    const existente = await this.getExpedienteById(id, actor);
    const nuevoEstado = payload.estado;

    if (!nuevoEstado) {
      throw new AppError(400, "El campo 'estado' es requerido.");
    }

    if (existente.estado === "cerrado") {
      throw new AppError(
          409,
          "El Expediente está cerrado y no admite más transiciones.",
      );
    }

    const permitidas = TRANSICIONES_VALIDAS[existente.estado] || [];
    if (!permitidas.includes(nuevoEstado)) {
      throw new AppError(
          409,
          `No se puede transicionar de '${existente.estado}' a ` +
          `'${nuevoEstado}'. Transiciones válidas desde ` +
          `'${existente.estado}': ` +
          `${permitidas.length ? permitidas.join(", ") : "ninguna"}.`,
      );
    }

    const updateData = {estado: nuevoEstado};
    if (nuevoEstado === "cerrado") {
      updateData.fechaCierre = payload.fechaCierre ?
          this._parseFecha(payload.fechaCierre, "fechaCierre") :
          new Date();
    }

    const actualizado = await expedienteRepository.update(id, updateData);

    await bitacoraLogger.registrarEvento({
      mandanteId: existente.mandanteId,
      entidad: "expediente",
      entidadId: id,
      accion: "transicion_estado",
      actor,
      detalle: {estadoAnterior: existente.estado, estadoNuevo: nuevoEstado},
    });

    return actualizado;
  }

  /**
   * Agrega un Requerimiento adicional a un Expediente ya creado, fuera
   * del snapshot original que vino del Perfil de Participación (RN-032
   * sigue intacto para ese snapshot: esto es una excepción explícita,
   * marcada `origen: "manual"`, para cuando esta acreditación puntual
   * necesita un Requerimiento extra, o cuando se vincula desde el modal
   * "Configurar Requerimientos" abierto en contexto de este Expediente).
   * Aplica a todos los sujetos de su `tipoEntidad` ("Todos",
   * perfilRecursoIds null), con la misma regla que rige los demás
   * Requerimientos, nunca una regla nueva por individuo. Corre la misma
   * reutilización documental que `crearExpediente`, así que si la
   * Empresa/Persona/
   * Recurso ya tiene una Evaluación "cumple" vigente para este
   * Requerimiento, se reutiliza en vez de quedar pendiente.
   * @param {string} id ID del expediente.
   * @param {string} requerimientoId ID del Requerimiento del catálogo
   *     global a agregar.
   * @param {Object} actor Usuario autenticado que ejecuta la acción.
   * @return {Promise<Object>} El expediente actualizado.
   */
  async agregarRequerimiento(id, requerimientoId, actor) {
    if (!requerimientoId) {
      throw new AppError(400, "requerimientoId es obligatorio.");
    }
    const expediente = await this.getExpedienteById(id, actor);
    if (expediente.estado === "cerrado") {
      throw new AppError(
          400,
          "No se pueden agregar Requerimientos a un Expediente cerrado.",
      );
    }

    const requerimiento = await requerimientoRepository.getById(
        requerimientoId,
    );
    if (!requerimiento) {
      throw new AppError(404, "Requerimiento no encontrado.");
    }
    if (requerimiento.estado !== "activo") {
      throw new AppError(400, "El Requerimiento indicado no está activo.");
    }

    const aplicables = expediente.requerimientosAplicables || [];
    if (aplicables.some((r) => r.requerimientoId === requerimientoId)) {
      throw new AppError(
          409, "Este Requerimiento ya está aplicable en este Expediente.",
      );
    }

    // Agregado manual: aplica a todos los sujetos del tipo ("Todos").
    const nuevaEntrada = {
      ...requerimientoCalculoService.construirEntrada(
          requerimiento, [{perfilRecursoId: null, orden: null}],
      ),
      origen: "manual",
    };

    const participacion = await participacionRepository.getById(
        expediente.participacionId,
    );
    const fechaInicioParticipacion =
        this._aFecha(participacion?.fechaInicio) || new Date();

    // Mismo motor de reutilización que crearExpediente — a quién se le
    // busca reutilización lo determina la regla de aplicabilidad del
    // propio Requerimiento, nunca una selección manual de individuos.
    const reutilizables = await this._buscarReutilizablesDe(
        expediente, [{entrada: nuevaEntrada, aplicaAntes: () => false}],
        fechaInicioParticipacion,
    );

    const expedienteRef = db.collection(expedienteRepository.COLLECTION)
        .doc(id);
    const evaluacionRefs = reutilizables.map(
        () => db.collection(evaluacionRepository.COLLECTION).doc(),
    );

    const creador = await usuarioRepository.getById(actor.uid);
    const creadoPorNombre = creador ?
        `${creador.nombre} ${creador.apellido}`.trim() : actor.email;

    await db.runTransaction(async (transaction) => {
      transaction.update(expedienteRef, {
        requerimientosAplicables: [...aplicables, nuevaEntrada],
        updatedAt: FieldValue.serverTimestamp(),
      });
      reutilizacionDocumentalService.registrarReutilizadas(
          transaction, evaluacionRefs, reutilizables,
          {
            expedienteId: id, mandanteId: expediente.mandanteId, actor,
            creadoPorNombre,
          },
      );
    });

    await bitacoraLogger.registrarEvento({
      mandanteId: expediente.mandanteId,
      entidad: "expediente",
      entidadId: id,
      accion: "requerimiento_agregado",
      actor,
      detalle: {
        requerimientoId, nombre: nuevaEntrada.nombre,
        tipoEntidad: nuevaEntrada.tipoEntidad,
        reutilizado: reutilizables.length > 0,
      },
    });

    // Un Requerimiento nuevo cambia cuántos pares hay que evaluar.
    return await this.recalcularEstado(id, actor) ||
        await expedienteRepository.getById(id);
  }

  /**
   * Quita un Requerimiento (de cualquier origen, del snapshot original
   * o agregado manualmente) del Expediente. Solo actúa sobre el
   * snapshot `requerimientosAplicables` — las Evaluaciones ya
   * registradas para ese Requerimiento en este Expediente NO se
   * eliminan (política del sistema: nunca borrar), simplemente quedan
   * sin referencia desde el snapshot y dejan de contar en el cálculo de
   * cumplimiento.
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
    if (expediente.estado === "cerrado") {
      throw new AppError(
          400,
          "No se pueden quitar Requerimientos de un Expediente cerrado.",
      );
    }

    const aplicables = expediente.requerimientosAplicables || [];
    const entrada = aplicables.find(
        (r) => r.requerimientoId === requerimientoId,
    );
    if (!entrada) {
      throw new AppError(
          404, "Este Requerimiento no está aplicable en este Expediente.",
      );
    }

    const actualizado = await expedienteRepository.update(id, {
      requerimientosAplicables: aplicables.filter(
          (r) => r.requerimientoId !== requerimientoId,
      ),
    });

    await bitacoraLogger.registrarEvento({
      mandanteId: expediente.mandanteId,
      entidad: "expediente",
      entidadId: id,
      accion: "requerimiento_quitado",
      actor,
      detalle: {requerimientoId, nombre: entrada.nombre},
    });

    return await this.recalcularEstado(id, actor) || actualizado;
  }

  /**
   * Busca Evaluaciones reutilizables (mismo motor que crearExpediente) para
   * entradas de snapshot nuevas o cambiadas, SOLO para los sujetos a los
   * que la entrada pasa a aplicar (no aplicaba antes) y que todavía no
   * tienen una Evaluación vigente de ese Requerimiento en este Expediente.
   * @param {Object} expediente Expediente (con id, empresaId, proyectoId).
   * @param {{entrada: Object, aplicaAntes: function(Object): boolean}[]}
   *     items Entradas y si ya aplicaban antes a un sujeto dado.
   * @param {Date} fechaInicioParticipacion Fecha de referencia por defecto.
   * @return {Promise<Object[]>} Evaluaciones originales reutilizables.
   */
  async _buscarReutilizablesDe(expediente, items, fechaInicioParticipacion) {
    if (items.length === 0) return [];
    const [sujetos, evaluaciones] = await Promise.all([
      sujetosActivosDeParticipacion(expediente.participacionId),
      evaluacionRepository.getByExpediente(expediente.id),
    ]);
    const clave = (reqId, personaId, recursoId) =>
      `${reqId}|${personaId || ""}|${recursoId || ""}`;
    const vigentes = new Set(evaluaciones
        .filter((e) => e.estado === "vigente")
        .map((e) => clave(e.requerimientoId, e.personaId, e.recursoId)));

    const resultado = [];
    for (const {entrada, aplicaAntes} of items) {
      const empresa = {tipoEntidad: "empresa"};
      if (aplicaRequerimientoASujeto(entrada, empresa)) {
        if (!aplicaAntes(empresa) &&
            !vigentes.has(clave(entrada.requerimientoId))) {
          const encontrados =
              await reutilizacionDocumentalService.buscarReutilizablesEmpresa(
                  expediente.empresaId, [entrada], fechaInicioParticipacion,
              );
          resultado.push(...encontrados);
        }
        continue;
      }
      for (const a of sujetos) {
        if (!aplicaRequerimientoASujeto(entrada, a) || aplicaAntes(a)) {
          continue;
        }
        if (vigentes.has(clave(entrada.requerimientoId, a.personaId,
            a.recursoId))) {
          continue;
        }
        const fecha = this._aFecha(a.fechaInicio) || fechaInicioParticipacion;
        // eslint-disable-next-line no-await-in-loop
        const encontrados = a.personaId ?
          await reutilizacionDocumentalService.buscarReutilizablesPersona(
              a.personaId, [entrada], fecha,
          ) :
          await reutilizacionDocumentalService.buscarReutilizablesRecurso(
              a.recursoId, [entrada], fecha,
          );
        resultado.push(...encontrados);
      }
    }
    return resultado;
  }

  /**
   * Lleva los Expedientes NO cerrados de un Perfil de Participación al
   * estado final que dictan sus vínculos activos, para un conjunto de
   * Requerimientos afectados por un cambio de vínculos. El catálogo del
   * Perfil es la fuente de verdad en vivo para los Expedientes en curso
   * (RN-032 queda acotado a "no reabrir Expedientes cerrados").
   * - Se calcula la entrada FINAL de cada Requerimiento y cada Expediente
   *   se escribe UNA sola vez (transacción), sin bajas/altas intermedias:
   *   pasar de "Todos" a Perfiles específicos actualiza la entrada en vez
   *   de quitarla y volverla a poner.
   * - Quitar un Requerimiento o un Perfil del snapshot nunca borra ni
   *   modifica Evaluaciones ni Evidencias.
   * - Corre la reutilización documental solo para los sujetos que pasan a
   *   estar alcanzados. Cada cambio queda en Bitácora.
   * Mejor esfuerzo por Expediente: si uno falla no bloquea a los demás.
   * @param {string} perfilParticipacionId ID del Perfil de Participación.
   * @param {string[]} requerimientoIds Requerimientos afectados.
   * @param {Object} actor Usuario autenticado que ejecuta la acción.
   * @return {Promise<void>}
   */
  async sincronizarRequerimientosDePerfil(
      perfilParticipacionId, requerimientoIds, actor,
  ) {
    const ids = [...new Set(requerimientoIds || [])].filter(Boolean);
    if (ids.length === 0) return;
    const [expedientes, vinculosActivos, requerimientos] = await Promise.all([
      expedienteRepository.getByPerfil(perfilParticipacionId),
      perfilRequerimientoRepository.getActivosByPerfil(perfilParticipacionId),
      Promise.all(ids.map((id) => requerimientoRepository.getById(id))),
    ]);
    const abiertos = expedientes.filter((e) => e.estado !== "cerrado");
    if (abiertos.length === 0) return;

    const finales = {};
    ids.forEach((id, i) => {
      const requerimiento = requerimientos[i];
      const vinculos = vinculosActivos.filter((v) => v.requerimientoId === id);
      finales[id] = requerimiento && requerimiento.estado === "activo" &&
          vinculos.length > 0 ?
        requerimientoCalculoService.construirEntrada(requerimiento, vinculos) :
        null;
    });

    for (const expediente of abiertos) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await this._aplicarEntradasFinales(expediente, finales, actor);
      } catch (err) {
        console.error(
            `Error al sincronizar Requerimientos del Expediente ` +
            `${expediente.id}:`, err,
        );
      }
    }
  }

  /**
   * Aplica a un Expediente las entradas finales calculadas en
   * sincronizarRequerimientosDePerfil (null = el Requerimiento ya no
   * aplica). Una sola escritura del snapshot, junto con las Evaluaciones
   * reutilizadas, en una transacción.
   * @param {Object} expediente Expediente abierto.
   * @param {Object<string, ?Object>} finales requerimientoId -> entrada.
   * @param {Object} actor Usuario autenticado que ejecuta la acción.
   * @return {Promise<void>}
   */
  async _aplicarEntradasFinales(expediente, finales, actor) {
    const aplicables = expediente.requerimientosAplicables || [];
    const actuales = new Map(aplicables.map((r) => [r.requerimientoId, r]));
    const relevante = (r) => JSON.stringify([
      r.tipoEntidad, r.perfilRecursoIds ?? null, r.nombre, r.nombreCorto,
      Boolean(r.requiereVencimiento),
    ]);

    let nuevo = [...aplicables];
    const eventos = [];
    const paraReutilizar = [];
    Object.entries(finales).forEach(([id, final]) => {
      const actual = actuales.get(id);
      if (!final) {
        if (actual) {
          nuevo = nuevo.filter((r) => r.requerimientoId !== id);
          eventos.push({
            accion: "requerimiento_quitado",
            detalle: {requerimientoId: id, nombre: actual.nombre},
          });
        }
        return;
      }
      const entrada = actual?.origen ?
        {...final, origen: actual.origen} : final;
      if (!actual) {
        nuevo.push(entrada);
        eventos.push({
          accion: "requerimiento_agregado",
          detalle: {
            requerimientoId: id, nombre: entrada.nombre,
            tipoEntidad: entrada.tipoEntidad,
            perfilRecursoIds: entrada.perfilRecursoIds,
          },
        });
        paraReutilizar.push({entrada, aplicaAntes: () => false});
        return;
      }
      if (relevante(actual) === relevante(entrada)) return;
      nuevo = nuevo.map((r) => (r.requerimientoId === id ? entrada : r));
      eventos.push({
        accion: "requerimiento_actualizado",
        detalle: {
          requerimientoId: id, nombre: entrada.nombre,
          perfilRecursoIdsAnterior: actual.perfilRecursoIds ?? null,
          perfilRecursoIds: entrada.perfilRecursoIds,
        },
      });
      paraReutilizar.push({
        entrada, aplicaAntes: (s) => aplicaRequerimientoASujeto(actual, s),
      });
    });
    if (eventos.length === 0) return;

    const participacion = await participacionRepository.getById(
        expediente.participacionId,
    );
    const fechaInicioParticipacion =
        this._aFecha(participacion?.fechaInicio) || new Date();
    const reutilizables = await this._buscarReutilizablesDe(
        expediente, paraReutilizar, fechaInicioParticipacion,
    );

    const creador = await usuarioRepository.getById(actor.uid);
    const creadoPorNombre = creador ?
        `${creador.nombre} ${creador.apellido}`.trim() : actor.email;
    const expedienteRef = db.collection(expedienteRepository.COLLECTION)
        .doc(expediente.id);
    const evaluacionRefs = reutilizables.map(
        () => db.collection(evaluacionRepository.COLLECTION).doc(),
    );
    await db.runTransaction(async (transaction) => {
      transaction.update(expedienteRef, {
        requerimientosAplicables: nuevo,
        updatedAt: FieldValue.serverTimestamp(),
      });
      reutilizacionDocumentalService.registrarReutilizadas(
          transaction, evaluacionRefs, reutilizables,
          {
            expedienteId: expediente.id, mandanteId: expediente.mandanteId,
            actor, creadoPorNombre,
          },
      );
    });

    for (const evento of eventos) {
      // eslint-disable-next-line no-await-in-loop
      await bitacoraLogger.registrarEvento({
        mandanteId: expediente.mandanteId,
        entidad: "expediente",
        entidadId: expediente.id,
        accion: evento.accion,
        actor,
        detalle: {...evento.detalle, reutilizados: reutilizables.length},
      });
    }
    await this.recalcularEstado(expediente.id, actor);
  }
}

module.exports = new ExpedienteService();
