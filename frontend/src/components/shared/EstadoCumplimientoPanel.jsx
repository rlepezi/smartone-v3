import React from "react";
import { MultiSegmentRing } from "./MultiSegmentRing";
import { calcularPorcentaje } from "../../utils/cumplimientoCalculos";

// Donut + leyenda de "Estado de Cumplimiento" — extraído de
// DashboardPage.jsx para que ExpedientesListPage lo reutilice sin
// duplicar la misma lógica visual.
//
// "Sin evidencia" (antes "Sin Evaluar") no es un resultado de Evaluación
// — es la cuenta de Requerimientos aplicables sin ninguna Evaluación
// vigente todavía (ver calcularSinEvaluar en utils/cumplimientoCalculos.js).
// Es distinto de "Pendiente": Pendiente SÍ es una Evaluación real, ya
// creada, con evidencia cargada esperando revisión. "Sin evidencia" es
// que ni siquiera existe el registro de Evaluación. Por eso llevan
// tooltips propios (title=) que explican la diferencia.
//
// "No Aplica" SÍ es un resultado real de Evaluación (a diferencia de "Sin
// evidencia") y antes quedaba fuera del donut — eso hacía que "Evaluaciones
// Realizadas" (KPI, cuenta TODAS las evaluaciones vigentes) no calzara con
// cumple+no_cumple+pendiente del donut. Se agrega acá para que el total
// del donut sea el total real de evaluaciones + sin evidencia.
export const EstadoCumplimientoPanel = ({ conteos, sinEvaluar = 0, size = 160, strokeWidth = 18 }) => {
  const segmentos = [
    { key: "cumple", label: "Cumple", value: conteos.cumple, ring: "text-sage-dark", dot: "bg-sage-dark" },
    {
      key: "pendiente", label: "Pendiente", value: conteos.pendiente, ring: "text-amber-400", dot: "bg-amber-400",
      tooltip: "Evaluación ya creada, con evidencia cargada, esperando revisión.",
    },
    { key: "no_cumple", label: "No Cumple", value: conteos.no_cumple, ring: "text-red-500", dot: "bg-red-500" },
    { key: "no_aplica", label: "No Aplica", value: conteos.no_aplica || 0, ring: "text-violet-300", dot: "bg-violet-300" },
    {
      key: "sin_evaluar", label: "Sin evidencia", value: sinEvaluar, ring: "text-slate-300", dot: "bg-slate-300",
      tooltip: "Requerimiento sin ninguna Evaluación creada todavía (distinto de \"Pendiente\", que sí tiene una Evaluación en curso).",
    },
  ];
  const totalDonut = segmentos.reduce((sum, s) => sum + s.value, 0);
  const porcentaje = calcularPorcentaje(conteos.cumple, totalDonut);

  if (totalDonut === 0) {
    return (
      <div className="py-10 text-center text-slate-400 text-xs">
        Aún no hay evaluaciones registradas.
      </div>
    );
  }

  return (
    <div className="flex flex-col sm:flex-row items-center gap-8">
      <div className="relative flex-shrink-0">
        <MultiSegmentRing
          segments={segmentos.map((s) => ({ key: s.key, value: s.value, className: s.ring }))}
          size={size}
          strokeWidth={strokeWidth}
        />
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-black text-carbon-dark">{porcentaje}%</span>
          <span className="text-[11px] font-semibold text-slate-400 text-center leading-tight mt-0.5">
            Cumplimiento<br />General
          </span>
        </div>
      </div>
      <div className="flex-1 w-full space-y-3">
        {segmentos.map((s) => (
          <div key={s.key} className="flex items-center justify-between text-xs" title={s.tooltip}>
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${s.dot} flex-shrink-0`} />
              <span className="font-semibold text-slate-600">{s.label}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-black text-carbon-dark">{s.value}</span>
              <span className="text-slate-400 font-medium">
                ({calcularPorcentaje(s.value, totalDonut)}%)
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
