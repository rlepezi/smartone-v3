const participacionRepository =
    require("../repositories/participacionRepository");
const proyectoRepository = require("../repositories/proyectoRepository");
const empresaRepository = require("../repositories/empresaRepository");
const perfilParticipacionRepository =
    require("../repositories/perfilParticipacionRepository");
const expedienteRepository = require("../repositories/expedienteRepository");
const bitacoraService = require("./bitacoraService");
const bitacoraLogger = require("../utils/bitacoraLogger");
const AppError = require("../utils/AppError");

const ESTADOS_TERMINALES_PROYECTO = ["finalizado", "archivado"];

// Ampliación de la máquina de estados (Doc 3, sección 9). El estado por
// defecto al crear sigue siendo "activa" — no se cambia ese
// comportamiento. "finalizada" sigue siendo terminal.
const ESTADOS_VALIDOS = ["pendiente", "activa", "suspendida", "finalizada"];
const TRANSICIONES_VALIDAS = {
  pendiente: ["activa", "finalizada"],
  activa: ["suspendida", "finalizada"],
  suspendida: ["activa", "finalizada"],
  finalizada: [],
};

// Roles cuyo acceso queda siempre acotado a su propio mandanteId (mismo
// criterio que proyectoService.js). evaluador NO está acá.
const ROLES_ALCANCE_FORZADO = ["mandante_admin", "mandante_lector"];

/**
 * Reglas de negocio para el recurso Participación: vincula una Empresa con
 * un Proyecto bajo un Perfil de Participación. El mandanteId del documento
 * se DERIVA siempre del Proyecto referenciado — nunca se lee del payload
 * del cliente.
 */
class ParticipacionService {
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
   * Obtiene una participación por su ID, respetando el alcance del actor.
   * @param {string} id ID de la participación.
   * @param {Object} actor Usuario autenticado que ejecuta la acción.
   * @return {Promise<Object>} La participación encontrada.
   */
  async getParticipacionById(id, actor) {
    if (!id || typeof id !== "string") {
      throw new AppError(400, "ID de participación inválido.");
    }
    const participacion = await participacionRepository.getById(id);
    if (!participacion) {
      throw new AppError(404, "Participación no encontrada.");
    }
    if (
      ROLES_ALCANCE_FORZADO.includes(actor.rol) &&
      participacion.mandanteId !== actor.mandanteId
    ) {
      throw new AppError(404, "Participación no encontrada.");
    }
    return participacion;
  }

  /**
   * Eventos recientes de Bitácora de una Participación y de sus Expedientes.
   * Mismo mecanismo compartido (listarPorReferencias) que Proyecto, Empresa,
   * Persona, Recurso y Expediente. Solo lectura, datos reales.
   * @param {string} id ID de la participación.
   * @param {Object} actor Usuario autenticado que ejecuta la acción.
   * @param {{limit: (string|number|undefined)}} [opciones] Máximo de
   *     eventos (por defecto 15, tope 500).
   * @return {Promise<Object[]>} Eventos, más reciente primero.
   */
  async obtenerEventos(id, actor, {limit} = {}) {
    await this.getParticipacionById(id, actor);
    const expedientes = await expedienteRepository.getByParticipacion(id);
    const referencias = [
      {entidad: "participacion", entidadId: id},
      ...expedientes.map((e) => ({entidad: "expediente", entidadId: e.id})),
    ];
    return bitacoraService.listarPorReferencias(referencias, actor, {limit});
  }

  /**
   * Lista participaciones, forzando el alcance del actor cuando
   * corresponde.
   * @param {Object} filtros Filtros de búsqueda.
   * @param {Object} actor Usuario autenticado que ejecuta la acción.
   * @return {Promise<Object[]>} Lista de participaciones.
   */
  async listarParticipaciones(filtros, actor) {
    const filtrosFinales = {...filtros};
    if (ROLES_ALCANCE_FORZADO.includes(actor.rol)) {
      filtrosFinales.mandanteId = actor.mandanteId;
      // El alcance por mandante tiene prioridad sobre cualquier otro
      // filtro por clave foránea que haya llegado en la petición.
      delete filtrosFinales.proyectoId;
      delete filtrosFinales.empresaId;
    }
    return await participacionRepository.list(filtrosFinales);
  }

