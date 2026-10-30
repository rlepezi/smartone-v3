const requerimientoRepository =
    require("../repositories/requerimientoRepository");
const perfilRequerimientoRepository =
    require("../repositories/perfilRequerimientoRepository");
const mandanteRepository = require("../repositories/mandanteRepository");
const plantillaEstructuraRepository =
    require("../repositories/plantillaEstructuraRepository");
const usuarioRepository = require("../repositories/usuarioRepository");
const perfilRequerimientoService = require("./perfilRequerimientoService");
const bitacoraLogger = require("../utils/bitacoraLogger");
const {TIPOS_ENTIDAD} = require("../utils/aplicabilidadRequerimiento");
const {claveNombre} = require("../utils/nombreRequerimiento");
const {
  opcionesUbicacion, aplicarUbicacionRequerimiento,
} = require("../utils/ubicacionRequerimiento");
const AppError = require("../utils/AppError");

// Catálogo oficial de tipos de entidad: fuente única de verdad, espejada a
// mano en frontend/src/services/requerimientoService.js ("recurso" se
// muestra como "Maquinaria").
const TIPOS_ENTIDAD_OPCIONES = [
  {value: "empresa", label: "Empresa"},
  {value: "persona", label: "Persona"},
  {value: "recurso", label: "Maquinaria"},
];

const ESTADOS_VALIDOS = ["activo", "inactivo"];
const NOMBRE_MAX = 200;
const NOMBRE_CORTO_MAX = 40;
const DESCRIPCION_MAX = 2000;
const MAX_UBICACIONES = 50;

// Roles cuyo acceso queda siempre acotado a su propio Mandante.
const ROLES_ALCANCE_FORZADO = ["mandante_admin", "mandante_lector"];

/**
 * Reglas de negocio para el recurso Requerimiento. Cada Requerimiento
 * pertenece a un Mandante (`mandanteId`, inmutable). A qué Perfiles de
 * Participación y de Recurso aplica NO se guarda en el Requerimiento: son
 * sus vínculos (perfilRequerimientos). Crear y editar guardan el
 * Requerimiento, su índice de nombre y sus vínculos en una sola
 * transacción; un Requerimiento nunca queda sin vínculos.
 */
class RequerimientoService {
  /**
   * Valida y normaliza un texto obligatorio.
   * @param {*} valor Valor recibido.
   * @param {string} etiqueta Nombre del campo para el mensaje.
   * @param {number} max Largo máximo.
   * @return {string} Texto con trim.
   */
  _textoObligatorio(valor, etiqueta, max) {
    const texto = typeof valor === "string" ? valor.trim() : "";
    if (!texto) throw new AppError(400, `${etiqueta} es obligatorio.`);
    if (texto.length > max) {
      throw new AppError(
          400, `${etiqueta} no puede exceder ${max} caracteres.`,
      );
    }
    return texto;
  }

  /**
   * Valida y normaliza la descripción (opcional).
   * @param {*} valor Valor recibido.
   * @return {?string} Descripción o null.
   */
  _descripcion(valor) {
    if (valor === null || valor === undefined || valor === "") return null;
    if (typeof valor !== "string") {
      throw new AppError(400, "La descripción debe ser texto.");
    }
    const texto = valor.trim();
    if (texto.length > DESCRIPCION_MAX) {
      throw new AppError(
          400,
          `La descripción no puede exceder ${DESCRIPCION_MAX} caracteres.`,
      );
    }
    return texto || null;
  }

  /**
   * Mandante sobre el que opera el actor: el propio para los roles de
   * Mandante; el indicado para el resto (obligatorio).
   * @param {Object} actor Usuario autenticado.
   * @param {?string} mandanteIdSolicitado Mandante pedido.
   * @return {string} mandanteId resuelto.
   */
  _mandanteDe(actor, mandanteIdSolicitado) {
    if (ROLES_ALCANCE_FORZADO.includes(actor.rol)) {
      if (!actor.mandanteId) {
        throw new AppError(403, "Su usuario no tiene un Mandante asignado.");
      }
      return actor.mandanteId;
    }
    if (!mandanteIdSolicitado || typeof mandanteIdSolicitado !== "string") {
      throw new AppError(400, "mandanteId es obligatorio.");
    }
    return mandanteIdSolicitado;
  }

