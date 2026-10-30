// Regla ÚNICA de "este Requerimiento aplica a este sujeto". Solo la usan la
// generación y sincronización de instancias (expedienteRequerimientoService)
// y las vistas previas, que aún no tienen instancias. El resto del sistema
// (backend, frontend y mobile) lee las instancias ya materializadas.

// Tipos de entidad a los que aplica un Requerimiento (requerimientos.
// tipoEntidad y perfilRequerimientos.tipoEntidad). "recurso" = Maquinaria
// en la UI.
const TIPOS_ENTIDAD = ["empresa", "persona", "recurso"];

/**
 * Indica si una entrada de Requerimiento (del cálculo de aplicables de un
 * Perfil de Participación) aplica a un sujeto.
 * - empresa: basta con que el tipo coincida.
 * - persona / recurso: el tipo coincide y `perfilRecursoIds` es null
 *   ("Todos") o comparte al menos un ID con los perfiles del sujeto.
 * @param {{tipoEntidad: string, perfilRecursoIds: (Array<string>|null)}}
 *     requerimiento Entrada del Requerimiento.
 * @param {{tipoEntidad: string, perfilRecursoIds: (Array<string>|undefined)}}
 *     sujeto Sujeto (empresa: sin perfiles; persona/recurso: el conjunto
 *     de perfilRecursoId de sus documentos activos en la Participación).
 * @return {boolean} true si aplica.
 */
function aplicaRequerimientoASujeto(requerimiento, sujeto) {
  if (!requerimiento || !sujeto) return false;
  if (requerimiento.tipoEntidad !== sujeto.tipoEntidad) return false;
  if (sujeto.tipoEntidad === "empresa") return true;
  const ids = requerimiento.perfilRecursoIds;
  if (ids === null || ids === undefined) return true;
  const propios = sujeto.perfilRecursoIds || [];
  return ids.some((id) => propios.includes(id));
}

module.exports = {TIPOS_ENTIDAD, aplicaRequerimientoASujeto};
