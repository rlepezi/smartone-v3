const asignacionRepository = require("../repositories/asignacionRepository");
const proyectoRepository = require("../repositories/proyectoRepository");
const empresaRepository = require("../repositories/empresaRepository");
const participacionRepository =
    require("../repositories/participacionRepository");
const personaRepository = require("../repositories/personaRepository");
const recursoRepository = require("../repositories/recursoRepository");
const perfilRecursoRepository =
    require("../repositories/perfilRecursoRepository");
const bitacoraLogger = require("../utils/bitacoraLogger");
const expedienteService = require("./expedienteService");
const AppError = require("../utils/AppError");
// TRANSICIÓN bloque 2: las Asignaciones que devuelve la API llevan
// `perfilRecursoId` resuelto, para que frontend y mobile trabajen con IDs.
const {resolverPerfilesRecurso} = require("../utils/transicionPerfilRecurso");

const ESTADOS_TERMINALES_PROYECTO = ["finalizado", "archivado"];

// Ampliación de la máquina de estados (Doc 3, sección 9). El estado por
// defecto al crear sigue siendo "activa" — no se cambia ese
// comportamiento. "finalizada" sigue siendo terminal.
const ESTADOS_VALIDOS_ASIGNACION = ["pendiente", "activa", "finalizada"];
const TRANSICIONES_VALIDAS_ASIGNACION = {
  pendiente: ["activa", "finalizada"],
  activa: ["finalizada"],
  finalizada: [],
};

// Roles cuyo acceso queda siempre acotado a su propio mandanteId (mismo
// criterio que participacionService.js). evaluador NO está acá.
const ROLES_ALCANCE_FORZADO = ["mandante_admin", "mandante_lector"];

/**
 * Reglas de negocio para el recurso Asignación: vincula una Persona o un
 * Recurso a un Proyecto, a través de la Empresa que los aporta. El
 * mandanteId del documento se DERIVA siempre del Proyecto referenciado —
 * nunca se lee del payload del cliente.
 */
class AsignacionService {
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
   * Obtiene una asignación por su ID, respetando el alcance del actor.
   * @param {string} id ID de la asignación.
   * @param {Object} actor Usuario autenticado que ejecuta la acción.
   * @return {Promise<Object>} La asignación encontrada.
   */
  async getAsignacionById(id, actor) {
    if (!id || typeof id !== "string") {
      throw new AppError(400, "ID de asignación inválido.");
    }
    const asignacion = await asignacionRepository.getById(id);
    if (!asignacion) {
      throw new AppError(404, "Asignación no encontrada.");
    }
    if (
      ROLES_ALCANCE_FORZADO.includes(actor.rol) &&
      asignacion.mandanteId !== actor.mandanteId
    ) {
      throw new AppError(404, "Asignación no encontrada.");
    }
    return (await resolverPerfilesRecurso([asignacion]))[0];
  }

  /**
   * Lista asignaciones, forzando el alcance del actor cuando corresponde.
   * @param {Object} filtros Filtros de búsqueda.
   * @param {Object} actor Usuario autenticado que ejecuta la acción.
   * @return {Promise<Object[]>} Lista de asignaciones.
   */
  async listarAsignaciones(filtros, actor) {
    const filtrosFinales = {...filtros};
    if (ROLES_ALCANCE_FORZADO.includes(actor.rol)) {
      filtrosFinales.mandanteId = actor.mandanteId;
      // El alcance por mandante tiene prioridad sobre cualquier otro
      // filtro por clave foránea que haya llegado en la petición.
      delete filtrosFinales.proyectoId;
      delete filtrosFinales.personaId;
      delete filtrosFinales.recursoId;
    }
    return await resolverPerfilesRecurso(
        await asignacionRepository.list(filtrosFinales),
    );
  }

