const perfilRequerimientoRepository =
    require("../repositories/perfilRequerimientoRepository");
const perfilParticipacionRepository =
    require("../repositories/perfilParticipacionRepository");
const perfilRecursoRepository =
    require("../repositories/perfilRecursoRepository");
const requerimientoRepository =
    require("../repositories/requerimientoRepository");
const expedienteService = require("./expedienteService");
const AppError = require("../utils/AppError");

const ESTADOS_VALIDOS = ["activo", "inactivo"];

// Roles cuyo acceso queda siempre acotado a su propio mandanteId (mismo
// criterio que proyectoService.js/participacionService.js).
const ROLES_ALCANCE_FORZADO = ["mandante_admin", "mandante_lector"];

// Clave de un vínculo dentro de su par (Perfil de Participación +
// Requerimiento): el Perfil de Recurso, o "*" para "Todos" (null).
const claveRecurso = (perfilRecursoId) => perfilRecursoId || "*";

/**
 * Reglas de negocio para el recurso Perfil-Requerimiento: vincula un
 * Perfil de Participación con un Requerimiento, para todos los Perfiles de
 * Recurso del tipo (`perfilRecursoId` null) o para uno puntual. El
 * mandanteId del documento se DERIVA siempre del Perfil de Participación
 * referenciado — nunca se lee del payload del cliente. Reglas:
 * - tipoEntidad "empresa": perfilRecursoId siempre null.
 * - El Perfil de Recurso debe ser del mismo Mandante, estar activo y su
 *   tipo coincidir con el tipoEntidad del Requerimiento.
 * - No hay dos vínculos activos con la misma combinación
 *   perfilParticipacionId + perfilRecursoId + requerimientoId.
 * - Para un mismo perfilParticipacionId + requerimientoId no coexisten
 *   activos un vínculo "Todos" (null) y vínculos con ID.
 */
class PerfilRequerimientoService {
  /**
   * Obtiene un vínculo por su ID, respetando el alcance del actor.
   * @param {string} id ID del vínculo.
   * @param {Object} actor Usuario autenticado que ejecuta la acción.
   * @return {Promise<Object>} El vínculo encontrado.
   */
  async getVinculoById(id, actor) {
    if (!id || typeof id !== "string") {
      throw new AppError(400, "ID de vínculo inválido.");
    }
    const vinculo = await perfilRequerimientoRepository.getById(id);
    if (!vinculo) {
      throw new AppError(404, "Vínculo no encontrado.");
    }
    if (
      ROLES_ALCANCE_FORZADO.includes(actor.rol) &&
      vinculo.mandanteId !== actor.mandanteId
    ) {
      throw new AppError(404, "Vínculo no encontrado.");
    }
    return vinculo;
  }

  /**
   * Lista vínculos, forzando el alcance del actor cuando corresponde.
   * @param {Object} filtros Filtros de búsqueda.
   * @param {Object} actor Usuario autenticado que ejecuta la acción.
   * @return {Promise<Object[]>} Lista de vínculos.
   */
  async listarVinculos(filtros, actor) {
    const filtrosFinales = {...filtros};
    if (ROLES_ALCANCE_FORZADO.includes(actor.rol)) {
      filtrosFinales.mandanteId = actor.mandanteId;
    }
    return await perfilRequerimientoRepository.list(filtrosFinales);
  }

  /**
   * Siguiente número de orden dentro de un (perfilParticipacionId,
   * tipoEntidad) — el orden es independiente por tipo. Los vínculos de un
   * mismo Requerimiento comparten orden, así que se cuenta por
   * Requerimiento, no por documento.
   * @param {string} perfilParticipacionId ID del Perfil de Participación.
   * @param {string} tipoEntidad Tipo de entidad del Requerimiento.
   * @return {Promise<number>} El siguiente orden disponible.
   */
  async _siguienteOrden(perfilParticipacionId, tipoEntidad) {
    const activos = await perfilRequerimientoRepository.getActivosByPerfil(
        perfilParticipacionId,
    );
    const maxOrden = activos
        .filter((v) => v.tipoEntidad === tipoEntidad)
        .reduce((max, v) => Math.max(max, v.orden || 0), 0);
    return maxOrden + 1;
  }

