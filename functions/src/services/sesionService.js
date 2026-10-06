const sesionRepository = require("../repositories/sesionRepository");
const usuarioRepository = require("../repositories/usuarioRepository");
const metricaUsuarioService = require("./metricaUsuarioService");
const AppError = require("../utils/AppError");

const PLATAFORMAS_VALIDAS = ["web", "android"];

/**
 * Reglas de negocio de Sesiones (telemetría de accesos — Fase B). Ver
 * `docs/` para las definiciones exactas de "acceso" y "tiempo conectado":
 * un acceso es una sesión nueva; el tiempo conectado es aproximado
 * (± el intervalo de latido), con la pestaña/app en primer plano y con
 * latidos activos — NO es tiempo de trabajo efectivo.
 */
class SesionService {
  /**
   * Crea una sesión nueva al hacer login (o al volver después de 30 min
   * sin latido — ese criterio lo aplica el cliente, no este Service).
   * @param {Object} actor Usuario autenticado (`req.user`).
   * @param {{plataforma: string, userAgent: ?string}} payload Datos del
   *     dispositivo/cliente.
   * @return {Promise<{sesionId: string}>} El id de la sesión creada.
   */
  async iniciar(actor, {plataforma, userAgent}) {
    if (!PLATAFORMAS_VALIDAS.includes(plataforma)) {
      throw new AppError(
          400,
          `'plataforma' inválida. Valores permitidos: ` +
          `${PLATAFORMAS_VALIDAS.join(", ")}.`,
      );
    }
    const sesion = await sesionRepository.create({
      usuarioId: actor.uid,
      mandanteId: actor.mandanteId ?? null,
      plataforma,
      userAgent,
    });
    // Un solo punto de escritura por métrica (ver metricaUsuarioService):
    // "accesos" se incrementa acá, nunca en otro lado.
    await metricaUsuarioService.registrarAcceso(actor.uid, actor.mandanteId);
    // Denormalizado en el propio doc de Usuario para que `GET /usuarios`
    // pueda mostrar "Último acceso" por fila sin consultar `sesiones` por
    // cada una (ver Fase C: "leídos del agregado y no calculados sobre
    // sesiones").
    await usuarioRepository.update(actor.uid, {
      ultimoAccesoAt: new Date(),
    }).catch((err) => {
      // No debe romper el login si esto falla — es solo una denormalización.
      console.error("⚠️ No se pudo actualizar ultimoAccesoAt:", err);
    });
    return {sesionId: sesion.id};
  }

  /**
   * Actualiza el latido de una sesión propia.
   * @param {string} sesionId ID de la sesión.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<void>}
   */
  async latido(sesionId, actor) {
    const sesion = await sesionRepository.getById(sesionId);
    if (!sesion) throw new AppError(404, "Sesión no encontrada.");
    if (sesion.usuarioId !== actor.uid) {
      // 404, no 403: no confirma la existencia de una sesión ajena.
      throw new AppError(404, "Sesión no encontrada.");
    }
    if (sesion.fin) {
      // La sesión ya se cerró (logout en otra pestaña, timeout, o
      // revocación) — el cliente debe iniciar una nueva, no es un error
      // fatal del lado del latido en sí.
      throw new AppError(409, "Esta sesión ya está cerrada.");
    }
    await sesionRepository.actualizarLatido(sesionId);
  }

  /**
   * Cierra una sesión propia (logout explícito del usuario).
   * @param {string} sesionId ID de la sesión.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<object>} La sesión cerrada.
   */
  async cerrarPropia(sesionId, actor) {
    const sesion = await sesionRepository.getById(sesionId);
    if (!sesion) throw new AppError(404, "Sesión no encontrada.");
    if (sesion.usuarioId !== actor.uid) {
      throw new AppError(404, "Sesión no encontrada.");
    }
    if (sesion.fin) return sesion; // Idempotente: ya estaba cerrada.
    return this._cerrar(sesion, "logout");
  }

  /**
   * Cierra una sesión sin verificar actor — usada por la scheduled
   * function de timeout y por "revocar sesiones" (acción de un admin
   * sobre sesiones de OTRO usuario, ya autorizada en ese punto de
   * llamada).
   * @param {object} sesion La sesión ya leída.
   * @param {"timeout"|"revocada"} cierre Motivo del cierre.
   * @param {Date} [finFecha] Momento del fin (el timeout usa
   *     `ultimoLatido`, no "ahora").
   * @return {Promise<object>} La sesión cerrada.
   */
  async cerrarInterna(sesion, cierre, finFecha) {
    if (sesion.fin) return sesion;
    return this._cerrar(sesion, cierre, finFecha);
  }

  /**
   * @param {object} sesion
   * @param {string} cierre
   * @param {Date} [finFecha]
   * @return {Promise<object>}
   */
  async _cerrar(sesion, cierre, finFecha) {
    const cerrada = await sesionRepository.cerrar(
        sesion.id, sesion, cierre, finFecha,
    );
    const inicioDate = sesion.inicio?.toDate ?
        sesion.inicio.toDate() : new Date(sesion.inicio);
    await metricaUsuarioService.registrarTiempoConectado(
        sesion.usuarioId, sesion.mandanteId, inicioDate, cerrada.duracionSeg,
    );
    return cerrada;
  }

  /**
   * Cierra TODAS las sesiones abiertas de un usuario — "Revocar
   * sesiones" (Fase D). El caller ya validó permisos.
   * @param {string} usuarioId ID del usuario.
   * @return {Promise<number>} Cantidad de sesiones cerradas.
   */
  async revocarTodas(usuarioId) {
    const abiertas = await sesionRepository.getAbiertasPorUsuario(usuarioId);
    await Promise.all(abiertas.map((s) => this.cerrarInterna(s, "revocada")));
    return abiertas.length;
  }

  /**
   * Historial de sesiones de un usuario, paginado.
   * @param {string} usuarioId ID del usuario.
   * @param {{cursor: (string|undefined)}} opciones
   * @return {Promise<object[]>}
   */
  async listarPorUsuario(usuarioId, {cursor} = {}) {
    return sesionRepository.listPorUsuario(usuarioId, {cursor});
  }
}

module.exports = new SesionService();
