const admin = require("firebase-admin");
const {FieldValue} = require("firebase-admin/firestore");
const empresaRepository = require("../repositories/empresaRepository");
const empresaMandanteRepository =
    require("../repositories/empresaMandanteRepository");
const empresaPersonaRepository =
    require("../repositories/empresaPersonaRepository");
const empresaRecursoRepository =
    require("../repositories/empresaRecursoRepository");
const bitacoraLogger = require("../utils/bitacoraLogger");
const {
  empresaIdsVisibles, puedeVerEmpresa,
} = require("../utils/alcanceMandante");
const participacionRepository =
    require("../repositories/participacionRepository");
const proyectoRepository = require("../repositories/proyectoRepository");
const mandanteRepository = require("../repositories/mandanteRepository");
const perfilParticipacionRepository =
    require("../repositories/perfilParticipacionRepository");
const {validateRut, cleanRut} = require("../utils/rutValidator");
const reporteService = require("./reporteService");
const bitacoraService = require("./bitacoraService");
const participacionPersonaRepository =
    require("../repositories/participacionPersonaRepository");
const participacionRecursoRepository =
    require("../repositories/participacionRecursoRepository");
const AppError = require("../utils/AppError");
const {getMandanteDisplayName} = require("../utils/mandanteDisplay");

const ESTADOS_VALIDOS = ["activo", "inactivo"];
// Código gRPC de Firestore cuando `create` encuentra el documento ya creado.
const ALREADY_EXISTS = 6;
const TELEFONO_MAX_DIGITOS = 11;
// Índice de unicidad del RUT de Empresa (RUT normalizado -> empresaId),
// escrito en la misma escritura atómica que la Empresa.
const RUT_COLLECTION = "empresasRut";
// Roles que gestionan la asociación Empresa-Mandante de cualquier Mandante.
const ROLES_GESTION_MANDANTES = ["superadmin", "admin_comercial"];
const ROLES_MANDANTE = ["mandante_admin", "mandante_lector"];

const db = admin.firestore();

/**
 * Reglas de negocio para el recurso Empresa.
 * Catálogo global compartido entre Mandantes (RN-021): no lleva mandanteId
 * ni lógica de alcance por actor — el control de acceso es enteramente por
 * rol a nivel de ruta (ver empresaRoutes.js).
 */
class EmpresaService {
  /**
   * Valida que contacto.telefono sea SOLO dígitos (sin "+", espacios,
   * guiones ni paréntesis) y de máximo TELEFONO_MAX_DIGITOS caracteres.
   * Mismo criterio que mandanteService.js.
   * @param {?string} telefono Teléfono a validar, o null/undefined.
   * @return {void}
   */
  _validarTelefono(telefono) {
    if (!telefono) return;
    const patron = new RegExp(`^\\d{1,${TELEFONO_MAX_DIGITOS}}$`);
    if (!patron.test(telefono)) {
      throw new AppError(
          400,
          "El teléfono debe contener solo números, sin espacios ni " +
          "símbolos, máximo 11 dígitos.",
      );
    }
  }

  /**
   * Obtiene una empresa por su ID.
   * @param {string} id ID de la empresa.
   * @param {?Object} [actor] Usuario autenticado: fuera de su alcance
   *     responde 404.
   * @return {Promise<Object>} La empresa encontrada.
   */
  async getEmpresaById(id, actor = null) {
    if (!id || typeof id !== "string") {
      throw new AppError(400, "ID de empresa inválido.");
    }
    const empresa = await empresaRepository.getById(id);
    // Fuera del alcance del actor se responde igual que si no existiera.
    if (!empresa || (actor && !(await puedeVerEmpresa(actor, id)))) {
      throw new AppError(404, "Empresa no encontrada.");
    }
    return empresa;
  }