  /**
   * Carga y valida el Perfil de Participación (existencia, estado y
   * alcance del actor).
   * @param {string} perfilParticipacionId ID del Perfil.
   * @param {Object} actor Usuario autenticado.
   * @param {boolean} exigirActivo Si debe estar activo.
   * @return {Promise<Object>} El Perfil de Participación.
   */
  async _cargarPerfilParticipacion(perfilParticipacionId, actor, exigirActivo) {
    const perfil = await perfilParticipacionRepository.getById(
        perfilParticipacionId,
    );
    if (!perfil) {
      throw new AppError(
          400, "El Perfil de Participación indicado no existe.",
      );
    }
    if (exigirActivo && perfil.estado !== "activo") {
      throw new AppError(
          400, "El Perfil de Participación indicado no está activo.",
      );
    }
    if (
      ROLES_ALCANCE_FORZADO.includes(actor.rol) &&
      perfil.mandanteId !== actor.mandanteId
    ) {
      throw new AppError(
          403,
          "No tiene permisos para configurar perfiles de otro Mandante.",
      );
    }
    return perfil;
  }

  /**
   * Carga y valida el Requerimiento.
   * @param {string} requerimientoId ID del Requerimiento.
   * @param {boolean} exigirActivo Si debe estar activo.
   * @return {Promise<Object>} El Requerimiento.
   */
  async _cargarRequerimiento(requerimientoId, exigirActivo) {
    const requerimiento = await requerimientoRepository.getById(
        requerimientoId,
    );
    if (!requerimiento) {
      throw new AppError(400, "El Requerimiento indicado no existe.");
    }
    if (exigirActivo && requerimiento.estado !== "activo") {
      throw new AppError(400, "El Requerimiento indicado no está activo.");
    }
    return requerimiento;
  }

  /**
   * Valida un Perfil de Recurso para un vínculo: null siempre válido salvo
   * que no corresponda; con ID, mismo Mandante, activo y tipo coincidente
   * con el tipoEntidad del Requerimiento. "empresa" no admite ID.
   * @param {?string} perfilRecursoId ID o null.
   * @param {string} mandanteId Mandante del Perfil de Participación.
   * @param {string} tipoEntidad Tipo del Requerimiento.
   * @return {Promise<void>}
   */
  async _validarPerfilRecurso(perfilRecursoId, mandanteId, tipoEntidad) {
    if (!perfilRecursoId) return;
    if (tipoEntidad === "empresa") {
      throw new AppError(
          400,
          "Un Requerimiento de Empresa no se puede acotar a un Perfil de " +
          "Recurso.",
      );
    }
    const perfil = await perfilRecursoRepository.getById(perfilRecursoId);
    if (!perfil || perfil.mandanteId !== mandanteId) {
      throw new AppError(
          400, "El Perfil de Recurso indicado no pertenece a este Mandante.",
      );
    }
    if (perfil.tipo !== tipoEntidad) {
      throw new AppError(
          400,
          `El Perfil de Recurso '${perfil.nombre}' no es del tipo ` +
          `'${tipoEntidad}' del Requerimiento.`,
      );
    }
    if (perfil.estado !== "activo") {
      throw new AppError(
          400, `El Perfil de Recurso '${perfil.nombre}' no está activo.`,
      );
    }
  }

