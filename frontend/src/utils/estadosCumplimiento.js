// Colores y nombres de los cuatro estados de cumplimiento de un requisito. ÚNICO lugar donde se
// definen: los usan las donas, sus leyendas, los puntos de la columna Requisitos, el resumen del
// listado de Expedientes y los badges de resultado, para que todos coincidan.
//  - `key`: valor del resultado de evaluación.  `campo`: contador en un `resumen`.
//  - `dot`: fondo del punto de color.  `ring`: color del segmento de la dona.
//  - `badge`: clases del badge de resultado.
export const ESTADOS_CUMPLIMIENTO = [
  {
    key: "cumple", campo: "cumple", label: "Cumple", plural: "Cumplen",
    dot: "bg-sage-dark", ring: "text-sage-dark", badge: "bg-sage-lighter text-sage-darker border-sage-light",
  },
  {
    key: "pendiente", campo: "pendiente", label: "Pendiente", plural: "Pendientes",
    dot: "bg-amber-400", ring: "text-amber-400", badge: "bg-amber-50 text-amber-700 border-amber-200",
    tooltip: "Requerimientos sin evaluar o evaluados como pendientes.",
  },
  {
    key: "no_cumple", campo: "noCumple", label: "No Cumple", plural: "No cumplen",
    dot: "bg-red-500", ring: "text-red-500", badge: "bg-red-50 text-red-700 border-red-200",
  },
  {
    key: "no_aplica", campo: "noAplica", label: "No Aplica", plural: "No aplican",
    dot: "bg-violet-300", ring: "text-violet-300", badge: "bg-violet-50 text-violet-700 border-violet-200",
  },
];

// Pista (fondo) de las donas: gris neutro, distinto de todos los estados.
export const CLASE_PISTA_DONA = "text-slate-200";

// Los cuatro estados con su cantidad, desde los contadores de un `resumen`.
export const segmentosCumplimiento = (resumen) => {
  const r = resumen || {};
  return ESTADOS_CUMPLIMIENTO.map((e) => ({ ...e, value: r[e.campo] || 0 }));
};
