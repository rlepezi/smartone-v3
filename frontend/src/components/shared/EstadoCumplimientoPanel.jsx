import { useState } from "react";
import { MultiSegmentRing } from "./MultiSegmentRing";
import { calcularPorcentaje, porcentajeCumplimiento, textoPorcentaje } from "../../utils/cumplimientoCalculos";
import { CLASE_PISTA_DONA, segmentosCumplimiento } from "../../utils/estadosCumplimiento";

// Donut + leyenda de "Estado de Cumplimiento" (Dashboard, listado de Expedientes) sobre los
// contadores de instancias de Requerimiento (`resumen` de uno o varios Expedientes). "Pendiente"
// incluye las instancias aún sin evaluar. El % del centro es el % de cumplimiento oficial:
// cumple / (activas − no aplica), "—" si no hay nada evaluable.
// `variante="encabezado"`: indicador compacto para el encabezado de una página (listado de
// Expedientes), sin tarjeta: anillo pequeño con el % al centro, "Cumplimiento general" y los cuatro
// estados en una línea ("● 2 Cumple · ● 13 Pendiente ..."), con el % de cada uno en su tooltip.
// En móvil solo se ven el anillo y "13% cumplimiento"; los estados aparecen al tocarlo. Con
// `cargando` muestra un espacio del mismo tamaño y con `vacio`, "Sin expedientes".
export const EstadoCumplimientoPanel = ({
  resumen, size = 160, strokeWidth = 18, variante = "panel", cargando = false, vacio = false,
}) => {
  const [estadosVisibles, setEstadosVisibles] = useState(false);
  const r = resumen || {};
  const segmentos = segmentosCumplimiento(r);
  const totalDonut = segmentos.reduce((sum, s) => sum + s.value, 0);

  if (variante === "encabezado") {
    if (cargando) {
      return <div className="h-11 w-44 sm:w-[30rem] max-w-full rounded-xl bg-slate-100 animate-pulse" aria-hidden="true" />;
    }
    if (vacio) {
      return <p className="h-11 flex items-center text-xs font-semibold text-slate-400">Sin expedientes</p>;
    }
    const porcentaje = textoPorcentaje(porcentajeCumplimiento(r));
    const detalle = (s) => `${s.label}: ${s.value} (${calcularPorcentaje(s.value, totalDonut)}%)`;
    return (
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <button
          type="button"
          onClick={() => setEstadosVisibles((v) => !v)}
          title={segmentos.map(detalle).join(" · ")}
          aria-expanded={estadosVisibles}
          className="flex items-center gap-2.5 text-left sm:cursor-default focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-xl"
        >
          <span className="relative shrink-0">
            <MultiSegmentRing
              segments={segmentos.map((s) => ({ key: s.key, value: s.value, className: s.ring }))}
              size={44}
              strokeWidth={5}
              trackClassName={CLASE_PISTA_DONA}
            />
            <span className="absolute inset-0 flex items-center justify-center text-[10px] font-black text-carbon-dark">
              {porcentaje}
            </span>
          </span>
          <span className="hidden sm:block text-[11px] font-semibold text-slate-500 leading-tight">
            Cumplimiento<br />general
          </span>
          <span className="sm:hidden text-xs font-semibold text-slate-600">{porcentaje} cumplimiento</span>
        </button>
        <div className={`${estadosVisibles ? "flex" : "hidden"} sm:flex flex-wrap items-center gap-x-2 gap-y-1 text-xs`}>
          {segmentos.map((s, i) => (
            <span key={s.key} className="flex items-center gap-2">
              {i > 0 && <span className="text-slate-300" aria-hidden="true">·</span>}
              <span className="flex items-center gap-1.5 whitespace-nowrap" title={detalle(s)}>
                <span className={`w-2 h-2 rounded-full ${s.dot} shrink-0`} />
                <span className="font-black text-carbon-dark">{s.value}</span>
                <span className="font-medium text-slate-500">{s.label}</span>
              </span>
            </span>
          ))}
        </div>
      </div>
    );
  }

  if (totalDonut === 0) {
    return (
      <div className="py-10 text-center text-slate-400 text-xs">
        Aún no hay requerimientos que evaluar.
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
          trackClassName={CLASE_PISTA_DONA}
        />
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-black text-carbon-dark">{textoPorcentaje(porcentajeCumplimiento(r))}</span>
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
