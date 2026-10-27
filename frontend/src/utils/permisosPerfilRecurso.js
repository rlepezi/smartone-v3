// Roles que pueden crear Perfiles de Recurso (POST /perfiles-recurso).
const ROLES_CREAN_PERFIL_RECURSO = ["superadmin", "mandante_admin"];

export const puedeCrearPerfilRecurso = (rol) => ROLES_CREAN_PERFIL_RECURSO.includes(rol);
