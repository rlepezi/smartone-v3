import React, { useEffect, useRef, useState } from "react";
import { MandanteChip } from "./MandanteChip";

// Celda de Mandantes: hasta 2 con logo y nombre; con 3 o más, los 2 primeros + "+N más", que al
// hacer clic (o al pasar el mouse) despliega el resto. Nunca un "+N" que oculte información sin
// forma de verla. `mandantes`: [{ id, nombre, logoUrl }] ya resueltos.
export const MandantesCelda = ({ mandantes }) => {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const alClicFuera = (e) => {
      if (!ref.current?.contains(e.target)) setAbierto(false);
    };
    document.addEventListener("mousedown", alClicFuera);
    return () => document.removeEventListener("mousedown", alClicFuera);
  }, []);

  const visibles = mandantes.slice(0, 2);
  const resto = mandantes.slice(2);

  return (
    <div className="flex flex-col gap-1.5 items-start">
      {visibles.map((m) => (
        <MandanteChip key={m.id} nombre={m.nombre} logoUrl={m.logoUrl} />
      ))}
      {resto.length > 0 && (
        <div ref={ref} className="relative" onMouseEnter={() => setAbierto(true)} onMouseLeave={() => setAbierto(false)}>
          <button
            type="button"
            onClick={() => setAbierto((v) => !v)}
            className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
          >
            +{resto.length} más
          </button>
          {abierto && (
            <div className="absolute z-30 left-0 top-full pt-1">
              <div className="min-w-[12rem] bg-white border border-slate-200 rounded-xl shadow-lg p-2.5 space-y-1.5">
                {resto.map((m) => (
                  <MandanteChip key={m.id} nombre={m.nombre} logoUrl={m.logoUrl} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
