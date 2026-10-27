const perfilRecursoRepository =
    require("../repositories/perfilRecursoRepository");
const mandanteRepository = require("../repositories/mandanteRepository");
const perfilParticipacionRepository =
    require("../repositories/perfilParticipacionRepository");
const perfilRequerimientoRepository =
    require("../repositories/perfilRequerimientoRepository");
const requerimientoRepository =
    require("../repositories/requerimientoRepository");
const bitacoraLogger = require("../utils/bitacoraLogger");
const {normalizarNombre} = require("../utils/nombreRequerimiento");
const AppError = require("../utils/AppError");

const ESTADOS_VALIDOS = ["activo", "inactivo"];
const TIPOS_APLICABLES_VALIDOS = ["persona", "recurso"];

// Roles cuyo acceso queda siempre acotado a su propio mandanteId (mismo
// criterio que perfilParticipacionService.js). evaluador NO está acá: lee
// sin restricción de mandante, pero no puede escribir (eso se filtra en
// las rutas).
const ROLES_ALCANCE_FORZADO = ["mandante_admin", "mandante_lector"];

/**
 * Reglas de negocio para el recurso Perfil de Recurso: catálogo
 * configurable por Mandante que reemplaza los catálogos fijos de Rol de
 * Persona y Clasificación de Maquinaria, unificados en una sola colección
 * distinguida por `tipo`.
 */
class PerfilRecursoService {
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
   * Obtiene un perfil de recurso por su ID, respetando el alcance del
   * actor.
   * @param {string} id ID del perfil.
   * @param {Object} actor Usuario autenticado que ejecuta la acción.
   * @return {Promise<Object>} El perfil encontrado.
   */
  async getPerfilById(id, actor) {
    if (!id || typeof id !== "string") {
      throw new AppError(400, "ID de perfil de recurso inválido.");
    }
    const perfil = await perfilRecursoRepository.getById(id);
    if (!perfil) {
      throw new AppError(404, "Perfil de recurso no encontrado.");
    }
    if (
      ROLES_ALCANCE_FORZADO.includes(actor.rol) &&
      perfil.mandanteId !== actor.mandanteId
    ) {
      throw new AppError(404, "Perfil de recurso no encontrado.");
    }
    return perfil;
  }

  /**
   * Lista perfiles de recurso, forzando el alcance del actor cuando
   * corresponde.
   * @param {Object} filtros Filtros de búsqueda (mandanteId,
   *     tipo, estado).
   * @param {Object} actor Usuario autenticado que ejecuta la acción.
   * @param {{incluirConteo: boolean}} [opciones] Si incluirConteo es true,
   *     cada perfil trae `cantidadRequerimientos` (ver
   *     _contarRequerimientos). Opcional para no cargar lecturas extra a
   *     los otros usos del listado (sugerencias, selectores de rol).
   * @return {Promise<Object[]>} Lista de perfiles.
   */
  async listarPerfiles(filtros, actor, {incluirConteo = false} = {}) {
    const filtrosFinales = {...filtros};
    if (ROLES_ALCANCE_FORZADO.includes(actor.rol)) {
      filtrosFinales.mandanteId = actor.mandanteId;
    }
    const perfiles = await perfilRecursoRepository.list(filtrosFinales);
    if (!incluirConteo || perfiles.length === 0) return perfiles;

    const contar = await this._contarRequerimientos(
        filtrosFinales.mandanteId || null,
    );
    return perfiles.map((p) => ({...p, cantidadRequerimientos: contar(p)}));
  }

