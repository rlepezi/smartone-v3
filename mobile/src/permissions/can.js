// Único archivo del proyecto donde puede aparecer lógica de rol
// (if (rol === '...')). En cualquier otra pantalla/componente, la
// decisión de mostrar/ocultar algo pasa por can(rol, accion).
//
// Entrega 1 es de solo lectura: este mapa solo se usa para decidir si un
// botón de acción se muestra deshabilitado o no se renderiza. Ningún
// resultado de can() habilita una escritura real todavía.
const ROLES = ["superadmin", "mandante_admin", "mandante_lector", "evaluador"];

const MAPA_ACCIONES = {
  editar_empresa: ["superadmin", "mandante_admin"],
  editar_persona: ["superadmin", "mandante_admin"],
  editar_recurso: ["superadmin", "mandante_admin"],
  asignar_recurso: ["superadmin", "mandante_admin"],
  cargar_documento: ["superadmin", "mandante_admin", "evaluador"],
  finalizar_asignacion: ["superadmin", "mandante_admin"],
  incorporar_empresa: ["superadmin", "mandante_admin"],
  evaluar_requerimiento: ["superadmin", "evaluador"],
  seleccionar_mandante: ["superadmin", "evaluador", "admin_comercial"],
};

export function can(rol, accion) {
  if (!rol || !ROLES.includes(rol)) return false;
  const permitidos = MAPA_ACCIONES[accion];
  if (!permitidos) return false;
  return permitidos.includes(rol);
}
