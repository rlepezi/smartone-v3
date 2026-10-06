// Regla ÚNICA (backend) de "este Requerimiento aplica a este sujeto".
// Espejo en frontend/src/utils/aplicabilidadRequerimiento.js y
// mobile/src/utils/aplicabilidadRequerimiento.js. Es el único punto a
// cambiar cuando la regla cambie (bloque 4): ningún otro módulo debe
// repetir esta lógica.

// Tipos de entidad a los que aplica un Requerimiento (requerimientos.
// tipoEntidad y perfilRequerimientos.tipoEntidad). "recurso" = Maquinaria
// en la UI.
const TIPOS_ENTIDAD = ["empresa", "persona", "recurso"];

/**
 * Indica si una entrada de Requerimiento (del snapshot
 * `requerimientosAplicables` de un Expediente, o del cálculo de
 * aplicables) aplica a un sujeto.
 * - empresa: basta con que el tipo coincida.
 * - persona / recurso: el tipo coincide y `perfilRecursoIds` es null
 *   ("Todos") o incluye el Perfil de Recurso del sujeto.
 * @param {{tipoEntidad: string, perfilRecursoIds: (Array<string>|null)}}
 *     requerimiento
 *     Entrada del Requerimiento.
 * @param {{tipoEntidad: string, perfilRecursoId: ?string}} sujeto Sujeto
 *     (empresa: sin perfil; persona/recurso: su Perfil de Recurso resuelto,
 *     o null si no tiene).
 * @return {boolean} true si aplica.
 */
function aplicaRequerimientoASujeto(requerimiento, sujeto) {
  if (!requerimiento || !sujeto) return false;
  if (requerimiento.tipoEntidad !== sujeto.tipoEntidad) return false;
  if (sujeto.tipoEntidad === "empresa") return true;
  const ids = requerimiento.perfilRecursoIds;
  if (ids === null || ids === undefined) return true;
  return Boolean(sujeto.perfilRecursoId) &&
      ids.includes(sujeto.perfilRecursoId);
}

/**
 * Sujeto de una Asignación (Persona o Recurso) en la forma que espera
 * aplicaRequerimientoASujeto. La Asignación debe venir ya con
 * `perfilRecursoId` resuelto (ver transicionPerfilRecurso.js).
 * @param {Object} asignacion Asignación con perfilRecursoId.
 * @return {{tipoEntidad: string, perfilRecursoId: ?string}} El sujeto.
 */
function sujetoDeAsignacion(asignacion) {
  return {
    tipoEntidad: asignacion.personaId ? "persona" : "recurso",
    perfilRecursoId: asignacion.perfilRecursoId || null,
  };
}

module.exports = {
  TIPOS_ENTIDAD, aplicaRequerimientoASujeto, sujetoDeAsignacion,
};
