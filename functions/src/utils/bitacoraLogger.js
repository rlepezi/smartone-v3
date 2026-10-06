const bitacoraRepository = require("../repositories/bitacoraRepository");
const usuarioRepository = require("../repositories/usuarioRepository");

/**
 * Registra un evento de auditoría en la Bitácora (RN-104/RN-120/RN-121).
 * NUNCA debe hacer fallar la operación de negocio que lo invoca: cualquier
 * error (de la búsqueda del nombre del actor o de la escritura misma) se
 * atrapa acá y solo se loguea a consola. La trazabilidad es importante,
 * pero nunca debe impedir que el sistema funcione.
 * @param {Object} evento Datos del evento.
 * @param {?string} evento.mandanteId mandanteId denormalizado desde la
 *     entidad afectada, o null si no aplica.
 * @param {string} evento.entidad Nombre de la colección afectada.
 * @param {string} evento.entidadId ID del documento afectado.
 * @param {string} evento.accion Acción realizada.
 * @param {Object} evento.actor Usuario autenticado (`req.user`) que
 *     ejecutó la acción — nunca se confía en un actor que venga del
 *     payload del cliente.
 * @param {Object} [evento.detalle] Detalle flexible según el caso. Nunca
 *     debe incluir contraseñas ni otros datos sensibles.
 * @return {Promise<void>}
 */
async function registrarEvento({
  mandanteId, entidad, entidadId, accion, actor, detalle,
}) {
  try {
    let actorNombre = actor.email;
    try {
      const usuario = await usuarioRepository.getById(actor.uid);
      if (usuario) {
        actorNombre = `${usuario.nombre} ${usuario.apellido}`.trim();
      }
    } catch (lookupError) {
      console.error(
          "⚠️ No se pudo resolver el nombre del actor para la bitácora:",
          lookupError,
      );
    }

    await bitacoraRepository.create({
      mandanteId: mandanteId ?? null,
      entidad,
      entidadId,
      accion,
      actorUid: actor.uid,
      actorNombre,
      actorRol: actor.rol,
      detalle: detalle || null,
    });
  } catch (error) {
    console.error("⚠️ Error al registrar evento de bitácora:", error);
  }
}

module.exports = {registrarEvento};
