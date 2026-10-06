const admin = require("firebase-admin");
const usuarioRepository = require("../repositories/usuarioRepository");
const mandanteRepository = require("../repositories/mandanteRepository");
const bitacoraRepository = require("../repositories/bitacoraRepository");
const sesionRepository = require("../repositories/sesionRepository");
const AppError = require("../utils/AppError");
const {generateTempPassword} = require("../utils/passwordGenerator");
const bitacoraLogger = require("../utils/bitacoraLogger");
const sesionService = require("./sesionService");
const metricaUsuarioService = require("./metricaUsuarioService");
const {enviarCorreo} = require("./emailService");

// Catálogo oficial de roles: fuente única de verdad, espejada a mano en
// frontend/src/services/usuarioService.js.
const ROLES_USUARIO = [
  {
    value: "superadmin",
    label: "Super Administrador",
    requiereMandante: false,
  },
  {value: "evaluador", label: "Evaluador", requiereMandante: false},
  {
    value: "admin_comercial",
    label: "Administrador Comercial",
    requiereMandante: false,
  },
  {
    value: "mandante_admin",
    label: "Administrador de Mandante",
    requiereMandante: true,
  },
  {
    value: "mandante_lector",
    label: "Lector de Mandante",
    requiereMandante: true,
  },
];

const ROLES_VALIDOS = ROLES_USUARIO.map((r) => r.value);
const ROLES_CON_MANDANTE = ROLES_USUARIO
    .filter((r) => r.requiereMandante)
    .map((r) => r.value);

// Roles de personal SmartApplication. Se mantienen como dos categorías
// separadas a propósito: ROLES_SMARTAPPLICATION (gestión técnica/incidentes
// de plataforma, alcance transversal irrestricto en varios Services vía
// ROLES_ALCANCE_FORZADO) vs ROLES_SMARTAPPLICATION_COMERCIAL (gestión
// comercial de clientes, alcance acotado a Mandante + Usuario únicamente —
// NUNCA se agrega a un array de alcance irrestricto existente).
const ROLES_SMARTAPPLICATION = ["superadmin", "evaluador"];
const ROLES_SMARTAPPLICATION_COMERCIAL = ["admin_comercial"];
const ESTADOS_VALIDOS = ["activo", "inactivo", "bloqueado"];
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Reglas de negocio para el recurso Usuario.
 */
class UsuarioService {
  /**
   * Valida RN-002/RN-003: coherencia entre rol y mandanteId, y que el
   * Mandante asociado exista y esté activo.
   * @param {string} rol Rol del usuario.
   * @param {?string} mandanteId ID del Mandante asociado.
   * @return {Promise<void>}
   */
  async _validarRolYMandante(rol, mandanteId) {
    if (ROLES_CON_MANDANTE.includes(rol)) {
      if (!mandanteId) {
        throw new AppError(400, `El rol '${rol}' requiere un mandanteId.`);
      }
      const mandante = await mandanteRepository.getById(mandanteId);
      if (!mandante) {
        throw new AppError(400, "El Mandante indicado no existe.");
      }
      if (mandante.estado !== "activo") {
        throw new AppError(400, "El Mandante indicado no está activo.");
      }
    } else if (mandanteId) {
      throw new AppError(
          400,
          `El rol '${rol}' no admite un mandanteId asociado.`,
      );
    }
  }

  /**
   * Aplica el aislamiento por alcance del actor sobre el rol y mandanteId
   * solicitados para un usuario objetivo, forzando/rechazando según su rol.
   * @param {Object} actor Usuario autenticado que ejecuta la acción.
   * @param {string} rolSolicitado Rol solicitado para el usuario objetivo.
   * @param {?string} mandanteIdSolicitado mandanteId solicitado.
   * @return {Object} Rol y mandanteId resueltos tras aplicar el alcance.
   */
  _aplicarScopeActor(actor, rolSolicitado, mandanteIdSolicitado) {
    if (actor.rol === "mandante_admin") {
      if (!ROLES_CON_MANDANTE.includes(rolSolicitado)) {
        throw new AppError(403, "No tiene permisos para asignar ese rol.");
      }
      // El mandanteId siempre se fuerza al propio del actor: nunca se
      // confía en el valor recibido del cliente para este caso.
      return {rol: rolSolicitado, mandanteId: actor.mandanteId};
    }
    if (ROLES_SMARTAPPLICATION_COMERCIAL.includes(actor.rol)) {
      // admin_comercial: solo puede dar de alta mandante_admin/lector,
      // pero de CUALQUIER Mandante (a diferencia de mandante_admin, que
      // queda forzado al propio). Nunca puede asignar superadmin,
      // evaluador ni admin_comercial — ni siquiera a sí mismo.
      if (!ROLES_CON_MANDANTE.includes(rolSolicitado)) {
        throw new AppError(403, "No tiene permisos para asignar ese rol.");
      }
      return {rol: rolSolicitado, mandanteId: mandanteIdSolicitado ?? null};
    }
    return {rol: rolSolicitado, mandanteId: mandanteIdSolicitado ?? null};
  }

