import React from "react";
import { Loader2 } from "lucide-react";
import { EmptyState } from "./EmptyState";

// `compact` (opcional, default false): padding horizontal de encabezados px-4
// en vez de px-6, para tablas con muchas columnas que deben caber sin
// scroll horizontal. Quien lo use debe aplicar el mismo px-4 en sus <td>.
// `col.align` (opcional): "right" alinea el encabezado a la derecha, para
// columnas numéricas cuyas <td> también van a la derecha.
export const DataTable = ({ columns, data, loading, loadingLabel, emptyLabel, renderRow, compact = false }) => {
  return (
    // `min-w-0`: si este componente termina siendo, en algún futuro uso,
    // el hijo DIRECTO de un contenedor grid/flex, evita el mismo bug de
    // desborde (un grid/flex item nunca se achica bajo el ancho mínimo
    // de su contenido salvo que se fuerce min-width:0) que hoy se
    // resuelve en cada página con su propio wrapper `min-w-0`.
    <div className="bg-white rounded-2xl border border-slate-100 shadow-card overflow-hidden min-w-0">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-slate-50/75 border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              {columns.map((col) => (
                <th key={col.key} className={`py-3.5 ${compact ? "px-4" : "px-6"}${col.align === "right" ? " text-right" : ""}`}>{col.label}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={columns.length} className="py-8 text-center text-slate-400">
                  <div className="flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-xs">{loadingLabel}</span>
                  </div>
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={columns.length}>
                  <EmptyState message={emptyLabel} />
                </td>
              </tr>
            ) : (
              data.map(renderRow)
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
