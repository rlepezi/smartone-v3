// Cálculos de cumplimiento compartidos entre Dashboard y
// ExpedientesListPage — antes vivían inline en el useEffect de
// DashboardPage.jsx, cerrados sobre su propio estado. Se extraen acá
// como funciones puras para que ninguna pantalla reimplemente la misma
// lógica con su propia data ya cargada.

// Único helper de redondeo de porcentajes para el donut de Cumplimiento
// (centro + cada fila de la leyenda) — un solo total, un solo criterio de
// redondeo, para que nunca puedan mostrar números que no calcen entre sí.
export const calcularPorcentaje = (valor, total) => {
  if (!total) return 0;
  return Math.round((valor / total) * 100);
};

// avancePct: mismo criterio que reporteService.js/EvaluarExpedientePage
// — cumplidos / evaluables * 100, evaluables excluye "no_aplica". null
// (no 0) cuando no hay nada evaluable todavía, para no confundir "sin
// datos" con "0% de cumplimiento".
export const calcularConteosEvaluacion = (evaluaciones) => {
  const conteos = { cumple: 0, no_cumple: 0, no_aplica: 0, pendiente: 0 };
  (evaluaciones || []).forEach((ev) => {
    if (conteos[ev.resultado] !== undefined) conteos[ev.resultado]++;
  });
  const total = (evaluaciones || []).length;
  const evaluables = conteos.cumple + conteos.no_cumple + conteos.pendiente;
  const avancePct = evaluables > 0 ? Math.round((conteos.cumple / evaluables) * 100) : null;
  return { conteos, total, avancePct };
};

// Resumen completo de un nivel (Empresa/Personas/Maquinarias) a partir del total de
// Requerimientos aplicables de ese nivel y sus Evaluaciones vigentes — generaliza
// calcularConteosEvaluacion sumándole "sinEvaluar" y "evaluados", para no duplicar el cálculo del
// donut de Cumplimiento Documental y el detalle numérico del panel "Resumen" (ExpedienteDetailPage).
// avancePct usa el MISMO criterio que el donut (cumple / (cumple+pendiente+no_cumple+sinEvaluar),
// no_aplica fuera del denominador) — no el "evaluables" de calcularConteosEvaluacion, para que
// nunca puedan mostrar números distintos en la misma pantalla.
export const calcularResumenCumplimiento = (totalItems, vigentes) => {
  const { conteos } = calcularConteosEvaluacion(vigentes);
  const sinEvaluar = Math.max(0, totalItems - (vigentes || []).length);
  const evaluados = conteos.cumple + conteos.no_cumple + conteos.no_aplica;
  const totalDonut = conteos.cumple + conteos.pendiente + conteos.no_cumple + sinEvaluar;
  const avancePct = totalDonut > 0 ? Math.round((conteos.cumple / totalDonut) * 100) : null;
  return {
    total: totalItems,
    evaluados,
    cumple: conteos.cumple,
    noCumple: conteos.no_cumple,
    noAplica: conteos.no_aplica,
    pendiente: conteos.pendiente,
    sinEvaluar,
    avancePct,
  };
};

// "Sin Evaluar": pares (expedienteId, requerimientoId) del snapshot
// requerimientosAplicables de cada Expediente SIN ninguna Evaluación
// vigente asociada. A nivel Persona/Maquinaria es una aproximación
// agregada — cuenta como "evaluado" si al menos una Persona/Recurso ya
// fue evaluado para ese Requerimiento, no exige cobertura de TODOS los
// asignados (eso requeriría cargar también las personas y maquinarias asignadas).
export const calcularSinEvaluar = (expedientes, evaluacionesVigentes) => {
  const evaluadosSet = new Set(
    (evaluacionesVigentes || []).map((ev) => `${ev.expedienteId}::${ev.requerimientoId}`),
  );
  let sinEvaluar = 0;
  (expedientes || []).forEach((exp) => {
    (exp.requerimientosAplicables || []).forEach((r) => {
      if (!evaluadosSet.has(`${exp.id}::${r.requerimientoId}`)) sinEvaluar++;
    });
  });
  return sinEvaluar;
};

// Conteo de Expedientes por cada estado del catálogo (ESTADOS_EXPEDIENTE
// de expedienteService.js) — incluye los estados en 0 para que el
// llamador decida si los oculta o no.
export const calcularConteosPorEstadoExpediente = (expedientes, estadosCatalogo) => {
  const conteos = {};
  estadosCatalogo.forEach((e) => { conteos[e.value] = 0; });
  (expedientes || []).forEach((exp) => {
    if (conteos[exp.estado] !== undefined) conteos[exp.estado]++;
  });
  return conteos;
};
