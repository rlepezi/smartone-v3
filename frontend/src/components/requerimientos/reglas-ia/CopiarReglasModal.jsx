import { useEffect, useState } from "react";
import { Copy, X } from "lucide-react";
import { requerimientoService } from "../../../services/requerimientoService";
import { mandanteService } from "../../../services/mandanteService";
import { ErrorBanner } from "../../shared/ErrorBanner";
import { SelectConBusqueda } from "../../shared/SelectConBusqueda";
import { estadoIAReq } from "../../../utils/reglasIA";
import { CLASE_LABEL, CLASE_PRIMARIO, CLASE_SECUNDARIO } from "../../configuracion-ia/estilos";

const CLASE_BADGE = "inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold border whitespace-nowrap";

// "Copiar reglas de otro requerimiento": de la misma entidad, del Mandante elegido (por defecto, el
// del requerimiento). Copia severidad, parámetros y activa; el backend omite las que ya están, las
// inactivas y las incompatibles, y lo informa.
export const CopiarReglasModal = ({ requerimiento, onCopiar, onCerrar }) => {
  const [mandantes, setMandantes] = useState([]);
  const [mandanteId, setMandanteId] = useState(requerimiento.mandanteId || "");
  const [lista, setLista] = useState(null);
  const [origenId, setOrigenId] = useState("");
  const [error, setError] = useState(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    let vigente = true;
    mandanteService.listar("activo").then((l) => { if (vigente) setMandantes(l || []); }).catch(() => {});
    return () => { vigente = false; };
  }, []);

  useEffect(() => {
    if (!mandanteId) return undefined;
    let vigente = true;
    requerimientoService.listar({ mandanteId, tipoEntidad: requerimiento.tipoEntidad, estado: "activo" })
      .then((l) => { if (vigente) setLista((l || []).filter((r) => r.id !== requerimiento.id)); })
      .catch((err) => { if (vigente) setError(err.message || "No se pudieron cargar los requerimientos."); });
    return () => { vigente = false; };
  }, [mandanteId, requerimiento.id, requerimiento.tipoEntidad]);

  const copiar = async () => {
    setOcupado(true);
    setError(null);
    try {
      await onCopiar(origenId);
    } catch (err) {
      setError(err.message || "No se pudieron copiar las reglas.");
      setOcupado(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40" onClick={onCerrar}>
      <div role="dialog" aria-modal="true" aria-labelledby="copiar-reglas-titulo" onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-dropdown w-full max-w-lg max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-100">
          <h3 id="copiar-reglas-titulo" className="text-sm font-bold text-carbon-dark">Copiar reglas de otro requerimiento</h3>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-3 overflow-y-auto">
          <ErrorBanner message={error} />
          <div>
            <span className={CLASE_LABEL}>Mandante</span>
            <SelectConBusqueda bloque anchoCompleto ariaLabel="Mandante" value={mandanteId}
              onChange={(v) => { setMandanteId(v); setOrigenId(""); setLista(null); }}
              options={mandantes.map((m) => ({ value: m.id, label: m.nombre }))} textoVacio="Elija un Mandante" />
          </div>
          {!mandanteId ? null : !lista ? <p className="py-4 text-center text-xs text-slate-400">Cargando...</p> : lista.length === 0 ? (
            <p className="py-4 text-center text-xs text-slate-500">No hay otros requerimientos de esta entidad.</p>
          ) : (
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100 max-h-72 overflow-y-auto">
              {lista.map((r) => {
                const e = estadoIAReq(r);
                return (
                  <li key={r.id}>
                    <label className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-slate-50">
                      <input type="radio" name="origen-reglas" checked={origenId === r.id} onChange={() => setOrigenId(r.id)} className="text-primary" />
                      <span className="flex-1 text-xs text-carbon-dark">{r.nombre}</span>
                      <span className={`${CLASE_BADGE} ${e.clase}`}>{e.label}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-100">
          <button type="button" onClick={onCerrar} className={CLASE_SECUNDARIO}>Cancelar</button>
          <button type="button" disabled={!origenId || ocupado} onClick={copiar} className={CLASE_PRIMARIO}>
            <Copy className="w-3.5 h-3.5" /> {ocupado ? "Copiando..." : "Copiar reglas"}
          </button>
        </div>
      </div>
    </div>
  );
};
