const proyectoRepository = require("../repositories/proyectoRepository");
const mandanteRepository = require("../repositories/mandanteRepository");
const participacionRepository =
    require("../repositories/participacionRepository");
const {sujetosActivosDeProyecto} = require("../utils/sujetosParticipacion");
const expedienteRepository = require("../repositories/expedienteRepository");
const bitacoraService = require("./bitacoraService");
const bitacoraLogger = require("../utils/bitacoraLogger");
const AppError = require("../utils/AppError");

const ESTADOS_VALIDOS = [
  "planificado",
  "en_ejecucion",
  "suspendido",
  "finalizado",
  "archivado",
];

// Campos de texto opcionales del Proyecto y su largo máximo. Los valores de
// los selectores (región, tipo, categoría, etc.) NO se validan contra un
// catálogo fijo — mismo criterio que Recurso.tipo: el catálogo de opciones
// vive en el frontend y puede cambiar sin tocar el backend.
const CAMPOS_TEXTO_EXTRA = {
  descripcion: 2000,
  ubicacion: 100,
  tipoProyecto: 100,
  observaciones: 500,
  categoria: 100,
  areaNegocio: 100,
  tipoContrato: 100,
  moneda: 20,
};
const CAMPOS_FECHA_EXTRA = ["fechaInicioEfectiva", "fechaTerminoReprogramada"];
const MAX_TAGS = 20;
const MAX_LARGO_TAG = 30;

// Roles cuyo acceso queda siempre acotado a su propio mandanteId. A
// diferencia de Usuario (donde solo mandante_admin tenía alcance forzado),
// aquí mandante_lector también lo tiene, y evaluador NO (lee sin
// restricción de mandante, pero no puede escribir — eso se filtra en las
// rutas, no aquí).
const ROLES_ALCANCE_FORZADO = ["mandante_admin", "mandante_lector"];

/**
 * Reglas de negocio para el recurso Proyecto.
 */
class ProyectoService {
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
   * Valida que la transición de estado solicitada sea válida.
   * @param {string} estadoActual Estado actual del proyecto.
   * @param {string} estadoNuevo Estado al que se desea transicionar.
   * @return {void}
   */
  _validarTransicionEstado(estadoActual, estadoNuevo) {
    if (!ESTADOS_VALIDOS.includes(estadoNuevo)) {
      throw new AppError(400, `Estado '${estadoNuevo}' no válido.`);
    }
    // "archivado" como estado de origen nunca llega aquí: la guardia de
    // terminalidad en actualizarProyecto ya lo intercepta antes.
    if (estadoActual === "finalizado" && estadoNuevo !== "archivado") {
      throw new AppError(
          400,
          "Desde el estado 'finalizado' solo se permite transicionar " +
          "a 'archivado'.",
      );
    }
  }

  /**
   * Normaliza y valida los campos opcionales del Proyecto (descripción,
   * ubicación, tipo, observaciones, categoría, área de negocio, tipo de
   * contrato, moneda, etiquetas y las dos fechas de cronograma). Solo
   * devuelve los que vienen en el payload; `null` o "" los vacía.
   * @param {Object} payload Payload de la petición.
   * @return {Object} Campos ya normalizados, listos para persistir.
   */
  _normalizarCamposExtra(payload) {
    const resultado = {};

    for (const [campo, largoMax] of Object.entries(CAMPOS_TEXTO_EXTRA)) {
      const valor = payload[campo];
      if (valor === undefined) continue;
      if (valor === null || valor === "") {
        resultado[campo] = null;
        continue;
      }
      if (typeof valor !== "string") {
        throw new AppError(400, `${campo} debe ser texto.`);
      }
      const limpio = valor.trim();
      if (limpio.length > largoMax) {
        throw new AppError(
            400, `${campo} no puede superar ${largoMax} caracteres.`,
        );
      }
      resultado[campo] = limpio || null;
    }

    for (const campo of CAMPOS_FECHA_EXTRA) {
      const valor = payload[campo];
      if (valor === undefined) continue;
      resultado[campo] = valor === null || valor === "" ?
          null : this._parseFecha(valor, campo);
    }

    if (payload.tags !== undefined) {
      if (payload.tags !== null && !Array.isArray(payload.tags)) {
        throw new AppError(400, "tags debe ser una lista de textos.");
      }
      const vistos = new Set();
      const tags = [];
      for (const tag of payload.tags || []) {
        if (typeof tag !== "string") {
          throw new AppError(400, "Cada etiqueta debe ser texto.");
        }
        const limpio = tag.trim();
        if (!limpio || vistos.has(limpio.toLowerCase())) continue;
        if (limpio.length > MAX_LARGO_TAG) {
          throw new AppError(
              400,
              `Cada etiqueta puede tener hasta ${MAX_LARGO_TAG} caracteres.`,
          );
        }
        vistos.add(limpio.toLowerCase());
        tags.push(limpio);
      }
      if (tags.length > MAX_TAGS) {
        throw new AppError(400, `Máximo ${MAX_TAGS} etiquetas por proyecto.`);
      }
      resultado.tags = tags;
    }

    return resultado;
  }

