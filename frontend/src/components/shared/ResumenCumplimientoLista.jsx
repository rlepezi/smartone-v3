// "Resumen" de cumplimiento en formato lista (sin donut): total de requisitos + un renglón por
// resultado, desde los mismos contadores que `EstadoCumplimientoPanel` (`resumen` de las
// instancias de Requerimiento) — así el donut y esta lista nunca muestran números distintos.
// "Pendientes" incluye los requisitos aún sin evaluar.
import { segmentosCumplimiento } from "../../utils/estadosCumplimiento";

export const ResumenCumplimientoLista = ({ resumen }) => {
  const r = resumen || {};
  const segmentos = segmentosCumplimiento(r).map((s) => ({ ...s, label: s.plural }));
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
