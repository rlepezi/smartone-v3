import React from "react";
import { Search } from "lucide-react";
import { SelectConBusqueda } from "./SelectConBusqueda";

// `busquedaFlexible` (opcional, default false): la búsqueda ocupa el espacio
// sobrante (mínimo 12rem) en vez de un ancho fijo, para que búsqueda y filtros
// quepan en una sola fila cuando la barra es ancha; si no caben, los filtros
// se envuelven igual que siempre.
export const FilterBar = ({ searchValue, searchPlaceholder, onSearchChange, filters = [], busquedaFlexible = false }) => {
  return (
    <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-card flex flex-col sm:flex-row items-center gap-3 justify-between">
      <div className={`relative w-full ${busquedaFlexible ? "sm:w-auto sm:flex-1 sm:min-w-48" : "sm:w-72"}`}>
        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
        <input
          type="text"
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          className="w-full pl-10 pr-3.5 py-2 bg-slate-50/50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
        />
      </div>
      {filters.length > 0 && (
        <div className="flex items-center gap-3 w-full sm:w-auto flex-wrap">
          {filters.map((filtro) => (
            <div key={filtro.label} className="flex items-center gap-2 w-full sm:w-auto">
              <span className="text-xs font-semibold text-slate-500">{filtro.label}:</span>
              {filtro.conBusqueda ? (
                <SelectConBusqueda value={filtro.value} onChange={filtro.onChange} options={filtro.options} placeholder={`Buscar ${filtro.label.toLowerCase()}...`} />
              ) : (
              <select
                value={filtro.value}
                onChange={(e) => filtro.onChange(e.target.value)}
                className="px-3 py-2 bg-slate-50/50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
              >
                {filtro.options.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
