const admin = require("firebase-admin");
const {FieldValue} = require("firebase-admin/firestore");
const participacionRepository =
    require("../repositories/participacionRepository");
const proyectoRepository = require("../repositories/proyectoRepository");
const expedienteRepository = require("../repositories/expedienteRepository");
const perfilRecursoRepository =
    require("../repositories/perfilRecursoRepository");
const bitacoraLogger = require("../utils/bitacoraLogger");
const AppError = require("../utils/AppError");

const db = admin.firestore();

const ESTADOS_TERMINALES_PROYECTO = ["finalizado", "archivado"];
const ESTADOS_VALIDOS = ["pendiente", "activa", "finalizada"];
const TRANSICIONES_VALIDAS = {
  pendiente: ["activa", "finalizada"],
  activa: ["finalizada"],
  finalizada: [],
};
// Roles cuyo acceso queda siempre acotado a su propio mandanteId.
const ROLES_ALCANCE_FORZADO = ["mandante_admin", "mandante_lector"];

/**
 * Reglas de negocio compartidas por participacionPersonas y
 * participacionRecursos: un sujeto (Persona o Recurso) dentro de una
 * Participación, con un Perfil de Recurso por documento.
 * - mandanteId, proyectoId y empresaId se copian de la Participación.
 * - perfilRecursoId obligatorio: del mismo Mandante, activo y del tipo de
 *   la colección.
 * - Persona: un documento por perfil; no se repite (participación +
 *   persona + perfil) activo. Recurso: un único documento activo por
 *   Participación.
 * - Exclusividad por Proyecto: un sujeto no puede estar activo en dos
 *   Participaciones distintas del mismo Proyecto (validado dentro de la
 *   transacción de alta).
 * - Sin borrado físico: finalizar fija estado y fechaTermino.
 */
class ParticipacionSujetoService {
  /**
   * @param {"persona"|"recurso"} tipo Tipo del sujeto.
   * @param {Object} repo Repositorio de la colección.
   * @param {Object} sujetoRepository Repositorio de Persona o Recurso.
   */
  constructor(tipo, repo, sujetoRepository) {
    this.tipo = tipo;
    this.repo = repo;
    this.sujetoRepository = sujetoRepository;
    this.campo = tipo === "persona" ? "personaId" : "recursoId";
    this.entidadBitacora = tipo === "persona" ?
        "participacionPersona" : "participacionRecurso";
    this.etiqueta = tipo === "persona" ? "Persona" : "Maquinaria";
  }

  /**
   * Servicio de Expediente (require diferido: evita el ciclo de módulos).
   * @return {Object} expedienteService.
   */
  _expedienteService() {
    return require("./expedienteService");
  }

  /**
   * Parsea y valida una fecha recibida del cliente.
   * @param {*} valor Valor a parsear.
   * @param {string} nombreCampo Nombre del campo.
   * @return {Date} Fecha parseada.
   */
  _parseFecha(valor, nombreCampo) {
    const fecha = valor instanceof Date ? valor : new Date(valor);
    if (isNaN(fecha.getTime())) {
      throw new AppError(400, `${nombreCampo} no es una fecha válida.`);
    }
    return fecha;
  }

  /**
   * Convierte Timestamp/Date/string a Date.
   * @param {*} valor Valor.
   * @return {?Date} Fecha o null.
   */
  _aFecha(valor) {
    if (!valor) return null;
    if (typeof valor.toDate === "function") return valor.toDate();
    return new Date(valor);
  }

  /**
   * Obtiene un documento por ID respetando el alcance del actor.
   * @param {string} id ID del documento.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object>} El documento.
   */
  async getById(id, actor) {
    if (!id || typeof id !== "string") {
      throw new AppError(400, "ID inválido.");
    }
    const doc = await this.repo.getById(id);
    if (!doc || (ROLES_ALCANCE_FORZADO.includes(actor.rol) &&
        doc.mandanteId !== actor.mandanteId)) {
      throw new AppError(404, `${this.etiqueta} asignada no encontrada.`);
    }
    return doc;
  }