  /**
   * Aplicabilidad de un Requerimiento a partir de sus vínculos activos.
   * @param {Object} requerimiento Requerimiento.
   * @param {Object[]} vinculos Vínculos activos de ese Requerimiento.
   * @return {{perfilParticipacionIds: string[], perfilRecursoIds:
   *     (null|string[])}} `perfilRecursoIds` null = "Todos".
   */
  _aplicabilidadDe(requerimiento, vinculos) {
    const perfilParticipacionIds =
        [...new Set(vinculos.map((v) => v.perfilParticipacionId))];
    const todos = requerimiento.tipoEntidad === "empresa" ||
        vinculos.some((v) => !v.perfilRecursoId);
    return {
      perfilParticipacionIds,
      perfilRecursoIds: todos ? null :
        [...new Set(vinculos.map((v) => v.perfilRecursoId))],
    };
  }

  /**
   * Obtiene un requerimiento por su ID, con su aplicabilidad. Fuera del
   * alcance del actor responde 404.
   * @param {string} id ID del requerimiento.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object>} El requerimiento con `aplicabilidad`.
   */
  async getRequerimientoById(id, actor) {
    const requerimiento = await this._cargar(id, actor);
    const vinculos =
        await perfilRequerimientoRepository.getActivosByRequerimiento(id);
    return {
      ...requerimiento,
      aplicabilidad: this._aplicabilidadDe(requerimiento, vinculos),
    };
  }

  /**
   * Carga un Requerimiento validando el alcance del actor.
   * @param {string} id ID del requerimiento.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object>} El requerimiento.
   */
  async _cargar(id, actor) {
    if (!id || typeof id !== "string") {
      throw new AppError(400, "ID de requerimiento inválido.");
    }
    const requerimiento = await requerimientoRepository.getById(id);
    if (!requerimiento || (
      ROLES_ALCANCE_FORZADO.includes(actor.rol) &&
      requerimiento.mandanteId !== actor.mandanteId
    )) {
      throw new AppError(404, "Requerimiento no encontrado.");
    }
    return requerimiento;
  }

  /**
   * Lista los requerimientos de UN Mandante (obligatorio para los roles
   * transversales; fijo en el propio para los roles de Mandante), cada uno
   * con su aplicabilidad (una sola consulta de vínculos para todos).
   * @param {{mandanteId: (string|undefined), estado: (string|undefined),
   *     tipoEntidad: (string|undefined)}} filtros Filtros de búsqueda.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object[]>} Lista de requerimientos.
   */
  async listarRequerimientos(filtros, actor) {
    const {estado, tipoEntidad} = filtros || {};
    const mandanteId = this._mandanteDe(actor, filtros?.mandanteId);
    const [requerimientos, vinculos] = await Promise.all([
      requerimientoRepository.list({mandanteId, estado, tipoEntidad}),
      perfilRequerimientoRepository.list({mandanteId, estado: "activo"}),
    ]);
    const porRequerimiento = new Map();
    vinculos.forEach((v) => {
      if (!porRequerimiento.has(v.requerimientoId)) {
        porRequerimiento.set(v.requerimientoId, []);
      }
      porRequerimiento.get(v.requerimientoId).push(v);
    });
    return requerimientos.map((r) => ({
      ...r,
      aplicabilidad: this._aplicabilidadDe(
          r, porRequerimiento.get(r.id) || [],
      ),
    }));
  }

