import { apiGet } from "./client";

// Personas y Maquinarias de cada Participación (colecciones
// participacionPersonas / participacionRecursos): un documento por
// (Participación, sujeto, Perfil de Recurso).
export const participacionPersonasApi = {
  listar: (params) => apiGet("/participacion-personas", params),
};

export const participacionRecursosApi = {
  listar: (params) => apiGet("/participacion-recursos", params),
};

// Catálogo de Perfiles de Recurso (para mostrar el nombre de los perfiles
// de un sujeto: en la asignación solo se guarda el ID).
export const perfilesRecursoApi = {
  listar: (params) => apiGet("/perfiles-recurso", params),
};
