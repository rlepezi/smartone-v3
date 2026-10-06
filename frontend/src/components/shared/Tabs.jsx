import React from "react";

// Barra de pestañas genérica. Controlada: quien la usa guarda cuál está
// activa y decide qué contenido pintar debajo.
export const Tabs = ({ tabs, active, onChange }) => (
  <div className="border-b border-slate-200 overflow-x-auto">
    <div role="tablist" className="flex items-center gap-1 min-w-max">
      {tabs.map((tab) => {
        const activa = tab.key === active;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={activa}
            onClick={() => onChange(tab.key)}
            className={`px-4 py-2.5 text-xs font-bold whitespace-nowrap border-b-2 -mb-px transition-colors ${
              activa
                ? "border-primary text-primary-dark"
                : "border-transparent text-slate-500 hover:text-carbon-dark hover:border-slate-300"
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  </div>
);
