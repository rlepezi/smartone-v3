const admin = require("firebase-admin");
const recursoRepository = require("../repositories/recursoRepository");
const empresaRepository = require("../repositories/empresaRepository");
const empresaRecursoRepository =
    require("../repositories/empresaRecursoRepository");
const empresaRecursoService = require("./empresaRecursoService");
const {
  empresaIdsVisibles, sujetoIdsVisibles, puedeVerSujeto,
} = require("../utils/alcanceMandante");
const perfilRecursoRepository =
    require("../repositories/perfilRecursoRepository");
const bitacoraLogger = require("../utils/bitacoraLogger");
const bitacoraService = require("./bitacoraService");
const participacionRecursoRepository =
    require("../repositories/participacionRecursoRepository");
const AppError = require("../utils/AppError");

const ESTADOS_VALIDOS = ["activo", "inactivo"];
const TIPO_MAX_LENGTH = 60;
const db = admin.firestore();

/**
 * Reglas de negocio para el recurso Recurso (maquinarias, vehículos,
 * equipos). Catálogo global, sin mandanteId; su visibilidad por Mandante
 * se decide en utils/alcanceMandante.js.
 *
 * `tipo` YA NO se valida contra un catálogo fijo: Recurso no tiene
 * mandanteId propio (RN-021, catálogo global compartido entre
 * Mandantes) y una misma Empresa puede aportar Recursos a Proyectos de
 * Mandantes distintos, así que no hay un único Mandante contra el cual
 * scopear la validación en este punto. Se mantiene como texto libre y
 * descriptivo: lo que define los Requerimientos de una Maquinaria es el
 * Perfil de Recurso (por ID) que se elige al asignarla a una Participación
 * (participacionRecursos), validado contra el Mandante del Proyecto.
 *
 * El vínculo con una Empresa (dueño/operador) vive SOLO en
 * empresaRecursos (bloque 3): la "empresa actual" se deriva de la relación
 * activa y nunca se guarda en el Recurso.
 */
class RecursoService {
  /**
   * Valida el campo "tipo": catálogo abierto por diseño (ver nota de
   * clase) — solo se exige un string no vacío dentro de un largo
   * razonable.
   * @param {*} tipo Valor de tipo a validar.
   * @return {void}
   */
  _validarTipo(tipo) {
    if (typeof tipo !== "string" || !tipo.trim()) {
      throw new AppError(400, "El campo 'tipo' es requerido.");
    }
    if (tipo.trim().length > TIPO_MAX_LENGTH) {
      throw new AppError(
          400,
          `El campo 'tipo' no puede exceder ${TIPO_MAX_LENGTH} caracteres.`,
      );
    }
  }

  /**
   * Obtiene un recurso por su ID.
   * @param {string} id ID del recurso.
   * @param {?Object} [actor] Usuario autenticado: fuera de su alcance
   *     responde 404.
   * @return {Promise<Object>} El recurso encontrado.
   */
  async getRecursoById(id, actor = null) {
    if (!id || typeof id !== "string") {
      throw new AppError(400, "ID de recurso inválido.");
    }
    const recurso = await recursoRepository.getById(id);
    if (!recurso || (actor && !(await puedeVerSujeto(actor, "recurso", id)))) {
      throw new AppError(404, "Recurso no encontrado.");
    }
    return recurso;
  }

  /**
   * "Empresa actual" de una relación activa (null si no hay o si la
   * Empresa está fuera del alcance del actor).
   * @param {?Object} relacion Relación activa.
   * @param {?Set<string>} visibles Empresas visibles (null = todas).
   * @param {Object<string, Object>} empresas Cache id -> Empresa.
   * @return {?Object} Empresa actual.
   */
  _empresaActual(relacion, visibles, empresas) {
    if (!relacion || (visibles && !visibles.has(relacion.empresaId))) {
      return null;
    }
    return {
      relacionId: relacion.id,
      empresaId: relacion.empresaId,
      empresaNombre: empresas[relacion.empresaId]?.razonSocial || null,
      tipoRelacion: relacion.tipoRelacion || null,
      fechaInicio: relacion.fechaInicio || null,
    };
  }

  /**
   * Carga Empresas por ID.
   * @param {string[]} ids IDs.
   * @return {Promise<Object<string, Object>>} Mapa id -> Empresa.
   */
  async _empresasPorId(ids) {
    const unicos = [...new Set(ids.filter(Boolean))];
    const lista = await Promise.all(unicos.map((id) =>
      empresaRepository.getById(id)));
    return Object.fromEntries(unicos.map((id, i) => [id, lista[i]]));
  }