  /**
   * Obtiene un usuario por su UID, respetando el alcance del actor.
   * @param {string} id UID del usuario.
   * @param {Object} actor Usuario autenticado que ejecuta la acción.
   * @return {Promise<Object>} El usuario encontrado.
   */
  async getUsuarioById(id, actor) {
    if (!id || typeof id !== "string") {
      throw new AppError(400, "ID de usuario inválido.");
    }
    const usuario = await usuarioRepository.getById(id);
    if (!usuario) {
      throw new AppError(404, "Usuario no encontrado.");
    }
    // 404 (no 403) ante fuga cross-tenant: no confirma la existencia de
    // cuentas fuera del propio Mandante del actor.
    if (
      actor.rol === "mandante_admin" &&
      usuario.mandanteId !== actor.mandanteId
    ) {
      throw new AppError(404, "Usuario no encontrado.");
    }
    // admin_comercial: mismo criterio de "ocultar existencia" que arriba,
    // pero por ROL en vez de por mandanteId — no debe poder confirmar la
    // existencia de cuentas superadmin/evaluador/admin_comercial por ID.
    if (
      ROLES_SMARTAPPLICATION_COMERCIAL.includes(actor.rol) &&
      !ROLES_CON_MANDANTE.includes(usuario.rol)
    ) {
      throw new AppError(404, "Usuario no encontrado.");
    }
    // Mismo alias que `listarUsuarios` ("leídos del agregado, no
    // calculados sobre sesiones") — así `GET /usuarios/:id` expone
    // `ultimoAcceso` con el mismo nombre en ambos endpoints.
    return {...usuario, ultimoAcceso: usuario.ultimoAccesoAt || null};
  }

  /**
   * Lista usuarios, forzando el alcance del actor cuando corresponde.
   * @param {Object} filtros Filtros de búsqueda (mandanteId, estado).
   * @param {Object} actor Usuario autenticado que ejecuta la acción.
   * @return {Promise<Object[]>} Lista de usuarios.
   */
  async listarUsuarios(filtros, actor) {
    const filtrosFinales = {...filtros};
    if (actor.rol === "mandante_admin") {
      filtrosFinales.mandanteId = actor.mandanteId;
    }
    let usuarios = await usuarioRepository.list(filtrosFinales);
    // admin_comercial: puede listar de cualquier Mandante (no fuerza
    // filtrosFinales.mandanteId), pero solo debe ver cuentas
    // mandante_admin/mandante_lector — nunca superadmin/evaluador/
    // admin_comercial en el listado.
    if (ROLES_SMARTAPPLICATION_COMERCIAL.includes(actor.rol)) {
      usuarios = usuarios.filter((u) => ROLES_CON_MANDANTE.includes(u.rol));
    }

    // Fase C: "ultimoAcceso" sale del propio doc de Usuario
    // (denormalizado por sesionService.iniciar) y "accesos7d" de UNA
    // consulta agregada sobre metricasUsuarioDiarias — nunca una consulta
    // a `sesiones` por fila.
    const accesos7dPorUsuario = await metricaUsuarioService
        .obtenerAccesos7dPorUsuario(usuarios.map((u) => u.id));
    return usuarios.map((u) => ({
      ...u,
      ultimoAcceso: u.ultimoAccesoAt || null,
      accesos7d: accesos7dPorUsuario[u.id] || 0,
    }));
  }

