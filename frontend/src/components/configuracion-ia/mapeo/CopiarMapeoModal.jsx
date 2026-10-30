import { useEffect, useRef, useState } from "react";
import { ArrowRight, Loader2, X } from "lucide-react";
import { listarDirectorio } from "../../../services/fuentes/carpetaLocal";
import { cambiosDeCopia, proponerCopia } from "../../../utils/copiaMapeo";
import { CLASE_PRIMARIO, CLASE_SECUNDARIO } from "../estilos";

const ETIQUETA = "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap";
const RESULTADOS = {
  exacta: { label: "Exacta", clase: "bg-sage-lighter text-sage-darker border-sage-light" },
  parecida: { label: "Parecida", clase: "bg-amber-50 text-amber-700 border-amber-200" },
  no_encontrada: { label: "Sin equivalente en esta carpeta", clase: "bg-slate-100 text-slate-500 border-slate-200" },
  no_aplica: { label: "No aplica", clase: "bg-slate-100 text-slate-500 border-slate-200" },
  conflicto: { label: "Ya asignado", clase: "bg-red-50 text-red-700 border-red-200" },
};
const ESTADOS = { parcial: "parcial", completo: "completo" };

// Propuesta para copiar el mapeo de una carpeta parecida (`similares`: [{ carpeta, similitud }]) a
// `destino`. Para cada ubicación del origen busca en el destino la misma ruta normalizada (solo lee
// las carpetas por las que pasa). Exactas preseleccionadas; parecidas para revisar; nunca sobrescribe
// lo que el destino ya tiene. onConfirmar(cambios): PATCH con soloAgregar (una sola operación).
export const CopiarMapeoModal = ({ similares, inicial, destino, raiz, asignables, nombreDe, onConfirmar, onCerrar }) => {
  const [origenId, setOrigenId] = useState(inicial || similares[0]?.carpeta.id || null);
  const [filas, setFilas] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);
  const cache = useRef(new Map());
  const origen = similares.find((s) => s.carpeta.id === origenId)?.carpeta || null;

  useEffect(() => {
    if (!origen) return undefined;
    let vigente = true;
    const listar = async (ruta) => {
      if (!cache.current.has(ruta)) cache.current.set(ruta, await listarDirectorio(raiz, ruta).catch(() => null));
      return cache.current.get(ruta);
    };
    proponerCopia({ origen, destino, asignables, listar, nombreDe })
      .then((f) => { if (vigente) { setFilas(f); setError(null); } })
      .catch(() => { if (vigente) setError("No se pudo leer la carpeta destino."); });
    return () => { vigente = false; };
    // Se recalcula al cambiar de carpeta de origen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origenId]);

  const actuales = filas && origen ? filas : null;
  const seleccionadas = (actuales || []).filter((f) => f.seleccionada);
  const alternar = (clave) => setFilas((l) => l.map((f) => (f.clave === clave ? { ...f, seleccionada: !f.seleccionada } : f)));
  const confirmar = async () => {
    setGuardando(true);
    setError(null);
    try {
      if (await onConfirmar(cambiosDeCopia(actuales, destino))) onCerrar();
    } catch (err) {
      setError(err.message || "No se pudo copiar el mapeo.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40" onClick={() => !guardando && onCerrar()}>
      <div role="dialog" aria-modal="true" aria-labelledby="copiar-mapeo-titulo" onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-dropdown w-full max-w-4xl max-h-[90vh] flex flex-col">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-100">
          <h3 id="copiar-mapeo-titulo" className="text-sm font-bold text-carbon-dark mr-auto">Copiar mapeo a «{destino.ruta}»</h3>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-50"><X className="w-4 h-4" /></button>
        </div>
        <div className="px-5 py-3 space-y-3 overflow-y-auto">
          <label className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-bold text-carbon-dark">Copiar desde:</span>
            <select value={origenId || ""} onChange={(e) => { setOrigenId(e.target.value); setFilas(null); }} className="px-2 py-1 rounded-lg border border-slate-200 text-xs">
              {similares.map((s) => (
                <option key={s.carpeta.id} value={s.carpeta.id}>{s.carpeta.ruta} · {Math.round(s.similitud * 100)}% · mapeo {ESTADOS[s.carpeta.estadoMapeo] || s.carpeta.estadoMapeo}</option>
              ))}
            </select>
          </label>
          <p className="text-[11px] text-slate-500">Las exactas vienen marcadas; revise las parecidas. Lo que esta carpeta ya tiene asignado no se toca.</p>
          {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
          {!actuales ? (
            <p className="flex items-center gap-1.5 text-xs text-slate-400"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Armando la propuesta...</p>
          ) : !actuales.length ? (
            <p className="text-xs text-slate-400">La carpeta de origen no tiene ubicaciones para copiar.</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wider text-slate-400 border-b border-slate-100">
                  <th className="py-2 pr-2 w-8" />
                  <th className="py-2 pr-2 font-bold">Requerimiento</th>
                  <th className="py-2 pr-2 font-bold">Ruta origen → ruta destino</th>
                  <th className="py-2 font-bold">Resultado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {actuales.map((f) => {
                  const elegible = ["exacta", "parecida"].includes(f.resultado) && f.destinoRuta;
                  const r = RESULTADOS[f.resultado];
                  return (
                    <tr key={f.clave} className={elegible ? "" : "text-slate-400"}>
                      <td className="py-1.5 pr-2">
                        {elegible && <input type="checkbox" checked={f.seleccionada} onChange={() => alternar(f.clave)} aria-label={`Copiar ${f.origenRuta}`} className="rounded text-primary" />}
                      </td>
                      <td className="py-1.5 pr-2 font-semibold">{f.campo ? f.etiqueta : nombreDe(f.requerimientoId)}</td>
                      <td className="py-1.5 pr-2">
                        <span className="break-all">{f.origenRuta}</span>
                        <ArrowRight className="inline w-3 h-3 mx-1 text-slate-400" />
                        <span className="break-all">{f.destinoRuta || "—"}</span>
                      </td>
                      <td className="py-1.5">
                        <span className={`${ETIQUETA} ${r.clase}`}>{r.label}</span>
                        {f.conflicto && <span className="block mt-0.5 text-[10px] text-red-600">{f.conflicto}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-slate-100">
          <button type="button" onClick={onCerrar} disabled={guardando} className={CLASE_SECUNDARIO}>Cancelar</button>
          <button type="button" onClick={confirmar} disabled={guardando || !seleccionadas.length} className={CLASE_PRIMARIO}>
            {guardando ? "Guardando..." : `Confirmar seleccionadas (${seleccionadas.length})`}
          </button>
        </div>
      </div>
    </div>
  );
};
