import React from "react";
import { ESTADOS_EXPEDIENTE } from "../../services/expedienteService";

// Fill sólido por estado — ESTADOS_EXPEDIENTE.color es una combinación
// pastel pensada para StatusBadge (bg-*-lighter + texto + borde), no un
// relleno sólido legible dentro de una barra angosta. Mismas familias de
// color que ya usa cada estado ahí (primary/sage/ámbar/slate), solo en
// su variante sólida.
const BARRA_COLOR_POR_ESTADO = {
  creado: "bg-primary-light",
  en_revision: "bg-amber-400",
  con_observaciones: "bg-amber-400",
  aprobado: "bg-sage-dark",
  en_ejecucion: "bg-sage-dark",
  cerrado: "bg-slate-400",
};

// Barras horizontales de Expedientes por Estado — extraído de
// DashboardPage.jsx para que ExpedientesListPage lo reutilice sin
// duplicar la misma lógica visual. Los estados en 0 SÍ se muestran (en
// gris claro, barra vacía) en vez de ocultarse, para que la lista de
// estados sea siempre estable y no "salte" según qué estados tengan datos
// en un momento dado.
export const ExpedientesPorEstadoBars = ({ conteos, emptyLabel = "Aún no hay expedientes registrados." }) => {
  const total = Object.values(conteos || {}).reduce((sum, n) => sum + n, 0);

  if (total === 0) {
    return (
      <div className="py-8 text-center text-slate-400 text-xs">
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {ESTADOS_EXPEDIENTE.map((estado) => {
        const cantidad = conteos?.[estado.value] || 0;
        const pct = total > 0 ? Math.round((cantidad / total) * 100) : 0;
        const enCero = cantidad === 0;
        return (
          <div key={estado.value} className="space-y-1">
            <div className="flex items-center justify-between text-[11px] font-semibold">
              <span className={enCero ? "text-slate-400" : "text-slate-600"}>{estado.label}</span>
              <span className={enCero ? "text-slate-300 font-black" : "text-carbon-dark font-black"}>
                {cantidad}
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  enCero ? "bg-slate-200" : BARRA_COLOR_POR_ESTADO[estado.value] || "bg-slate-400"
                }`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};