  /**
   * Lista empresas visibles para el actor (ver utils/alcanceMandante.js),
   * opcionalmente filtradas por estado y por Mandante asociado
   * (`mandanteId`: solo las con empresaMandantes activo para ese Mandante;
   * lo usa el asistente de Nueva Acreditación).
   * @param {{estado: (string|undefined), mandanteId: (string|undefined)}}
   *     filtros Filtros de búsqueda.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object[]>} Lista de empresas.
   */
  async listarEmpresas(filtros, actor) {
    const {estado, mandanteId} = filtros || {};
    const [empresas, visibles, delMandante] = await Promise.all([
      empresaRepository.list({estado}),
      empresaIdsVisibles(actor),
      mandanteId ? empresaMandanteRepository.empresaIdsActivas(mandanteId) :
        null,
    ]);
    const filtroMandante = delMandante ? new Set(delMandante) : null;
    return empresas.filter((e) =>
      (!visibles || visibles.has(e.id)) &&
      (!filtroMandante || filtroMandante.has(e.id)));
  }

  /**
   * Mandante con el que se asocia una Empresa nueva: el propio para los
   * roles de Mandante; el indicado (obligatorio) para el resto.
   * @param {Object} actor Usuario autenticado.
   * @param {?string} mandanteId Mandante pedido.
   * @return {Promise<string>} Mandante resuelto y validado.
   */
  async _resolverMandanteAlta(actor, mandanteId) {
    const resuelto = ROLES_MANDANTE.includes(actor.rol) ?
        actor.mandanteId : mandanteId;
    if (!resuelto) {
      throw new AppError(400, "El campo 'mandanteId' es obligatorio.");
    }
    const mandante = await mandanteRepository.getById(resuelto);
    if (!mandante || mandante.estado !== "activo") {
      throw new AppError(
          400, "El Mandante indicado no existe o no está activo.",
      );
    }
    return resuelto;
  }

  /**
   * Asocia una Empresa a un Mandante (o reactiva la asociación). Un
   * mandante_admin solo puede asociarla a su propio Mandante (al crearla o
   * cuando el RUT ya existe); superadmin y admin_comercial, a cualquiera.
   * @param {string} empresaId ID de la Empresa.
   * @param {string} mandanteId ID del Mandante.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object>} El vínculo activo.
   */
  async asociarMandante(empresaId, mandanteId, actor) {
    const destino = ROLES_MANDANTE.includes(actor.rol) ?
        actor.mandanteId : mandanteId;
    if (ROLES_MANDANTE.includes(actor.rol) && mandanteId &&
        mandanteId !== actor.mandanteId) {
      throw new AppError(
          403, "Solo puede asociar empresas a su propio Mandante.",
      );
    }
    if (!ROLES_GESTION_MANDANTES.includes(actor.rol) &&
        actor.rol !== "mandante_admin") {
      throw new AppError(403, "No tiene permisos para esta operación.");
    }
    const empresa = await empresaRepository.getById(empresaId);
    if (!empresa) throw new AppError(404, "Empresa no encontrada.");
    const resuelto = await this._resolverMandanteAlta(actor, destino);
    const anterior = await empresaMandanteRepository.get(empresaId, resuelto);
    const vinculo =
        await empresaMandanteRepository.activar(empresaId, resuelto);
    if (anterior?.estado !== "activo") {
      await bitacoraLogger.registrarEvento({
        mandanteId: resuelto,
        entidad: "empresa",
        entidadId: empresaId,
        accion: "asociada_mandante",
        actor,
        detalle: {mandanteId: resuelto, empresaNombre: empresa.razonSocial},
      });
    }
    return vinculo;
  }

