import React from "react";
import { BarraCumplimiento } from "../proyectos/EmpresasParticipantesTable";

// Lista numerada de Requerimientos. Compartida por el detalle de Empresa y
// el de Proyecto: cada pantalla decide qué mostrar a la derecha de cada
// ítem (`renderEstado`) y qué desplegar debajo (`renderDetalle`, p. ej. el
// formulario de evaluación inline).
export const RequerimientosLista = ({ items, renderEstado, renderDetalle }) => (
  <div className="rounded-xl border border-slate-100 overflow-hidden divide-y divide-slate-100">
    {items.map((r, index) => (
      <div key={r.requerimientoId} className="px-3 py-2.5 bg-white">
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="text-slate-600 font-medium">
            <span className="text-slate-400 font-semibold mr-1.5">{index + 1}.</span>
            {r.nombreCorto || r.nombre}
            {r.perfilRecursoIds?.length > 0 && (
              <span className="ml-2 text-[11px] text-slate-400">
                (solo {r.perfilRecursoIds.length} {r.perfilRecursoIds.length === 1 ? "perfil" : "perfiles"})
              </span>
            )}
          </span>
          <div className="shrink-0">{renderEstado(r)}</div>
        </div>
        {renderDetalle?.(r)}
      </div>
    ))}
  </div>
);

// Encabezado (título, subtítulo, cantidad y % de cumplimiento) + lista.
export const GrupoRequerimientos = ({ titulo, subtitulo, pctCumple, items, renderEstado, renderDetalle }) => (
  <div>
    <div className="flex items-center justify-between gap-2 mb-1.5">
      <div className="min-w-0">
        <p className="text-xs font-bold text-carbon-dark truncate">{titulo}</p>
        {subtitulo && <p className="text-[11px] text-slate-400">{subtitulo}</p>}
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <span className="text-[11px] font-semibold text-slate-500 whitespace-nowrap">
          {items.length} Requerimiento{items.length === 1 ? "" : "s"}
        </span>
        {pctCumple !== null && pctCumple !== undefined && <BarraCumplimiento pct={pctCumple} />}
      </div>
    </div>
    <RequerimientosLista items={items} renderEstado={renderEstado} renderDetalle={renderDetalle} />
  </div>
);
