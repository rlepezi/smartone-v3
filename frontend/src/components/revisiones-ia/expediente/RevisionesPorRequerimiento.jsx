import { useEffect, useState } from "react";
import { revisionRequerimientoIAService } from "../../../services/revisionRequerimientoIAService";
import { ErrorBanner } from "../../shared/ErrorBanner";
import { ResultadoPrueba } from "../../requerimientos/reglas-ia/ResultadoPrueba";
import { RESULTADOS_PROPUESTOS, fechaDMA } from "../../../utils/reglasIA";
import { formatUsd } from "../../configuracion-ia/estilos";

const CLASE_BADGE = "inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold border whitespace-nowrap";
const CLASE_SELECT = "px-3 py-2 bg-slate-50/50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-primary/20";
const ESTADOS = {
  propuesta: { label: "Propuesta", clase: "bg-sky-50 text-sky-700 border-sky-200" },
  confirmada: { label: "Confirmada", clase: "bg-sage-lighter text-sage-darker border-sage-light" },
  descartada: { label: "Descartada", clase: "bg-slate-100 text-slate-500 border-slate-200" },
};

// Sección "Revisiones por requerimiento" de la pestaña Revisiones IA (superadmin y evaluador): todas
// las revisiones "Revisar con IA" del expediente, con filtros por estado y resultado, y su detalle.
export const RevisionesPorRequerimiento = ({ expedienteId }) => {
  const [filtros, setFiltros] = useState({ estado: "", resultado: "" });
  const [lista, setLista] = useState(null);
  const [error, setError] = useState(null);
  const [vista, setVista] = useState(null);

  useEffect(() => {
    let vigente = true;
    revisionRequerimientoIAService.listar(expedienteId, filtros)
      .then((l) => { if (vigente) { setLista(l || []); setError(null); } })
      .catch((err) => { if (vigente) setError(err.message || "No se pudieron cargar las revisiones."); });
    return () => { vigente = false; };
  }, [expedienteId, filtros]);

  const filtro = (campo) => (e) => setFiltros((f) => ({ ...f, [campo]: e.target.value }));

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-auto">
          <h4 className="text-sm font-bold text-carbon-dark">Revisiones por requerimiento</h4>
          <p className="text-[11px] text-slate-500">“Revisar con IA” desde la evaluación, con las reglas de cada requerimiento. La IA propone; el evaluador confirma.</p>
        </div>
        <select aria-label="Estado" value={filtros.estado} onChange={filtro("estado")} className={CLASE_SELECT}>
          <option value="">Todos los estados</option>
          {Object.entries(ESTADOS).map(([v, x]) => <option key={v} value={v}>{x.label}</option>)}
        </select>
        <select aria-label="Resultado" value={filtros.resultado} onChange={filtro("resultado")} className={CLASE_SELECT}>
          <option value="">Todos los resultados</option>
          {Object.entries(RESULTADOS_PROPUESTOS).map(([v, x]) => <option key={v} value={v}>{x.label}</option>)}
        </select>
      </div>
      <ErrorBanner message={error} />
      {!lista ? <p className="py-4 text-center text-xs text-slate-400">Cargando revisiones...</p> : lista.length === 0 ? (
        <p className="py-4 text-center text-xs text-slate-400">Sin revisiones{filtros.estado || filtros.resultado ? " con estos filtros" : ""}.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-100">
          <table className="w-full min-w-[48rem] text-left text-xs">
            <thead>
              <tr className="bg-slate-50 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                <th className="px-3 py-2">Requerimiento</th>
                <th className="px-3 py-2">Persona / recurso</th>
                <th className="px-3 py-2">Archivo</th>
                <th className="px-3 py-2">Resultado propuesto</th>
                <th className="px-3 py-2">Estado</th>
                <th className="px-3 py-2 text-right">Costo</th>
                <th className="px-3 py-2">Fecha</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lista.map((r) => {
                const res = RESULTADOS_PROPUESTOS[r.resultadoPropuesto?.resultado];
                const est = ESTADOS[r.estado];
                return (
                  <tr key={r.id} onClick={() => setVista(r)} className="cursor-pointer hover:bg-slate-50">
                    <td className="px-3 py-2 font-semibold text-carbon-dark">{r.requerimientoNombre || r.requerimientoId}</td>
                    <td className="px-3 py-2 text-slate-600">{r.sujetoNombre || "—"}</td>
                    <td className="px-3 py-2 text-slate-600 max-w-[16rem] truncate" title={r.archivo?.nombre}>{r.archivo?.nombre}</td>
                    <td className="px-3 py-2">
                      {r.error ? <span className={`${CLASE_BADGE} bg-red-50 text-red-700 border-red-200`}>Error</span>
                        : res && <span className={`${CLASE_BADGE} ${res.clase}`}>{res.label}</span>}
                    </td>
                    <td className="px-3 py-2">{est && <span className={`${CLASE_BADGE} ${est.clase}`}>{est.label}</span>}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-600">{formatUsd(r.costoEstimado, 4)}</td>
                    <td className="px-3 py-2 text-slate-500 tabular-nums">{fechaDMA(r.createdAt, true)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {vista && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40" onClick={() => setVista(null)}>
          <div role="dialog" aria-modal="true" aria-label="Detalle de la revisión" onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl shadow-dropdown w-full max-w-3xl max-h-[88vh] overflow-y-auto p-5 space-y-3">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-carbon-dark truncate mr-auto">{vista.requerimientoNombre} · {vista.sujetoNombre}</h3>
              <button type="button" onClick={() => setVista(null)} className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50">Cerrar</button>
            </div>
            <p className="text-[11px] text-slate-500">
              {vista.archivo?.nombre} · {vista.createdByNombre}
              {vista.estado === "confirmada" && vista.evaluacionId ? " · Confirmada en una evaluación" : ""}
              {vista.motivoDescarte === "reemplazada" ? " · Reemplazada por una revisión más nueva" : ""}
            </p>
            <ResultadoPrueba prueba={vista} />
            {vista.observacionesPropuestas && (
              <pre className="whitespace-pre-wrap font-sans text-[11px] text-slate-700 bg-slate-50 rounded-lg p-2">{vista.observacionesPropuestas}</pre>
            )}
          </div>
        </div>
      )}
    </section>
  );
};
