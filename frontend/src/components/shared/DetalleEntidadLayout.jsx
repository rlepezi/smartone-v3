import React from "react";
import { ArrowLeft } from "lucide-react";
import { Tabs } from "./Tabs";
import { ErrorBanner } from "./ErrorBanner";

// Esqueleto común de las pantallas de Detalle de Persona y Maquinaria:
// encabezado + franja de 5 KPIs + pestañas con un panel lateral que se ve en
// TODAS las pestañas. Cada pantalla solo aporta sus datos.
//   kpis: nodos (normalmente <KpiCard/>), tabs: [{key,label}], sidebar: nodo.
export const DetalleEntidadLayout = ({
  onVolver, titulo, subtitulo, badge, acciones, error, kpis, tabs, tab, onTab, sidebar, children,
}) => (
  <div className="max-w-7xl mx-auto space-y-6">
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onVolver}
          className="p-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 transition-colors shadow-sm"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="min-w-0">
          <h2 className="text-xl font-bold text-gray-900 tracking-tight">{titulo}</h2>
          <p className="text-xs text-gray-500">{subtitulo}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {badge}
        {acciones}
      </div>
    </div>

    <ErrorBanner message={error} />

    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-5">{kpis}</div>

    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_20rem] gap-6 items-start">
      <div className="min-w-0 space-y-6">
        <Tabs tabs={tabs} active={tab} onChange={onTab} />
        {children}
      </div>
      <aside className="space-y-6 min-w-0">{sidebar}</aside>
    </div>
  </div>
);