  /**
   * Prepara el conteo de Requerimientos por Perfil de Recurso: cantidad de
   * Requerimientos ACTIVOS y DISTINTOS con al menos un vínculo
   * Perfil-Requerimiento ACTIVO, de un Perfil de Participación ACTIVO del
   * mismo Mandante, cuyo `perfilRecursoId` sea ese perfil o null ("Todos")
   * con el mismo tipo. Un Requerimiento vinculado por varios Perfiles de
   * Participación cuenta una vez.
   *
   * Tres consultas fijas, sin importar cuántos perfiles haya (sin N+1):
   * vínculos activos, Perfiles de Participación activos y Requerimientos
   * activos, con proyección. Los Requerimientos se piden por Mandante: el
   * indicado o, sin filtro (superadmin/evaluador), uno por cada Mandante
   * con Perfiles de Participación activos. El Mandante del vínculo se toma
   * de su Perfil de Participación.
   * @param {?string} mandanteId Mandante al que acotar, o null.
   * @return {Promise<function(Object): number>} Función perfil -> conteo.
   */
  async _contarRequerimientos(mandanteId) {
    const [vinculos, perfilesParticipacion] = await Promise.all([
      perfilRequerimientoRepository.listActivosParaConteo({mandanteId}),
      perfilParticipacionRepository.listActivosParaConteo({mandanteId}),
    ]);
    const mandanteIds = mandanteId ? [mandanteId] : [...new Set(
        perfilesParticipacion.map((pp) => pp.mandanteId).filter(Boolean),
    )];
    const requerimientos = (await Promise.all(mandanteIds.map((mid) =>
      requerimientoRepository.listActivosAplicacion(mid)))).flat();

    const mandantePorPerfilParticipacion = new Map(
        perfilesParticipacion.map((pp) => [pp.id, pp.mandanteId]),
    );
    const requerimientosPorId = new Map(requerimientos.map((r) => [r.id, r]));

    // `${mandanteId}|${tipo}` -> Set(req) de los vínculos "Todos";
    // perfilRecursoId -> Set(req) de los vínculos a ese perfil puntual.
    const todosPorTipo = new Map();
    const porPerfil = new Map();
    const agregar = (mapa, clave, valor) => {
      if (!mapa.has(clave)) mapa.set(clave, new Set());
      mapa.get(clave).add(valor);
    };
    vinculos.forEach((v) => {
      const mandante = mandantePorPerfilParticipacion.get(
          v.perfilParticipacionId,
      );
      const requerimiento = requerimientosPorId.get(v.requerimientoId);
      if (!mandante || !requerimiento) return;
      if (requerimiento.tipoEntidad === "empresa") return;
      if (v.perfilRecursoId) {
        agregar(porPerfil, v.perfilRecursoId, requerimiento.id);
      } else {
        agregar(todosPorTipo, `${mandante}|${requerimiento.tipoEntidad}`,
            requerimiento.id);
      }
    });

    return (perfil) => new Set([
      ...(todosPorTipo.get(`${perfil.mandanteId}|${perfil.tipo}`) || []),
      ...(porPerfil.get(perfil.id) || []),
    ]).size;
  }

  /**
   * Busca un perfil del Mandante y tipo con el mismo nombre, comparando
   * normalizado (minúsculas, sin tildes, trim, espacios colapsados) y sin
   * importar su estado. Si hubiera más de uno, prefiere el activo.
   * @param {string} mandanteId ID del Mandante.
   * @param {string} tipo "persona" | "recurso".
   * @param {string} nombre Nombre a buscar.
   * @param {?string} [excluirId] Perfil a ignorar (el que se edita).
   * @return {Promise<?Object>} El perfil con ese nombre, o null.
   */
  async _buscarPorNombre(mandanteId, tipo, nombre, excluirId = null) {
    const clave = normalizarNombre(nombre);
    const iguales = (await perfilRecursoRepository.listByMandanteYTipo(
        mandanteId, tipo,
    )).filter((p) => p.id !== excluirId &&
        normalizarNombre(p.nombre) === clave);
    return iguales.find((p) => p.estado === "activo") || iguales[0] || null;
  }

