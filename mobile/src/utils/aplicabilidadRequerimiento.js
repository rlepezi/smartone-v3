// Regla única (mobile) de "este Requerimiento aplica a este sujeto". Mismo
// criterio que functions/src/utils/aplicabilidadRequerimiento.js y
// frontend/src/utils/aplicabilidadRequerimiento.js: único punto de cambio
// cuando se reemplace la regla.
//
// `requerimiento`: entrada del snapshot `requerimientosAplicables`
//   ({ tipoEntidad, perfilRecursoIds: null | [ids] }).
// `sujeto`: { tipoEntidad: "empresa" | "persona" | "recurso",
//   perfilRecursoIds } — el conjunto de Perfiles de Recurso de sus
//   documentos activos en la Participación.
export const aplicaRequerimientoASujeto = (requerimiento, sujeto) => {
  if (!requerimiento || !sujeto) return false;
  if (requerimiento.tipoEntidad !== sujeto.tipoEntidad) return false;
  if (sujeto.tipoEntidad === "empresa") return true;
  const ids = requerimiento.perfilRecursoIds;
  if (!ids) return true;
  const propios = sujeto.perfilRecursoIds || [];
  return ids.some((id) => propios.includes(id));
};