  /**
   * Lista las asignaciones activas de un Proyecto específico, respetando
   * el alcance del actor. Usado por la vista de detalle del Proyecto
   * (separa Personas de Recursos-maquinaria en el frontend) y expone una
   * semántica más precisa que `listarAsignaciones` para este caso, que de
   * otro modo perdería el filtro por proyectoId al forzar el alcance por
   * Mandante.
   * @param {string} proyectoId ID del Proyecto.
   * @param {Object} actor Usuario autenticado que ejecuta la acción.
   * @return {Promise<Object[]>} Lista de asignaciones activas.
   */
  async listarActivasPorProyecto(proyectoId, actor) {
    const proyecto = await proyectoRepository.getById(proyectoId);
    if (!proyecto) {
      throw new AppError(404, "Proyecto no encontrado.");
    }
    if (
      ROLES_ALCANCE_FORZADO.includes(actor.rol) &&
      proyecto.mandanteId !== actor.mandanteId
    ) {
      throw new AppError(404, "Proyecto no encontrado.");
    }
    return await resolverPerfilesRecurso(
        await asignacionRepository.getActivasByProyecto(proyectoId),
    );
  }

  /**
   * Lista las asignaciones activas de una Persona (en cualquier Proyecto),
   * respetando el alcance del actor. Usado por PersonasListPage para
   * mostrar el "Rol Actual" (RN-044: el rol vive en la Asignación, no en
   * la Persona, que es catálogo global sin alcance propio) — filtrar acá
   * evita que un mandante_admin/mandante_lector vea en qué Proyecto de
   * OTRO Mandante está activa una Persona del catálogo compartido.
   * @param {string} personaId ID de la Persona.
   * @param {Object} actor Usuario autenticado que ejecuta la acción.
   * @return {Promise<Object[]>} Lista de asignaciones activas visibles
   *     para el actor.
   */
  async obtenerActivasPorPersona(personaId, actor) {
    const activas = await asignacionRepository.getActivasByPersona(
        personaId,
    );
    const visibles = ROLES_ALCANCE_FORZADO.includes(actor.rol) ?
        activas.filter((a) => a.mandanteId === actor.mandanteId) : activas;
    return await resolverPerfilesRecurso(visibles);
  }

