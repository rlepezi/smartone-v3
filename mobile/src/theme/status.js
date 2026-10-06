// Semántica de color heredada de la v2 (mismo orden: verde/amarillo/rojo/
// naranja) pero en versión saturada — los usuarios ya reconocen ese
// código. Cada estado tiene 3 tonos: `fg` (texto y números — SIEMPRE con
// contraste ≥4.5:1 sobre blanco, ver tabla de contraste en la Entrega),
// `bar` (barras, puntos, bordes — más brillante, NUNCA como texto) y `bg`
// (fondo de pill).
//
// ⚠️ El amarillo/naranja de la referencia fallan como texto sobre blanco:
// por eso `fg` es un tono más oscuro que `bar` en esos dos casos.
const ESTADOS = {
  // Acreditada / Cumple
  positivo: { fg: "#15803D", bar: "#16A34A", bg: "#DCF5E7" },
  // En proceso / Pendiente
  enProceso: { fg: "#A16207", bar: "#F2B01E", bg: "#FEF4D6" },
  // Con observaciones / No cumple
  negativo: { fg: "#C0262D", bar: "#E5484D", bg: "#FDE4E5" },
  // Vencido
  vencido: { fg: "#C2410C", bar: "#EA6A1B", bg: "#FDEBDD" },
  // No aplica
  neutro: { fg: "#475569", bar: null, bg: "#EEF2F6" },
};

// Resultado de Evaluación (Requerimiento).
export const ESTADO_RESULTADO = {
  cumple: { label: "Cumple", ...ESTADOS.positivo },
  no_cumple: { label: "No Cumple", ...ESTADOS.negativo },
  no_aplica: { label: "No Aplica", ...ESTADOS.neutro },
  pendiente: { label: "Pendiente", ...ESTADOS.enProceso },
};

// Estado de Expediente. creado/en_revision/con_observaciones/aprobado son
// DERIVADOS por el backend; en_ejecucion y cerrado son manuales (ver
// decisions.md, "Estado de Expediente derivado").
export const ESTADO_EXPEDIENTE = {
  creado: { label: "En proceso", ...ESTADOS.enProceso },
  en_revision: { label: "En proceso", ...ESTADOS.enProceso },
  con_observaciones: { label: "Con observaciones", ...ESTADOS.negativo },
  aprobado: { label: "Acreditada", ...ESTADOS.positivo },
  en_ejecucion: { label: "Acreditada", ...ESTADOS.positivo },
  cerrado: { label: "Cerrado", ...ESTADOS.neutro },
};

// Vencimiento, derivado en el cliente a partir de una fecha que ya trae el
// backend (fechaVencimiento) — no es un estado propio de ninguna colección.
export const ESTADO_VENCIMIENTO = {
  vigente: { label: "Vigente", ...ESTADOS.positivo },
  por_vencer: { label: "Por vencer", ...ESTADOS.enProceso },
  vencido: { label: "Vencido", ...ESTADOS.vencido },
};

// Espejo manual de MAPEO_ESTADO_KPI_EMPRESA en
// functions/src/services/reporteService.js.
const BUCKET_ACREDITACION_POR_ESTADO = {
  aprobado: "acreditadas",
  en_ejecucion: "acreditadas",
  cerrado: "acreditadas",
  creado: "enProceso",
  en_revision: "enProceso",
  con_observaciones: "observadas",
};

export function bucketAcreditacion(estadoExpediente) {
  return BUCKET_ACREDITACION_POR_ESTADO[estadoExpediente] || null;
}

export function estadoResultado(resultado) {
  return ESTADO_RESULTADO[resultado] || ESTADO_RESULTADO.pendiente;
}

export function estadoExpediente(estado) {
  return ESTADO_EXPEDIENTE[estado] || ESTADO_EXPEDIENTE.creado;
}

export function estadoPorDiasRestantes(diasRestantes, umbralPorVencer = 30) {
  if (diasRestantes === null || diasRestantes === undefined) return null;
  if (diasRestantes < 0) return ESTADO_VENCIMIENTO.vencido;
  if (diasRestantes <= umbralPorVencer) return ESTADO_VENCIMIENTO.por_vencer;
  return ESTADO_VENCIMIENTO.vigente;
}
