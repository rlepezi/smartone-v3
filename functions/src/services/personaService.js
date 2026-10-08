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
const relacionLaboralService = require("./relacionLaboralService");
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

/**
 * Reglas de negocio para el recurso Persona.
 * Catálogo global, sin mandanteId ni lógica de alcance por actor — el
 * control de acceso es enteramente por rol a nivel de ruta (ver
 * personaRoutes.js). No incluye rol (sus Perfiles de Recurso pertenecen a la
 * participación en un
 * proyecto, RN-044) ni contacto. El vínculo laboral con una Empresa
 * (cargo, tipo de contrato, etc.) vive en RelaciónLaboral (entidad 17,
 * ver decisions.md) — acá solo se denormalizan `empresaId`/
 * `empresaActivaId`/`cargoActivo` de la relación activa, mantenidos
 * exclusivamente por relacionLaboralService (nunca editables directo vía
 * actualizarPersona).
 */
class PersonaService {
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
   * Obtiene una persona por su ID.
   * @param {string} id ID de la persona.
   * @return {Promise<Object>} La persona encontrada.
   */
  async getPersonaById(id) {
    if (!id || typeof id !== "string") {
      throw new AppError(400, "ID de persona inválido.");
    }
    const persona = await personaRepository.getById(id);
    if (!persona) {
      throw new AppError(404, "Persona no encontrada.");
    }
    return persona;
  }

  /**
   * Lista personas, opcionalmente filtradas por estado y/o empresa.
   * @param {Object} filtros Filtros de búsqueda.
   * @return {Promise<Object[]>} Lista de personas.
   */
  async listarPersonas(filtros) {
    return await personaRepository.list(filtros);
  }

  /**
   * Crea una nueva persona junto con su RelaciónLaboral inicial (RN-041b:
   * toda Persona necesita una relación laboral activa desde su creación,
   * no puede quedar "huérfana" de Empresa) y su índice de unicidad de
   * identificación (personasIdentificacion — RN-040, único por
   * tipo+país+número). La creación de la Persona + su índice SÍ es una
   * transacción atómica (a diferencia de antes, que solo verificaba
   * duplicado con una lectura previa no atómica): el ID de Persona se
   * pre-genera para poder escribir ambos documentos dentro de la misma
   * transacción. La RelaciónLaboral se sigue creando después, aparte —
   * mismo trade-off ya aceptado en el resto del sistema para esa segunda
   * escritura no-transaccional.
   * @param {Object} payload Datos de la nueva persona: `identificacion`
   *     ({tipo, numero, pais}) — o, por compatibilidad con llamadores que
   *     todavía no migraron, `rut` plano (se interpreta como
   *     {tipo:"RUT", pais:"Chile"}) — más nombre, apellido, empresaId, y
   *     los de su relación laboral inicial (tipoRelacion/tipoContrato
   *     opcionales desde que el modal rápido del wizard dejó de
   *     pedirlos — "completar después"; cargo sigue siendo obligatorio).
   * @return {Promise<Object>} La persona creada.
   */
  async crearPersona(payload) {
    const {
      nombre, apellido, empresaId, estado,
      tipoRelacion, cargo, tipoContrato, jornada, fechaInicio,
    } = payload;

    if (!nombre || !apellido || !empresaId) {
      throw new AppError(
          400,
          "Faltan campos obligatorios: 'nombre', 'apellido' y " +
          "'empresaId' son requeridos.",
      );
    }

    // Compatibilidad hacia atrás: formularios que todavía envían `rut`
    // plano (ej. PersonaFormPage.jsx, no migrado en esta pasada) siguen
    // funcionando igual que antes, armando `identificacion` internamente.
    const identificacionEntrada = payload.identificacion ||
        (payload.rut ?
            {tipo: "RUT", numero: payload.rut, pais: "Chile"} : null);
    if (!identificacionEntrada) {
      throw new AppError(
          400,
          "Falta la identificación de la persona " +
          "('identificacion' o 'rut').",
      );
    }
    const identificacion = validarIdentificacion(identificacionEntrada);

    await this._validarEmpresaActiva(empresaId);

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
      // Se sigue poblando para identificaciones tipo RUT: todo el resto
      // del sistema (búsquedas, fichas, exportables) todavía lee `rut`
      // directo — queda null para Pasaporte, una persona extranjera
      // genuinamente no tiene RUT (esas pantallas se actualizarán en una
      // pasada aparte para mostrar `identificacion` en vez de solo `rut`).
      rut: identificacion.tipo === "RUT" ? identificacion.numero : null,
      nombre: nombre.trim(),
      apellido: apellido.trim(),
      empresaId,
      empresaActivaId: empresaId,
      cargoActivo: cargo ? cargo.trim() : null,
      estado: estadoFinal,
    };

    await db.runTransaction(async (tx) => {
      const indiceExistente = await tx.get(refIndice);
      if (indiceExistente.exists) {
        const etiquetaTipo =
            identificacion.tipo === "RUT" ? "RUT" : "Pasaporte";
        throw new AppError(
            409,
            `DUPLICADO: ya existe una Persona registrada con este ` +
            `${etiquetaTipo} (${identificacion.numero}).`,
        );
      }
      tx.set(refPersona, {
        ...datosPersona,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      tx.set(refIndice, {
        personaId: refPersona.id,
        createdAt: FieldValue.serverTimestamp(),
      });
    });

    const creada = {id: refPersona.id, ...datosPersona};

    // Si la validación de campos de la relación falla acá, la Persona ya
    // quedó creada (mismo trade-off aceptado en el resto del sistema para
    // operaciones no-transaccionales de dos pasos) — se propaga el error
    // igual para que el cliente sepa que algo quedó incompleto.
    await relacionLaboralService.crearRelacionInicial(creada.id, {
      empresaId, tipoRelacion, cargo, tipoContrato, jornada, fechaInicio,
    });

    return creada;
  }

  /**
   * Actualiza los campos editables de identidad de una persona existente.
   * `empresaId`/`empresaActivaId`/`cargoActivo` quedan deliberadamente
   * fuera de `allowedFields`: el vínculo laboral con una Empresa ya NO se
   * edita acá — solo a través de
   * relacionLaboralService.cambiarEmpresa (RN-063).
   * @param {string} id ID de la persona.
   * @param {Object} payload Campos a actualizar.
   * @return {Promise<Object|null>} La persona actualizada.
   */
  async actualizarPersona(id, payload) {
    const existente = await this.getPersonaById(id); // Verifica existencia
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

    // El RUT no puede cambiarse directamente por este método.
    if (payload.rut) {
      throw new AppError(
          400,
          "El RUT de la Persona no puede ser modificado directamente.",
      );
    }

    if (updateData.estado && !ESTADOS_VALIDOS.includes(updateData.estado)) {
      throw new AppError(400, `Estado '${updateData.estado}' no válido.`);
    }

    if (updateData.nombre) updateData.nombre = updateData.nombre.trim();
    if (updateData.apellido) {
      updateData.apellido = updateData.apellido.trim();
    }

    return await personaRepository.update(id, updateData);
  }

  /**
   * Desactiva una persona existente.
   * @param {string} id ID de la persona.
   * @return {Promise<Object|null>} La persona desactivada.
   */
  async desactivarPersona(id) {
    await this.getPersonaById(id);
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
    await this.getPersonaById(id); // Verifica existencia

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
    await this.getPersonaById(id); // Verifica existencia

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