  /**
   * Obtiene un proyecto por su ID, respetando el alcance del actor.
   * @param {string} id ID del proyecto.
   * @param {Object} actor Usuario autenticado que ejecuta la acción.
   * @return {Promise<Object>} El proyecto encontrado.
   */
  async getProyectoById(id, actor) {
    if (!id || typeof id !== "string") {
      throw new AppError(400, "ID de proyecto inválido.");
    }
    const proyecto = await proyectoRepository.getById(id);
    if (!proyecto) {
      throw new AppError(404, "Proyecto no encontrado.");
    }
    if (
      ROLES_ALCANCE_FORZADO.includes(actor.rol) &&
      proyecto.mandanteId !== actor.mandanteId
    ) {
      throw new AppError(404, "Proyecto no encontrado.");
    }
    return proyecto;
  }

  /**
   * Lista proyectos, forzando el alcance del actor cuando corresponde.
   * @param {Object} filtros Filtros de búsqueda (mandanteId, estado).
   * @param {Object} actor Usuario autenticado que ejecuta la acción.
   * @return {Promise<Object[]>} Lista de proyectos.
   */
  async listarProyectos(filtros, actor) {
    const {empresaId, ...filtrosRepo} = filtros || {};
    if (ROLES_ALCANCE_FORZADO.includes(actor.rol)) {
      filtrosRepo.mandanteId = actor.mandanteId;
    }
    const proyectos = await proyectoRepository.list(filtrosRepo);
    if (!empresaId) return proyectos;

    // Con `empresaId` cada Proyecto trae `participacionEmpresa`: la
    // relación actual de esa Empresa con él (una sola consulta por Empresa).
    const participaciones = await participacionRepository.list({empresaId});
    const porProyecto = new Map();
    participaciones.forEach((p) => {
      if (!porProyecto.has(p.proyectoId)) porProyecto.set(p.proyectoId, []);
      porProyecto.get(p.proyectoId).push(p);
    });

    return await Promise.all(proyectos.map(async (proyecto) => {
      const relacion = await this._relacionEmpresaProyecto(
          porProyecto.get(proyecto.id) || [],
      );
      return {...proyecto, participacionEmpresa: relacion};
    }));
  }

  /**
   * Resume la relación vigente de una Empresa con un Proyecto a partir de
   * sus Participaciones. Prioridad: activa > suspendida > pendiente; sin
   * ninguna de esas (o solo finalizadas) no hay relación vigente.
   * Para una pendiente incluye su Expediente en curso, si ya tiene uno.
   * @param {object[]} participaciones Participaciones Empresa+Proyecto.
   * @return {Promise<?object>} {id, estado, perfilParticipacionId,
   *     expedienteId} o null.
   */
  async _relacionEmpresaProyecto(participaciones) {
    for (const estado of ["activa", "suspendida", "pendiente"]) {
      const p = participaciones.find((x) => x.estado === estado);
      if (!p) continue;
      let expedienteId = null;
      if (estado === "pendiente") {
        const expedientes = await expedienteRepository.getByParticipacion(
            p.id,
        );
        expedienteId =
            expedientes.find((e) => e.estado !== "cerrado")?.id || null;
      }
      return {
        id: p.id,
        estado,
        perfilParticipacionId: p.perfilParticipacionId,
        expedienteId,
      };
    }
    return null;
  }

