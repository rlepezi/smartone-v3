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

// Categoría de acreditación de una Empresa según el estado de su Expediente y sus "no cumple".
// Espejo de categoriaKpiEmpresa (functions/src/services/reporteService.js).
export const categoriaAcreditacionExpediente = (estado, noCumple) => {
  if (!estado) return null;
  if (estado === "cerrado") return "acreditada";
  if (["creado", "en_ejecucion"].includes(estado)) return "en_proceso";
  if (["completado", "completado_pendientes"].includes(estado)) return noCumple ? "con_observaciones" : "acreditada";
  return null;
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

// Umbrales de defecto del nivel de acreditación. Cada Mandante puede configurar los suyos
// (Configuración → Niveles de acreditación; campo `umbralesAcreditacion` del Mandante). Mismos
// valores que functions/src/utils/umbralesAcreditacion.js.
export const UMBRALES_ACREDITACION_DEFECTO = { acreditada: 100, aceptable: 85 };

// Umbrales del Mandante, o los de defecto si no tiene (o los guardados no son coherentes).
export const resolverUmbrales = (umbrales) => {
  const acreditada = Number(umbrales?.acreditada);
  const aceptable = Number(umbrales?.aceptable);
  const validos = acreditada > 0 && acreditada <= 100 && aceptable > 0 && aceptable < acreditada;
  return validos ? { acreditada, aceptable } : UMBRALES_ACREDITACION_DEFECTO;
};

// Nivel de acreditación según el % de cumplimiento y los umbrales del Mandante (por defecto: 100 %
// Acreditada en verde, desde 85 % Aceptable en amarillo, bajo 85 % Rechazada en rojo). Sin nada
// evaluable (null) no hay nivel.
export const nivelAcreditacion = (pct, umbrales = null) => {
  if (pct === null || pct === undefined) {
    return { etiqueta: null, caja: "bg-slate-50 border-slate-200", texto: "text-slate-400", icono: "text-slate-400" };
  }
  const { acreditada, aceptable } = resolverUmbrales(umbrales);
  if (pct >= acreditada) return { etiqueta: "Acreditada", caja: "bg-emerald-50 border-emerald-300", texto: "text-emerald-700", icono: "text-emerald-600" };
  if (pct >= aceptable) return { etiqueta: "Aceptable", caja: "bg-amber-50 border-amber-300", texto: "text-amber-700", icono: "text-amber-500" };
  return { etiqueta: "Rechazada", caja: "bg-red-50 border-red-300", texto: "text-red-700", icono: "text-red-500" };
};