  /**
   * Desasocia una Empresa de un Mandante (queda inactivo, sin borrado).
   * Solo superadmin y admin_comercial. Se rechaza si la Empresa tiene
   * Participaciones activas en Proyectos de ese Mandante.
   * @param {string} empresaId ID de la Empresa.
   * @param {string} mandanteId ID del Mandante.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object>} El vínculo inactivo.
   */
  async desasociarMandante(empresaId, mandanteId, actor) {
    if (!ROLES_GESTION_MANDANTES.includes(actor.rol)) {
      throw new AppError(403, "No tiene permisos para desasociar mandantes.");
    }
    const vinculo = await empresaMandanteRepository.get(empresaId, mandanteId);
    if (!vinculo || vinculo.estado !== "activo") {
      throw new AppError(404, "La Empresa no está asociada a ese Mandante.");
    }
    const activas = (await participacionRepository.list({empresaId}))
        .filter((p) => p.estado === "activa" && p.mandanteId === mandanteId);
    if (activas.length > 0) {
      throw new AppError(
          409,
          `La Empresa tiene ${activas.length} participación(es) activa(s) ` +
          "en proyectos de este Mandante: finalícelas antes de desasociarla.",
      );
    }
    const resultado =
        await empresaMandanteRepository.desactivar(empresaId, mandanteId);
    await bitacoraLogger.registrarEvento({
      mandanteId,
      entidad: "empresa",
      entidadId: empresaId,
      accion: "desasociada_mandante",
      actor,
      detalle: {mandanteId},
    });
    return resultado;
  }

  /**
   * Mandantes asociados a una Empresa (activos e inactivos), con su
   * nombre. Respeta el alcance del actor sobre la Empresa.
   * @param {string} empresaId ID de la Empresa.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object[]>} Vínculos {mandanteId, estado, nombre,
   *     logoUrl}.
   */
  async listarMandantes(empresaId, actor) {
    await this.getEmpresaById(empresaId, actor);
    let vinculos = await empresaMandanteRepository.listByEmpresa(empresaId);
    // Un rol de Mandante solo ve su propio vínculo.
    if (ROLES_MANDANTE.includes(actor.rol)) {
      vinculos = vinculos.filter((v) => v.mandanteId === actor.mandanteId);
    }
    return Promise.all(vinculos.map(async (v) => {
      const m = await mandanteRepository.getById(v.mandanteId);
      return {
        mandanteId: v.mandanteId,
        estado: v.estado,
        nombre: getMandanteDisplayName(m) || v.mandanteId,
        logoUrl: m?.logoUrl || null,
      };
    }));
  }

  /**
   * Error 409 RUT_EXISTENTE con la Empresa que ya tiene ese RUT, para
   * ofrecer asociarla al Mandante en vez de duplicarla. Se arma después del
   * intento de alta fallido, fuera de cualquier transacción.
   * @param {string} rut RUT normalizado.
   * @param {string} mandanteId Mandante al que se quería asociar.
   * @return {Promise<AppError>} El error a lanzar.
   */
  async _errorRutExistente(rut, mandanteId) {
    const indice = await db.collection(RUT_COLLECTION).doc(rut).get();
    const empresaId = indice.data()?.empresaId || null;
    const existente = empresaId ?
        await empresaRepository.getById(empresaId) : null;
    const yaAsociada = existente ?
        await empresaMandanteRepository.estaActiva(existente.id, mandanteId) :
        false;
    return new AppError(
        409, `Ya existe una Empresa registrada con el RUT ${rut}.`,
        {
          codigo: "RUT_EXISTENTE",
          detalle: {
            empresaId, razonSocial: existente?.razonSocial || null, rut,
            mandanteId, yaAsociada,
          },
        },
    );
  }