  /**
   * Valida que agregar (activar) un vínculo con este perfilRecursoId no
   * rompa la unicidad ni la exclusividad "Todos" vs. específicos.
   * @param {Object[]} activosDelPar Vínculos activos del par.
   * @param {?string} perfilRecursoId Perfil a activar (null = "Todos").
   * @param {?string} excluirId Vínculo a ignorar (el que se reactiva).
   * @return {void}
   */
  _validarCompatibilidad(activosDelPar, perfilRecursoId, excluirId = null) {
    const otros = activosDelPar.filter((v) => v.id !== excluirId);
    if (otros.some((v) => claveRecurso(v.perfilRecursoId) ===
        claveRecurso(perfilRecursoId))) {
      throw new AppError(
          409, "Ya existe un vínculo activo con esta misma combinación.",
      );
    }
    const hayTodos = otros.some((v) => !v.perfilRecursoId);
    const hayEspecificos = otros.some((v) => v.perfilRecursoId);
    if ((perfilRecursoId && hayTodos) || (!perfilRecursoId && hayEspecificos)) {
      throw new AppError(
          409,
          "Un Requerimiento no puede aplicar a la vez a \"Todos\" y a " +
          "Perfiles de Recurso específicos dentro del mismo Perfil de " +
          "Participación.",
      );
    }
  }

  /**
   * Crea un nuevo vínculo (una combinación Perfil de Participación +
   * Requerimiento + Perfil de Recurso o "Todos").
   * @param {Object} payload {perfilParticipacionId, requerimientoId,
   *     perfilRecursoId?}.
   * @param {Object} actor Usuario autenticado que ejecuta la acción.
   * @return {Promise<Object>} El vínculo creado.
   */
  async crearVinculo(payload, actor) {
    const {perfilParticipacionId, requerimientoId} = payload;
    const perfilRecursoId = payload.perfilRecursoId || null;

    if (!perfilParticipacionId || !requerimientoId) {
      throw new AppError(
          400,
          "Faltan campos obligatorios: 'perfilParticipacionId' y " +
          "'requerimientoId' son requeridos.",
      );
    }

    const perfil = await this._cargarPerfilParticipacion(
        perfilParticipacionId, actor, true,
    );
    // mandanteId SIEMPRE se deriva del Perfil de Participación.
    const mandanteId = perfil.mandanteId;
    const requerimiento =
        await this._cargarRequerimiento(requerimientoId, true);
    await this._validarPerfilRecurso(
        perfilRecursoId, mandanteId, requerimiento.tipoEntidad,
    );

    const delPar = await perfilRequerimientoRepository
        .getByPerfilYRequerimiento(perfilParticipacionId, requerimientoId);
    if (delPar.some((v) => claveRecurso(v.perfilRecursoId) ===
        claveRecurso(perfilRecursoId))) {
      throw new AppError(
          409,
          "Ya existe un vínculo con esta misma combinación. Si estaba " +
          "inactivo, reactívelo en vez de crear uno nuevo.",
      );
    }
    const activosDelPar = delPar.filter((v) => v.estado === "activo");
    this._validarCompatibilidad(activosDelPar, perfilRecursoId);

    // Los vínculos de un mismo Requerimiento comparten orden.
    const orden = activosDelPar.length ?
      Math.min(...activosDelPar.map((v) => v.orden || 0)) :
      await this._siguienteOrden(
          perfilParticipacionId, requerimiento.tipoEntidad,
      );

    const creado = await perfilRequerimientoRepository.create({
      perfilParticipacionId,
      requerimientoId,
      perfilRecursoId,
      mandanteId,
      tipoEntidad: requerimiento.tipoEntidad,
      estado: "activo",
      orden,
    });
    await expedienteService.sincronizarRequerimientosDePerfil(
        perfilParticipacionId, [requerimientoId], actor,
    );
    return creado;
  }