  /**
   * Crea una nueva asignación, derivando mandanteId del Proyecto
   * referenciado y validando las reglas cruzadas con Empresa, Persona o
   * Recurso.
   * @param {Object} payload Datos de la nueva asignación.
   * @param {Object} actor Usuario autenticado que ejecuta la acción.
   * @return {Promise<Object>} La asignación creada.
   */
  async crearAsignacion(payload, actor) {
    const {proyectoId, empresaId, personaId, recursoId, rol, fechaInicio} =
        payload;

    if (!proyectoId || !empresaId || !fechaInicio) {
      throw new AppError(
          400,
          "Faltan campos obligatorios: 'proyectoId', 'empresaId' y " +
          "'fechaInicio' son requeridos.",
      );
    }

    // 3. Exactamente uno de personaId/recursoId debe venir.
    if (!personaId && !recursoId) {
      throw new AppError(
          400, "Debe indicar 'personaId' o 'recursoId' (exactamente uno).",
      );
    }
    if (personaId && recursoId) {
      throw new AppError(
          400,
          "No se puede indicar 'personaId' y 'recursoId' simultáneamente.",
      );
    }

    // 1. El Proyecto debe existir y no estar en un estado terminal
    // (RN-013: un Proyecto finalizado/archivado no admite nuevas
    // Asignaciones).
    const proyecto = await proyectoRepository.getById(proyectoId);
    if (!proyecto) {
      throw new AppError(400, "El Proyecto indicado no existe.");
    }
    if (ESTADOS_TERMINALES_PROYECTO.includes(proyecto.estado)) {
      throw new AppError(
          409,
          "El Proyecto indicado está finalizado o archivado y no admite " +
          "nuevas Asignaciones.",
      );
    }

    // Alcance del actor: un mandante_admin/mandante_lector solo puede
    // crear Asignaciones sobre Proyectos de su propio Mandante. Este
    // chequeo corre ANTES de las validaciones de negocio (Empresa/
    // Persona/Recurso/unicidad), mismo criterio que Participación.
    if (
      ROLES_ALCANCE_FORZADO.includes(actor.rol) &&
      proyecto.mandanteId !== actor.mandanteId
    ) {
      throw new AppError(
          403,
          "No tiene permisos para crear asignaciones en proyectos de " +
          "otro Mandante.",
      );
    }

    // mandanteId SIEMPRE se deriva del Proyecto — jamás se lee del
    // payload del cliente.
    const mandanteId = proyecto.mandanteId;

    // 2. La Empresa debe existir, estar activa, y tener una Participación
    // activa en este Proyecto (no tiene sentido asignar recursos de una
    // Empresa que no está participando en el Proyecto).
    const empresa = await empresaRepository.getById(empresaId);
    if (!empresa) {
      throw new AppError(400, "La Empresa indicada no existe.");
    }
    if (empresa.estado !== "activo") {
      throw new AppError(400, "La Empresa indicada no está activa.");
    }
    const participacionActiva =
        await participacionRepository.getActivaByProyectoYEmpresa(
            proyectoId, empresaId,
        );
    if (!participacionActiva) {
      throw new AppError(
          400,
          "La Empresa indicada no tiene una Participación activa en " +
          "este Proyecto.",
      );
    }

    // 4/5. Validación cruzada de Persona o Recurso contra la Empresa, y
    // del campo 'rol' (obligatorio solo para Persona, prohibido para
    // Recurso).
    if (personaId) {
      const persona = await personaRepository.getById(personaId);
      if (!persona) {
        throw new AppError(400, "La Persona indicada no existe.");
      }
      if (persona.estado !== "activo") {
        throw new AppError(400, "La Persona indicada no está activa.");
      }
      if (persona.empresaId !== empresaId) {
        throw new AppError(
            400,
            "La Persona indicada no pertenece a la Empresa de esta " +
            "Asignación.",
        );
      }
      if (!rol) {
        throw new AppError(
            400,
            "El campo 'rol' es obligatorio cuando se asigna una Persona.",
        );
      }
      // El catálogo de roles es configurable por Mandante (Perfil de
      // Recurso, tipo: "persona") — reemplaza el antiguo
      // ROLES_VALIDOS fijo. Se valida contra el mandanteId ya resuelto
      // del Proyecto, nunca contra uno enviado por el cliente.
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
      const recurso = await recursoRepository.getById(recursoId);
      if (!recurso) {
        throw new AppError(400, "El Recurso indicado no existe.");
      }
      if (recurso.estado !== "activo") {
        throw new AppError(400, "El Recurso indicado no está activo.");
      }
      if (recurso.empresaId !== empresaId) {
        throw new AppError(
            400,
            "El Recurso indicado no pertenece a la Empresa de esta " +
            "Asignación.",
        );
      }
      if (rol) {
        throw new AppError(
            400,
            "El campo 'rol' solo aplica cuando se asigna una Persona.",
        );
      }
      // Recurso es un catálogo global (sin mandanteId propio, RN-021):
      // su `tipo` no se valida contra Perfil de Recurso al crear/editar
      // el Recurso, sino recién acá, contra el Mandante del Proyecto al
      // que se lo está asignando (mismo mandanteId ya resuelto arriba).
      const perfilTipo = await perfilRecursoRepository.getActivoByNombre(
          mandanteId, "recurso", recurso.tipo,
      );
      if (!perfilTipo) {
        throw new AppError(
            400,
            `La clasificación '${recurso.tipo}' del Recurso no está ` +
            "configurada como activa para este Mandante.",
        );
      }
    }

    // 6. RN-064: no puede existir ya una Asignación activa para la misma
    // Persona/Recurso en el mismo Proyecto. Se valida en el Service,
    // nunca solo en el frontend.
    const duplicado = personaId ?
        await asignacionRepository.getActivaByPersonaYProyecto(
            personaId, proyectoId,
        ) :
        await asignacionRepository.getActivaByRecursoYProyecto(
            recursoId, proyectoId,
        );
    if (duplicado) {
      throw new AppError(
          409,
          "Ya existe una Asignación activa para esta " +
          (personaId ? "Persona" : "Recurso") + " en este Proyecto.",
      );
    }

    const fechaInicioDate = this._parseFecha(fechaInicio, "fechaInicio");
    let fechaTerminoDate = null;
    if (payload.fechaTermino) {
      fechaTerminoDate =
          this._parseFecha(payload.fechaTermino, "fechaTermino");
      if (fechaTerminoDate < fechaInicioDate) {
        throw new AppError(
            400, "fechaTermino no puede ser anterior a fechaInicio.",
        );
      }
    }

    const nuevaAsignacion = {
      proyectoId,
      empresaId,
      mandanteId,
      // Trazabilidad: a qué Participación específica queda ligada esta
      // Asignación — necesario porque una Empresa puede volver a
      // participar en el mismo Proyecto más adelante (una Participación
      // distinta, mismo proyectoId+empresaId), y sin esto las
      // Asignaciones de ambos períodos quedarían indistinguibles. No
      // reemplaza a proyectoId/empresaId como filtro principal en
      // ninguna consulta existente.
      participacionId: participacionActiva.id,
      personaId: personaId || null,
      recursoId: recursoId || null,
      rol: personaId ? rol : null,
      estado: "activa",
      fechaInicio: fechaInicioDate,
      fechaTermino: fechaTerminoDate,
    };

    const asignacionCreada = await asignacionRepository.create(
        nuevaAsignacion,
    );

    await bitacoraLogger.registrarEvento({
      mandanteId,
      entidad: "asignacion",
      entidadId: asignacionCreada.id,
      accion: "creado",
      actor,
      detalle: {proyectoId, empresaId, personaId, recursoId, rol},
    });

    // Una Asignación nueva cambia cuántos pares Requerimiento × sujeto hay
    // que evaluar en el Expediente de esa Empresa/Proyecto (estado derivado).
    await expedienteService.recalcularPorProyectoEmpresa(
        proyectoId, empresaId, actor,
    );

    return asignacionCreada;
  }

