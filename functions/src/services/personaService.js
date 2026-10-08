const admin = require("firebase-admin");
const {FieldValue} = require("firebase-admin/firestore");
const personaRepository = require("../repositories/personaRepository");
const empresaRepository = require("../repositories/empresaRepository");
const proyectoRepository = require("../repositories/proyectoRepository");
const mandanteRepository = require("../repositories/mandanteRepository");
const participacionPersonaService =
    require("./participacionPersonaService");
const perfilRecursoRepository =
    require("../repositories/perfilRecursoRepository");
const {agruparSujetos} = require("../utils/sujetosParticipacion");
const empresaPersonaService = require("./empresaPersonaService");
const empresaPersonaRepository =
    require("../repositories/empresaPersonaRepository");
const bitacoraLogger = require("../utils/bitacoraLogger");
const {
  empresaIdsVisibles, sujetoIdsVisibles, puedeVerSujeto,
} = require("../utils/alcanceMandante");
const {
  validarIdentificacion, claveIdentificacion,
} = require("../utils/identificacionValidator");
const bitacoraService = require("./bitacoraService");
const participacionPersonaRepository =
    require("../repositories/participacionPersonaRepository");
const AppError = require("../utils/AppError");
const {getMandanteDisplayName} = require("../utils/mandanteDisplay");

const db = admin.firestore();
const IDENTIFICACION_COLLECTION = "personasIdentificacion";

const ESTADOS_VALIDOS = ["activo", "inactivo"];
// Código gRPC de Firestore cuando `create` encuentra el documento ya creado.
const ALREADY_EXISTS = 6;

/**
 * Reglas de negocio para el recurso Persona (catálogo global, sin
 * mandanteId). Su vínculo con una Empresa vive SOLO en empresaPersonas
 * (bloque 3): "empresa actual" y "cargo actual" se derivan siempre de la
 * relación activa y nunca se guardan en la Persona. Visibilidad por
 * Mandante en utils/alcanceMandante.js. Sus Perfiles de Recurso en un
 * proyecto viven en participacionPersonas (RN-044).
 */
class PersonaService {
  /**
   * Obtiene una persona por su ID (documento tal cual). Con `actor`,
   * respeta su alcance: fuera de él responde 404.
   * @param {string} id ID de la persona.
   * @param {?Object} [actor] Usuario autenticado.
   * @return {Promise<Object>} La persona encontrada.
   */
  async getPersonaById(id, actor = null) {
    if (!id || typeof id !== "string") {
      throw new AppError(400, "ID de persona inválido.");
    }
    const persona = await personaRepository.getById(id);
    if (!persona || (actor && !(await puedeVerSujeto(actor, "persona", id)))) {
      throw new AppError(404, "Persona no encontrada.");
    }
    return persona;
  }

  /**
   * "Empresa actual" de una relación activa, en la forma que consume la
   * API (con el nombre de la Empresa). null si no hay relación o si la
   * Empresa está fuera del alcance del actor.
   * @param {?Object} relacion Relación activa.
   * @param {?Set<string>} visibles Empresas visibles (null = todas).
   * @param {Object<string, Object>} empresas Cache id -> Empresa.
   * @return {?Object} Empresa y cargo actuales.
   */
  _empresaActual(relacion, visibles, empresas) {
    if (!relacion || (visibles && !visibles.has(relacion.empresaId))) {
      return null;
    }
    return {
      relacionId: relacion.id,
      empresaId: relacion.empresaId,
      empresaNombre: empresas[relacion.empresaId]?.razonSocial || null,
      cargo: relacion.cargo || null,
      tipoRelacion: relacion.tipoRelacion || null,
      tipoContrato: relacion.tipoContrato || null,
      jornada: relacion.jornada || null,
      fechaInicio: relacion.fechaInicio || null,
    };
  }

  /**
   * Carga Empresas por ID (cache simple).
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
   * Persona con su empresa y cargo actuales derivados (visibles para el
   * actor).
   * @param {string} id ID de la persona.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object>} Persona con `empresaActual`.
   */
  async obtenerPersona(id, actor) {
    const persona = await this.getPersonaById(id, actor);
    const [relacion, visibles] = await Promise.all([
      empresaPersonaRepository.getActivaBySujeto(id),
      empresaIdsVisibles(actor),
    ]);
    const empresas = await this._empresasPorId([relacion?.empresaId]);
    return {
      ...persona,
      empresaActual: this._empresaActual(relacion, visibles, empresas),
    };
  }