  /**
   * Sugiere el siguiente código correlativo disponible, con formato
   * PRJ-{añoActual}-{correlativo de 3 dígitos}. El correlativo es GLOBAL
   * (entre todos los Mandantes) desde que un usuario reportó una colisión
   * real (dos Proyectos de Mandantes distintos sugiriendo/usando
   * "PRJ-2026-001") — decisión explícita, revierte el criterio anterior
   * de acotarlo por Mandante. La unicidad real de "codigo" en BD sigue
   * siendo por Mandante (ver proyectoRepository.getByCodigo): esto solo
   * hace que la SUGERENCIA nunca choque con ningún Proyecto existente,
   * sea de qué Mandante sea. Busca el máximo correlativo ya usado este
   * año en TODOS los Proyectos y le suma 1; empieza en 001 si no hay
   * ninguno.
   * @param {Object} actor Usuario autenticado que ejecuta la acción.
   * @param {?string} mandanteIdSolicitado mandanteId solicitado (ignorado
   *     para roles con alcance forzado, que siempre usan el propio) — ya
   *     no se usa para acotar la búsqueda, solo para la validación de
   *     acceso de siempre.
   * @return {Promise<string>} El código sugerido.
   */
  async sugerirSiguienteCodigo(actor, mandanteIdSolicitado) {
    const mandanteId = this._aplicarScopeActor(actor, mandanteIdSolicitado);
    if (!mandanteId) {
      throw new AppError(400, "mandanteId es obligatorio.");
    }

    const anioActual = new Date().getFullYear();
    const prefijo = `PRJ-${anioActual}-`;
    const patron = new RegExp(`^PRJ-${anioActual}-(\\d+)$`);

    const proyectos = await proyectoRepository.list({});
    const maxCorrelativo = proyectos.reduce((max, p) => {
      const match = typeof p.codigo === "string" ?
          p.codigo.match(patron) : null;
      if (!match) return max;
      return Math.max(max, parseInt(match[1], 10));
    }, 0);

    const correlativo = String(maxCorrelativo + 1).padStart(3, "0");
    return `${prefijo}${correlativo}`;
  }

