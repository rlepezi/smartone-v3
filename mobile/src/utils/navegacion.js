// Marca única para el parámetro `reset` de las listas: cada apertura desde un acceso trae un valor
// distinto, así la lista reinicia sus filtros aunque ya estuviera montada.
let ultimo = 0;
export const tokenReset = () => {
  ultimo += 1;
  return ultimo;
};