  /**
   * Lista personas visibles para el actor, con su empresa y cargo actuales
   * (derivados de la relación activa). Con `empresaId`, solo las que
   * tienen relación ACTIVA con esa Empresa.
   * @param {{estado: (string|undefined), empresaId: (string|undefined)}}
   *     filtros Filtros de búsqueda.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object[]>} Lista de personas.
   */
  async listarPersonas(filtros, actor) {
    const {estado, empresaId} = filtros || {};
    const [personas, sujetosVisibles, empresasVisibles, activas] =
        await Promise.all([
          personaRepository.list({estado}),
          sujetoIdsVisibles(actor, "persona"),
          empresaIdsVisibles(actor),
          empresaPersonaRepository.listActivas(),
        ]);
    const activaPorPersona = new Map(activas.map((r) => [r.personaId, r]));
    const empresas = await this._empresasPorId(activas.map((r) => r.empresaId));
    return personas
        .filter((p) => !sujetosVisibles || sujetosVisibles.has(p.id))
        .filter((p) => !empresaId ||
          activaPorPersona.get(p.id)?.empresaId === empresaId)
        .map((p) => ({
          ...p,
          empresaActual: this._empresaActual(
              activaPorPersona.get(p.id), empresasVisibles, empresas,
          ),
        }));
  }

  /**
   * Error 409 IDENTIFICACION_EXISTENTE. Devuelve SOLO lo necesario para
   * ofrecer crear la relación: el id, nombre, apellido e identificación de
   * la Persona existente (nunca su empresa, cargo ni historial, que pueden
   * estar fuera del alcance del actor). Se arma después del intento de alta
   * fallido, fuera de cualquier transacción.
   * @param {string} clave Clave del índice personasIdentificacion.
   * @param {Object} identificacion Identificación pedida.
   * @return {Promise<AppError>} El error a lanzar.
   */
  async _errorIdentificacionExistente(clave, identificacion) {
    const indice = await db.collection(IDENTIFICACION_COLLECTION)
        .doc(clave).get();
    const personaId = indice.data()?.personaId || null;
    const existente = personaId ?
        await personaRepository.getById(personaId) : null;
    const etiquetaTipo = identificacion.tipo === "RUT" ? "RUT" : "Pasaporte";
    return new AppError(
        409,
        "DUPLICADO: ya existe una Persona registrada con este " +
        `${etiquetaTipo} (${identificacion.numero}).`,
        {
          codigo: "IDENTIFICACION_EXISTENTE",
          detalle: {
            personaId,
            nombre: existente?.nombre || null,
            apellido: existente?.apellido || null,
            identificacion: existente?.identificacion || identificacion,
          },
        },
    );
  }