  /**
   * Crea una nueva participación, derivando mandanteId del Proyecto
   * referenciado y validando las reglas cruzadas con Empresa y Perfil de
   * Participación.
   * @param {Object} payload Datos de la nueva participación.
   * @param {Object} actor Usuario autenticado que ejecuta la acción.
   * @return {Promise<Object>} La participación creada.
   */
  async crearParticipacion(payload, actor) {
    const {proyectoId, empresaId, perfilParticipacionId, fechaInicio} =
        payload;

    if (!proyectoId || !empresaId || !perfilParticipacionId || !fechaInicio) {
      throw new AppError(
          400,
          "Faltan campos obligatorios: 'proyectoId', 'empresaId', " +
          "'perfilParticipacionId' y 'fechaInicio' son requeridos.",
      );
    }

    // 1. El Proyecto debe existir y no estar en un estado terminal
    // (RN-013: un Proyecto finalizado/archivado no admite nuevas
    // Participaciones).
    const proyecto = await proyectoRepository.getById(proyectoId);
    if (!proyecto) {
      throw new AppError(400, "El Proyecto indicado no existe.");
    }
    if (ESTADOS_TERMINALES_PROYECTO.includes(proyecto.estado)) {
      throw new AppError(
          409,
          "El Proyecto indicado está finalizado o archivado y no admite " +
          "nuevas Participaciones.",
      );
    }

    // Alcance del actor: un mandante_admin/mandante_lector solo puede
    // crear Participaciones sobre Proyectos de su propio Mandante. Este
    // chequeo corre ANTES de las validaciones de negocio (Empresa/Perfil/
    // unicidad), tal como fue especificado.
    if (
      ROLES_ALCANCE_FORZADO.includes(actor.rol) &&
      proyecto.mandanteId !== actor.mandanteId
    ) {
      throw new AppError(
          403,
          "No tiene permisos para crear participaciones en proyectos de " +
          "otro Mandante.",
      );
    }

    // mandanteId SIEMPRE se deriva del Proyecto — jamás se lee del
    // payload del cliente, ni para ignorarlo condicionalmente.
    const mandanteId = proyecto.mandanteId;

    // 2. La Empresa debe existir y estar activa.
    const empresa = await empresaRepository.getById(empresaId);
    if (!empresa) {
      throw new AppError(400, "La Empresa indicada no existe.");
    }
    if (empresa.estado !== "activo") {
      throw new AppError(400, "La Empresa indicada no está activa.");
    }

    // 3. El Perfil de Participación debe existir, pertenecer al MISMO
    // Mandante que el Proyecto, y estar activo. Se valida el mandante
    // antes que el estado para no filtrar el estado de un recurso de
    // otro Mandante ante un cliente que no debería poder verlo.
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

    // 4. Unicidad: una Empresa no puede tener dos Participaciones activas
    // simultáneas en el mismo Proyecto.
    const duplicado = await participacionRepository.getActivaByProyectoYEmpresa(
        proyectoId, empresaId,
    );
    if (duplicado) {
      throw new AppError(
          409,
          "Ya existe una Participación activa para esta Empresa en este " +
          "Proyecto.",
      );
    }

    const fechaInicioDate = this._parseFecha(fechaInicio, "fechaInicio");
    let fechaTerminoDate = null;
    if (payload.fechaTermino) {
      fechaTerminoDate = this._parseFecha(payload.fechaTermino, "fechaTermino");
      if (fechaTerminoDate < fechaInicioDate) {
        throw new AppError(
            400, "fechaTermino no puede ser anterior a fechaInicio.",
        );
      }
    }

    // 5. Guardar con el mandanteId derivado.
    const nuevaParticipacion = {
      proyectoId,
      empresaId,
      perfilParticipacionId,
      mandanteId,
      estado: "activa",
      fechaInicio: fechaInicioDate,
      fechaTermino: fechaTerminoDate,
    };

    const participacionCreada = await participacionRepository.create(
        nuevaParticipacion,
    );

    await bitacoraLogger.registrarEvento({
      mandanteId,
      entidad: "participacion",
      entidadId: participacionCreada.id,
      accion: "creado",
      actor,
      detalle: {proyectoId, empresaId, perfilParticipacionId},
    });

    return participacionCreada;
  }

  /**
   * Transiciona el estado de una participación, validando contra el mapa
   * explícito de transiciones permitidas (TRANSICIONES_VALIDAS).
   * "finalizada" es terminal: no admite reversión ni edición de ningún
   * otro campo. `fechaTermino` solo se completa/valida cuando se
   * transiciona específicamente a "finalizada" (mismo criterio que ya
   * tenía la extinta `finalizarParticipacion`).
   * @param {string} id ID de la participación.
   * @param {Object} payload Payload de la petición (`estado` requerido,
   *     `fechaTermino` opcional, solo relevante si `estado` es
   *     "finalizada").
   * @param {Object} actor Usuario autenticado que ejecuta la acción.
   * @return {Promise<Object|null>} La participación actualizada.
   */
  async transicionarParticipacion(id, payload, actor) {
    const existente = await this.getParticipacionById(id, actor);
    const nuevoEstado = payload.estado;

    if (!nuevoEstado) {
      throw new AppError(400, "El campo 'estado' es requerido.");
    }
    if (!ESTADOS_VALIDOS.includes(nuevoEstado)) {
      throw new AppError(400, `Estado '${nuevoEstado}' no válido.`);
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

    if (nuevoEstado === "finalizada") {
      let fechaTerminoDate;
      if (payload.fechaTermino) {
        fechaTerminoDate =
            this._parseFecha(payload.fechaTermino, "fechaTermino");
        const fechaInicioDate = this._aFecha(existente.fechaInicio);
        if (fechaTerminoDate < fechaInicioDate) {
          throw new AppError(
              400, "fechaTermino no puede ser anterior a fechaInicio.",
          );
        }
      } else {
        fechaTerminoDate = new Date();
      }
      updateData.fechaTermino = fechaTerminoDate;
    }

    const actualizada = await participacionRepository.update(id, updateData);

    await bitacoraLogger.registrarEvento({
      mandanteId: existente.mandanteId,
      entidad: "participacion",
      entidadId: id,
      accion: "transicion_estado",
      actor,
      detalle: {
        proyectoId: existente.proyectoId,
        empresaId: existente.empresaId,
        estadoAnterior: existente.estado,
        estadoNuevo: nuevoEstado,
      },
    });

    return actualizada;
  }
}

module.exports = new ParticipacionService();
