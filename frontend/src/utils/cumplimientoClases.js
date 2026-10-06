// Mismos umbrales que ya usa la columna "Cumplimiento" de
// ExpedientesListPage.jsx — sin umbral propio inventado.
export const claseCumplimiento = (pct) => {
  if (pct === null || pct === undefined) return "bg-slate-400";
  if (pct >= 70) return "bg-sage-dark";
  if (pct >= 40) return "bg-amber-400";
  return "bg-red-500";
};

// Estado de la Empresa derivado del MISMO umbral que la barra
// (claseCumplimiento): así el color de la barra y el del badge siempre
// coinciden. `clave` sirve para agrupar/filtrar.
export const estadoPorCumplimiento = (pct) => {
  if (pct === null || pct === undefined) {
    return { clave: "sin_evaluar", label: "Sin evaluar", className: "bg-slate-100 text-slate-600 border-slate-200" };
  }
  if (pct >= 70) return { clave: "acreditado", label: "Acreditado", className: "bg-sage-lighter text-sage-darker border-sage-light" };
  if (pct >= 40) return { clave: "en_proceso", label: "En proceso", className: "bg-amber-50 text-amber-700 border-amber-200" };
  return { clave: "pendiente", label: "Pendiente", className: "bg-red-50 text-red-700 border-red-200" };
};

// Color de texto (para el anillo/donut SVG) equivalente a la barra de
// claseCumplimiento: mismo umbral, una sola fuente.
export const claseAnilloCumplimiento = (pct) => claseCumplimiento(pct).replace("bg-", "text-");
