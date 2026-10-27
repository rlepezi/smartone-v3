// Etiquetas y colores de Revisiones IA (un solo lugar para listado, asistente y detalle).

export const ETIQUETA_TIPO_DOCUMENTAL = {
  CEDULA_CL: "Cédula de identidad",
  LICENCIA_CL: "Licencia de conducir",
  OTRO: "No normalizado",
};

// Propuesta y resultado final: verde, rojo o ámbar.
export const PROPUESTA = {
  cumple: { label: "Cumple", clase: "bg-sage-lighter text-sage-darker border-sage-light" },
  no_cumple: { label: "No cumple", clase: "bg-red-50 text-red-700 border-red-200" },
  revision_humana: { label: "Revisión humana", clase: "bg-amber-50 text-amber-700 border-amber-200" },
};

export const ESTADO_RESULTADO = {
  propuesto: { label: "Propuesto", clase: "bg-slate-100 text-slate-600 border-slate-200" },
  aceptado: { label: "Aceptado", clase: "bg-sage-lighter text-sage-darker border-sage-light" },
  corregido: { label: "Corregido", clase: "bg-primary-lighter text-primary-dark border-primary/20" },
  descartado: { label: "Descartado", clase: "bg-slate-100 text-slate-400 border-slate-200" },
};

export const ESTADO_ENLACE = {
  confirmado: { label: "Enlace confirmado", clase: "bg-sage-lighter text-sage-darker border-sage-light" },
  sin_confirmar: { label: "RUN solo de la carpeta", clase: "bg-amber-50 text-amber-700 border-amber-200" },
  conflicto_run: { label: "RUN distinto al de la carpeta", clase: "bg-red-50 text-red-700 border-red-200" },
  persona_no_existe: { label: "Persona no registrada", clase: "bg-red-50 text-red-700 border-red-200" },
  sin_participacion: { label: "Sin participación activa", clase: "bg-amber-50 text-amber-700 border-amber-200" },
};

export const ESTADO_SESION = {
  en_proceso: { label: "En proceso", clase: "bg-primary-lighter text-primary-dark border-primary/20" },
  completada: { label: "Completada", clase: "bg-sage-lighter text-sage-darker border-sage-light" },
  cancelada: { label: "Cancelada", clase: "bg-slate-100 text-slate-500 border-slate-200" },
};

// Resultado de una regla: color del ícono.
export const RESULTADO_REGLA = {
  cumple: { label: "Cumple", clase: "text-sage-dark" },
  no_cumple: { label: "No cumple", clase: "text-red-600" },
  revision: { label: "Revisión", clase: "text-amber-600" },
  informativa: { label: "Informativa", clase: "text-slate-400" },
  no_aplica: { label: "No aplica", clase: "text-slate-300" },
};

export const CLASE_BADGE = "inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold border whitespace-nowrap";

export const formatUsd = (valor, decimales = 2) =>
  `US$${Number(valor || 0).toLocaleString("es-CL", { minimumFractionDigits: decimales, maximumFractionDigits: decimales })}`;

// RUN 12345678-5 → 12.345.678-5.
export const formatRun = (run) => {
  const m = String(run || "").match(/^(\d+)-([\dK])$/i);
  if (!m) return run || "—";
  return `${m[1].replace(/\B(?=(\d{3})+(?!\d))/g, ".")}-${m[2].toUpperCase()}`;
};

export const ROLES_OPERAN_REVISIONES = ["superadmin", "evaluador"];

// Completitud contra la plantilla de estructura.
export const ESTADO_COMPLETITUD = {
  completo: { label: "Completo", clase: "bg-sage-lighter text-sage-darker border-sage-light" },
  incompleto: { label: "Incompleto", clase: "bg-amber-50 text-amber-700 border-amber-200" },
  faltante: { label: "Falta", clase: "bg-red-50 text-red-700 border-red-200" },
  no_aplica: { label: "No aplica", clase: "bg-slate-100 text-slate-400 border-slate-200" },
  no_reconocida: { label: "No reconocida", clase: "bg-slate-100 text-slate-500 border-slate-200" },
  deshabilitada: { label: "Deshabilitada (no se revisa)", clase: "bg-slate-100 text-slate-400 border-slate-200" },
};

