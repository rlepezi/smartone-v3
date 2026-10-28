// Formatea para display un valor de catálogo configurable (rol de
// Persona / clasificación de Maquinaria, entidad Perfil de Recurso).
// Los Perfiles creados desde el nuevo CRUD ya guardan un `nombre`
// prolijo ("Operador", "Camión Pluma"); esta función solo mejora la
// lectura de valores HISTÓRICOS heredados del catálogo fijo que
// reemplazó Perfil de Recurso (ej. "camion_pluma" -> "Camion pluma").
// No hay ida y vuelta: es puramente cosmético, nunca se usa para
// comparar ni para enviar de vuelta al backend.
export const formatCatalogo = (valor) => {
  if (!valor) return valor;
  return valor
    .replace(/_/g, " ")
    // Inicio de cada palabra (no \b\w: tras una letra con tilde, "Camión" quedaba "CamióN").
    .replace(/(^|\s)(\S)/g, (_, espacio, c) => espacio + c.toUpperCase());
};