  /**
   * Crea una nueva empresa asociada a un Mandante (empresaMandantes). El
   * RUT es único: el índice empresasRut se crea en la misma escritura
   * atómica (create), así dos altas simultáneas con el mismo RUT no pueden
   * tener éxito ambas. Si el RUT ya existe responde 409 con código
   * RUT_EXISTENTE y la Empresa existente, para ofrecer asociarla al
   * Mandante en vez de duplicarla.
   * @param {Object} payload Datos de la nueva empresa y `mandanteId`.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object>} La empresa creada.
   */
  async crearEmpresa(payload, actor) {
    const {rut, razonSocial, nombreFantasia, giro, contacto, estado} =
        payload;

    if (!rut || !razonSocial || !giro) {
      throw new AppError(
          400,
          "Faltan campos obligatorios: 'rut', 'razonSocial' y 'giro' " +
          "son requeridos.",
      );
    }

    if (!validateRut(rut)) {
      throw new AppError(400, `El RUT proporcionado (${rut}) no es válido.`);
    }
    const rutNormalizado = cleanRut(rut);
    const mandanteId = await this._resolverMandanteAlta(
        actor, payload.mandanteId,
    );

    const estadoFinal = estado || "activo";
    if (!ESTADOS_VALIDOS.includes(estadoFinal)) {
      throw new AppError(
          400,
          `Estado '${estadoFinal}' no válido. ` +
          `Valores permitidos: ${ESTADOS_VALIDOS.join(", ")}.`,
      );
    }

    let contactoFinal = null;
    if (contacto) {
      if (!contacto.nombre && !contacto.email && !contacto.telefono) {
        throw new AppError(
            400,
            "Si se incluye información de contacto, debe proporcionar " +
            "al menos uno de: 'nombre', 'email' o 'telefono'.",
        );
      }
      this._validarTelefono(contacto.telefono);
      contactoFinal = {
        nombre: contacto.nombre ? contacto.nombre.trim() : null,
        email: contacto.email ? contacto.email.trim().toLowerCase() : null,
        telefono: contacto.telefono ? contacto.telefono.trim() : null,
      };
    }

    const nuevaEmpresa = {
      rut: rutNormalizado,
      razonSocial: razonSocial.trim(),
      nombreFantasia: (nombreFantasia || razonSocial).trim(),
      giro: giro.trim(),
      contacto: contactoFinal,
      estado: estadoFinal,
      logoUrl: null,
    };

    const refIndice = db.collection(RUT_COLLECTION).doc(rutNormalizado);
    const refEmpresa = db.collection(empresaRepository.COLLECTION).doc();
    const refVinculo = empresaMandanteRepository.ref(refEmpresa.id, mandanteId);
    // Escritura atómica SIN lecturas previas: `create` del índice falla con
    // ALREADY_EXISTS si el RUT ya está tomado y entonces no se escribe nada.
    // Leer el índice dentro de una transacción para luego escribirlo hacía
    // que altas simultáneas se bloquearan entre sí hasta el timeout de locks.
    const lote = db.batch();
    lote.create(refIndice, {
      empresaId: refEmpresa.id, createdAt: FieldValue.serverTimestamp(),
    });
    lote.set(refEmpresa, {
      ...nuevaEmpresa,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    lote.set(refVinculo,
        empresaMandanteRepository.datosActivo(
            refEmpresa.id, mandanteId, false,
        ));
    try {
      await lote.commit();
    } catch (err) {
      if (err.code !== ALREADY_EXISTS) throw err;
      throw await this._errorRutExistente(rutNormalizado, mandanteId);
    }

    await bitacoraLogger.registrarEvento({
      mandanteId,
      entidad: "empresa",
      entidadId: refEmpresa.id,
      accion: "creado",
      actor,
      detalle: {razonSocial: nuevaEmpresa.razonSocial, mandanteId},
    });
    return {id: refEmpresa.id, ...nuevaEmpresa};
  }

  /**
   * Actualiza los campos editables de una empresa existente.
   * @param {string} id ID de la empresa.
   * @param {Object} payload Campos a actualizar.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object|null>} La empresa actualizada.
   */
  async actualizarEmpresa(id, payload, actor) {
    const existente = await this.getEmpresaById(id, actor);

    const allowedFields = [
      "razonSocial", "nombreFantasia", "giro", "contacto", "estado",
      "logoUrl",
    ];
    const updateData = {};
    for (const key of allowedFields) {
      if (payload[key] !== undefined) {
        updateData[key] = payload[key];
      }
    }

    if (updateData.estado && !ESTADOS_VALIDOS.includes(updateData.estado)) {
      throw new AppError(400, `Estado '${updateData.estado}' no válido.`);
    }

    // El RUT no se edita después de creado, salvo superadmin (actualiza
    // el índice empresasRut en la misma transacción).
    if (payload.rut !== undefined && cleanRut(payload.rut) !== existente.rut) {
      if (actor.rol !== "superadmin") {
        throw new AppError(
            403, "El RUT de la Empresa no se puede modificar.",
        );
      }
      if (!validateRut(payload.rut)) {
        throw new AppError(
            400, `El RUT proporcionado (${payload.rut}) no es válido.`,
        );
      }
      await this._cambiarRut(id, existente.rut, cleanRut(payload.rut));
    }

    if (updateData.razonSocial) {
      updateData.razonSocial = updateData.razonSocial.trim();
    }
    if (updateData.nombreFantasia) {
      updateData.nombreFantasia = updateData.nombreFantasia.trim();
    }
    if (updateData.giro) updateData.giro = updateData.giro.trim();

    if (updateData.contacto) {
      const contacto = updateData.contacto;
      if (!contacto.nombre && !contacto.email && !contacto.telefono) {
        throw new AppError(
            400,
            "Si se incluye información de contacto, debe proporcionar " +
            "al menos uno de: 'nombre', 'email' o 'telefono'.",
        );
      }
      this._validarTelefono(contacto.telefono);
      updateData.contacto = {
        nombre: contacto.nombre ? contacto.nombre.trim() : null,
        email: contacto.email ? contacto.email.trim().toLowerCase() : null,
        telefono: contacto.telefono ? contacto.telefono.trim() : null,
      };
    }

    return await empresaRepository.update(id, updateData);
  }

  /**
   * Cambia el RUT de una Empresa (solo superadmin), moviendo el índice
   * empresasRut en una transacción; rechaza si el nuevo RUT ya existe.
   * @param {string} id ID de la Empresa.
   * @param {string} rutAnterior RUT normalizado actual.
   * @param {string} rutNuevo RUT normalizado nuevo.
   * @return {Promise<void>}
   */
  async _cambiarRut(id, rutAnterior, rutNuevo) {
    const refNuevo = db.collection(RUT_COLLECTION).doc(rutNuevo);
    const refAnterior = db.collection(RUT_COLLECTION).doc(rutAnterior);
    await db.runTransaction(async (tx) => {
      const ocupado = await tx.get(refNuevo);
      if (ocupado.exists && ocupado.data().empresaId !== id) {
        throw new AppError(
            409, `Ya existe una Empresa con el RUT ${rutNuevo}.`,
        );
      }
      tx.set(refNuevo, {
        empresaId: id, createdAt: FieldValue.serverTimestamp(),
      });
      tx.delete(refAnterior);
      tx.update(db.collection(empresaRepository.COLLECTION).doc(id), {
        rut: rutNuevo, updatedAt: FieldValue.serverTimestamp(),
      });
    });
  }

  /**
   * Desactiva una empresa existente.
   * @param {string} id ID de la empresa.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object|null>} La empresa desactivada.
   */
  async desactivarEmpresa(id, actor) {
    await this.getEmpresaById(id, actor);
    return await empresaRepository.setEstado(id, "inactivo");
  }

  /**
   * Calcula, en una sola llamada, los contadores de Personas, Recursos y
   * Proyectos (distintos, vía Participación activa) de una Empresa.
   * @param {string} id ID de la empresa.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<{personasCount: number, recursosCount: number,
   *     proyectosCount: number}>} Los contadores calculados.
   */
  async obtenerResumen(id, actor) {
    await this.getEmpresaById(id, actor); // Existencia y alcance

    // Personas y Recursos de la Empresa: los con relación ACTIVA con ella.
    const [personas, recursos, participaciones] = await Promise.all([
      empresaPersonaRepository.listActivasByEmpresa(id),
      empresaRecursoRepository.listActivasByEmpresa(id),
      participacionRepository.list({empresaId: id}),
    ]);

    const participacionesActivas = participaciones.filter(
        (p) => p.estado === "activa",
    );
    const proyectosActivos = new Set(
        participacionesActivas.map((p) => p.proyectoId),
    );

    // Detalle por participación activa (Proyecto + Perfil de
    // Participación asociado) — para la columna "Proyecto/Perfil" y el
    // panel lateral de EmpresasListPage.jsx, que necesitan el nombre, no
    // solo el conteo. Una Empresa activa normalmente tiene 0-2
    // participaciones simultáneas, así que resolver cada Proyecto/Perfil
    // por separado (sin `in` batching) es aceptable acá.
    const proyectos = await Promise.all(
        participacionesActivas.map(
            (p) => proyectoRepository.getById(p.proyectoId),
        ),
    );
    const perfiles = await Promise.all(
        participacionesActivas.map((p) =>
          p.perfilParticipacionId ?
            perfilParticipacionRepository.getById(p.perfilParticipacionId) :
            null,
        ),
    );
    // Mandante del Proyecto (no de la Participación) — se resuelve vía
    // proyectos[i].mandanteId, con una cache local para no repetir la
    // misma consulta si dos Proyectos activos comparten Mandante.
    const mandanteCache = {};
    const mandantes = await Promise.all(
        proyectos.map(async (proyecto) => {
          if (!proyecto?.mandanteId) return null;
          if (!(proyecto.mandanteId in mandanteCache)) {
            mandanteCache[proyecto.mandanteId] =
                await mandanteRepository.getById(proyecto.mandanteId);
          }
          return mandanteCache[proyecto.mandanteId];
        }),
    );
    // Personas/Maquinarias y avance de Requerimientos DE ESTA Participación
    // (su Proyecto y su Expediente), nunca agregados entre Proyectos.
    const resumenesParticipacion = await Promise.all(
        participacionesActivas.map(
            (p) => reporteService.resumirParticipacion(p),
        ),
    );
    const participacionesDetalle = participacionesActivas.map((p, i) => ({
      participacionId: p.id,
      personasCount: resumenesParticipacion[i].personasCount,
      recursosCount: resumenesParticipacion[i].recursosCount,
      evaluacion: resumenesParticipacion[i].evaluacion,
      proyectoId: p.proyectoId,
      proyectoNombre: proyectos[i]?.nombre || null,
      perfilParticipacionId: p.perfilParticipacionId || null,
      perfilNombre: perfiles[i]?.nombre || null,
      mandanteId: proyectos[i]?.mandanteId || null,
      mandanteNombre: getMandanteDisplayName(mandantes[i]) || null,
      mandanteLogoUrl: mandantes[i]?.logoUrl || null,
    }));

    return {
      personasCount: personas.length,
      recursosCount: recursos.length,
      proyectosCount: proyectosActivos.size,
      participacionesActivas: participacionesDetalle,
    };
  }

  /**
   * Eventos de Bitácora relacionados a una Empresa: los de la propia
   * Empresa, los de sus Participaciones y los de sus personas y maquinarias
   * asignadas (cualquier
   * estado). Solo lectura, solo datos reales de Bitácora.
   * @param {string} id ID de la empresa.
   * @param {Object} actor Usuario autenticado que ejecuta la acción.
   * @param {{limit: (string|number|undefined)}} [opciones] Máximo de
   *     eventos (por defecto 15, tope 500).
   * @return {Promise<Object[]>} Eventos, más reciente primero.
   */
  async obtenerEventos(id, actor, {limit} = {}) {
    await this.getEmpresaById(id, actor); // Existencia y alcance

    const [participaciones, personas, recursos] = await Promise.all([
      participacionRepository.list({empresaId: id}),
      participacionPersonaRepository.list({empresaId: id}),
      participacionRecursoRepository.list({empresaId: id}),
    ]);
    const documentos = [
      ...personas.map((a) => ({...a, entidad: "participacionPersona"})),
      ...recursos.map((a) => ({...a, entidad: "participacionRecurso"})),
    ].sort((a, b) =>
      (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));

    // Una consulta por referencia: se acota a los documentos más
    // recientes (el repositorio las devuelve de más nueva a más antigua)
    // para no disparar lecturas en Empresas con mucho personal.
    const MAX_DOCUMENTOS = 30;
    const referencias = [
      {entidad: "empresa", entidadId: id},
      ...participaciones.map((p) => ({
        entidad: "participacion", entidadId: p.id,
      })),
      ...documentos.slice(0, MAX_DOCUMENTOS).map((a) => ({
        entidad: a.entidad, entidadId: a.id,
      })),
    ];

    return bitacoraService.listarPorReferencias(referencias, actor, {limit});
  }
}

module.exports = new EmpresaService();
module.exports.RUT_COLLECTION = RUT_COLLECTION;
