// Situación de la Empresa seleccionada respecto de un Proyecto, según `participacionEmpresa`
// (calculada en el backend por proyectoService.listarProyectos con `empresaId`):
//  - "nueva": sin relación vigente (ninguna Participación, o solo finalizadas) -> se crea una.
//  - "pendiente": hay una Participación pendiente -> se completa esa, sin duplicar.
//  - "no_aplica": ya participa (activa o suspendida) -> se gestiona desde el Detalle.
export const MENSAJE_NO_APLICA =
  "Esta empresa ya participa activamente en este proyecto — usa \"Cambiar Proyecto\" o la gestión desde el Detalle para modificarla.";

export const estadoTarjetaProyecto = (proyecto) => {
  const estado = proyecto?.participacionEmpresa?.estado;
  if (estado === "activa" || estado === "suspendida") return "no_aplica";
  if (estado === "pendiente") return "pendiente";
  return "nueva";
};