  /**
   * Lista documentos. Los roles acotados solo ven su propio Mandante.
   * @param {Object} filtros Filtros de igualdad.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object[]>} Documentos.
   */
  async listar(filtros, actor) {
    const finales = {...filtros};
    if (ROLES_ALCANCE_FORZADO.includes(actor.rol)) {
      finales.mandanteId = actor.mandanteId;
    }
    return this.repo.list(finales);
  }

  /**
   * Resuelve y valida la Participación destino (activa, Proyecto no
   * terminal, alcance del actor).
   * @param {{participacionId: ?string, proyectoId: ?string,
   *     empresaId: ?string}} datos Referencia a la Participación.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object>} La Participación.
   */
  async _resolverParticipacion({participacionId, proyectoId, empresaId},
      actor) {
    let participacion = null;
    if (participacionId) {
      participacion = await participacionRepository.getById(participacionId);
    } else if (proyectoId && empresaId) {
      participacion = await participacionRepository
          .getActivaByProyectoYEmpresa(proyectoId, empresaId);
    } else {
      throw new AppError(
          400,
          "Indique 'participacionId', o 'proyectoId' y 'empresaId'.",
      );
    }
    if (!participacion || participacion.estado !== "activa") {
      throw new AppError(
          400,
          "La Empresa indicada no tiene una Participación activa en este " +
          "Proyecto.",
      );
    }
    if (ROLES_ALCANCE_FORZADO.includes(actor.rol) &&
        participacion.mandanteId !== actor.mandanteId) {
      throw new AppError(
          403,
          "No tiene permisos para asignar recursos en proyectos de otro " +
          "Mandante.",
      );
    }
    // Un Expediente cerrado es de solo lectura: no admite nuevas
    // Personas/Maquinarias aunque su Participación siga activa (cierres
    // anteriores a que el cierre finalizara la Participación).
    const expedientes = await expedienteRepository.getByParticipacion(
        participacion.id,
    );
    if (expedientes.length &&
        expedientes.every((e) => e.estado === "cerrado")) {
      throw new AppError(
          409,
          "El Expediente de esta Participación está cerrado: no admite " +
          "nuevas asignaciones.",
      );
    }
    const proyecto = await proyectoRepository.getById(
        participacion.proyectoId,
    );
    if (!proyecto) throw new AppError(400, "El Proyecto indicado no existe.");
    if (ESTADOS_TERMINALES_PROYECTO.includes(proyecto.estado)) {
      throw new AppError(
          409,
          "El Proyecto indicado está finalizado o archivado y no admite " +
          "nuevas asignaciones.",
      );
    }
    return participacion;
  }

  /**
   * Relación empresa-sujeto del tipo (empresaPersonas / empresaRecursos).
   * @return {Object} Repositorio de la relación.
   */
  _relacionRepo() {
    return this.tipo === "persona" ?
      require("../repositories/empresaPersonaRepository") :
      require("../repositories/empresaRecursoRepository");
  }

  /**
   * Valida que el sujeto exista, esté activo y tenga relación ACTIVA con la
   * Empresa de la Participación (empresaPersonas / empresaRecursos).
   * @param {string} sujetoId personaId o recursoId.
   * @param {string} empresaId Empresa de la Participación.
   * @return {Promise<Object>} La Persona o el Recurso.
   */
  async _validarSujeto(sujetoId, empresaId) {
    if (!sujetoId) {
      throw new AppError(400, `El campo '${this.campo}' es obligatorio.`);
    }
    const sujeto = await this.sujetoRepository.getById(sujetoId);
    if (!sujeto) {
      throw new AppError(400, `La ${this.etiqueta} indicada no existe.`);
    }
    if (sujeto.estado !== "activo") {
      throw new AppError(400, `La ${this.etiqueta} indicada no está activa.`);
    }
    const relacion = await this._relacionRepo().getActivaBySujeto(sujetoId);
    if (relacion?.empresaId !== empresaId) {
      throw new AppError(
          400,
          `La ${this.etiqueta} indicada no tiene una relación activa con la ` +
          "Empresa de esta Participación.",
      );
    }
    return sujeto;
  }