  /**
   * Valida la forma de la aplicabilidad y la deja normalizada.
   * @param {*} aplicabilidad Valor recibido.
   * @param {string} tipoEntidad Tipo del Requerimiento.
   * @return {{perfilParticipacionIds: string[], perfilRecursoIds:
   *     (null|string[])}} Aplicabilidad normalizada.
   */
  _validarAplicabilidad(aplicabilidad, tipoEntidad) {
    const pps = aplicabilidad?.perfilParticipacionIds;
    if (!Array.isArray(pps) || pps.length === 0 ||
        pps.some((x) => typeof x !== "string" || !x)) {
      throw new AppError(
          400, "Seleccione al menos un Perfil de Participación.",
      );
    }
    let perfilRecursoIds = null;
    if (tipoEntidad !== "empresa") {
      const prs = aplicabilidad.perfilRecursoIds;
      if (prs !== null && prs !== undefined) {
        if (!Array.isArray(prs) || prs.length === 0 ||
            prs.some((x) => typeof x !== "string" || !x)) {
          throw new AppError(
              400,
              "Indique a qué Perfiles de Recurso aplica, o \"Todos\".",
          );
        }
        perfilRecursoIds = [...new Set(prs)];
      }
    }
    return {perfilParticipacionIds: [...new Set(pps)], perfilRecursoIds};
  }

  /**
   * Plan de vínculos para dejar un Requerimiento con la aplicabilidad
   * pedida: un vínculo por cada combinación Perfil de Participación ×
   * Perfil de Recurso (o "Todos"); los Perfiles de Participación que ya no
   * están se desvinculan (quedan inactivos, sin borrado).
   * @param {Object} requerimiento Requerimiento (con id y mandanteId).
   * @param {{perfilParticipacionIds: string[], perfilRecursoIds:
   *     (null|string[])}} aplicabilidad Aplicabilidad normalizada.
   * @param {Object[]} activosActuales Vínculos activos actuales.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object>} Plan de perfilRequerimientoService.
   */
  async _planVinculos(requerimiento, aplicabilidad, activosActuales, actor) {
    const deseados = new Set(aplicabilidad.perfilParticipacionIds);
    const sobrantes = [...new Set(
        activosActuales.map((v) => v.perfilParticipacionId),
    )].filter((id) => !deseados.has(id));
    const cambios = [
      ...aplicabilidad.perfilParticipacionIds.map((id) => ({
        perfilParticipacionId: id,
        requerimientoId: requerimiento.id,
        activo: true,
        perfilRecursoIds: aplicabilidad.perfilRecursoIds,
      })),
      ...sobrantes.map((id) => ({
        perfilParticipacionId: id,
        requerimientoId: requerimiento.id,
        activo: false,
      })),
    ];
    return perfilRequerimientoService.planificarVinculos(
        cambios, actor, requerimiento,
    );
  }

  /**
   * Valida la ubicación en la plantilla pedida para un requerimiento:
   * [{seccionClave, documentoClave (null: sección sin documentos)}].
   * @param {*} valor Valor recibido.
   * @return {Array<{seccionClave: string, documentoClave: ?string}>}
   *     Selección normalizada.
   */
  _validarSeleccionUbicacion(valor) {
    if (!Array.isArray(valor) || valor.length > MAX_UBICACIONES ||
        valor.some((x) => !x || typeof x.seccionClave !== "string" ||
          (x.documentoClave !== null && x.documentoClave !== undefined &&
            typeof x.documentoClave !== "string"))) {
      throw new AppError(400, "La ubicación en la estructura de carpetas " +
          "no es válida.");
    }
    return valor.map((x) => ({seccionClave: x.seccionClave,
      documentoClave: x.documentoClave || null}));
  }