  /**
   * Crea un nuevo usuario: cuenta de Auth + Custom Claims + documento
   * Firestore. Devuelve la contraseña temporal generada una única vez.
   * @param {Object} payload Datos del nuevo usuario.
   * @param {Object} actor Usuario autenticado que ejecuta la acción.
   * @return {Promise<Object>} El usuario creado, con `passwordTemporal`.
   */
  async crearUsuario(payload, actor) {
    const {nombre, apellido, email} = payload;

    if (!nombre || !apellido || !email) {
      throw new AppError(
          400,
          "Faltan campos obligatorios: 'nombre', 'apellido' y 'email' " +
          "son requeridos.",
      );
    }
    if (!EMAIL_REGEX.test(email)) {
      throw new AppError(400, "El email proporcionado no es válido.");
    }
    if (!ROLES_VALIDOS.includes(payload.rol)) {
      throw new AppError(
          400,
          `Rol '${payload.rol}' no válido. ` +
          `Valores permitidos: ${ROLES_VALIDOS.join(", ")}.`,
      );
    }

    const {rol, mandanteId} = this._aplicarScopeActor(
        actor, payload.rol, payload.mandanteId,
    );
    await this._validarRolYMandante(rol, mandanteId);

    let emailEnUso = true;
    try {
      await admin.auth().getUserByEmail(email);
    } catch (error) {
      if (error.code === "auth/user-not-found") {
        emailEnUso = false;
      } else {
        throw error;
      }
    }
    if (emailEnUso) {
      throw new AppError(409, "Ya existe un usuario con este email.");
    }

    const password = (payload.password && payload.password.trim()) ||
        generateTempPassword();

    let userRecord;
    try {
      userRecord = await admin.auth().createUser({
        email,
        password,
        displayName: `${nombre} ${apellido}`,
      });
    } catch (error) {
      if (error.code === "auth/email-already-exists") {
        throw new AppError(409, "Ya existe un usuario con este email.");
      }
      throw error;
    }

    try {
      await admin.auth().setCustomUserClaims(
          userRecord.uid, {rol, mandanteId},
      );
      const usuarioCreado = await usuarioRepository.create(userRecord.uid, {
        email,
        nombre: nombre.trim(),
        apellido: apellido.trim(),
        rol,
        mandanteId,
        estado: "activo",
      });
      // Antes faltaba (ver auditoría Fase A): crear un usuario no dejaba
      // rastro en la Bitácora, solo actualizarlo.
      await bitacoraLogger.registrarEvento({
        mandanteId,
        entidad: "usuario",
        entidadId: userRecord.uid,
        accion: "creado",
        actor,
        detalle: {rol, mandanteId},
      });
      return {...usuarioCreado, passwordTemporal: password};
    } catch (error) {
      // Rollback: evita cuentas de Auth huérfanas sin perfil Firestore.
      await admin.auth().deleteUser(userRecord.uid).catch(() => {});
      throw error;
    }
  }

  /**
   * Actualiza los campos editables de un usuario, resincronizando Custom
   * Claims y el estado de bloqueo en Auth cuando corresponda.
   * @param {string} id UID del usuario.
   * @param {Object} payload Campos a actualizar.
   * @param {Object} actor Usuario autenticado que ejecuta la acción.
   * @return {Promise<Object|null>} El usuario actualizado.
   */
  async actualizarUsuario(id, payload, actor) {
    // getUsuarioById ya aplica el alcance del actor (404 si es de otro
    // Mandante), así que a partir de aquí el acceso está garantizado.
    const existente = await this.getUsuarioById(id, actor);

    // Protecciones de Fase D — antes de tocar cualquier campo.
    const rolCambiaEnPayload = payload.rol !== undefined &&
        payload.rol !== existente.rol;
    const estadoDesactivaEnPayload = payload.estado !== undefined &&
        payload.estado !== "activo";
    if (id === actor.uid && (rolCambiaEnPayload || estadoDesactivaEnPayload)) {
      throw new AppError(
          403, "No puede cambiar su propio rol ni desactivarse a sí mismo.",
      );
    }
    const dejaDeSerSuperadminActivo = existente.rol === "superadmin" &&
        existente.estado === "activo" &&
        (rolCambiaEnPayload || estadoDesactivaEnPayload);
    if (dejaDeSerSuperadminActivo) {
      await this._exigirNoUltimoSuperadmin(id);
    }

    const allowedFields = [
      "nombre", "apellido", "rol", "mandanteId", "estado",
    ];
    const updateData = {};
    for (const key of allowedFields) {
      if (payload[key] !== undefined) {
        updateData[key] = payload[key];
      }
    }

    if (updateData.rol !== undefined || updateData.mandanteId !== undefined) {
      const rolFinal = updateData.rol !== undefined ?
          updateData.rol : existente.rol;
      const mandanteIdFinal = updateData.mandanteId !== undefined ?
          updateData.mandanteId : existente.mandanteId;
      const resuelto = this._aplicarScopeActor(
          actor, rolFinal, mandanteIdFinal,
      );
      updateData.rol = resuelto.rol;
      updateData.mandanteId = resuelto.mandanteId;
      await this._validarRolYMandante(resuelto.rol, resuelto.mandanteId);
    }

    if (updateData.estado && !ESTADOS_VALIDOS.includes(updateData.estado)) {
      throw new AppError(400, `Estado '${updateData.estado}' no válido.`);
    }

    if (updateData.nombre) updateData.nombre = updateData.nombre.trim();
    if (updateData.apellido) {
      updateData.apellido = updateData.apellido.trim();
    }

    const rolCambio = updateData.rol !== undefined &&
        updateData.rol !== existente.rol;
    const mandanteIdCambio = updateData.mandanteId !== undefined &&
        updateData.mandanteId !== existente.mandanteId;
    if (rolCambio || mandanteIdCambio) {
      await admin.auth().setCustomUserClaims(id, {
        rol: updateData.rol !== undefined ? updateData.rol : existente.rol,
        mandanteId: updateData.mandanteId !== undefined ?
            updateData.mandanteId : existente.mandanteId,
      });
    }

    const estadoCambio = updateData.estado !== undefined &&
        updateData.estado !== existente.estado;
    if (estadoCambio) {
      await admin.auth().updateUser(id, {
        disabled: updateData.estado !== "activo",
      });
    }

    if (rolCambio || mandanteIdCambio || estadoCambio) {
      // Fase D: el cambio debe aplicar de inmediato, no esperar a que el
      // token de ID actual expire naturalmente (hasta 1 hora) con los
      // claims/estado viejos.
      await admin.auth().revokeRefreshTokens(id);
    }

    const actualizado = await usuarioRepository.update(id, updateData);

    if (rolCambio || mandanteIdCambio || estadoCambio) {
      // detalle solo incluye los campos que efectivamente cambiaron, con
      // su valor anterior y nuevo — nunca password ni otro dato sensible
      // (ni siquiera está en `allowedFields` de este método).
      const detalle = {};
      if (rolCambio) {
        detalle.rol = {anterior: existente.rol, nuevo: updateData.rol};
      }
      if (mandanteIdCambio) {
        detalle.mandanteId = {
          anterior: existente.mandanteId, nuevo: updateData.mandanteId,
        };
      }
      if (estadoCambio) {
        detalle.estado = {
          anterior: existente.estado, nuevo: updateData.estado,
        };
      }

      await bitacoraLogger.registrarEvento({
        mandanteId: updateData.mandanteId !== undefined ?
            updateData.mandanteId : existente.mandanteId,
        entidad: "usuario",
        entidadId: id,
        accion: "actualizado",
        actor,
        detalle,
      });
    }

    return actualizado;
  }

