import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarClock, AlertTriangle, ArrowUpRight } from "lucide-react";
import { vencimientoService } from "../../services/vencimientoService";
import { textoVencimiento, CLASE_VENCIMIENTO, UMBRAL_PROXIMO_DIAS } from "../../utils/vencimientos";

const PESTANAS = [
  { key: "vencidos", label: "Vencidos", vacio: "No hay documentos vencidos." },
  { key: "proximos", label: `Próximos (${UMBRAL_PROXIMO_DIAS} días)`, vacio: `No hay documentos que venzan en los próximos ${UMBRAL_PROXIMO_DIAS} días.` },
];
const LIMITE = 10;

// "Vencimientos próximos" del Dashboard: dos pestañas (Vencidos / Próximos), hasta 10 ítems cada
// una, con filas clickeables que abren el expediente en ese vencimiento
// (/expedientes/:id?tab=vencimientos&item=<instanciaId>). El alcance por Mandante lo aplica el
// backend (GET /vencimientos). "Ver todos" abre el listado de Expedientes filtrado.
export const VencimientosDashboard = ({ mandanteId = null }) => {
  const [pestana, setPestana] = useState("vencidos");
  // { vencidos: { loading, error, items, total }, proximos: {...} }
  const [datos, setDatos] = useState({});

  useEffect(() => {
    let vigente = true;
    PESTANAS.forEach(({ key }) => {
      vencimientoService.listar({ mandanteId, estado: key, limit: LIMITE })
        .then((r) => { if (vigente) setDatos((prev) => ({ ...prev, [key]: { items: r.items || [], total: r.total || 0 } })); })
        .catch((err) => { if (vigente) setDatos((prev) => ({ ...prev, [key]: { error: err.message || "No se pudo cargar." } })); });
    });
    return () => { vigente = false; };
  }, [mandanteId]);

  const actual = datos[pestana];
  const definicion = PESTANAS.find((p) => p.key === pestana);

  return (
    <div className="md:col-span-2 xl:col-span-1 bg-white p-6 rounded-2xl border border-slate-100 shadow-card flex flex-col h-full">
      <div className="flex items-center gap-2 pb-3 border-b border-slate-100 mb-4">
        <CalendarClock className="w-4 h-4 text-slate-400" />
        <h2 className="text-sm font-bold text-carbon-dark uppercase tracking-wider">Vencimientos Próximos</h2>
      </div>

      <div role="tablist" className="flex items-center gap-2 mb-3">
        {PESTANAS.map((p) => {
          const activo = pestana === p.key;
          const total = datos[p.key]?.total;
          return (
            <button
              key={p.key}
              type="button"
              role="tab"
              aria-selected={activo}
              onClick={() => setPestana(p.key)}
              className={`inline-flex items-center gap-1.5 text-[11px] font-bold rounded-full px-2.5 py-1 border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                activo
                  ? (p.key === "vencidos" ? "text-white bg-red-500 border-red-500" : "text-white bg-amber-500 border-amber-500")
                  : (p.key === "vencidos" ? "text-red-700 bg-red-50 border-red-200" : "text-amber-700 bg-amber-50 border-amber-200")
              }`}
            >
              {p.key === "vencidos" && <AlertTriangle className="w-3 h-3" />}
              {p.label} {total === undefined ? "…" : total}
            </button>
          );
        })}
      </div>

      <div className="flex-1">
        {!actual ? (
          <div className="py-8 text-center text-slate-400 text-xs">Cargando...</div>
        ) : actual.error ? (
          <div className="py-8 text-center text-red-400 text-xs">{actual.error}</div>
        ) : actual.items.length === 0 ? (
          <div className="py-8 text-center text-slate-400 text-xs">{definicion.vacio}</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {actual.items.map((it) => (
              <Link
                key={it.instanciaId}
                to={`/expedientes/${it.expedienteId}?tab=vencimientos&item=${it.instanciaId}`}
                title="Abrir el vencimiento en su expediente"
                className="py-3 px-2 -mx-2 flex items-center justify-between gap-3 rounded-xl hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-xs font-bold text-carbon-dark truncate" title={it.requerimiento?.nombre || undefined}>
                    {it.requerimiento?.nombreCorto || it.requerimiento?.nombre || "—"}
                  </p>
                  <p className="text-[11px] text-slate-400 truncate">
                    {[it.sujeto?.nombre, it.empresa?.nombre, it.proyecto?.nombre].filter(Boolean).join(" — ")}
                  </p>
                </div>
                <span className={`text-[11px] font-bold rounded-full px-2.5 py-1 border shrink-0 ${CLASE_VENCIMIENTO[it.clasificacion] || ""}`}>
                  {textoVencimiento(it.dias)}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>

      <Link
        to={`/expedientes?vencimientos=${pestana}`}
        className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-primary hover:text-primary-dark"
      >
        Ver todos <ArrowUpRight className="w-3.5 h-3.5" />
      </Link>
    </div>
  );
};