  /**
   * Cambia el estado (activo/inactivo) de un vínculo existente. Es el
   * único campo editable — la combinación en sí es inmutable.
   * @param {string} id ID del vínculo.
   * @param {Object} payload Payload de la petición (solo se usa
   *     `estado`).
   * @param {Object} actor Usuario autenticado que ejecuta la acción.
   * @return {Promise<Object|null>} El vínculo actualizado.
   */
  async actualizarVinculo(id, payload, actor) {
    const existente = await this.getVinculoById(id, actor);

    if (!ESTADOS_VALIDOS.includes(payload.estado)) {
      throw new AppError(
          400,
          `Estado '${payload.estado}' no válido. ` +
          `Valores permitidos: ${ESTADOS_VALIDOS.join(", ")}.`,
      );
    }

    const updateData = {estado: payload.estado};
    if (payload.estado === "inactivo") {
      // Al desmarcar, el orden se limpia — no se recupera al reactivar.
      updateData.orden = null;
    } else if (existente.estado !== "activo") {
      const requerimiento = await this._cargarRequerimiento(
          existente.requerimientoId, true,
      );
      await this._validarPerfilRecurso(
          existente.perfilRecursoId, existente.mandanteId,
          requerimiento.tipoEntidad,
      );
      const activosDelPar = (await perfilRequerimientoRepository
          .getByPerfilYRequerimiento(
              existente.perfilParticipacionId, existente.requerimientoId,
          )).filter((v) => v.estado === "activo");
      this._validarCompatibilidad(
          activosDelPar, existente.perfilRecursoId, existente.id,
      );
      updateData.tipoEntidad = requerimiento.tipoEntidad;
      updateData.orden = activosDelPar.length ?
        Math.min(...activosDelPar.map((v) => v.orden || 0)) :
        await this._siguienteOrden(
            existente.perfilParticipacionId, requerimiento.tipoEntidad,
        );
    }

    const actualizado = await perfilRequerimientoRepository.update(
        id, updateData,
    );
    if (payload.estado !== existente.estado) {
      await expedienteService.sincronizarRequerimientosDePerfil(
          existente.perfilParticipacionId, [existente.requerimientoId], actor,
      );
    }
    return actualizado;
  }

