// Reglas de cumplimiento de la app móvil. ESPEJO de
// frontend/src/utils/cumplimientoCalculos.js — mantener alineados (misma base
// de %, mismos umbrales por Mandante, mismo criterio de "Pendiente"). No se
// cuentan evaluaciones en el cliente: todo sale de los contadores que el
// backend mantiene en cada Expediente sobre sus instancias de Requerimiento:
//   resumen:        { activas, cumple, noCumple, noAplica, pendiente, fechaVencimientoMasProxima }
//   resumenSujetos: { empresa | persona_<id> | recurso_<id>: mismo formato }

// Umbrales de defecto del nivel de acreditación. Cada Mandante puede tener los
// suyos (campo `umbralesAcreditacion`). Mismos valores que
// functions/src/utils/umbralesAcreditacion.js.
export const UMBRALES_ACREDITACION_DEFECTO = { acreditada: 100, aceptable: 85 };

export const resumenVacio = () => ({ activas: 0, cumple: 0, noCumple: 0, noAplica: 0, pendiente: 0 });

// Umbrales del Mandante, o los de defecto si no tiene (o no son coherentes).
export const resolverUmbrales = (umbrales) => {
  const acreditada = Number(umbrales?.acreditada);
  const aceptable = Number(umbrales?.aceptable);
  const validos = acreditada > 0 && acreditada <= 100 && aceptable > 0 && aceptable < acreditada;
  return validos ? { acreditada, aceptable } : UMBRALES_ACREDITACION_DEFECTO;
};

// % de cumplimiento = cumple / (activas − noAplica). null cuando el denominador es 0 (se muestra
// "—", no 0 %, que sería un incumplimiento real).
export const porcentajeCumplimiento = (resumen) => {
  if (!resumen) return null;
  const denominador = (resumen.activas || 0) - (resumen.noAplica || 0);
  if (denominador <= 0) return null;
  return Math.round(((resumen.cumple || 0) / denominador) * 100);
};

export const textoPorcentaje = (pct) => (pct === null || pct === undefined ? "—" : `${pct}%`);

// Instancias ya evaluadas (cumple / no cumple / no aplica).
export const evaluadosDe = (resumen) =>
  (resumen?.cumple || 0) + (resumen?.noCumple || 0) + (resumen?.noAplica || 0);

// Suma de contadores (agregados ponderados: se suman numeradores y denominadores, nunca se
// promedian porcentajes).
export const sumarResumenes = (resumenes) => {
  const total = resumenVacio();
  (resumenes || []).forEach((r) => {
    if (!r) return;
    Object.keys(total).forEach((k) => { total[k] += r[k] || 0; });
  });
  return total;
};

// Clave de un sujeto en resumenSujetos.
export const claveSujeto = ({ personaId, recursoId } = {}) => {
  if (personaId) return `persona_${personaId}`;
  if (recursoId) return `recurso_${recursoId}`;
  return "empresa";
};

export const resumenDeSujeto = (expediente, sujeto) =>
  expediente?.resumenSujetos?.[claveSujeto(sujeto)] || null;

// Nivel de acreditación (misma regla que nivelAcreditacion de la web):
//  - sin requerimientos aplicables → "sinRequerimientos" (sin %);
//  - con requerimientos pero ninguno evaluado → "pendiente";
//  - % ≥ umbral Acreditada → "acreditada"; ≥ Aceptable → "aceptable"; si no, "rechazada".
// Devuelve también los números para la interfaz: `revisados` (cumple + no cumple) de
// `aplicables` (activas − no aplica).
export const nivelDeResumen = (resumen, umbrales = null) => {
  const r = resumen || resumenVacio();
  const aplicables = Math.max((r.activas || 0) - (r.noAplica || 0), 0);
  const aprobados = r.cumple || 0;
  const rechazados = r.noCumple || 0;
  const revisados = aprobados + rechazados;
  const pct = porcentajeCumplimiento(r);
  const base = { pct, aplicables, revisados, aprobados, rechazados, sinRevisar: Math.max(aplicables - revisados, 0) };
  if (pct === null) return { ...base, clave: "sinRequerimientos" };
  if (evaluadosDe(r) === 0) return { ...base, clave: "pendiente" };
  const { acreditada, aceptable } = resolverUmbrales(umbrales);
  if (pct >= acreditada) return { ...base, clave: "acreditada" };
  if (pct >= aceptable) return { ...base, clave: "aceptable" };
  return { ...base, clave: "rechazada" };
};

// Orden de gravedad (peor primero). "sinRequerimientos" y "sinParticipacion" no compiten.
const GRAVEDAD = { rechazada: 0, pendiente: 1, aceptable: 2, acreditada: 3 };

// Peor nivel de una lista de claves; null si ninguna es comparable.
export const peorNivel = (claves) => (claves || [])
  .filter((c) => c in GRAVEDAD)
  .sort((a, b) => GRAVEDAD[a] - GRAVEDAD[b])[0] || null;

// "aaaa-mm-dd" de hoy en la hora local del teléfono.
const hoyIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// "aaaa-mm-dd" de una fecha sin hora (Timestamp serializado, Date o texto). null si no es válida.
const isoDeFecha = (valor) => {
  if (!valor) return null;
  if (typeof valor === "string" && /^\d{4}-\d{2}-\d{2}/.test(valor)) return valor.slice(0, 10);
  const seg = typeof valor._seconds === "number" ? valor._seconds : typeof valor.seconds === "number" ? valor.seconds : null;
  const d = seg !== null ? new Date(seg * 1000) : new Date(valor);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
};

// true si la fecha (sin hora) ya pasó.
export const estaVencida = (fecha) => {
  const iso = isoDeFecha(fecha);
  return Boolean(iso) && iso < hoyIso();
};

// Expediente con algún documento vencido: su vencimiento más próximo ya pasó.
export const expedienteConVencidos = (expediente) =>
  estaVencida(expediente?.resumen?.fechaVencimientoMasProxima);

// Estado de un requerimiento (fila) desde su Evaluación vigente (o el resultado de la instancia):
// "Vencido" es un cumple con vencimiento pasado; se muestra en la fila y en las alertas, pero NO
// cambia el % (mismo criterio que la web).
export const estadoDeRequerimiento = ({ evaluacion, resultado } = {}) => {
  const r = evaluacion?.resultado || resultado || "pendiente";
  if (r === "cumple") return estaVencida(evaluacion?.fechaVencimiento) ? "vencido" : "aprobado";
  if (r === "no_cumple") return "rechazado";
  if (r === "no_aplica") return "noAplica";
  return "sinRevisar";
};