  /**
   * Recurso con su empresa actual derivada (visible para el actor).
   * @param {string} id ID del recurso.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object>} Recurso con `empresaActual`.
   */
  async obtenerRecurso(id, actor) {
    const recurso = await this.getRecursoById(id, actor);
    const [relacion, visibles] = await Promise.all([
      empresaRecursoRepository.getActivaBySujeto(id),
      empresaIdsVisibles(actor),
    ]);
    const empresas = await this._empresasPorId([relacion?.empresaId]);
    return {
      ...recurso,
      empresaActual: this._empresaActual(relacion, visibles, empresas),
    };
  }

  /**
   * Lista recursos visibles para el actor con su empresa actual. Con
   * `empresaId`, solo los con relación ACTIVA con esa Empresa.
   * @param {{estado: (string|undefined), empresaId: (string|undefined)}}
   *     filtros Filtros de búsqueda.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object[]>} Lista de recursos.
   */
  async listarRecursos(filtros, actor) {
    const {estado, empresaId} = filtros || {};
    const [recursos, sujetosVisibles, empresasVisibles, activas] =
        await Promise.all([
          recursoRepository.list({estado}),
          sujetoIdsVisibles(actor, "recurso"),
          empresaIdsVisibles(actor),
          empresaRecursoRepository.listActivas(),
        ]);
    const activaPorRecurso = new Map(activas.map((r) => [r.recursoId, r]));
    const empresas = await this._empresasPorId(activas.map((r) => r.empresaId));
    return recursos
        .filter((r) => !sujetosVisibles || sujetosVisibles.has(r.id))
        .filter((r) => !empresaId ||
          activaPorRecurso.get(r.id)?.empresaId === empresaId)
        .map((r) => ({
          ...r,
          empresaActual: this._empresaActual(
              activaPorRecurso.get(r.id), empresasVisibles, empresas,
          ),
        }));
  }

  /**
   * Patente obligatoria (no única). Si otro recurso ACTIVO visible para el
   * actor ya la usa y el cliente no confirmó, responde 409
   * PATENTE_DUPLICADA con ese recurso (aviso, no bloqueo: reenviar con
   * `confirmarPatenteDuplicada: true` continúa).
   * @param {*} patente Patente recibida.
   * @param {Object} opciones excluirId, confirmado, actor.
   * @return {Promise<string>} Patente normalizada.
   */
  async _validarPatente(patente, {excluirId = null, confirmado, actor}) {
    if (typeof patente !== "string" || !patente.trim()) {
      throw new AppError(
          400, "El campo 'patente' (identificación) es obligatorio.",
      );
    }
    const normalizada = patente.trim().toUpperCase();
    if (confirmado === true) return normalizada;
    const [mismos, visibles] = await Promise.all([
      recursoRepository.listByPatente(normalizada),
      sujetoIdsVisibles(actor, "recurso"),
    ]);
    const otro = mismos.find((r) => r.id !== excluirId &&
        r.estado === "activo" && (!visibles || visibles.has(r.id)));
    if (otro) {
      throw new AppError(
          409,
          `Ya existe otra maquinaria activa con la patente ${normalizada}.`,
          {
            codigo: "PATENTE_DUPLICADA",
            detalle: {
              recursoId: otro.id, nombre: otro.nombre, patente: normalizada,
            },
          },
      );
    }
    return normalizada;
  }

  /**
   * Devuelve el catálogo de tipos disponibles para el selector del
   * formulario: la UNIÓN de los Perfiles de Recurso activos
   * (tipo: "recurso") configurados por CUALQUIER Mandante, más
   * los valores personalizados distintos que ya estén en uso en la
   * colección y no figuren en ese catálogo (para no perder de vista
   * clasificaciones antiguas todavía en uso). Es solo una sugerencia —
   * no se enforcea acá (ver nota de clase); por eso no se scopea a un
   * único Mandante.
   * `origen` distingue en la respuesta cuáles vienen del catálogo
   * configurable y cuáles son personalizados en uso — el frontend los
   * agrupa por separado en el selector (RecursoFormPage.jsx).
   * @return {Promise<Object[]>} Lista de {value, label, origen}.
   */
  async listarTiposDisponibles() {
    const [perfilesRecurso, recursos] = await Promise.all([
      perfilRecursoRepository.list({
        tipo: "recurso", estado: "activo",
      }),
      recursoRepository.list({}),
    ]);

    const nombresCatalogo = new Set(perfilesRecurso.map((p) => p.nombre));
    const tiposUsados = new Set(
        recursos.map((r) => r.tipo).filter(Boolean),
    );
    nombresCatalogo.forEach((n) => tiposUsados.delete(n));
    const personalizados = [...tiposUsados]
        .sort()
        .map((tipo) => ({value: tipo, label: tipo, origen: "personalizado"}));
    const catalogo = [...nombresCatalogo]
        .sort()
        .map((nombre) => ({value: nombre, label: nombre, origen: "catalogo"}));

    return [...catalogo, ...personalizados];
  }

