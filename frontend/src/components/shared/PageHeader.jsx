import React from "react";
import { Link } from "react-router-dom";
import { RefreshCw, Plus } from "lucide-react";
import { cn } from "../../utils/cn";

// El prop "icon" es opcional y a propósito no cambia nada si no se pasa:
// solo cuando se usa se agranda el título y se separa mejor del subtítulo
// (jerarquía visual reforzada) — así páginas que todavía no lo adoptan
// quedan pixel-idénticas a como estaban.
// El prop "resumen" (opcional, un nodo) muestra un indicador compacto en la misma fila: en pantallas
// anchas, entre el título y los botones, separado por un divisor; en angostas baja a una línea
// propia bajo el subtítulo y los botones quedan fijos arriba a la derecha. Sin "resumen" el
// encabezado no cambia.
export const PageHeader = ({ title, subtitle, icon: Icon, loading, onRefresh, action, resumen = null }) => {
  return (
    <div className={resumen
      ? "flex items-start xl:items-center justify-between gap-4"
      : "flex flex-col sm:flex-row sm:items-center justify-between gap-4"}
    >
      <div className={resumen ? "min-w-0" : undefined}>
      <div className="flex items-center gap-3">
        {Icon && (
          <div className="w-11 h-11 rounded-xl bg-primary-lighter text-primary-dark flex items-center justify-center flex-shrink-0">
            <Icon className="w-5 h-5" />
          </div>
        )}
        <div>
          <h1 className={`font-bold text-carbon-dark tracking-tight ${Icon ? "text-2xl" : "text-xl"}`}>{title}</h1>
          <p className={`text-xs text-slate-500 ${Icon ? "mt-1" : ""}`}>{subtitle}</p>
        </div>
      </div>
      {resumen && <div className="xl:hidden mt-3">{resumen}</div>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {resumen && (
          <div className="hidden xl:flex items-center gap-4 mr-2">
            {resumen}
            <span className="w-px h-7 bg-slate-200" aria-hidden="true" />
          </div>
        )}
        <button
          onClick={onRefresh}
          className="p-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition-colors shadow-sm"
          title="Refrescar"
        >
          <RefreshCw className={cn("w-4 h-4", loading && "animate-spin text-primary")} />
        </button>
        {action && action.onClick && (
          <button
            type="button"
            onClick={action.onClick}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary hover:bg-primary-dark text-white font-bold text-xs shadow-md shadow-primary/20 transition-all"
          >
            <Plus className="w-4 h-4" />
            {action.label}
          </button>
        )}
        {action && !action.onClick && (
          <Link
            to={action.to}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary hover:bg-primary-dark text-white font-bold text-xs shadow-md shadow-primary/20 transition-all"
          >
            <Plus className="w-4 h-4" />
            {action.label}
          </Link>
        )}
      </div>
    </div>
  );
};
