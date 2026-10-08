const participacionPersonaRepository =
    require("../repositories/participacionPersonaRepository");
const participacionRecursoRepository =
    require("../repositories/participacionRecursoRepository");

/**
 * Convierte un valor de fecha (Timestamp, Date o string) a milisegundos.
 * @param {*} valor Fecha.
 * @return {number} Milisegundos (Infinity si no hay fecha).
 */
const aMillis = (valor) => {
  if (!valor) return Infinity;
  if (typeof valor.toMillis === "function") return valor.toMillis();
  return new Date(valor).getTime();
};

/**
 * Agrupa documentos de participacionPersonas / participacionRecursos en
 * "sujetos": uno por Persona o Recurso dentro de cada Participación, con el
 * conjunto de sus perfilRecursoId. Es la forma que espera
 * aplicaRequerimientoASujeto (utils/aplicabilidadRequerimiento.js).
 * @param {Object[]} docsPersonas Documentos de participacionPersonas.
 * @param {Object[]} docsRecursos Documentos de participacionRecursos.
 * @return {Object[]} Sujetos {tipoEntidad, personaId, recursoId,
 *     participacionId, proyectoId, empresaId, mandanteId, perfilRecursoIds,
 *     fechaInicio, documentoIds}.
 */
function agruparSujetos(docsPersonas = [], docsRecursos = []) {
  const porClave = new Map();
  const agregar = (doc, tipoEntidad) => {
    const sujetoId = tipoEntidad === "persona" ? doc.personaId : doc.recursoId;
    const clave = `${tipoEntidad}|${doc.participacionId}|${sujetoId}`;
    if (!porClave.has(clave)) {
      porClave.set(clave, {
        tipoEntidad,
        personaId: tipoEntidad === "persona" ? sujetoId : null,
        recursoId: tipoEntidad === "recurso" ? sujetoId : null,
        participacionId: doc.participacionId,
        proyectoId: doc.proyectoId,
        empresaId: doc.empresaId,
        mandanteId: doc.mandanteId,
        perfilRecursoIds: [],
        fechaInicio: doc.fechaInicio || null,
        documentoIds: [],
      });
    }
    const sujeto = porClave.get(clave);
    if (doc.perfilRecursoId &&
        !sujeto.perfilRecursoIds.includes(doc.perfilRecursoId)) {
      sujeto.perfilRecursoIds.push(doc.perfilRecursoId);
    }
    sujeto.documentoIds.push(doc.id);
    // Fecha de inicio del sujeto: la más antigua de sus documentos.
    if (aMillis(doc.fechaInicio) < aMillis(sujeto.fechaInicio)) {
      sujeto.fechaInicio = doc.fechaInicio;
    }
  };
  docsPersonas.forEach((d) => agregar(d, "persona"));
  docsRecursos.forEach((d) => agregar(d, "recurso"));
  return [...porClave.values()];
}

/**
 * Sujetos ACTIVOS de un Proyecto (opcionalmente de una Empresa).
 * @param {string} proyectoId ID del Proyecto.
 * @param {?string} [empresaId] Empresa a la que acotar.
 * @return {Promise<Object[]>} Sujetos (ver agruparSujetos).
 */
async function sujetosActivosDeProyecto(proyectoId, empresaId = null) {
  const [personas, recursos] = await Promise.all([
    participacionPersonaRepository.getActivosByProyecto(proyectoId),
    participacionRecursoRepository.getActivosByProyecto(proyectoId),
  ]);
  const deEmpresa = (d) => !empresaId || d.empresaId === empresaId;
  return agruparSujetos(personas.filter(deEmpresa), recursos.filter(deEmpresa));
}

/**
 * Sujetos ACTIVOS de una Participación (los de su Expediente).
 * @param {string} participacionId ID de la Participación.
 * @return {Promise<Object[]>} Sujetos (ver agruparSujetos).
 */
async function sujetosActivosDeParticipacion(participacionId) {
  const [personas, recursos] = await Promise.all([
    participacionPersonaRepository.list({participacionId, estado: "activa"}),
    participacionRecursoRepository.list({participacionId, estado: "activa"}),
  ]);
  return agruparSujetos(personas, recursos);
}

/**
 * Sujeto activo de una Persona o Recurso en un Proyecto, o null.
 * @param {"persona"|"recurso"} tipoEntidad Tipo del sujeto.
 * @param {string} sujetoId personaId o recursoId.
 * @param {string} proyectoId ID del Proyecto.
 * @return {Promise<?Object>} El sujeto (ver agruparSujetos) o null.
 */
async function sujetoActivoEnProyecto(tipoEntidad, sujetoId, proyectoId) {
  const repo = tipoEntidad === "persona" ?
      participacionPersonaRepository : participacionRecursoRepository;
  const campo = tipoEntidad === "persona" ? "personaId" : "recursoId";
  const docs = await repo.list({
    [campo]: sujetoId, proyectoId, estado: "activa",
  });
  const [sujeto] = tipoEntidad === "persona" ?
      agruparSujetos(docs, []) : agruparSujetos([], docs);
  return sujeto || null;
}

module.exports = {
  agruparSujetos, sujetosActivosDeProyecto, sujetosActivosDeParticipacion,
  sujetoActivoEnProyecto,
};