  /**
   * Crea un recurso junto con su relación inicial con la Empresa
   * (empresaRecursos), en una sola transacción (RN-122: ningún Recurso
   * queda sin Empresa). Patente obligatoria (ver _validarPatente).
   * @param {Object} payload Datos del recurso, empresaId (obligatorio),
   *     tipoRelacion y fechaInicio opcionales, y
   *     confirmarPatenteDuplicada.
   * @param {Object} actor Usuario autenticado que ejecuta la acción.
   * @return {Promise<Object>} El recurso creado.
   */
  async crearRecurso(payload, actor) {
    const {
      nombre, tipo, empresaId, estado, patente, marca, modelo, anio,
      fechaInicio,
    } = payload;

    if (!empresaId || !nombre || !tipo) {
      throw new AppError(
          400,
          "Faltan campos obligatorios: 'empresaId', 'nombre' y 'tipo' " +
          "son requeridos.",
      );
    }
    // tipoRelacion no es obligatorio en el alta (el alta rápida no lo
    // pide); sí lo es al cambiar de Empresa (empresaRecursoService).

    this._validarTipo(tipo);
    await empresaRecursoService.validarEmpresa(empresaId, actor);
    const patenteFinal = await this._validarPatente(patente, {
      confirmado: payload.confirmarPatenteDuplicada, actor,
    });

    const estadoFinal = estado || "activo";
    if (!ESTADOS_VALIDOS.includes(estadoFinal)) {
      throw new AppError(
          400,
          `Estado '${estadoFinal}' no válido. ` +
          `Valores permitidos: ${ESTADOS_VALIDOS.join(", ")}.`,
      );
    }

    const nuevoRecurso = {
      nombre: nombre.trim(),
      tipo: tipo.trim(),
      estado: estadoFinal,
      patente: patenteFinal,
      marca: marca ? marca.trim() : null,
      modelo: modelo ? modelo.trim() : null,
      anio: anio ? Number(anio) : null,
    };

    // Recurso + relación inicial con la Empresa (empresaRecursos) en UNA
    // transacción.
    const fechaInicioDate = fechaInicio ? new Date(fechaInicio) : new Date();
    if (isNaN(fechaInicioDate.getTime())) {
      throw new AppError(400, "fechaInicio no es una fecha válida.");
    }
    const refRecurso = db.collection(recursoRepository.COLLECTION).doc();
    const relacion = empresaRecursoService.prepararAlta(
        refRecurso.id, empresaId,
        empresaRecursoService.camposRelacion(payload, false), fechaInicioDate,
    );
    await db.runTransaction(async (tx) => {
      tx.set(refRecurso, recursoRepository.datosAlta(nuevoRecurso));
      tx.set(relacion.ref, relacion.data);
    });
    const creado = {id: refRecurso.id, ...nuevoRecurso};

    // Recurso es catálogo global (sin mandanteId) — mismo criterio que
    // Persona/Requerimiento: el evento queda registrado igual, aunque los
    // roles con alcance forzado por mandante no lo verán en su feed de
    // bitácora filtrado por mandanteId.
    await bitacoraLogger.registrarEvento({
      mandanteId: null,
      entidad: "recurso",
      entidadId: creado.id,
      accion: "creado",
      actor,
      detalle: {nombre: nuevoRecurso.nombre},
    });

    return creado;
  }

