import React from "react";
import { ProgressRing } from "./ProgressRing";
import { claseAnilloCumplimiento } from "../../utils/cumplimientoClases";

// Piezas visuales comunes de las pantallas de Detalle (Proyecto, Empresa,
// Persona, Maquinaria): mismas tarjetas KPI, mismos paneles y campos.

// Tarjeta de la franja de KPIs superior.
export const KpiCard = ({ titulo, subtexto, children }) => (
  <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-card min-w-0">
    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">{titulo}</p>
    {children}
    {subtexto && <p className="text-[11px] font-semibold text-slate-500 mt-1.5">{subtexto}</p>}
  </div>
);

// Número grande de una tarjeta KPI (con esqueleto mientras carga).
export const KpiValor = ({ valor, listo = true }) => (
  listo
    ? <h3 className="text-2xl font-black text-carbon-dark tracking-tight">{valor}</h3>
    : <div className="h-8 w-14 rounded-lg bg-slate-100 animate-pulse" />
);

// Donut de cumplimiento (pct: número, null = sin dato, undefined = cargando).
export const KpiAnillo = ({ pct, size = 56, strokeWidth = 6, textoClass = "text-xs" }) => {
  if (pct === undefined) {
    return <div className="rounded-full bg-slate-100 animate-pulse" style={{ width: size, height: size }} />;
  }
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <ProgressRing value={pct || 0} size={size} strokeWidth={strokeWidth} progressClassName={claseAnilloCumplimiento(pct)} />
      <span className={`absolute inset-0 flex items-center justify-center ${textoClass} font-black text-carbon-dark`}>
        {pct === null ? "—" : `${pct}%`}
      </span>
    </div>
  );
};

// Tarjeta con título (y ícono opcional): contenedor de las secciones de un
// detalle, tanto en el contenido de las pestañas como en el panel lateral.
export const TarjetaPanel = ({ titulo, Icono, accion, children }) => (
  <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-card space-y-3">
    <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100">
      <div className="flex items-center gap-2">
        {Icono && <Icono className="w-4 h-4 text-primary" />}
        <h3 className="text-sm font-bold text-carbon-dark uppercase tracking-wider">{titulo}</h3>
      </div>
      {accion}
    </div>
    {children}
  </div>
);

// Par etiqueta / valor de las tarjetas de información.
export const CampoInfo = ({ etiqueta, children }) => (
  <div>
    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">{etiqueta}</p>
    <div className="text-slate-700 font-medium text-xs">{children || <span className="text-slate-400 italic">-</span>}</div>
  </div>
);