  /**
   * Operación sobre la plantilla activa para guardar la ubicación de un
   * requerimiento EN LA MISMA transacción (requerimientoRepository.
   * guardarAtomico): aplica la selección sobre la plantilla leída en la
   * transacción y sube su versión. Sin plantilla activa, una selección no
   * vacía es un 409; una vacía no hace nada.
   * @param {Object} entrada {mandanteId, requerimientoId, tipoEntidad,
   *     seleccion, actor}.
   * @return {Promise<?{operacion: Object, resultado: Object}>} Operación
   *     (resultado.cambios se completa al guardar), o null.
   */
  async _ubicacionPlantilla({mandanteId, requerimientoId, tipoEntidad,
    seleccion, actor}) {
    const activa = await plantillaEstructuraRepository.getActiva(mandanteId);
    if (!activa) {
      if (seleccion.length) {
        throw new AppError(409, "El Mandante no tiene una plantilla de " +
            "estructura activa: no se puede indicar la ubicación.");
      }
      return null;
    }
    const usuario = await usuarioRepository.getById(actor.uid)
        .catch(() => null);
    const nombre = usuario ?
      `${usuario.nombre || ""} ${usuario.apellido || ""}`.trim() : "";
    const autor = {uid: actor.uid, nombre: nombre || actor.email || actor.uid};
    const resultado = {plantillaId: activa.id, version: null, cambios: null};
    const operacion = {
      id: activa.id,
      aplicar: (actual) => {
        if (!actual || actual.estado !== "activa") {
          throw Object.assign(new Error("La plantilla cambió."),
              {codigo: "PLANTILLA_CAMBIO"});
        }
        const r = aplicarUbicacionRequerimiento(actual, requerimientoId,
            tipoEntidad, seleccion);
        resultado.cambios = r.cambios;
        const hay = r.cambios.agregados.length + r.cambios.quitados.length +
            r.cambios.movidos.length > 0;
        if (!hay) return null;
        resultado.version = (actual.version || 1) + 1;
        return {secciones: r.secciones, version: resultado.version,
          updatedBy: autor};
      },
    };
    return {operacion, resultado};
  }

  /**
   * Bitácora del cambio de ubicación (en la plantilla), si lo hubo.
   * @param {Object} entrada {mandanteId, requerimientoId, ubicacion, actor}.
   * @return {Promise<void>}
   */
  async _registrarUbicacion({mandanteId, requerimientoId, ubicacion, actor}) {
    const r = ubicacion?.resultado;
    if (!r?.version) return;
    await bitacoraLogger.registrarEvento({
      mandanteId, entidad: "plantillasEstructura", entidadId: r.plantillaId,
      accion: "ubicacion_requerimiento", actor,
      detalle: {requerimientoId, version: r.version, ...r.cambios},
    });
  }

  /**
   * Opciones del selector "Ubicación en la estructura de carpetas": los
   * documentos (y secciones sin documentos) de la plantilla activa del
   * Mandante para ese tipo de entidad, con el requerimiento al que hoy están
   * vinculados. Sin plantilla activa: {plantilla: null, opciones: []}.
   * @param {{mandanteId: ?string, tipoEntidad: string}} filtros Filtros.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object>} {plantilla, opciones}.
   */
  async opcionesUbicacionPlantilla({mandanteId, tipoEntidad}, actor) {
    const id = this._mandanteDe(actor, mandanteId);
    if (!TIPOS_ENTIDAD.includes(tipoEntidad)) {
      throw new AppError(400, "Tipo de entidad no válido.");
    }
    const activa = await plantillaEstructuraRepository.getActiva(id);
    if (!activa) return {plantilla: null, opciones: []};
    const opciones = opcionesUbicacion(activa, tipoEntidad);
    const nombres = new Map((await requerimientoRepository.getByIds(
        [...new Set(opciones.map((o) => o.requerimientoId).filter(Boolean))],
    )).map((r) => [r.id, r.nombreCorto || r.nombre]));
    return {
      plantilla: {id: activa.id, nombre: activa.nombre,
        version: activa.version || 1},
      opciones: opciones.map((o) => ({...o, requerimientoNombre:
        o.requerimientoId ? nombres.get(o.requerimientoId) || null : null})),
    };
  }

