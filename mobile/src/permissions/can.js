// Único archivo del proyecto donde puede aparecer lógica de rol
// (if (rol === '...')). En cualquier otra pantalla/componente, la
// decisión de mostrar/ocultar algo pasa por can(rol, accion).
//
// La app es de solo lectura: ningún resultado de can() habilita escrituras.
// Alcance por rol, igual que la web (frontend/src/App.jsx) y la API:
//  - roles operacionales (superadmin, mandante_admin, mandante_lector,
//    evaluador): Inicio, Proyectos, Empresas, Personas y Equipos;
//  - admin_comercial: solo Empresas (la web lo excluye de Proyectos,
//    Expedientes, Personas y Maquinarias, y la API le niega esos datos).
const ROLES = ["superadmin", "mandante_admin", "mandante_lector", "evaluador", "admin_comercial"];
const OPERACIONALES = ["superadmin", "mandante_admin", "mandante_lector", "evaluador"];

const MAPA_ACCIONES = {
  ver_operacion: OPERACIONALES,
  ver_empresas: [...OPERACIONALES, "admin_comercial"],
  // Elegir Mandante en el selector y la opción "Todos los mandantes".
  seleccionar_mandante: ["superadmin", "evaluador"],
  ver_todos_mandantes: ["superadmin", "evaluador"],
  // Listado completo de Mandantes (GET /mandantes); evaluador los resuelve
  // desde sus Proyectos visibles.
  listar_mandantes: ["superadmin", "admin_comercial"],
};

export function can(rol, accion) {
  if (!rol || !ROLES.includes(rol)) return false;
  const permitidos = MAPA_ACCIONES[accion];
  if (!permitidos) return false;
  return permitidos.includes(rol);
}
