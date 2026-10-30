// Sugerencia del checklist manual para la fila del requisito (no guarda): con todo marcado, SI;
// con alguna regla bloqueante sin marcar, NO; si solo faltan advertencias, SI con observación. Sin
// nada marcado no sugiere. La observación nombra lo verificado o lo no verificado.
export const sugerenciaChecklist = (reglas, checks) => {
  const marcadas = reglas.filter((r) => checks[r.vinculoId || r.reglaId]);
  if (!reglas.length || !marcadas.length) return null;
  const faltan = reglas.filter((r) => !checks[r.vinculoId || r.reglaId]);
  const nombres = (lista) => lista.map((r) => r.nombre).join(", ");
  if (!faltan.length) {
    return { resultado: "cumple", texto: "SI", observaciones: `Verificado manualmente: ${nombres(reglas)}.` };
  }
  if (faltan.some((r) => r.severidad === "bloqueante")) {
    return { resultado: "no_cumple", texto: "NO", observaciones: `No verificado: ${nombres(faltan)}.` };
  }
  return {
    resultado: "cumple", texto: "SI (con observación)",
    observaciones: `Verificado manualmente: ${nombres(marcadas)}. No verificado (advertencia): ${nombres(faltan)}.`,
  };
};
