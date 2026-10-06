import { aplicaRequerimientoASujeto } from "./aplicabilidadRequerimiento";

// Evaluación de UN sujeto (Persona o Maquinaria) dentro del Expediente de su
// Empresa en un Proyecto. Mismo criterio que la columna "Evaluación" de
// PersonasListPage: total = Requerimientos aplicables a ese sujeto (regla única
// aplicaRequerimientoASujeto, con el Perfil de Recurso de su Asignación);
// % = cumple / (cumple + no_cumple + pendiente) sobre los que ya tienen
// Evaluación vigente. `categoria` es el peor caso primero.
export const evaluarSujeto = ({ expediente, vigentes, campo, sujetoId, perfilRecursoId }) => {
  const sujeto = { tipoEntidad: campo === "personaId" ? "persona" : "recurso", perfilRecursoId };
  const items = (expediente?.requerimientosAplicables || []).filter(
    (r) => aplicaRequerimientoASujeto(r, sujeto),
  );
  const propias = expediente
    ? vigentes.filter((ev) => ev.expedienteId === expediente.id && ev[campo] === sujetoId)
    : [];
  const resultados = items.map(
    (r) => propias.find((ev) => ev.requerimientoId === r.requerimientoId)?.resultado || null,
  );
  const cumple = resultados.filter((r) => r === "cumple").length;
  const evaluables = resultados.filter((r) => r === "cumple" || r === "no_cumple" || r === "pendiente").length;

  let categoria = null;
  if (propias.some((ev) => ev.resultado === "no_cumple")) categoria = "no_acreditada";
  else if (propias.some((ev) => ev.resultado === "pendiente")) categoria = "pendiente";
  else if (propias.some((ev) => ev.resultado === "cumple")) categoria = "acreditada";

  return {
    total: items.length,
    pctCumple: evaluables > 0 ? Math.round((cumple / evaluables) * 100) : null,
    categoria: categoria || "sin_evaluar",
  };
};
