import { apiClient } from "../api/apiClient";

// Personas y Maquinarias de cada Participación (colecciones
// participacionPersonas y participacionRecursos). Un documento por
// (Participación, sujeto, Perfil de Recurso): una Persona con dos perfiles
// tiene dos documentos; una Maquinaria, uno.
const crearCliente = (ruta) => ({
  async listar(filtros = {}) {
    const params = new URLSearchParams();
    Object.entries(filtros).forEach(([k, v]) => { if (v) params.set(k, v); });
    const query = params.toString() ? `?${params.toString()}` : "";
    const res = await apiClient(`${ruta}${query}`);
    return res.data;
  },

  async obtenerPorId(id) {
    const res = await apiClient(`${ruta}/${id}`);
    return res.data;
  },

  // payload: participacionId (o proyectoId + empresaId), personaId/recursoId,
  // perfilRecursoIds (Persona: uno o varios; Maquinaria: uno), fechaInicio.
  // Devuelve los documentos creados.
  async crear(payload) {
    const res = await apiClient(ruta, { method: "POST", body: payload });
    return res.data;
  },

  // PUT transiciona el estado (finalizar fija fechaTermino; sin borrado).
  async transicionar(id, estado, payload = {}) {
    const res = await apiClient(`${ruta}/${id}`, {
      method: "PUT",
      body: { ...payload, estado },
    });
    return res.data;
  },
});

export const participacionPersonaService = crearCliente("/participacion-personas");
export const participacionRecursoService = crearCliente("/participacion-recursos");

const millis = (v) => {
  if (!v) return Infinity;
  if (v._seconds) return v._seconds * 1000;
  return new Date(v).getTime();
};

// Agrupa documentos en "sujetos": uno por Persona/Maquinaria dentro de cada
// Participación y estado, con el conjunto de sus perfilRecursoId (los Perfiles
// de Recurso que muestra la interfaz). `documentos` conserva los
// documentos originales (para finalizarlos uno a uno).
export const agruparSujetos = (docsPersonas = [], docsRecursos = []) => {
  const porClave = new Map();
  const agregar = (doc, tipoEntidad) => {
    const sujetoId = tipoEntidad === "persona" ? doc.personaId : doc.recursoId;
    const clave = `${tipoEntidad}|${doc.participacionId}|${sujetoId}|${doc.estado}`;
    if (!porClave.has(clave)) {
      porClave.set(clave, {
        id: clave,
        tipoEntidad,
        personaId: tipoEntidad === "persona" ? sujetoId : null,
        recursoId: tipoEntidad === "recurso" ? sujetoId : null,
        participacionId: doc.participacionId,
        proyectoId: doc.proyectoId,
        empresaId: doc.empresaId,
        mandanteId: doc.mandanteId,
        estado: doc.estado,
        fechaInicio: doc.fechaInicio || null,
        fechaTermino: doc.fechaTermino || null,
        createdAt: doc.createdAt || null,
        perfilRecursoIds: [],
        documentos: [],
        // Carpeta de esta persona/recurso en el repositorio documental del expediente.
        carpetaRelativa: null,
      });
    }
    const s = porClave.get(clave);
    if (!s.carpetaRelativa && doc.carpetaRelativa) s.carpetaRelativa = doc.carpetaRelativa;
    if (doc.perfilRecursoId && !s.perfilRecursoIds.includes(doc.perfilRecursoId)) {
      s.perfilRecursoIds.push(doc.perfilRecursoId);
    }
    s.documentos.push(doc);
    if (millis(doc.fechaInicio) < millis(s.fechaInicio)) s.fechaInicio = doc.fechaInicio;
    if (millis(doc.fechaTermino) !== Infinity &&
        (millis(s.fechaTermino) === Infinity || millis(doc.fechaTermino) > millis(s.fechaTermino))) {
      s.fechaTermino = doc.fechaTermino;
    }
  };
  docsPersonas.forEach((d) => agregar(d, "persona"));
  docsRecursos.forEach((d) => agregar(d, "recurso"));
  return [...porClave.values()];
};

// Sujetos (agrupados) según filtros. Con personaId solo consulta Personas;
// con recursoId, solo Maquinarias.
export const sujetoService = {
  async listar(filtros = {}) {
    const { personaId, recursoId, ...resto } = filtros;
    const [personas, recursos] = await Promise.all([
      recursoId ? [] : participacionPersonaService.listar({ ...resto, personaId }),
      personaId ? [] : participacionRecursoService.listar({ ...resto, recursoId }),
    ]);
    return agruparSujetos(personas || [], recursos || []);
  },

  // Finaliza todos los documentos activos de un sujeto agrupado.
  async finalizar(sujeto, payload = {}) {
    const servicio = sujeto.tipoEntidad === "persona"
      ? participacionPersonaService : participacionRecursoService;
    for (const doc of sujeto.documentos.filter((d) => d.estado === "activa" || d.estado === "pendiente")) {
      await servicio.transicionar(doc.id, "finalizada", payload);
    }
  },
};

// Nombres de los Perfiles de Recurso de un sujeto, a partir de un mapa
// id -> perfil (ver hook usePerfilesRecurso). Texto para mostrar, nunca se
// guarda.
export const nombresPerfiles = (perfilRecursoIds = [], perfilesPorId = {}) =>
  perfilRecursoIds.map((id) => perfilesPorId[id]?.nombre || "…").join(", ");
