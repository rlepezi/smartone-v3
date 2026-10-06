import React from "react";
import { Users, Truck } from "lucide-react";

// Celda "Participantes": Personas y Maquinarias juntas (ícono + número).
// `personas` / `maquinarias` aceptan el valor ya resuelto (número, "…" o "-").
export const ParticipantesCell = ({ personas, maquinarias }) => (
  <div className="flex items-center gap-3.5">
    <span className="inline-flex items-center gap-1 text-xs font-bold text-carbon-dark" title="Personas">
      <Users className="w-3.5 h-3.5 text-slate-400" />
      {personas}
    </span>
    <span className="inline-flex items-center gap-1 text-xs font-bold text-carbon-dark" title="Maquinarias">
      <Truck className="w-3.5 h-3.5 text-slate-400" />
      {maquinarias}
    </span>
  </div>
);