  /**
   * Normaliza y valida los Perfiles de Recurso pedidos.
   * @param {(string|string[])} perfiles perfilRecursoId o arreglo.
   * @param {string} mandanteId Mandante de la Participación.
   * @return {Promise<string[]>} IDs válidos, sin repetir.
   */
  async validarPerfiles(perfiles, mandanteId) {
    const ids = [...new Set((Array.isArray(perfiles) ? perfiles : [perfiles])
        .filter(Boolean))];
    if (ids.length === 0) {
      throw new AppError(400, "Debe indicar el Perfil de Recurso.");
    }
    if (this.tipo === "recurso" && ids.length > 1) {
      throw new AppError(
          400, "Una Maquinaria tiene un único Perfil de Recurso.",
      );
    }
    for (const id of ids) {
      // eslint-disable-next-line no-await-in-loop
      const perfil = await perfilRecursoRepository.getById(id);
      if (!perfil || perfil.mandanteId !== mandanteId) {
        throw new AppError(
            400, "El Perfil de Recurso indicado no pertenece a este Mandante.",
        );
      }
      if (perfil.estado !== "activo") {
        throw new AppError(
            400, `El Perfil de Recurso '${perfil.nombre}' no está activo.`,
        );
      }
      if (perfil.tipo !== this.tipo) {
        throw new AppError(
            400,
            `El Perfil de Recurso '${perfil.nombre}' no es de tipo ` +
            `${this.tipo === "persona" ? "Persona" : "Maquinaria"}.`,
        );
      }
    }
    return ids;
  }

  /**
   * Valida, dentro de una transacción, las reglas de unicidad y de
   * exclusividad por Proyecto, y prepara los documentos de alta.
   * @param {FirebaseFirestore.Transaction} transaction Transacción.
   * @param {{participacion: Object, sujetoId: string,
   *     perfilRecursoIds: string[], fechaInicio: Date,
   *     fechaTermino: ?Date}} datos Datos del alta.
   * @return {Promise<Array<{ref: Object, data: Object}>>} Altas a escribir.
   */
  async prepararAltasEnTransaccion(transaction, {
    participacion, sujetoId, perfilRecursoIds, fechaInicio, fechaTermino,
  }) {
    const snap = await transaction.get(this.repo.queryActivosSujetoProyecto(
        sujetoId, participacion.proyectoId,
    ));
    const activos = snap.docs.map((d) => ({id: d.id, ...d.data()}));
    if (activos.some((a) => a.participacionId !== participacion.id)) {
      throw new AppError(
          409,
          `Esta ${this.etiqueta} ya está asignada a otra Empresa en este ` +
          "Proyecto.",
      );
    }
    if (this.tipo === "recurso" && activos.length > 0) {
      throw new AppError(
          409,
          "Esta Maquinaria ya está asignada en esta Participación.",
      );
    }
    const repetido = activos.find(
        (a) => perfilRecursoIds.includes(a.perfilRecursoId),
    );
    if (repetido) {
      throw new AppError(
          409,
          "Esta Persona ya tiene ese Perfil de Recurso en esta Participación.",
      );
    }
    return perfilRecursoIds.map((perfilRecursoId) => ({
      ref: this.repo.coleccion().doc(),
      data: this.repo.datosAlta({
        mandanteId: participacion.mandanteId,
        participacionId: participacion.id,
        proyectoId: participacion.proyectoId,
        empresaId: participacion.empresaId,
        [this.campo]: sujetoId,
        perfilRecursoId,
        fechaInicio,
        fechaTermino: fechaTermino || null,
        estado: "activa",
      }),
    }));
  }

