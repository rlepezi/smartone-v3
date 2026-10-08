const recursoRepository = require("../repositories/recursoRepository");
const empresaRepository = require("../repositories/empresaRepository");
const perfilRecursoRepository =
    require("../repositories/perfilRecursoRepository");
const relacionRecursoService = require("./relacionRecursoService");
const bitacoraLogger = require("../utils/bitacoraLogger");
const bitacoraService = require("./bitacoraService");
const participacionRecursoRepository =
    require("../repositories/participacionRecursoRepository");
const AppError = require("../utils/AppError");

const ESTADOS_VALIDOS = ["activo", "inactivo"];
const TIPO_MAX_LENGTH = 60;

/**
 * Reglas de negocio para el recurso Recurso (maquinarias, vehículos,
 * equipos). Catálogo global, sin mandanteId ni lógica de alcance por
 * actor — el control de acceso es enteramente por rol a nivel de ruta
 * (ver recursoRoutes.js).
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
 * El vínculo con una Empresa (dueño/operador) vive en RelaciónRecurso
 * (entidad 19, ver decisions.md) — acá solo se denormalizan `empresaId`/
 * `empresaActivaId` de la relación activa, mantenidos exclusivamente por
 * relacionRecursoService (nunca editables directo vía
 * actualizarRecurso). Mismo patrón ya usado en Persona/RelaciónLaboral.
 */
class RecursoService {
  /**
   * Valida que el empresaId apunte a una Empresa existente y activa.
   * @param {string} empresaId ID de la Empresa a validar.
   * @return {Promise<void>}
   */
  async _validarEmpresaActiva(empresaId) {
    const empresa = await empresaRepository.getById(empresaId);
    if (!empresa) {
      throw new AppError(400, "La Empresa indicada no existe.");
    }
    if (empresa.estado !== "activo") {
      throw new AppError(400, "La Empresa indicada no está activa.");
    }
  }

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
   * @return {Promise<Object>} El recurso encontrado.
   */
  async getRecursoById(id) {
    if (!id || typeof id !== "string") {
      throw new AppError(400, "ID de recurso inválido.");
    }
    const recurso = await recursoRepository.getById(id);
    if (!recurso) {
      throw new AppError(404, "Recurso no encontrado.");
    }
    return recurso;
  }

  /**
   * Lista recursos, opcionalmente filtrados por estado y/o empresa.
   * @param {Object} filtros Filtros de búsqueda.
   * @return {Promise<Object[]>} Lista de recursos.
   */
  async listarRecursos(filtros) {
    return await recursoRepository.list(filtros);
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
   * Crea un nuevo recurso junto con su RelaciónRecurso inicial (RN-122:
   * todo Recurso necesita una relación activa desde su creación, no
   * puede quedar "huérfano" de Empresa). Mismo patrón que
   * personaService.crearPersona: no es una transacción multi-colección
   * porque el documento de Recurso todavía no existe al momento de
   * validar/crear — se crea primero el Recurso, y recién con su ID real
   * se crea la RelaciónRecurso.
   * @param {Object} payload Datos del nuevo recurso y de su relación
   *     inicial (empresaId, tipoRelacion, fechaInicio opcional).
   * @param {Object} actor Usuario autenticado que ejecuta la acción.
   * @return {Promise<Object>} El recurso creado.
   */
  async crearRecurso(payload, actor) {
    const {
      nombre, tipo, empresaId, estado, patente, marca, modelo, anio,
      tipoRelacion, fechaInicio,
    } = payload;

    if (!nombre || !tipo || !empresaId) {
      throw new AppError(
          400,
          "Faltan campos obligatorios: 'nombre', 'tipo' y 'empresaId' " +
          "son requeridos.",
      );
    }
    // tipoRelacion ya NO es obligatorio acá (decisión "completar
    // después", mismo criterio aplicado a Persona/cargo): el alta rápida
    // (ModalCrearRecurso, wizard de Nueva Acreditación) no lo pide. Queda
    // null hasta completarse editando la Maquinaria/RelaciónRecurso
    // después. RecursoFormPage.jsx (alta completa) sigue exigiéndolo del
    // lado del cliente. La validación estricta de "Cambiar Empresa"
    // (relacionRecursoService.cambiarEmpresa) no se toca.

    this._validarTipo(tipo);

    await this._validarEmpresaActiva(empresaId);

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
      empresaId,
      empresaActivaId: empresaId,
      estado: estadoFinal,
      patente: patente ? patente.trim() : null,
      marca: marca ? marca.trim() : null,
      modelo: modelo ? modelo.trim() : null,
      anio: anio ? Number(anio) : null,
    };

    const creado = await recursoRepository.create(nuevoRecurso);

    // Si la validación de campos de la relación falla acá, el Recurso ya
    // quedó creado (mismo trade-off aceptado en personaService para
    // operaciones no-transaccionales de dos pasos) — se propaga el error
    // igual para que el cliente sepa que algo quedó incompleto.
    await relacionRecursoService.crearRelacionInicial(creado.id, {
      empresaId, tipoRelacion, fechaInicio,
    });

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
   * `empresaId`/`empresaActivaId` quedan deliberadamente fuera de
   * `allowedFields`: el vínculo con una Empresa ya NO se edita acá —
   * solo a través de relacionRecursoService.cambiarEmpresa (RN-122).
   * @param {string} id ID del recurso.
   * @param {Object} payload Campos a actualizar.
   * @param {Object} actor Usuario autenticado que ejecuta la acción.
   * @return {Promise<Object|null>} El recurso actualizado.
   */
  async actualizarRecurso(id, payload, actor) {
    const existente = await this.getRecursoById(id);

    // La Empresa no puede cambiarse directamente por este método — se
    // rechaza explícito (en vez de ignorarlo silenciosamente) para no
    // confundir a quien todavía no sepa del nuevo flujo.
    if (
      payload.empresaId !== undefined &&
      payload.empresaId !== existente.empresaId
    ) {
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
      updateData.patente = updateData.patente ?
          updateData.patente.trim() : null;
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
    await this.getRecursoById(id); // Verifica existencia

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