  /**
   * Ejecuta el guardado atómico y traduce sus errores.
   * @param {Object} operacion Operación de requerimientoRepository.
   * @param {string} nombre Nombre del Requerimiento (para el mensaje).
   * @return {Promise<void>}
   */
  async _guardar(operacion, nombre) {
    try {
      await requerimientoRepository.guardarAtomico(operacion);
    } catch (err) {
      if (err.codigo === "NOMBRE_DUPLICADO") {
        throw new AppError(
            409,
            `Ya existe un Requerimiento activo con el nombre '${nombre}' ` +
            "para este Mandante y tipo de entidad.",
            {codigo: "NOMBRE_DUPLICADO"},
        );
      }
      if (err.codigo === "NO_ENCONTRADO") {
        throw new AppError(404, "Requerimiento no encontrado.");
      }
      if (err.codigo === "UBICACION_INVALIDA") {
        throw new AppError(400, err.message);
      }
      if (err.codigo === "PLANTILLA_CAMBIO") {
        throw new AppError(409, "La plantilla de estructura cambió o se " +
            "desactivó mientras guardaba. Vuelva a abrir el requerimiento.");
      }
      throw err;
    }
  }

  /**
   * Crea un Requerimiento con su aplicabilidad, en una sola transacción:
   * el documento, su índice de nombre y un vínculo por combinación. Se crea
   * activo. Después sincroniza los Expedientes abiertos de los Perfiles de
   * Participación (regla del bloque 4).
   * @param {Object} payload mandanteId, tipoEntidad, nombre, nombreCorto,
   *     descripcion, requiereVencimiento, esDocumentoIdentidad y
   *     aplicabilidad {perfilParticipacionIds, perfilRecursoIds}.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object>} El requerimiento creado, con aplicabilidad.
   */
  async crearRequerimiento(payload, actor) {
    const datosEntrada = payload || {};
    const mandanteId = this._mandanteDe(actor, datosEntrada.mandanteId);
    const {tipoEntidad} = datosEntrada;
    if (!TIPOS_ENTIDAD.includes(tipoEntidad)) {
      throw new AppError(
          400,
          `Tipo de entidad '${tipoEntidad}' no válido. ` +
          `Valores permitidos: ${TIPOS_ENTIDAD.join(", ")}.`,
      );
    }
    const nombre = this._textoObligatorio(
        datosEntrada.nombre, "El nombre", NOMBRE_MAX,
    );
    const nombreCorto = this._textoObligatorio(
        datosEntrada.nombreCorto, "El nombre corto", NOMBRE_CORTO_MAX,
    );
    const aplicabilidad = this._validarAplicabilidad(
        datosEntrada.aplicabilidad, tipoEntidad,
    );

    const mandante = await mandanteRepository.getById(mandanteId);
    if (!mandante) throw new AppError(400, "El Mandante indicado no existe.");

    const ref = requerimientoRepository.nuevaRef();
    const datos = {
      mandanteId,
      nombre,
      nombreCorto,
      descripcion: this._descripcion(datosEntrada.descripcion),
      tipoEntidad,
      estado: "activo",
      requiereVencimiento: Boolean(datosEntrada.requiereVencimiento),
      // Clasificación manual: su Evidencia típica es un documento de
      // identidad (cédula, licencia). Nunca se infiere por el nombre. Solo
      // tiene sentido para Personas.
      esDocumentoIdentidad: tipoEntidad === "persona" &&
          Boolean(datosEntrada.esDocumentoIdentidad),
      // Reglas de revisión IA: el tipo documental y el estado IA se
      // configuran en la pestaña "Reglas IA" (requerimientoReglaIAService).
      tipoDocumentalId: null,
      estadoIA: "sin_reglas",
    };
    const plan = await this._planVinculos(
        {id: ref.id, ...datos}, aplicabilidad, [], actor,
    );
    // Ubicación en la plantilla de estructura: misma transacción.
    const ubicacion = datosEntrada.ubicacionPlantilla !== undefined ?
      await this._ubicacionPlantilla({mandanteId, requerimientoId: ref.id,
        tipoEntidad, actor, seleccion: this._validarSeleccionUbicacion(
            datosEntrada.ubicacionPlantilla)}) : null;

    await this._guardar({
      ref,
      esNuevo: true,
      datos,
      claveTomar: claveNombre(mandanteId, tipoEntidad, nombre),
      claveLiberar: null,
      escribirVinculos: (tx) =>
        perfilRequerimientoRepository.escribirCambiosEn(tx, plan),
      plantilla: ubicacion?.operacion || null,
    }, nombre);
    await this._registrarUbicacion({mandanteId, requerimientoId: ref.id,
      ubicacion, actor});

    await bitacoraLogger.registrarEvento({
      mandanteId,
      entidad: "requerimiento",
      entidadId: ref.id,
      accion: "creado",
      actor,
      detalle: {nombre, tipoEntidad, vinculos: plan.resumen.creados},
    });
    await perfilRequerimientoService.sincronizarExpedientes(
        plan.afectados, actor,
    );
    return {id: ref.id, ...datos, aplicabilidad};
  }