  /**
   * Crea un nuevo proyecto, siempre en estado "planificado".
   * @param {Object} payload Datos del nuevo proyecto.
   * @param {Object} actor Usuario autenticado que ejecuta la acción.
   * @return {Promise<Object>} El proyecto creado.
   */
  async crearProyecto(payload, actor) {
    const {nombre, codigo, fechaInicio, fechaTermino} = payload;

    if (!nombre || !codigo || !fechaInicio) {
      throw new AppError(
          400,
          "Faltan campos obligatorios: 'nombre', 'codigo' y " +
          "'fechaInicio' son requeridos.",
      );
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

    const fechaInicioDate = this._parseFecha(fechaInicio, "fechaInicio");
    let fechaTerminoDate = null;
    if (fechaTermino) {
      fechaTerminoDate = this._parseFecha(fechaTermino, "fechaTermino");
      if (fechaTerminoDate < fechaInicioDate) {
        throw new AppError(
            400,
            "fechaTermino no puede ser anterior a fechaInicio.",
        );
      }
    }

    const duplicado = await proyectoRepository.getByCodigo(
        mandanteId, codigo,
    );
    if (duplicado) {
      throw new AppError(
          409,
          `Ya existe un proyecto con el código '${codigo}' en este ` +
          "Mandante.",
      );
    }

    const nuevoProyecto = {
      mandanteId,
      nombre: nombre.trim(),
      codigo: codigo.trim(),
      estado: "planificado",
      fechaInicio: fechaInicioDate,
      fechaTermino: fechaTerminoDate,
      ...this._normalizarCamposExtra(payload),
    };

    return await proyectoRepository.create(nuevoProyecto);
  }

  /**
   * Actualiza los campos editables de un proyecto existente.
   * @param {string} id ID del proyecto.
   * @param {Object} payload Campos a actualizar.
   * @param {Object} actor Usuario autenticado que ejecuta la acción.
   * @return {Promise<Object|null>} El proyecto actualizado.
   */
  async actualizarProyecto(id, payload, actor) {
    // getProyectoById ya aplica el alcance del actor (404 si es de otro
    // Mandante).
    const existente = await this.getProyectoById(id, actor);

    // "archivado" es terminal: bloquea cualquier edición, no solo estado.
    if (existente.estado === "archivado") {
      throw new AppError(
          400,
          "El proyecto está archivado y no puede modificarse.",
      );
    }

    // mandanteId no es editable después de creado (campo identidad, igual
    // que el RUT de Mandante o el email de Usuario).
    const allowedFields = [
      "nombre", "codigo", "estado", "fechaInicio", "fechaTermino",
      "fechaTerminoReal",
    ];
    const updateData = {};
    for (const key of allowedFields) {
      if (payload[key] !== undefined) {
        updateData[key] = payload[key];
      }
    }

    if (updateData.nombre) updateData.nombre = updateData.nombre.trim();

    Object.assign(updateData, this._normalizarCamposExtra(payload));

    if (updateData.codigo && updateData.codigo !== existente.codigo) {
      const duplicado = await proyectoRepository.getByCodigo(
          existente.mandanteId, updateData.codigo,
      );
      if (duplicado && duplicado.id !== id) {
        throw new AppError(
            409,
            `Ya existe un proyecto con el código '${updateData.codigo}' ` +
            "en este Mandante.",
        );
      }
      updateData.codigo = updateData.codigo.trim();
    }

    if (updateData.estado && updateData.estado !== existente.estado) {
      this._validarTransicionEstado(existente.estado, updateData.estado);
      // TODO: cuando exista el módulo Participación, un proyecto que
      // transicione a "finalizado" debe rechazar nuevas Participaciones
      // de Empresa, y debe cerrar automáticamente los Expedientes
      // activos asociados. Ninguna de las dos cosas se implementa aún
      // porque esas colecciones no existen todavía.
    }

    // fechaTermino solo puede tocarse si el proyecto NO estaba
    // "finalizado" antes de esta actualización (el caso "archivado" ya
    // fue rechazado arriba). Esto permite finalizar y setear
    // fechaTermino en la misma llamada, pero no tocarla después.
    if (
      updateData.fechaTermino !== undefined &&
      existente.estado === "finalizado"
    ) {
      throw new AppError(
          400,
          "fechaTermino no puede modificarse mientras el proyecto está " +
          "'finalizado'.",
      );
    }

    // fechaTerminoReal (fecha real de término, distinta de fechaTermino
    // que es la planificada) sigue el mismo candado: se puede setear en
    // la MISMA llamada que transiciona a "finalizado" (auto-completada
    // más abajo si no vino explícita), pero no tocarla en una llamada
    // posterior.
    if (
      updateData.fechaTerminoReal !== undefined &&
      existente.estado === "finalizado"
    ) {
      throw new AppError(
          400,
          "fechaTerminoReal no puede modificarse mientras el proyecto " +
          "está 'finalizado'.",
      );
    }
    if (updateData.fechaTerminoReal !== undefined) {
      updateData.fechaTerminoReal = updateData.fechaTerminoReal === null ?
          null :
          this._parseFecha(updateData.fechaTerminoReal, "fechaTerminoReal");
    }

    if (
      updateData.fechaInicio !== undefined ||
      updateData.fechaTermino !== undefined
    ) {
      let fechaInicioDate = this._aFecha(existente.fechaInicio);
      let fechaTerminoDate = this._aFecha(existente.fechaTermino);

      if (updateData.fechaInicio !== undefined) {
        fechaInicioDate = this._parseFecha(
            updateData.fechaInicio, "fechaInicio",
        );
        updateData.fechaInicio = fechaInicioDate;
      }
      if (updateData.fechaTermino !== undefined) {
        fechaTerminoDate = updateData.fechaTermino === null ?
            null : this._parseFecha(updateData.fechaTermino, "fechaTermino");
        updateData.fechaTermino = fechaTerminoDate;
      }

      if (
        fechaInicioDate && fechaTerminoDate &&
        fechaTerminoDate < fechaInicioDate
      ) {
        throw new AppError(
            400,
            "fechaTermino no puede ser anterior a fechaInicio.",
        );
      }
    }

    // La fecha de término reprogramada no puede ser anterior al inicio
    // (efectivo si lo hay, si no el planificado).
    const reprogramada = updateData.fechaTerminoReprogramada !== undefined ?
        updateData.fechaTerminoReprogramada :
        this._aFecha(existente.fechaTerminoReprogramada);
    const inicioBase =
        (updateData.fechaInicioEfectiva !== undefined ?
            updateData.fechaInicioEfectiva :
            this._aFecha(existente.fechaInicioEfectiva)) ||
        (updateData.fechaInicio !== undefined ?
            updateData.fechaInicio : this._aFecha(existente.fechaInicio));
    if (reprogramada && inicioBase && reprogramada < inicioBase) {
      throw new AppError(
          400,
          "fechaTerminoReprogramada no puede ser anterior al inicio.",
      );
    }

    const huboTransicionEstado = updateData.estado !== undefined &&
        updateData.estado !== existente.estado;
    const estadoAnterior = existente.estado;

    // Al transicionar a "finalizado" en esta misma llamada, se completa
    // fechaTerminoReal con la fecha actual si no vino explícita en el
    // payload — mismo patrón que fechaCierre en expedienteService.js.
    if (
      huboTransicionEstado &&
      updateData.estado === "finalizado" &&
      updateData.fechaTerminoReal === undefined
    ) {
      updateData.fechaTerminoReal = new Date();
    }

    const actualizado = await proyectoRepository.update(id, updateData);

    if (huboTransicionEstado) {
      await bitacoraLogger.registrarEvento({
        mandanteId: existente.mandanteId,
        entidad: "proyecto",
        entidadId: id,
        accion: "transicion_estado",
        actor,
        detalle: {
          estadoAnterior,
          estadoNuevo: updateData.estado,
          fechaTerminoReal: updateData.fechaTerminoReal || null,
        },
      });
    }

    return actualizado;
  }

  /**
   * Archiva un proyecto existente (transición terminal de estado).
   * @param {string} id ID del proyecto.
   * @param {Object} actor Usuario autenticado que ejecuta la acción.
   * @return {Promise<Object|null>} El proyecto archivado.
   */
  async archivarProyecto(id, actor) {
    return this.actualizarProyecto(id, {estado: "archivado"}, actor);
  }

  /**
   * Calcula, en una sola llamada, los contadores de Empresas participantes
   * (Participación activa), Personas y Recursos asignados (documentos
   * activa) de un Proyecto.
   * @param {string} id ID del proyecto.
   * @param {Object} actor Usuario autenticado que ejecuta la acción.
   * @return {Promise<{empresasCount: number, personasCount: number,
   *     recursosCount: number}>} Los contadores calculados.
   */
  async obtenerResumen(id, actor) {
    // getProyectoById ya aplica el alcance del actor (404 si es de otro
    // Mandante).
    await this.getProyectoById(id, actor);

    const [participaciones, sujetosActivos] = await Promise.all([
      participacionRepository.list({proyectoId: id}),
      sujetosActivosDeProyecto(id),
    ]);

    const empresasCount = participaciones.filter(
        (p) => p.estado === "activa",
    ).length;
    const personasCount = sujetosActivos.filter(
        (a) => a.personaId,
    ).length;
    const recursosCount = sujetosActivos.filter(
        (a) => a.recursoId,
    ).length;

    return {empresasCount, personasCount, recursosCount};
  }

  /**
   * Eventos de Bitácora relacionados a un Proyecto: los del propio
   * Proyecto, los de sus Participaciones (cualquier estado) y los de los
   * Expedientes de esas Participaciones. Solo lectura, solo datos reales de
   * Bitácora.
   * @param {string} id ID del proyecto.
   * @param {Object} actor Usuario autenticado que ejecuta la acción.
   * @param {{limit: (number|undefined)}} [opciones] Máximo de eventos a
   *     devolver (por defecto 15, tope 500).
   * @return {Promise<Object[]>} Eventos, más reciente primero.
   */
  async obtenerEventos(id, actor, {limit} = {}) {
    // getProyectoById ya aplica el alcance del actor (404 si es de otro
    // Mandante).
    await this.getProyectoById(id, actor);

    const participaciones = await participacionRepository.list({
      proyectoId: id,
    });
    const expedientesPorParticipacion = await Promise.all(
        participaciones.map((p) => expedienteRepository.getByParticipacion(
            p.id,
        )),
    );

    const referencias = [
      {entidad: "proyecto", entidadId: id},
      ...participaciones.map((p) => ({
        entidad: "participacion", entidadId: p.id,
      })),
      ...expedientesPorParticipacion.flat().map((e) => ({
        entidad: "expediente", entidadId: e.id,
      })),
    ];

    return bitacoraService.listarPorReferencias(referencias, actor, {limit});
  }
}

module.exports = new ProyectoService();
