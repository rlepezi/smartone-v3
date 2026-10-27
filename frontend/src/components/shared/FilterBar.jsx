import React from "react";
import { Search } from "lucide-react";
import { SelectConBusqueda } from "./SelectConBusqueda";

// Barra de búsqueda y filtros de los listados. Todo va en una sola fila que se envuelve: la
// búsqueda es compacta (entre 10rem y 16rem) y cada filtro va a continuación, con su nombre en
// pequeño arriba del selector y un ancho fijo, para que un nombre largo en las opciones no empuje
// a los demás a otra línea. En móvil, cada elemento ocupa el ancho completo.
export const FilterBar = ({ searchValue, searchPlaceholder, onSearchChange, filters = [] }) => {
  return (
    <div className="bg-white px-4 py-3 rounded-2xl border border-slate-100 shadow-card flex flex-col sm:flex-row sm:flex-wrap sm:items-end gap-x-3 gap-y-3">
      <div className="relative w-full sm:w-auto sm:flex-1 sm:basis-40 sm:min-w-40 sm:max-w-64">
        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-2.5" />
        <input
          type="text"
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          className="w-full pl-10 pr-3.5 py-2 bg-slate-50/50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
        />
      </div>
      {filters.map((filtro) => (
        <div key={filtro.label} className="flex flex-col gap-1 w-full sm:w-44">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider leading-none">{filtro.label}</span>
          {filtro.conBusqueda ? (
            <SelectConBusqueda anchoCompleto ariaLabel={filtro.label} value={filtro.value} onChange={filtro.onChange} options={filtro.options} placeholder={`Buscar ${filtro.label.toLowerCase()}...`} />
          ) : (
            <select
              aria-label={filtro.label}
              value={filtro.value}
              onChange={(e) => filtro.onChange(e.target.value)}
              className="w-full min-w-0 truncate px-3 py-2 bg-slate-50/50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
            >
              {filtro.options.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          )}
        </div>
      ))}
    </div>
  );
};
