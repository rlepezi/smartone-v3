// Normaliza un valor de "Aplica a" (null = "Todos", o arreglo de perfilRecursoId) para
// compararlo: "*" para "Todos", o los ids ordenados.
export const claveAplicaA = (valor) => (!valor || valor.length === 0 ? "*" : [...valor].sort().join(","));
