const empresaMandanteRepository =
    require("../repositories/empresaMandanteRepository");
const empresaPersonaRepository =
    require("../repositories/empresaPersonaRepository");
const empresaRecursoRepository =
    require("../repositories/empresaRecursoRepository");

// Visibilidad por Mandante (bloque 3). Único punto que decide qué Empresas,
// Personas y Recursos ve cada rol:
// - Empresas: superadmin, evaluador y admin_comercial ven todas;
//   mandante_admin / mandante_lector, las con empresaMandantes ACTIVO para
//   su Mandante.
// - Personas y Recursos: superadmin y evaluador ven todo; los roles de
//   Mandante, los que tienen relación (vigente o histórica) con una
//   Empresa visible. admin_comercial no tiene acceso (se corta en rutas).
const ROLES_EMPRESAS_GLOBAL = ["superadmin", "evaluador", "admin_comercial"];
const ROLES_SUJETOS_GLOBAL = ["superadmin", "evaluador"];

const repoDe = (tipo) => (tipo === "persona" ?
  empresaPersonaRepository : empresaRecursoRepository);
const campoDe = (tipo) => (tipo === "persona" ? "personaId" : "recursoId");

/**
 * IDs de Empresas visibles para el actor, o null si ve todas.
 * @param {Object} actor Usuario autenticado.
 * @return {Promise<?Set<string>>} Empresas visibles.
 */
async function empresaIdsVisibles(actor) {
  if (ROLES_EMPRESAS_GLOBAL.includes(actor.rol)) return null;
  if (!actor.mandanteId) return new Set();
  return new Set(await empresaMandanteRepository.empresaIdsActivas(
      actor.mandanteId,
  ));
}

/**
 * true si el actor puede ver la Empresa.
 * @param {Object} actor Usuario autenticado.
 * @param {string} empresaId ID de la Empresa.
 * @return {Promise<boolean>} Visible.
 */
async function puedeVerEmpresa(actor, empresaId) {
  if (ROLES_EMPRESAS_GLOBAL.includes(actor.rol)) return true;
  if (!actor.mandanteId || !empresaId) return false;
  return empresaMandanteRepository.estaActiva(empresaId, actor.mandanteId);
}

/**
 * IDs de Personas o Recursos visibles, o null si ve todos.
 * @param {Object} actor Usuario autenticado.
 * @param {"persona"|"recurso"} tipo Tipo de sujeto.
 * @return {Promise<?Set<string>>} Sujetos visibles.
 */
async function sujetoIdsVisibles(actor, tipo) {
  if (ROLES_SUJETOS_GLOBAL.includes(actor.rol)) return null;
  const empresas = await empresaIdsVisibles(actor);
  if (!empresas || empresas.size === 0) return new Set();
  const relaciones = await repoDe(tipo).listByEmpresas([...empresas]);
  return new Set(relaciones.map((r) => r[campoDe(tipo)]));
}

/**
 * true si el actor puede ver la Persona o el Recurso.
 * @param {Object} actor Usuario autenticado.
 * @param {"persona"|"recurso"} tipo Tipo de sujeto.
 * @param {string} sujetoId ID del sujeto.
 * @return {Promise<boolean>} Visible.
 */
async function puedeVerSujeto(actor, tipo, sujetoId) {
  if (ROLES_SUJETOS_GLOBAL.includes(actor.rol)) return true;
  const empresas = await empresaIdsVisibles(actor);
  if (!empresas || empresas.size === 0) return false;
  const relaciones = await repoDe(tipo).listBySujeto(sujetoId);
  return relaciones.some((r) => empresas.has(r.empresaId));
}

/**
 * Relaciones que el actor puede ver (las de Empresas de su alcance).
 * @param {Object} actor Usuario autenticado.
 * @param {Object[]} relaciones Relaciones empresa-sujeto.
 * @return {Promise<Object[]>} Relaciones visibles.
 */
async function filtrarRelacionesVisibles(actor, relaciones) {
  const empresas = await empresaIdsVisibles(actor);
  if (!empresas) return relaciones;
  return relaciones.filter((r) => empresas.has(r.empresaId));
}

/**
 * Mandante de contexto para la Bitácora de una acción sobre una Empresa o
 * sobre una Persona/Recurso de una Empresa (entidades sin mandanteId
 * propio). En orden: el Mandante del actor; el de las asignaciones
 * afectadas, si todas son del mismo; el único Mandante con vínculo activo
 * con la Empresa. null si no se puede derivar sin ambigüedad (acción
 * global de un rol transversal).
 * @param {Object} actor Usuario autenticado.
 * @param {{empresaId: (?string|undefined),
 *     asignaciones: (Object[]|undefined)}} [contexto] Datos de la acción.
 * @return {Promise<?string>} mandanteId o null.
 */
async function mandanteDeContexto(actor, {empresaId, asignaciones} = {}) {
  if (actor?.mandanteId) return actor.mandanteId;
  const deAsignaciones = [...new Set(
      (asignaciones || []).map((a) => a.mandanteId).filter(Boolean),
  )];
  if (deAsignaciones.length > 0) {
    return deAsignaciones.length === 1 ? deAsignaciones[0] : null;
  }
  if (!empresaId) return null;
  const vinculos = await empresaMandanteRepository.listByEmpresa(
      empresaId, "activo",
  );
  return vinculos.length === 1 ? vinculos[0].mandanteId : null;
}

module.exports = {
  ROLES_EMPRESAS_GLOBAL, ROLES_SUJETOS_GLOBAL,
  empresaIdsVisibles, puedeVerEmpresa, sujetoIdsVisibles, puedeVerSujeto,
  filtrarRelacionesVisibles, mandanteDeContexto,
};