  /**
   * Crea una Persona junto con su índice de unicidad de identificación
   * (personasIdentificacion, RN-040) y su relación laboral inicial
   * (empresaPersonas), los tres en UNA escritura atómica. Si la identificación
   * ya existe responde 409 con código IDENTIFICACION_EXISTENTE y la
   * Persona existente, para ofrecer crearle la relación con la Empresa
   * elegida en vez de duplicarla.
   * @param {Object} payload `identificacion` (o `rut`), nombre,
   *     apellido, empresaId y los campos de la relación (cargo obligatorio;
   *     tipoRelacion, tipoContrato, jornada, fechaInicio opcionales).
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object>} La persona creada, con `empresaActual`.
   */
  async crearPersona(payload, actor) {
    const {nombre, apellido, empresaId, estado} = payload;
    if (!nombre || !apellido || !empresaId) {
      throw new AppError(
          400,
          "Faltan campos obligatorios: 'empresaId', 'nombre' y 'apellido' " +
          "son requeridos.",
      );
    }
    const identificacionEntrada = payload.identificacion ||
        (payload.rut ?
            {tipo: "RUT", numero: payload.rut, pais: "Chile"} : null);
    if (!identificacionEntrada) {
      throw new AppError(
          400,
          "Falta la identificación de la persona ('identificacion' o 'rut').",
      );
    }
    const identificacion = validarIdentificacion(identificacionEntrada);
    await empresaPersonaService.validarEmpresa(empresaId, actor);
    const campos = empresaPersonaService.camposRelacion(payload, false);
    const fechaInicio = payload.fechaInicio ?
        new Date(payload.fechaInicio) : new Date();
    if (isNaN(fechaInicio.getTime())) {
      throw new AppError(400, "fechaInicio no es una fecha válida.");
    }

    const estadoFinal = estado || "activo";
    if (!ESTADOS_VALIDOS.includes(estadoFinal)) {
      throw new AppError(
          400,
          `Estado '${estadoFinal}' no válido. ` +
          `Valores permitidos: ${ESTADOS_VALIDOS.join(", ")}.`,
      );
    }

    const clave = claveIdentificacion(identificacion);
    const refIndice = db.collection(IDENTIFICACION_COLLECTION).doc(clave);
    const refPersona = db.collection(personaRepository.COLLECTION).doc();
    const datosPersona = {
      identificacion,
      // Copia del RUT para búsquedas y fichas que leen `rut` directo (null
      // para Pasaporte).
      rut: identificacion.tipo === "RUT" ? identificacion.numero : null,
      nombre: nombre.trim(),
      apellido: apellido.trim(),
      estado: estadoFinal,
    };
    const relacion = empresaPersonaService.prepararAlta(
        refPersona.id, empresaId, campos, fechaInicio,
    );

    // Escritura atómica SIN lecturas previas (mismo criterio que el alta de
    // Empresa): `create` del índice falla con ALREADY_EXISTS si la
    // identificación ya está tomada y entonces no se escribe nada.
    const lote = db.batch();
    lote.create(refIndice, {
      personaId: refPersona.id,
      createdAt: FieldValue.serverTimestamp(),
    });
    lote.set(refPersona, {
      ...datosPersona,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    lote.set(relacion.ref, relacion.data);
    try {
      await lote.commit();
    } catch (err) {
      if (err.code !== ALREADY_EXISTS) throw err;
      throw await this._errorIdentificacionExistente(clave, identificacion);
    }

    await bitacoraLogger.registrarEvento({
      mandanteId: actor?.mandanteId || null,
      entidad: "persona",
      entidadId: refPersona.id,
      accion: "creado",
      actor,
      detalle: {empresaId, relacionId: relacion.ref.id},
    });
    return this.obtenerPersona(refPersona.id, actor);
  }

  /**
   * Actualiza la identidad de una Persona (nombre, apellido, estado). La
   * identificación no se edita después de creada, salvo superadmin (mueve
   * el índice de unicidad en una transacción). La Empresa se cambia por
   * empresaPersonaService (cambiar empresa / terminar relación).
   * @param {string} id ID de la persona.
   * @param {Object} payload Campos a actualizar.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object|null>} La persona actualizada.
   */
  async actualizarPersona(id, payload, actor) {
    const existente = await this.getPersonaById(id, actor);
    if (existente.anonimizada === true) {
      throw new AppError(
          409, "La Persona fue anonimizada: sus datos ya no se pueden editar.",
      );
    }

    const allowedFields = ["nombre", "apellido", "estado"];
    const updateData = {};
    for (const key of allowedFields) {
      if (payload[key] !== undefined) {
        updateData[key] = payload[key];
      }
    }

    const nuevaIdentificacion = payload.identificacion ||
        (payload.rut ? {tipo: "RUT", numero: payload.rut, pais: "Chile"} :
          null);
    if (nuevaIdentificacion) {
      const validada = validarIdentificacion(nuevaIdentificacion);
      const anterior = existente.identificacion ?
          claveIdentificacion(existente.identificacion) : null;
      if (claveIdentificacion(validada) !== anterior) {
        if (actor.rol !== "superadmin") {
          throw new AppError(
              403, "La identificación de la Persona no se puede modificar.",
          );
        }
        await this._cambiarIdentificacion(id, anterior, validada);
      }
    }

    if (updateData.estado && !ESTADOS_VALIDOS.includes(updateData.estado)) {
      throw new AppError(400, `Estado '${updateData.estado}' no válido.`);
    }
    if (updateData.nombre) updateData.nombre = updateData.nombre.trim();
    if (updateData.apellido) {
      updateData.apellido = updateData.apellido.trim();
    }
    if (Object.keys(updateData).length > 0) {
      await personaRepository.update(id, updateData);
    }
    return this.obtenerPersona(id, actor);
  }

  /**
   * Cambia la identificación (solo superadmin) moviendo el índice de
   * unicidad en una transacción; rechaza si la nueva ya existe.
   * @param {string} id ID de la persona.
   * @param {?string} claveAnterior Clave del índice actual.
   * @param {Object} identificacion Identificación nueva validada.
   * @return {Promise<void>}
   */
  async _cambiarIdentificacion(id, claveAnterior, identificacion) {
    const refNueva = db.collection(IDENTIFICACION_COLLECTION)
        .doc(claveIdentificacion(identificacion));
    await db.runTransaction(async (tx) => {
      const ocupada = await tx.get(refNueva);
      if (ocupada.exists && ocupada.data().personaId !== id) {
        throw new AppError(
            409, "Ya existe otra Persona con esa identificación.",
        );
      }
      tx.set(refNueva, {
        personaId: id, createdAt: FieldValue.serverTimestamp(),
      });
      if (claveAnterior) {
        tx.delete(db.collection(IDENTIFICACION_COLLECTION).doc(claveAnterior));
      }
      tx.update(db.collection(personaRepository.COLLECTION).doc(id), {
        identificacion,
        rut: identificacion.tipo === "RUT" ? identificacion.numero : null,
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
  }

  /**
   * Desactiva una persona existente.
   * @param {string} id ID de la persona.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object|null>} La persona desactivada.
   */
  async desactivarPersona(id, actor) {
    await this.getPersonaById(id, actor);
    return await personaRepository.setEstado(id, "inactivo");
  }

  /**
   * Calcula el resumen de una Persona: sus Participaciones activas actuales
   * (Proyecto y Perfiles de Recurso), respetando el alcance del actor. Los
   * perfiles viven en participacionPersonas (por ID), nunca en Persona
   * (RN-044); el nombre se resuelve aquí en tiempo real.
   * @param {string} id ID de la persona.
   * @param {Object} actor Usuario autenticado que ejecuta la acción.
   * @return {Promise<{participacionesActivas: Object[]}>} El resumen
   *     calculado: una fila por Participación, con `perfilRecursoIds` y
   *     `perfilesRecurso` ({id, nombre}).
   */
  async obtenerResumen(id, actor) {
    await this.getPersonaById(id, actor); // Existencia y alcance

    const docs = await participacionPersonaService.listar(
        {personaId: id, estado: "activa"}, actor,
    );
    const sujetos = agruparSujetos(docs, []);
    const perfiles = await perfilRecursoRepository.getByIds(
        sujetos.flatMap((s) => s.perfilRecursoIds),
    );

    // Mandante del Proyecto — misma cache local que empresaService.
    // obtenerResumen usa para no repetir la misma consulta si dos
    // Proyectos activos comparten Mandante.
    const mandanteCache = {};
    const participacionesActivas = await Promise.all(
        sujetos.map(async (a) => {
          const proyecto = await proyectoRepository.getById(a.proyectoId);
          let mandante = null;
          if (proyecto?.mandanteId) {
            if (!(proyecto.mandanteId in mandanteCache)) {
              mandanteCache[proyecto.mandanteId] =
                  await mandanteRepository.getById(proyecto.mandanteId);
            }
            mandante = mandanteCache[proyecto.mandanteId];
          }
          return {
            participacionId: a.participacionId,
            proyectoId: a.proyectoId,
            empresaId: a.empresaId,
            proyectoNombre: proyecto?.nombre || a.proyectoId,
            perfilRecursoIds: a.perfilRecursoIds,
            perfilesRecurso: a.perfilRecursoIds.map((pid) => ({
              id: pid, nombre: perfiles[pid]?.nombre || pid,
            })),
            fechaInicio: a.fechaInicio,
            mandanteId: proyecto?.mandanteId || null,
            mandanteNombre: getMandanteDisplayName(mandante) || null,
            mandanteLogoUrl: mandante?.logoUrl || null,
          };
        }),
    );

    return {participacionesActivas};
  }

  /**
   * Eventos de Bitácora relacionados a una Persona: los propios, los de sus
   * documentos de participación (cualquier estado) y los de las Participaciones
   * a las que
   * esos documentos pertenecen. Solo lectura, solo datos reales de
   * Bitácora.
   * @param {string} id ID de una Persona.
   * @param {Object} actor Usuario autenticado que ejecuta la acción.
   * @param {{limit: (string|number|undefined)}} [opciones] Máximo de
   *     eventos (por defecto 15, tope 500).
   * @return {Promise<Object[]>} Eventos, más reciente primero.
   */
  async obtenerEventos(id, actor, {limit} = {}) {
    await this.getPersonaById(id, actor); // Existencia y alcance

    const documentos =
        await participacionPersonaRepository.list({personaId: id});
    const participacionIds = [
      ...new Set(documentos.map((a) => a.participacionId).filter(Boolean)),
    ];

    // Una consulta por referencia: se acota a los documentos más
    // recientes (el repositorio las devuelve de más nueva a más antigua).
    const MAX_DOCUMENTOS = 30;
    const referencias = [
      {entidad: "persona", entidadId: id},
      ...documentos.slice(0, MAX_DOCUMENTOS).map((a) => ({
        entidad: "participacionPersona", entidadId: a.id,
      })),
      ...participacionIds.map((pid) => ({
        entidad: "participacion", entidadId: pid,
      })),
    ];

    return bitacoraService.listarPorReferencias(referencias, actor, {limit});
  }
}

module.exports = new PersonaService();