  /**
   * Fija en un solo paso el estado deseado de varios pares Perfil de
   * Participación + Requerimiento: a qué Perfiles de Recurso aplica cada
   * uno ("Todos" = null) o si se desvincula. Calcula las altas,
   * reactivaciones y bajas necesarias, las escribe en UN batch y después
   * sincroniza una sola vez los Expedientes abiertos de cada Perfil de
   * Participación afectado. Lo usan el formulario de Requerimiento y el
   * panel de configuración del Perfil de Participación.
   * @param {Array<{perfilParticipacionId: string, requerimientoId: string,
   *     activo: boolean, perfilRecursoIds: (null|string[])}>} cambios
   *     Estado deseado por par.
   * @param {Object} actor Usuario autenticado que ejecuta la acción.
   * @return {Promise<{creados: number, reactivados: number,
   *     desactivados: number}>} Resumen.
   */
  async sincronizarVinculos(cambios, actor) {
    if (!Array.isArray(cambios) || cambios.length === 0) {
      throw new AppError(400, "Debe indicar al menos un cambio de vínculos.");
    }

    const crear = [];
    const actualizar = [];
    const resumen = {creados: 0, reactivados: 0, desactivados: 0};
    const afectados = new Map(); // perfilParticipacionId -> Set(reqIds)
    const siguientes = new Map(); // `${pp}|${tipo}` -> próximo orden

    const vistos = new Set();
    for (const cambio of cambios) {
      const {perfilParticipacionId, requerimientoId} = cambio || {};
      if (!perfilParticipacionId || !requerimientoId) {
        throw new AppError(
            400,
            "Cada cambio requiere 'perfilParticipacionId' y " +
            "'requerimientoId'.",
        );
      }
      const clavePar = `${perfilParticipacionId}|${requerimientoId}`;
      if (vistos.has(clavePar)) {
        throw new AppError(400, "Hay pares Perfil-Requerimiento repetidos.");
      }
      vistos.add(clavePar);
      const activo = Boolean(cambio.activo);

      // eslint-disable-next-line no-await-in-loop
      const perfil = await this._cargarPerfilParticipacion(
          perfilParticipacionId, actor, activo,
      );
      // eslint-disable-next-line no-await-in-loop
      const requerimiento = await this._cargarRequerimiento(
          requerimientoId, activo,
      );

      let deseados = [];
      if (activo) {
        const ids = cambio.perfilRecursoIds;
        if (requerimiento.tipoEntidad === "empresa" || ids === null ||
            ids === undefined) {
          deseados = [null];
        } else if (Array.isArray(ids) && ids.length > 0) {
          deseados = [...new Set(ids)];
        } else {
          throw new AppError(
              400,
              "Indique Perfiles de Recurso o \"Todos\" (null) para cada " +
              "vínculo activo.",
          );
        }
        for (const id of deseados) {
          // eslint-disable-next-line no-await-in-loop
          await this._validarPerfilRecurso(
              id, perfil.mandanteId, requerimiento.tipoEntidad,
          );
        }
      }
      const clavesDeseadas = new Set(deseados.map(claveRecurso));

      // eslint-disable-next-line no-await-in-loop
      const delPar = await perfilRequerimientoRepository
          .getByPerfilYRequerimiento(perfilParticipacionId, requerimientoId);
      const activosDelPar = delPar.filter((v) => v.estado === "activo");
      const quedanActivos = activosDelPar.filter(
          (v) => clavesDeseadas.has(claveRecurso(v.perfilRecursoId)),
      );

      // Orden común del Requerimiento: el que ya tenía, o el siguiente.
      let orden = null;
      if (activo) {
        if (quedanActivos.length) {
          orden = Math.min(...quedanActivos.map((v) => v.orden || 0));
        } else {
          const claveOrden = `${perfilParticipacionId}|` +
              `${requerimiento.tipoEntidad}`;
          if (!siguientes.has(claveOrden)) {
            // eslint-disable-next-line no-await-in-loop
            siguientes.set(claveOrden, await this._siguienteOrden(
                perfilParticipacionId, requerimiento.tipoEntidad,
            ));
          }
          orden = siguientes.get(claveOrden);
          siguientes.set(claveOrden, orden + 1);
        }
      }

      let huboCambio = false;
      delPar.forEach((v) => {
        const deseado = clavesDeseadas.has(claveRecurso(v.perfilRecursoId));
        if (v.estado === "activo" && !deseado) {
          actualizar.push({id: v.id, data: {estado: "inactivo", orden: null}});
          resumen.desactivados++;
          huboCambio = true;
        } else if (v.estado !== "activo" && deseado) {
          actualizar.push({
            id: v.id,
            data: {
              estado: "activo", orden, tipoEntidad: requerimiento.tipoEntidad,
            },
          });
          resumen.reactivados++;
          huboCambio = true;
        }
      });
      const existentes = new Set(delPar.map((v) =>
        claveRecurso(v.perfilRecursoId)));
      deseados
          .filter((id) => !existentes.has(claveRecurso(id)))
          .forEach((id) => {
            crear.push({
              perfilParticipacionId,
              requerimientoId,
              perfilRecursoId: id,
              mandanteId: perfil.mandanteId,
              tipoEntidad: requerimiento.tipoEntidad,
              estado: "activo",
              orden,
            });
            resumen.creados++;
            huboCambio = true;
          });

      if (huboCambio) {
        if (!afectados.has(perfilParticipacionId)) {
          afectados.set(perfilParticipacionId, new Set());
        }
        afectados.get(perfilParticipacionId).add(requerimientoId);
      }
    }

    await perfilRequerimientoRepository.aplicarCambios({crear, actualizar});
    for (const [perfilParticipacionId, reqIds] of afectados) {
      // eslint-disable-next-line no-await-in-loop
      await expedienteService.sincronizarRequerimientosDePerfil(
          perfilParticipacionId, [...reqIds], actor,
      );
    }
    return resumen;
  }