  /**
   * Desactiva (bloquea el login y marca inactivo) a un usuario existente.
   * @param {string} id UID del usuario.
   * @param {Object} actor Usuario autenticado que ejecuta la acción.
   * @return {Promise<Object|null>} El usuario desactivado.
   */
  async desactivarUsuario(id, actor) {
    return this.actualizarUsuario(id, {estado: "inactivo"}, actor);
  }

  /**
   * Reactiva un usuario previamente desactivado.
   * @param {string} id UID del usuario.
   * @param {Object} actor Usuario autenticado que ejecuta la acción.
   * @return {Promise<Object|null>} El usuario reactivado.
   */
  async reactivarUsuario(id, actor) {
    return this.actualizarUsuario(id, {estado: "activo"}, actor);
  }

  /**
   * Lanza 403 si `id` es el único superadmin activo del sistema.
   * @param {string} id UID a excluir del conteo (es el que se está por
   *     desactivar/degradar).
   * @return {Promise<void>}
   */
  async _exigirNoUltimoSuperadmin(id) {
    const activos = await usuarioRepository.list({estado: "activo"});
    const superadminsActivos = activos.filter((u) => u.rol === "superadmin");
    if (superadminsActivos.length <= 1 &&
        superadminsActivos.some((u) => u.id === id)) {
      throw new AppError(
          403,
          "No se puede desactivar ni degradar al último superadmin activo.",
      );
    }
  }

  /**
   * Restablece la contraseña de un usuario: genera el link oficial de
   * Firebase Auth y lo envía por correo con el servicio existente
   * (`emailService`, Resend). Nunca expone el link en la respuesta HTTP.
   * @param {string} id UID del usuario.
   * @param {Object} actor Usuario autenticado que ejecuta la acción.
   * @return {Promise<{enviado: boolean}>}
   */
  async resetPassword(id, actor) {
    const usuario = await this.getUsuarioById(id, actor);
    const link = await admin.auth().generatePasswordResetLink(usuario.email);
    await enviarCorreo({
      to: usuario.email,
      subject: "SmartOne v3 — Restablecer contraseña",
      html:
        `<p>Hola ${usuario.nombre},</p>` +
        `<p>Se solicitó restablecer la contraseña de tu cuenta SmartOne. ` +
        `Si fuiste tú, hacé clic en el siguiente enlace:</p>` +
        `<p><a href="${link}">Restablecer contraseña</a></p>` +
        `<p>Si no fuiste vos, podés ignorar este correo.</p>`,
    });
    await bitacoraLogger.registrarEvento({
      mandanteId: usuario.mandanteId,
      entidad: "usuario",
      entidadId: id,
      accion: "reset_password_solicitado",
      actor,
      detalle: {}, // nunca el link ni la contraseña.
    });
    return {enviado: true};
  }