  /**
   * Edita un Requerimiento y, si viene `aplicabilidad`, ajusta sus
   * vínculos por diferencia (crea los nuevos, desactiva los que sobran, no
   * toca los que se mantienen), todo en una sola transacción. `mandanteId`
   * y `tipoEntidad` no se pueden cambiar. El nombre único solo cuenta
   * mientras está activo: renombrar libera la clave anterior y toma la
   * nueva; desactivar la libera; reactivar la vuelve a tomar (409 si otro
   * la ocupa).
   * @param {string} id ID del requerimiento.
   * @param {Object} payload Campos a actualizar.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object>} El requerimiento actualizado.
   */
  async actualizarRequerimiento(id, payload, actor) {
    const entrada = payload || {};
    const existente = await this._cargar(id, actor);
    if (!existente.mandanteId) {
      throw new AppError(
          409,
          "Este Requerimiento aún no tiene Mandante asignado (migración " +
          "pendiente) y no se puede editar.",
      );
    }
    const {mandanteId, tipoEntidad} = existente;

    const cambios = {};
    if (entrada.nombre !== undefined) {
      cambios.nombre = this._textoObligatorio(
          entrada.nombre, "El nombre", NOMBRE_MAX,
      );
    }
    if (entrada.nombreCorto !== undefined) {
      cambios.nombreCorto = this._textoObligatorio(
          entrada.nombreCorto, "El nombre corto", NOMBRE_CORTO_MAX,
      );
    }
    if (entrada.descripcion !== undefined) {
      cambios.descripcion = this._descripcion(entrada.descripcion);
    }
    if (entrada.requiereVencimiento !== undefined) {
      cambios.requiereVencimiento = Boolean(entrada.requiereVencimiento);
    }
    if (entrada.esDocumentoIdentidad !== undefined) {
      cambios.esDocumentoIdentidad = tipoEntidad === "persona" &&
          Boolean(entrada.esDocumentoIdentidad);
    }
    if (entrada.estado !== undefined) {
      if (!ESTADOS_VALIDOS.includes(entrada.estado)) {
        throw new AppError(400, `Estado '${entrada.estado}' no válido.`);
      }
      cambios.estado = entrada.estado;
    }

    // Al guardarlo un superadmin, los campos que la IA lee del tipo pasan al
    // requerimiento (camposAdicionales), sin cambiar lo que se extrae.
    if (actor?.rol === "superadmin") {
      // eslint-disable-next-line global-require
      const reglasIA = require("./requerimientoReglaIAService");
      const copia = await reglasIA.copiaCamposAdicionales(existente);
      if (copia) cambios.camposAdicionales = copia;
    }

    const final = {...existente, ...cambios};
    const activosActuales =
        await perfilRequerimientoRepository.getActivosByRequerimiento(id);

    let plan = null;
    let aplicabilidad = this._aplicabilidadDe(existente, activosActuales);
    if (entrada.aplicabilidad !== undefined) {
      aplicabilidad = this._validarAplicabilidad(
          entrada.aplicabilidad, tipoEntidad,
      );
      plan = await this._planVinculos(
          final, aplicabilidad, activosActuales, actor,
      );
    }

    // Ubicación en la plantilla de estructura: misma transacción.
    const ubicacion = entrada.ubicacionPlantilla !== undefined ?
      await this._ubicacionPlantilla({mandanteId, requerimientoId: id,
        tipoEntidad, actor, seleccion: this._validarSeleccionUbicacion(
            entrada.ubicacionPlantilla)}) : null;

    // Índice de nombre: la clave se ocupa solo mientras está activo.
    const claveAnterior = existente.estado === "activo" ?
        claveNombre(mandanteId, tipoEntidad, existente.nombre) : null;
    const claveNueva = final.estado === "activo" ?
        claveNombre(mandanteId, tipoEntidad, final.nombre) : null;
    const cambiaClave = claveAnterior !== claveNueva;

    await this._guardar({
      ref: requerimientoRepository.ref(id),
      esNuevo: false,
      datos: {...cambios, mandanteId, tipoEntidad},
      claveTomar: cambiaClave ? claveNueva : null,
      claveLiberar: cambiaClave ? claveAnterior : null,
      escribirVinculos: plan ? (tx) =>
        perfilRequerimientoRepository.escribirCambiosEn(tx, plan) : null,
      plantilla: ubicacion?.operacion || null,
    }, final.nombre);
    await this._registrarUbicacion({mandanteId, requerimientoId: id,
      ubicacion, actor});

    const cambioEstado = cambios.estado !== undefined &&
        cambios.estado !== existente.estado;
    const camposEditados = Object.keys(cambios).filter((k) =>
      k !== "estado" &&
      JSON.stringify(cambios[k] ?? null) !==
          JSON.stringify(existente[k] ?? null));
    const cambioVinculos = Boolean(plan) && (plan.resumen.creados +
        plan.resumen.reactivados + plan.resumen.desactivados) > 0;

    if (cambioEstado) {
      await bitacoraLogger.registrarEvento({
        mandanteId,
        entidad: "requerimiento",
        entidadId: id,
        accion: "transicion_estado",
        actor,
        detalle: {
          estadoAnterior: existente.estado, estadoNuevo: cambios.estado,
        },
      });
    }
    if (camposEditados.length > 0 || cambioVinculos) {
      const detalle = {};
      camposEditados.forEach((campo) => {
        detalle[campo] = {anterior: existente[campo], nuevo: cambios[campo]};
      });
      if (cambioVinculos) detalle.vinculos = plan.resumen;
      await bitacoraLogger.registrarEvento({
        mandanteId,
        entidad: "requerimiento",
        entidadId: id,
        accion: "actualizado",
        actor,
        detalle,
      });
    }

    // "Requiere vencimiento" se propaga a las instancias de los Expedientes
    // abiertos (mejor esfuerzo: el catálogo ya quedó guardado). Corre cada
    // vez que se envía el campo, aunque no cambie: solo toca las instancias
    // que difieren, así que volver a guardar repara las desalineadas.
    if (cambios.requiereVencimiento !== undefined) {
      try {
        await require("./expedienteRequerimientoService")
            .propagarRequiereVencimiento(id, cambios.requiereVencimiento);
      } catch (err) {
        console.error(
            `Error al propagar el vencimiento del Requerimiento ${id}:`, err,
        );
      }
    }

    // Expedientes abiertos: los de los Perfiles con cambios de vínculos y,
    // si cambió el estado, los de todos los Perfiles donde aplica.
    const afectados = new Map(plan ? plan.afectados : []);
    if (cambioEstado) {
      [
        ...activosActuales.map((v) => v.perfilParticipacionId),
        ...aplicabilidad.perfilParticipacionIds,
      ].forEach((ppId) => {
        if (!afectados.has(ppId)) afectados.set(ppId, new Set());
        afectados.get(ppId).add(id);
      });
    }
    await perfilRequerimientoService.sincronizarExpedientes(afectados, actor);

    return {...final, aplicabilidad};
  }
}

module.exports = new RequerimientoService();
module.exports.TIPOS_ENTIDAD_OPCIONES = TIPOS_ENTIDAD_OPCIONES;