  /**
   * Registra en Bitácora el alta de documentos.
   * @param {Array<{ref: Object, data: Object}>} altas Documentos creados.
   * @param {Object} actor Usuario autenticado.
   * @param {Object} [extra] Detalle adicional.
   * @return {Promise<void>}
   */
  async registrarAltas(altas, actor, extra = {}) {
    for (const {ref, data} of altas) {
      // eslint-disable-next-line no-await-in-loop
      await bitacoraLogger.registrarEvento({
        mandanteId: data.mandanteId,
        entidad: this.entidadBitacora,
        entidadId: ref.id,
        accion: "creado",
        actor,
        detalle: {
          participacionId: data.participacionId,
          proyectoId: data.proyectoId,
          empresaId: data.empresaId,
          [this.campo]: data[this.campo],
          perfilRecursoId: data.perfilRecursoId,
          ...extra,
        },
      });
    }
  }

  /**
   * Asigna un sujeto a una Participación con uno (Recurso) o varios
   * (Persona) Perfiles de Recurso.
   * @param {Object} payload participacionId (o proyectoId + empresaId),
   *     personaId/recursoId, perfilRecursoIds (o perfilRecursoId),
   *     fechaInicio, fechaTermino.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object[]>} Documentos creados.
   */
  async crear(payload, actor) {
    const participacion = await this._resolverParticipacion(payload, actor);
    const sujetoId = payload[this.campo];
    await this._validarSujeto(sujetoId, participacion.empresaId);
    const perfilRecursoIds = await this.validarPerfiles(
        payload.perfilRecursoIds ?? payload.perfilRecursoId,
        participacion.mandanteId,
    );
    if (!payload.fechaInicio) {
      throw new AppError(400, "El campo 'fechaInicio' es obligatorio.");
    }
    const fechaInicio = this._parseFecha(payload.fechaInicio, "fechaInicio");
    let fechaTermino = null;
    if (payload.fechaTermino) {
      fechaTermino = this._parseFecha(payload.fechaTermino, "fechaTermino");
      if (fechaTermino < fechaInicio) {
        throw new AppError(
            400, "fechaTermino no puede ser anterior a fechaInicio.",
        );
      }
    }

    let altas = [];
    await db.runTransaction(async (transaction) => {
      altas = await this.prepararAltasEnTransaccion(transaction, {
        participacion, sujetoId, perfilRecursoIds, fechaInicio, fechaTermino,
      });
      altas.forEach(({ref, data}) => transaction.set(ref, data));
    });

    await this.registrarAltas(altas, actor);
    await this._expedienteService().recalcularPorProyectoEmpresa(
        participacion.proyectoId, participacion.empresaId, actor,
    );
    return Promise.all(altas.map(({ref}) => this.repo.getById(ref.id)));
  }

  /**
   * Cambia el estado de un documento (finalizar fija fechaTermino).
   * @param {string} id ID del documento.
   * @param {{estado: string, fechaTermino: (string|undefined)}} payload
   *     Nuevo estado.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object>} El documento actualizado.
   */
  async transicionar(id, payload, actor) {
    const existente = await this.getById(id, actor);
    const nuevoEstado = payload.estado;
    if (!ESTADOS_VALIDOS.includes(nuevoEstado)) {
      throw new AppError(400, `Estado '${nuevoEstado}' no válido.`);
    }
    const permitidas = TRANSICIONES_VALIDAS[existente.estado] || [];
    if (!permitidas.includes(nuevoEstado)) {
      throw new AppError(
          409,
          `No se puede transicionar de '${existente.estado}' a ` +
          `'${nuevoEstado}'.`,
      );
    }
    const updateData = {estado: nuevoEstado};
    if (nuevoEstado === "finalizada") {
      const fechaTermino = payload.fechaTermino ?
          this._parseFecha(payload.fechaTermino, "fechaTermino") : new Date();
      if (fechaTermino < this._aFecha(existente.fechaInicio)) {
        throw new AppError(
            400, "fechaTermino no puede ser anterior a fechaInicio.",
        );
      }
      updateData.fechaTermino = fechaTermino;
    }
    if (nuevoEstado === "activa") {
      // Reactivar un pendiente respeta las mismas reglas que un alta.
      const participacion = await participacionRepository.getById(
          existente.participacionId,
      );
      await db.runTransaction(async (transaction) => {
        await this.prepararAltasEnTransaccion(transaction, {
          participacion, sujetoId: existente[this.campo],
          perfilRecursoIds: [existente.perfilRecursoId],
          fechaInicio: existente.fechaInicio, fechaTermino: null,
        });
        transaction.update(this.repo.coleccion().doc(id), {
          ...updateData, updatedAt: FieldValue.serverTimestamp(),
        });
      });
    } else {
      await this.repo.update(id, updateData);
    }

    await bitacoraLogger.registrarEvento({
      mandanteId: existente.mandanteId,
      entidad: this.entidadBitacora,
      entidadId: id,
      accion: "transicion_estado",
      actor,
      detalle: {
        participacionId: existente.participacionId,
        proyectoId: existente.proyectoId,
        [this.campo]: existente[this.campo],
        perfilRecursoId: existente.perfilRecursoId,
        estadoAnterior: existente.estado,
        estadoNuevo: nuevoEstado,
      },
    });
    await this._expedienteService().recalcularPorProyectoEmpresa(
        existente.proyectoId, existente.empresaId, actor,
    );
    return this.repo.getById(id);
  }

