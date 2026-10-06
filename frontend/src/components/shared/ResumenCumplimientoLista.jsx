import React from "react";

// "Resumen" de cumplimiento en formato lista (sin donut): Total de requisitos + un renglón por
// resultado, con la misma fuente de datos que `EstadoCumplimientoPanel` (conteos/sinEvaluar) —
// para que el donut y esta lista nunca puedan mostrar números distintos. Usado junto a
// EstadoCumplimientoPanel cuando además del donut hace falta la versión "tarjeta de resumen"
// (ej. "Resumen por Empresa" / "Resumen de {Persona}" en el Detalle de Expediente).
export const ResumenCumplimientoLista = ({ conteos, sinEvaluar = 0 }) => {
  const segmentos = [
    { key: "cumple", label: "Cumplen", value: conteos.cumple, dot: "bg-sage-dark" },
    { key: "pendiente", label: "Pendientes", value: conteos.pendiente, dot: "bg-amber-400" },
    { key: "no_cumple", label: "No cumplen", value: conteos.no_cumple, dot: "bg-red-500" },
    { key: "sin_evaluar", label: "Sin evaluar", value: sinEvaluar, dot: "bg-slate-300" },
  ];
  const total = segmentos.reduce((sum, s) => sum + s.value, 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs pb-2 border-b border-slate-100">
        <span className="font-semibold text-slate-600">Total de requisitos</span>
        <span className="font-black text-carbon-dark">{total}</span>
      </div>
      {segmentos.map((s) => (
        <div key={s.key} className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${s.dot} flex-shrink-0`} />
            <span className="font-semibold text-slate-600">{s.label}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-black text-carbon-dark">{s.value}</span>
            <span className="text-slate-400 font-medium">
              ({total > 0 ? Math.round((s.value / total) * 100) : 0}%)
            </span>
          </div>
        </div>
      ))}
    </div>
  );
};
