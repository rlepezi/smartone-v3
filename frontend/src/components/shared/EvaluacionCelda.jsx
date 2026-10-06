import React from "react";
import { claseCumplimiento } from "../../utils/cumplimientoClases";

// Celda "Evaluación" de una Persona/Maquinaria: barra + % + cantidad de
// Requerimientos. `evaluacion` = { total, pctCumple } (ver
// utils/evaluacionSujeto.js).
export const EvaluacionCelda = ({ evaluacion }) => {
  if (!evaluacion || evaluacion.total === 0) {
    return <span className="text-[11px] text-slate-300 italic">Sin Requerimientos</span>;
  }
  return (
    <div>
      <div className="flex items-center gap-2">
        <div className="w-14 h-1.5 rounded-full bg-slate-100 overflow-hidden shrink-0">
          <div
            className={`h-full rounded-full ${claseCumplimiento(evaluacion.pctCumple)}`}
            style={{ width: `${evaluacion.pctCumple ?? 0}%` }}
          />
        </div>
        <span className="text-xs font-bold text-carbon-dark">
          {evaluacion.pctCumple === null ? "-" : `${evaluacion.pctCumple}%`}
        </span>
      </div>
      <span className="text-[10px] text-slate-400 whitespace-nowrap">
        {evaluacion.total} Requerimiento{evaluacion.total === 1 ? "" : "s"}
      </span>
    </div>
  );
};
