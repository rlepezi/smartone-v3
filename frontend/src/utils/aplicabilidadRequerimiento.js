// Regla ÚNICA (frontend) de "este Requerimiento aplica a este sujeto".
// Espejo de functions/src/utils/aplicabilidadRequerimiento.js (backend) y
// mobile/src/utils/aplicabilidadRequerimiento.js. Planilla, detalle de
// Expediente, Proyecto y demás vistas la usan; ninguna repite la lógica.
// Es el único punto a cambiar cuando la regla cambie (bloque 4).

/**
 * Indica si una entrada de Requerimiento (snapshot `requerimientosAplicables`
 * o requisitos de un Perfil) aplica a un sujeto:
 * - empresa: basta con que el tipo coincida.
 * - persona / recurso: el tipo coincide y `perfilRecursoIds` es null
 *   ("Todos") o incluye el Perfil de Recurso del sujeto.
 * @param {{tipoEntidad: string, perfilRecursoIds: (string[]|null)}} requerimiento
 * @param {{tipoEntidad: string, perfilRecursoId: (string|null)}} sujeto
 * @returns {boolean}
 */
export const aplicaRequerimientoASujeto = (requerimiento, sujeto) => {
  if (!requerimiento || !sujeto) return false;
  if (requerimiento.tipoEntidad !== sujeto.tipoEntidad) return false;
  if (sujeto.tipoEntidad === "empresa") return true;
  const ids = requerimiento.perfilRecursoIds;
  if (ids === null || ids === undefined) return true;
  return Boolean(sujeto.perfilRecursoId) && ids.includes(sujeto.perfilRecursoId);
};

// Sujeto de una Asignación (Persona o Maquinaria). Las Asignaciones que
// devuelve la API ya traen `perfilRecursoId` resuelto.
export const sujetoDeAsignacion = (asignacion) => ({
  tipoEntidad: asignacion?.personaId ? "persona" : "recurso",
  perfilRecursoId: asignacion?.perfilRecursoId || null,
});