  /**
   * Cierra todas las sesiones abiertas de un usuario y revoca sus
   * refresh tokens — el usuario queda desconectado de inmediato en todos
   * los dispositivos.
   * @param {string} id UID del usuario.
   * @param {Object} actor Usuario autenticado que ejecuta la acción.
   * @return {Promise<{sesionesCerradas: number}>}
   */
  async revocarSesiones(id, actor) {
    const usuario = await this.getUsuarioById(id, actor);
    await admin.auth().revokeRefreshTokens(id);
    const sesionesCerradas = await sesionService.revocarTodas(id);
    await bitacoraLogger.registrarEvento({
      mandanteId: usuario.mandanteId,
      entidad: "usuario",
      entidadId: id,
      accion: "sesiones_revocadas",
      actor,
      detalle: {sesionesCerradas},
    });
    return {sesionesCerradas};
  }

  /**
   * `GET /usuarios/actividad-hoy` — resumen agregado para el panel
   * "Actividad hoy" del listado (Fase E). A diferencia de
   * métricas/actividad/sesiones de UN usuario, este es un agregado de
   * pantalla — mismo alcance de rol que el listado básico
   * (PUEDE_ADMINISTRAR_USUARIOS), no el más restrictivo de
   * PUEDE_VER_ACTIVIDAD.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<object>}
   */
  async obtenerResumenActividadHoy(actor) {
    const mandanteId = actor.rol === "mandante_admin" ?
        actor.mandanteId : null;
    return metricaUsuarioService.obtenerResumenHoy(mandanteId);
  }

  /**
   * `GET /usuarios/:id/metricas` — totales + serie diaria del período.
   * Ver métricas/actividad: solo `superadmin` (todos) y `mandante_admin`
   * (los de su propio Mandante) — más restrictivo que el CRUD básico de
   * Usuarios, que además permite `admin_comercial`.
   * @param {string} id UID del usuario.
   * @param {{desde: string, hasta: string}} rango Fechas YYYY-MM-DD.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<object>}
   */
  async obtenerMetricas(id, rango, actor) {
    this._exigirPuedeVerActividad(actor);
    await this.getUsuarioById(id, actor);
    return metricaUsuarioService.obtenerMetricas(id, rango);
  }

  /**
   * `GET /usuarios/:id/actividad` — línea de tiempo desde Bitácora,
   * paginada con cursor. Devuelve los campos crudos (entidad, accion,
   * detalle, actorNombre, createdAt) — el frontend ya cuenta con
   * `describirEvento()` (utils/bitacoraFormatters.js) para traducirlos a
   * labels legibles sin duplicar esa lógica en el backend.
   * @param {string} id UID del usuario.
   * @param {{cursor: (string|undefined), tipo: (string|undefined)}}
   *     opciones
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<object[]>}
   */
  async obtenerActividad(id, {cursor, tipo}, actor) {
    this._exigirPuedeVerActividad(actor);
    await this.getUsuarioById(id, actor);
    return bitacoraRepository.listPorActor(id, {cursor, tipo});
  }

  /**
   * `GET /usuarios/:id/sesiones` — historial de sesiones, paginado.
   * @param {string} id UID del usuario.
   * @param {{cursor: (string|undefined)}} opciones
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<object[]>}
   */
  async obtenerSesiones(id, {cursor}, actor) {
    this._exigirPuedeVerActividad(actor);
    await this.getUsuarioById(id, actor);
    return sesionRepository.listPorUsuario(id, {cursor});
  }

  /**
   * @param {Object} actor
   * @return {void}
   */
  _exigirPuedeVerActividad(actor) {
    if (!["superadmin", "mandante_admin"].includes(actor.rol)) {
      throw new AppError(
          403, "No tiene permisos para ver la actividad de usuarios.",
      );
    }
  }
}

module.exports = new UsuarioService();
module.exports.ROLES_USUARIO = ROLES_USUARIO;
module.exports.ROLES_SMARTAPPLICATION = ROLES_SMARTAPPLICATION;
module.exports.ROLES_SMARTAPPLICATION_COMERCIAL =
    ROLES_SMARTAPPLICATION_COMERCIAL;