  /**
   * Actualiza los campos editables de identidad de un recurso existente.
   * La Empresa no se edita acá: vive en empresaRecursos (cambiar empresa /
   * terminar relación en empresaRecursoService).
   * @param {string} id ID del recurso.
   * @param {Object} payload Campos a actualizar.
   * @param {Object} actor Usuario autenticado que ejecuta la acción.
   * @return {Promise<Object|null>} El recurso actualizado.
   */
  async actualizarRecurso(id, payload, actor) {
    const existente = await this.getRecursoById(id, actor);

    // La Empresa no se cambia por este método: vive en empresaRecursos
    // (Cambiar Empresa / Terminar relación).
    if (payload.empresaId !== undefined) {
      throw new AppError(
          400,
          "Para cambiar la Empresa de un Recurso, use 'Cambiar Empresa'.",
      );
    }

    const allowedFields = [
      "nombre", "tipo", "estado", "patente", "marca", "modelo", "anio",
    ];
    const updateData = {};
    for (const key of allowedFields) {
      if (payload[key] !== undefined) {
        updateData[key] = payload[key];
      }
    }

    if (updateData.tipo !== undefined) {
      this._validarTipo(updateData.tipo);
      updateData.tipo = updateData.tipo.trim();
    }

    if (updateData.estado && !ESTADOS_VALIDOS.includes(updateData.estado)) {
      throw new AppError(400, `Estado '${updateData.estado}' no válido.`);
    }

    if (updateData.nombre) updateData.nombre = updateData.nombre.trim();
    if (updateData.patente !== undefined) {
      const cambia = (updateData.patente || "").trim().toUpperCase() !==
          (existente.patente || "");
      updateData.patente = cambia ?
        await this._validarPatente(updateData.patente, {
          excluirId: id, confirmado: payload.confirmarPatenteDuplicada, actor,
        }) :
        existente.patente;
    }
    if (updateData.marca !== undefined) {
      updateData.marca = updateData.marca ? updateData.marca.trim() : null;
    }
    if (updateData.modelo !== undefined) {
      updateData.modelo = updateData.modelo ?
          updateData.modelo.trim() : null;
    }
    if (updateData.anio !== undefined) {
      updateData.anio = updateData.anio ? Number(updateData.anio) : null;
    }

    const actualizado = await recursoRepository.update(id, updateData);

    // La transición de estado se registra aparte (mismo criterio que
    // Perfil de Participación/Usuario): un cambio de estado es
    // semánticamente distinto de una edición de datos generales.
    const estadoCambio = updateData.estado !== undefined &&
        updateData.estado !== existente.estado;
    if (estadoCambio) {
      await bitacoraLogger.registrarEvento({
        mandanteId: null,
        entidad: "recurso",
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
        mandanteId: null,
        entidad: "recurso",
        entidadId: id,
        accion: "actualizado",
        actor,
        detalle,
      });
    }

    return actualizado;
  }

  /**
   * Desactiva un recurso existente.
   * @param {string} id ID del recurso.
   * @param {Object} actor Usuario autenticado que ejecuta la acción.
   * @return {Promise<Object|null>} El recurso desactivado.
   */
  async desactivarRecurso(id, actor) {
    return this.actualizarRecurso(id, {estado: "inactivo"}, actor);
  }

  /**
   * Eventos de Bitácora relacionados a un Recurso: los propios, los de sus
   * documentos de participación (cualquier estado) y los de las Participaciones
   * a las que
   * esos documentos pertenecen. Solo lectura, solo datos reales de
   * Bitácora.
   * @param {string} id ID de un Recurso.
   * @param {Object} actor Usuario autenticado que ejecuta la acción.
   * @param {{limit: (string|number|undefined)}} [opciones] Máximo de
   *     eventos (por defecto 15, tope 500).
   * @return {Promise<Object[]>} Eventos, más reciente primero.
   */
  async obtenerEventos(id, actor, {limit} = {}) {
    await this.getRecursoById(id, actor); // Existencia y alcance

    const documentos =
        await participacionRecursoRepository.list({recursoId: id});
    const participacionIds = [
      ...new Set(documentos.map((a) => a.participacionId).filter(Boolean)),
    ];

    // Una consulta por referencia: se acota a los documentos más
    // recientes (el repositorio las devuelve de más nueva a más antigua).
    const MAX_DOCUMENTOS = 30;
    const referencias = [
      {entidad: "recurso", entidadId: id},
      ...documentos.slice(0, MAX_DOCUMENTOS).map((a) => ({
        entidad: "participacionRecurso", entidadId: a.id,
      })),
      ...participacionIds.map((pid) => ({
        entidad: "participacion", entidadId: pid,
      })),
    ];

    return bitacoraService.listarPorReferencias(referencias, actor, {limit});
  }
}

module.exports = new RecursoService();