  /**
   * Reordena en batch los Requerimientos de un mismo Perfil de
   * Participación y tipo de entidad. Cada ítem identifica un Requerimiento
   * a través de uno de sus vínculos; el nuevo orden se aplica a TODOS los
   * vínculos activos de ese Requerimiento en el Perfil (comparten orden).
   * @param {{perfilRequerimientoId: string, ordenNuevo: number}[]} items
   *     Vínculos a reordenar.
   * @param {Object} actor Usuario autenticado que ejecuta la acción.
   * @return {Promise<void>}
   */
  async reordenarVinculos(items, actor) {
    if (!Array.isArray(items) || items.length === 0) {
      throw new AppError(400, "Debe indicar al menos un vínculo a reordenar.");
    }

    for (const item of items) {
      if (
        !item.perfilRequerimientoId ||
        typeof item.ordenNuevo !== "number"
      ) {
        throw new AppError(
            400,
            "Cada elemento requiere 'perfilRequerimientoId' y " +
            "'ordenNuevo' (number).",
        );
      }
    }

    const vinculos = await Promise.all(
        items.map((it) => perfilRequerimientoRepository.getById(
            it.perfilRequerimientoId,
        )),
    );

    vinculos.forEach((v, idx) => {
      if (!v) {
        throw new AppError(
            400,
            `El vínculo '${items[idx].perfilRequerimientoId}' no existe.`,
        );
      }
    });

    const {perfilParticipacionId, tipoEntidad} = vinculos[0];
    const mismoGrupo = vinculos.every((v) =>
      v.perfilParticipacionId === perfilParticipacionId &&
      v.tipoEntidad === tipoEntidad,
    );
    if (!mismoGrupo) {
      throw new AppError(
          400,
          "Todos los vínculos deben pertenecer al mismo Perfil de " +
          "Participación y al mismo tipo de entidad.",
      );
    }

    if (
      ROLES_ALCANCE_FORZADO.includes(actor.rol) &&
      vinculos[0].mandanteId !== actor.mandanteId
    ) {
      throw new AppError(
          403,
          "No tiene permisos para reordenar vínculos de otro Mandante.",
      );
    }

    const activos = await perfilRequerimientoRepository.getActivosByPerfil(
        perfilParticipacionId,
    );
    const updates = [];
    vinculos.forEach((v, idx) => {
      activos
          .filter((a) => a.requerimientoId === v.requerimientoId)
          .forEach((a) => updates.push({
            id: a.id, orden: items[idx].ordenNuevo,
          }));
    });
    await perfilRequerimientoRepository.batchUpdateOrden(updates);
  }

  /**
   * Devuelve el catálogo completo de Requerimientos activos, cada uno
   * anotado con su vínculo a un Perfil de Participación específico:
   * - vinculado: si tiene algún vínculo activo.
   * - perfilRecursoIds: null ("Todos") o los IDs de Perfil de Recurso a
   *   los que aplica (solo si está vinculado).
   * - perfilRequerimientoId: un vínculo activo representativo (para
   *   reordenar), o null.
   * - orden: el orden común del Requerimiento en el Perfil.
   * @param {string} perfilParticipacionId ID del Perfil de Participación.
   * @param {Object} actor Usuario autenticado que ejecuta la acción.
   * @return {Promise<Object[]>} Requerimientos anotados.
   */
  async obtenerMatriz(perfilParticipacionId, actor) {
    const perfil = await perfilParticipacionRepository.getById(
        perfilParticipacionId,
    );
    if (!perfil) {
      throw new AppError(404, "Perfil de Participación no encontrado.");
    }
    if (
      ROLES_ALCANCE_FORZADO.includes(actor.rol) &&
      perfil.mandanteId !== actor.mandanteId
    ) {
      throw new AppError(404, "Perfil de Participación no encontrado.");
    }

    const [requerimientos, activos] = await Promise.all([
      requerimientoRepository.list({estado: "activo"}),
      perfilRequerimientoRepository.getActivosByPerfil(perfilParticipacionId),
    ]);

    const porRequerimiento = {};
    activos.forEach((v) => {
      (porRequerimiento[v.requerimientoId] =
          porRequerimiento[v.requerimientoId] || []).push(v);
    });

    return requerimientos.map((r) => {
      const vinculos = porRequerimiento[r.id] || [];
      const vinculado = vinculos.length > 0;
      const todos = vinculos.some((v) => !v.perfilRecursoId);
      return {
        ...r,
        vinculado,
        perfilRecursoIds: !vinculado || todos || r.tipoEntidad === "empresa" ?
          null : vinculos.map((v) => v.perfilRecursoId).sort(),
        perfilRequerimientoId: vinculado ? vinculos[0].id : null,
        orden: vinculado ? Math.min(...vinculos.map((v) => v.orden || 0)) :
          null,
      };
    });
  }
}

module.exports = new PerfilRequerimientoService();