  /**
   * Transiciona el estado de una asignación, validando contra el mapa
   * explícito de transiciones permitidas
   * (TRANSICIONES_VALIDAS_ASIGNACION). "finalizada" es terminal: no
   * admite reversión ni edición de ningún otro campo. `fechaTermino`
   * solo se completa/valida cuando se transiciona específicamente a
   * "finalizada" (mismo criterio que ya tenía la extinta
   * `finalizarAsignacion`).
   * @param {string} id ID de la asignación.
   * @param {Object} payload Payload de la petición (`estado` requerido,
   *     `fechaTermino` opcional, solo relevante si `estado` es
   *     "finalizada").
   * @param {Object} actor Usuario autenticado que ejecuta la acción.
   * @return {Promise<Object|null>} La asignación actualizada.
   */
  async transicionarAsignacion(id, payload, actor) {
    const existente = await this.getAsignacionById(id, actor);
    const nuevoEstado = payload.estado;

    if (!nuevoEstado) {
      throw new AppError(400, "El campo 'estado' es requerido.");
    }
    if (!ESTADOS_VALIDOS_ASIGNACION.includes(nuevoEstado)) {
      throw new AppError(400, `Estado '${nuevoEstado}' no válido.`);
    }

    const permitidas = TRANSICIONES_VALIDAS_ASIGNACION[existente.estado] ||
        [];
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

    const actualizada = await asignacionRepository.update(id, updateData);

    await bitacoraLogger.registrarEvento({
      mandanteId: existente.mandanteId,
      entidad: "asignacion",
      entidadId: id,
      accion: "transicion_estado",
      actor,
      detalle: {
        proyectoId: existente.proyectoId,
        personaId: existente.personaId,
        recursoId: existente.recursoId,
        estadoAnterior: existente.estado,
        estadoNuevo: nuevoEstado,
      },
    });

    await expedienteService.recalcularPorProyectoEmpresa(
        existente.proyectoId, existente.empresaId, actor,
    );

    return actualizada;
  }
}

module.exports = new AsignacionService();