// Motivos por los que un archivo no va a la IA.
export const MOTIVO_EXCLUSION = {
  datos_sensibles: "Revisión manual (dato sensible)",
  tipo_no_normalizado: "Tipo no normalizado",
  no_reconocido: "No reconocido",
  formato_no_soportado: "Formato no soportado",
  tamano: "Supera los 10 MB",
  deshabilitado: "Deshabilitado en la plantilla",
  tipo_inactivo: "Tipo documental inactivo",
  no_solicitado: "No solicitado en este expediente",
  sin_persona_en_expediente: "Carpeta sin persona en el expediente",
  ya_validado: "Ya validado",
};

// Semáforo de completitud de una empresa: rojo si falta una sección obligatoria, ámbar si hay
// algo incompleto, verde si está todo.
export const semaforoEmpresa = (secciones) => {
  const filas = (secciones || []).filter((s) => s.estado !== "no_reconocida");
  if (filas.some((s) => s.estado === "faltante")) return { label: "Faltan secciones", clase: "bg-red-500" };
  if (filas.some((s) => s.estado === "incompleto")) return { label: "Incompleta", clase: "bg-amber-400" };
  return { label: "Completa", clase: "bg-sage-dark" };
};

// Estado de una celda de la matriz del Expediente (sujeto × requerimiento).
export const ESTADO_CELDA = {
  pendiente: { label: "Pendiente", clase: "bg-slate-100 text-slate-500 border-slate-200" },
  propuesta_ia: { label: "Propuesta IA", clase: "bg-primary-lighter text-primary-dark border-primary border-dashed" },
  validado_ia: { label: "Validado IA", clase: "" },
  validado_manual: { label: "Validado manual", clase: "" },
  no_aplica: { label: "No aplica", clase: "bg-violet-50 text-violet-700 border-violet-200" },
  vencido: { label: "Vencido", clase: "bg-red-50 text-red-700 border-red-300" },
  discrepancia: { label: "Discrepancia", clase: "bg-amber-50 text-amber-800 border-amber-300" },
};
export const CLASE_RESULTADO_CELDA = {
  cumple: "bg-sage-lighter text-sage-darker border-sage-light",
  no_cumple: "bg-red-50 text-red-700 border-red-200",
};
export const PROPUESTA_TEXTO = { cumple: "Cumple", no_cumple: "No cumple", revision_humana: "Revisión humana" };
export const RESULTADO_TEXTO = { cumple: "Cumple", no_cumple: "No cumple", no_aplica: "No aplica", pendiente: "Pendiente" };
export const MODALIDAD_EVALUACION = { manual: "Manual", ia_asistida: "IA", reutilizada: "Reutilizada" };

// Valor del selector de Empresa para "sin enlace (solo completitud)".
export const SIN_ENLACE = "__sin_enlace";

// Modalidad de un documento en el alcance de validación.
export const MODALIDAD = {
  ia: { label: "Validación IA", clase: "bg-primary-lighter text-primary-dark border-primary/20" },
  solo_completitud: { label: "Solo completitud", clase: "bg-slate-100 text-slate-600 border-slate-200" },
  sensible: { label: "Sensible · solo presencia", clase: "bg-orange-50 text-orange-700 border-orange-200" },
};
export const MOTIVO_MODALIDAD = {
  sin_tipo_documental: "Sin tipo documental",
  tipo_inactivo: "Tipo documental inactivo",
  tipo_no_normalizado: "Tipo no normalizado",
  datos_sensibles: "Datos sensibles: nunca se envía a la IA",
};

// Texto de una celda (badge y CSV).
export const textoCelda = (celda) => {
  if (!celda) return "";
  const base = ESTADO_CELDA[celda.estado]?.label || celda.estado;
  if (["validado_ia", "validado_manual"].includes(celda.estado)) return `${base} · ${RESULTADO_TEXTO[celda.resultado] || celda.resultado}`;
  if (celda.estado === "propuesta_ia" && celda.propuesta) return `${base} · ${PROPUESTA_TEXTO[celda.propuesta.propuesta] || celda.propuesta.propuesta}`;
  return base;
};
