import React from "react";
import { Link } from "react-router-dom";
import { RefreshCw, Plus } from "lucide-react";
import { cn } from "../../utils/cn";

// El prop "icon" es opcional y a propósito no cambia nada si no se pasa:
// solo cuando se usa se agranda el título y se separa mejor del subtítulo
// (jerarquía visual reforzada) — así páginas que todavía no lo adoptan
// quedan pixel-idénticas a como estaban.
export const PageHeader = ({ title, subtitle, icon: Icon, loading, onRefresh, action }) => {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
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
      <div className="flex items-center gap-2">
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
