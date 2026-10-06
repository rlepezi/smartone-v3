// Espejo manual de las reglas de permisos del backend (Fase D de "Usuarios
// — actividad, métricas y gestión de accesos"): `usuarioRoutes.js`
// (PUEDE_ADMINISTRAR_USUARIOS / PUEDE_VER_ACTIVIDAD) y las protecciones de
// `usuarioService.js` (auto-desactivación, último superadmin). Este
// archivo es SOLO para mostrar/ocultar UI — el backend siempre vuelve a
// validar todo, nunca se confía en esto como control de acceso real.
const ACCIONES_USUARIO = {
  editar_usuario: ["superadmin", "mandante_admin", "admin_comercial"],
  desactivar_usuario: ["superadmin", "mandante_admin", "admin_comercial"],
  reactivar_usuario: ["superadmin", "mandante_admin", "admin_comercial"],
  resetear_password: ["superadmin", "mandante_admin", "admin_comercial"],
  revocar_sesiones: ["superadmin", "mandante_admin", "admin_comercial"],
  // Más restrictivo que el CRUD básico — admin_comercial queda afuera
  // (mismo criterio que PUEDE_VER_ACTIVIDAD en el backend).
  ver_metricas: ["superadmin", "mandante_admin"],
  ver_actividad: ["superadmin", "mandante_admin"],
  ver_sesiones: ["superadmin", "mandante_admin"],
};

/**
 * @param {?string} rol Rol del usuario actual.
 * @param {string} accion Una de las claves de ACCIONES_USUARIO.
 * @return {boolean}
 */
export function can(rol, accion) {
  return (ACCIONES_USUARIO[accion] || []).includes(rol);
}

/**
 * Protecciones que ocultan la acción incluso si `can()` la permitiría:
 * nadie se desactiva ni se cambia el rol a sí mismo (RN de Fase D). El
 * backend vuelve a validar esto igual — acá es solo para no mostrar un
 * botón que siempre fallaría.
 * @param {string} usuarioObjetivoId ID del usuario sobre el que se
 *     mostraría la acción.
 * @param {string} actorUid UID del usuario logueado.
 * @return {boolean}
 */
export function esUnoMismo(usuarioObjetivoId, actorUid) {
  return usuarioObjetivoId === actorUid;
}