  /**
   * Crea un nuevo perfil de recurso.
   * @param {Object} payload Datos del nuevo perfil.
   * @param {Object} actor Usuario autenticado que ejecuta la acción.
   * @return {Promise<Object>} El perfil creado.
   */
  async crearPerfil(payload, actor) {
    const {nombre, tipo, descripcion} = payload;

    if (!nombre || !nombre.trim()) {
      throw new AppError(400, "El campo 'nombre' es requerido.");
    }
    if (!tipo || !TIPOS_APLICABLES_VALIDOS.includes(tipo)) {
      throw new AppError(
          400,
          "El campo 'tipo' es requerido y debe ser " +
          `${TIPOS_APLICABLES_VALIDOS.join(" o ")}.`,
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

    // Nombre único por Mandante y tipo, comparado normalizado y entre
    // activos e inactivos. Si ya existe, el cliente recibe el perfil para
    // ofrecer usarlo o reactivarlo en vez de crear otro.
    const existente = await this._buscarPorNombre(mandanteId, tipo, nombre);
    if (existente) {
      const contar = await this._contarRequerimientos(mandanteId);
      throw new AppError(
          409,
          `Ya existe un perfil de recurso con el nombre '${existente.nombre}'` +
          (existente.estado === "activo" ? "" : " (inactivo)") +
          ` para ${tipo} en este Mandante.`,
          {
            codigo: "PERFIL_EXISTENTE",
            detalle: {
              perfil: {
                id: existente.id,
                nombre: existente.nombre,
                tipo: existente.tipo,
                estado: existente.estado,
              },
              cantidadRequerimientos: contar(existente),
            },
          },
      );
    }

    const nuevoPerfil = {
      mandanteId,
      tipo,
      nombre: nombre.trim(),
      descripcion: descripcion ? descripcion.trim() : null,
      estado: "activo",
    };

    const creado = await perfilRecursoRepository.create(nuevoPerfil);

    await bitacoraLogger.registrarEvento({
      mandanteId,
      entidad: "perfil_recurso",
      entidadId: creado.id,
      accion: "creado",
      actor,
      detalle: {nombre: nuevoPerfil.nombre, tipo},
    });

    return creado;
  }

  /**
   * Actualiza los campos editables de un perfil de recurso existente.
   * `tipo` y `mandanteId` no son editables después de creado
   * (campos identidad, igual que en Perfil de Participación).
   * @param {string} id ID del perfil.
   * @param {Object} payload Campos a actualizar.
   * @param {Object} actor Usuario autenticado que ejecuta la acción.
   * @return {Promise<Object|null>} El perfil actualizado.
   */
  async actualizarPerfil(id, payload, actor) {
    const existente = await this.getPerfilById(id, actor);

    const allowedFields = ["nombre", "descripcion", "estado"];
    const updateData = {};
    for (const key of allowedFields) {
      if (payload[key] !== undefined) {
        updateData[key] = payload[key];
      }
    }

    if (updateData.nombre !== undefined) {
      updateData.nombre = String(updateData.nombre).trim();
      if (!updateData.nombre) {
        throw new AppError(400, "El campo 'nombre' es requerido.");
      }
    }
    // Renombrar: el nombre sigue siendo único (normalizado) entre los
    // demás perfiles del Mandante y tipo, activos o inactivos. Reactivar no
    // necesita validación: su nombre ya era único.
    if (updateData.nombre && normalizarNombre(updateData.nombre) !==
        normalizarNombre(existente.nombre)) {
      const duplicado = await this._buscarPorNombre(
          existente.mandanteId, existente.tipo, updateData.nombre, id,
      );
      if (duplicado) {
        throw new AppError(
            409,
            `Ya existe un perfil de recurso con el nombre ` +
            `'${duplicado.nombre}' para ${existente.tipo} en este Mandante.`,
        );
      }
    }

    if (updateData.descripcion !== undefined) {
      updateData.descripcion = updateData.descripcion ?
          updateData.descripcion.trim() : null;
    }

    if (updateData.estado && !ESTADOS_VALIDOS.includes(updateData.estado)) {
      throw new AppError(400, `Estado '${updateData.estado}' no válido.`);
    }

    const actualizado = await perfilRecursoRepository.update(id, updateData);

    // La transición de estado se registra aparte (mismo criterio que
    // Perfil de Participación): un cambio de estado es semánticamente
    // distinto de una edición de nombre.
    const estadoCambio = updateData.estado !== undefined &&
        updateData.estado !== existente.estado;
    if (estadoCambio) {
      await bitacoraLogger.registrarEvento({
        mandanteId: existente.mandanteId,
        entidad: "perfil_recurso",
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
        mandanteId: existente.mandanteId,
        entidad: "perfil_recurso",
        entidadId: id,
        accion: "actualizado",
        actor,
        detalle,
      });
    }

    return actualizado;
  }

  /**
   * Desactiva un perfil de recurso existente.
   * @param {string} id ID del perfil.
   * @param {Object} actor Usuario autenticado que ejecuta la acción.
   * @return {Promise<Object|null>} El perfil desactivado.
   */
  async desactivarPerfil(id, actor) {
    return this.actualizarPerfil(id, {estado: "inactivo"}, actor);
  }
}

module.exports = new PerfilRecursoService();
