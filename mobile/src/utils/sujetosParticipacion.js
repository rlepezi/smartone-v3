// Agrupa documentos de participacionPersonas / participacionRecursos en
// "sujetos": uno por Persona o Maquinaria dentro de cada Participación, con
// el conjunto de sus perfilRecursoId (forma que espera
// utils/aplicabilidadRequerimiento.js). Mismo criterio que el frontend web.
export const agruparSujetos = (docsPersonas = [], docsRecursos = []) => {
  const porClave = new Map();
  const agregar = (doc, tipoEntidad) => {
    const sujetoId = tipoEntidad === "persona" ? doc.personaId : doc.recursoId;
    const clave = `${tipoEntidad}|${doc.participacionId}|${sujetoId}`;
    if (!porClave.has(clave)) {
      porClave.set(clave, {
        id: clave,
        tipoEntidad,
        personaId: tipoEntidad === "persona" ? sujetoId : null,
        recursoId: tipoEntidad === "recurso" ? sujetoId : null,
        participacionId: doc.participacionId,
        proyectoId: doc.proyectoId,
        empresaId: doc.empresaId,
        perfilRecursoIds: [],
      });
    }
    const s = porClave.get(clave);
    if (doc.perfilRecursoId && !s.perfilRecursoIds.includes(doc.perfilRecursoId)) {
      s.perfilRecursoIds.push(doc.perfilRecursoId);
    }
  };
  docsPersonas.forEach((d) => agregar(d, "persona"));
  docsRecursos.forEach((d) => agregar(d, "recurso"));
  return [...porClave.values()];
};

// Nombres de Perfiles de Recurso a partir de un mapa id -> perfil.
export const nombresPerfiles = (ids = [], perfilesPorId = {}) =>
  ids.map((id) => perfilesPorId[id]?.nombre || "…").join(", ");
