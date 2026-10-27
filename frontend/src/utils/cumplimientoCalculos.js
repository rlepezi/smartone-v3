// Cálculos de cumplimiento compartidos. Desde el bloque 4 todo sale de los
// contadores que el backend mantiene en cada Expediente sobre sus
// instancias de Requerimiento (expedienteRequerimientos):
//   resumen:        { activas, cumple, noCumple, noAplica, pendiente }
//   resumenSujetos: { empresa | persona_<id> | recurso_<id>: mismo formato }
// Una instancia activa sin evaluar cuenta como "pendiente". Ninguna pantalla
// cruza Requerimientos con sujetos: eso lo hace solo el backend.

// Único helper de redondeo de porcentajes para el donut (centro + cada fila
// de la leyenda), para que nunca muestren números que no calcen entre sí.
export const calcularPorcentaje = (valor, total) => {
  if (!total) return 0;
  return Math.round((valor / total) * 100);
};

export const resumenVacio = () => ({ activas: 0, cumple: 0, noCumple: 0, noAplica: 0, pendiente: 0 });

// % de cumplimiento = cumple / (activas − noAplica). null cuando el denominador es 0: la interfaz
// muestra "—" (no 0%, que sería un incumplimiento real).
export const porcentajeCumplimiento = (resumen) => {
  if (!resumen) return null;
  const denominador = (resumen.activas || 0) - (resumen.noAplica || 0);
  if (denominador <= 0) return null;
  return Math.round(((resumen.cumple || 0) / denominador) * 100);
};

// Texto del % para la interfaz ("—" si no hay nada evaluable).
export const textoPorcentaje = (pct) => (pct === null || pct === undefined ? "—" : `${pct}%`);

export const sumarResumenes = (resumenes) => {
  const total = resumenVacio();
  (resumenes || []).forEach((r) => {
    if (!r) return;
    Object.keys(total).forEach((k) => { total[k] += r[k] || 0; });
  });
  return total;
};

// Suma de los contadores de varios Expedientes.
export const resumenDeExpedientes = (expedientes) =>
  sumarResumenes((expedientes || []).map((e) => e.resumen));

// Instancias ya evaluadas (cumple / no cumple / no aplica).
export const evaluadosDe = (resumen) =>
  (resumen?.cumple || 0) + (resumen?.noCumple || 0) + (resumen?.noAplica || 0);

// Clave de un sujeto en resumenSujetos.
export const claveSujeto = ({ personaId, recursoId } = {}) => {
  if (personaId) return `persona_${personaId}`;
  if (recursoId) return `recurso_${recursoId}`;
  return "empresa";
};

// Contadores de un sujeto en un Expediente (null si el sujeto no tiene instancias ahí).
export const resumenDeSujeto = (expediente, sujeto) =>
  expediente?.resumenSujetos?.[claveSujeto(sujeto)] || null;

// Categoría de acreditación de un conjunto de instancias (peor caso primero):
// algún "no cumple" → no_acreditada; todas resueltas (cumple / no aplica) → acreditada;
// ninguna evaluada → sin_evaluar; el resto → pendiente.
export const categoriaDeResumen = (resumen) => {
  if (!resumen || !resumen.activas) return "sin_evaluar";
  if (resumen.noCumple > 0) return "no_acreditada";
  if ((resumen.cumple || 0) + (resumen.noAplica || 0) === resumen.activas) return "acreditada";
  if (evaluadosDe(resumen) === 0) return "sin_evaluar";
  return "pendiente";
};

// Evaluación de UN sujeto (Persona o Maquinaria) dentro del Expediente de su Empresa en un
// Proyecto, desde los contadores por sujeto del Expediente.
export const evaluarSujeto = ({ expediente, campo, sujetoId }) => {
  const resumen = resumenDeSujeto(expediente, { [campo]: sujetoId });
  return {
    total: resumen?.activas || 0,
    pctCumple: porcentajeCumplimiento(resumen),
    categoria: categoriaDeResumen(resumen),
  };
};

// Conteo de Expedientes por cada estado del catálogo (ESTADOS_EXPEDIENTE de
// expedienteService.js) — incluye los estados en 0 para que el llamador
// decida si los oculta o no.
export const calcularConteosPorEstadoExpediente = (expedientes, estadosCatalogo) => {
  const conteos = {};
  estadosCatalogo.forEach((e) => { conteos[e.value] = 0; });
  (expedientes || []).forEach((exp) => {
    if (conteos[exp.estado] !== undefined) conteos[exp.estado]++;
  });
  return conteos;
};