  /**
   * Finaliza, dentro de una transacción, TODOS los documentos activos de
   * un sujeto (en cualquier Proyecto): es el "mover" de los flujos de
   * acreditación (reemplazar / cambiar de Proyecto). Devuelve lo cerrado.
   * @param {FirebaseFirestore.Transaction} transaction Transacción.
   * @param {string} sujetoId personaId o recursoId.
   * @return {Promise<Object[]>} Documentos que se finalizan.
   */
  async finalizarActivosEnTransaccion(transaction, sujetoId) {
    const snap = await transaction.get(this.repo.queryActivosSujeto(sujetoId));
    const activos = snap.docs.map((d) => ({id: d.id, ref: d.ref, ...d.data()}));
    activos.forEach((a) => transaction.update(a.ref, {
      estado: "finalizada",
      fechaTermino: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }));
    return activos;
  }

  /**
   * Finaliza documentos activos (fija estado y fechaTermino), registra la
   * bitácora y recalcula los Expedientes afectados. Lo usan terminar o
   * cambiar la relación con la Empresa.
   * @param {Object[]} docs Documentos activos a finalizar.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<void>}
   */
  async finalizarDocumentos(docs, actor) {
    if (!docs || docs.length === 0) return;
    const batch = db.batch();
    docs.forEach((d) => batch.update(this.repo.coleccion().doc(d.id), {
      estado: "finalizada",
      fechaTermino: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }));
    await batch.commit();
    await this.registrarFinalizados(docs, actor);
    const pares = new Set(docs.map((d) => `${d.proyectoId}|${d.empresaId}`));
    for (const par of pares) {
      const [proyectoId, empresaId] = par.split("|");
      // eslint-disable-next-line no-await-in-loop
      await this._expedienteService().recalcularPorProyectoEmpresa(
          proyectoId, empresaId, actor,
      );
    }
  }

  /**
   * Registra en Bitácora la finalización de documentos.
   * @param {Object[]} docs Documentos finalizados.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<void>}
   */
  async registrarFinalizados(docs, actor) {
    for (const d of docs) {
      // eslint-disable-next-line no-await-in-loop
      await bitacoraLogger.registrarEvento({
        mandanteId: d.mandanteId,
        entidad: this.entidadBitacora,
        entidadId: d.id,
        accion: "transicion_estado",
        actor,
        detalle: {
          participacionId: d.participacionId,
          proyectoId: d.proyectoId,
          [this.campo]: d[this.campo],
          perfilRecursoId: d.perfilRecursoId,
          estadoAnterior: "activa",
          estadoNuevo: "finalizada",
        },
      });
    }
  }
}

module.exports = ParticipacionSujetoService;
