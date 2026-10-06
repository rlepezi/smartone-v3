// Regla única (mobile) de "este Requerimiento aplica a este sujeto". Mismo
// criterio que functions/src/utils/aplicabilidadRequerimiento.js y
// frontend/src/utils/aplicabilidadRequerimiento.js: único punto de cambio
// cuando se reemplace la regla.
//
// `requerimiento`: entrada del snapshot `requerimientosAplicables`
//   ({ tipoEntidad, perfilRecursoIds: null | [ids] }).
// `sujeto`: { tipoEntidad: "empresa" | "persona" | "recurso",
//   perfilRecursoId } — el Perfil de Recurso de su Asignación activa.
export const aplicaRequerimientoASujeto = (requerimiento, sujeto) => {
  if (!requerimiento || !sujeto) return false;
  if (requerimiento.tipoEntidad !== sujeto.tipoEntidad) return false;
  if (sujeto.tipoEntidad === "empresa") return true;
  const ids = requerimiento.perfilRecursoIds;
  if (!ids) return true;
  return Boolean(sujeto.perfilRecursoId) && ids.includes(sujeto.perfilRecursoId);
};
