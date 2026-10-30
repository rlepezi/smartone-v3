import { useEffect, useState } from "react";
import { Plus, Search, X } from "lucide-react";
import { reglaIAService } from "../../../services/reglaIAService";
import { ErrorBanner } from "../../shared/ErrorBanner";
import { SEVERIDADES, TIPOS_REGLA, etiquetaEntidad } from "../../../utils/reglasIA";
import { CLASE_INPUT, CLASE_PRIMARIO } from "../../configuracion-ia/estilos";

const CLASE_BADGE = "inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold border whitespace-nowrap";

// Motivo por el que una regla no se puede usar en este requerimiento, o null.
const incompatibilidad = (regla, entidad, vinculadas, verificacionesUsadas) => {
  if (vinculadas.includes(regla.id)) return "Ya está en el requerimiento.";
  if (regla.tipo === "deterministica" && regla.verificacion && verificacionesUsadas.includes(regla.verificacion)) {
    return "El requerimiento ya tiene una regla con esta verificación.";
  }
  if (!(regla.entidades || []).includes(entidad)) return `No aplica a ${etiquetaEntidad(entidad)}.`;
  return null;
};

// "Agregar desde biblioteca": reglas activas, las compatibles primero (entidad del requerimiento).
// Los campos que la regla necesita se suman solos a lo que lee la IA. Se elige la severidad al agregar.
// `verificacionesUsadas`: verificaciones determinísticas que el requerimiento ya usa (no se repiten).
export const AgregarReglaModal = ({ entidad, vinculadas, verificacionesUsadas = [], onAgregar, onCerrar }) => {
  const [reglas, setReglas] = useState(null);
  const [error, setError] = useState(null);
  const [texto, setTexto] = useState("");
  const [severidad, setSeveridad] = useState({});
  const [ocupado, setOcupado] = useState(null);

  useEffect(() => {
    let vigente = true;
    reglaIAService.listar({ estado: "activa" })
      .then((l) => { if (vigente) setReglas(l || []); })
      .catch((err) => { if (vigente) setError(err.message || "No se pudo cargar la biblioteca."); });
    return () => { vigente = false; };
  }, []);

  const t = texto.trim().toLowerCase();
  const lista = (reglas || [])
    .filter((r) => !t || `${r.nombre} ${r.descripcion || ""}`.toLowerCase().includes(t))
    .map((r) => ({ ...r, motivo: incompatibilidad(r, entidad, vinculadas, verificacionesUsadas) }))
    .sort((a, b) => Number(Boolean(a.motivo)) - Number(Boolean(b.motivo)) || a.nombre.localeCompare(b.nombre, "es"));

  const agregar = async (regla) => {
    setOcupado(regla.id);
    setError(null);
    try {
      await onAgregar(regla, severidad[regla.id] || "bloqueante");
    } catch (err) {
      setError(err.message || "No se pudo agregar la regla.");
    } finally {
      setOcupado(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40" onClick={onCerrar}>
      <div role="dialog" aria-modal="true" aria-labelledby="agregar-regla-titulo" onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-dropdown w-full max-w-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-100">
          <h3 id="agregar-regla-titulo" className="text-sm font-bold text-carbon-dark">Agregar desde biblioteca</h3>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-3 overflow-y-auto">
          <ErrorBanner message={error} />
          <label className="relative block">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input type="search" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Buscar regla" aria-label="Buscar regla" className={`${CLASE_INPUT} pl-8`} />
          </label>
          {!reglas ? <p className="py-6 text-center text-xs text-slate-400">Cargando biblioteca...</p> : lista.length === 0 ? (
            <p className="py-6 text-center text-xs text-slate-500">No hay reglas activas que coincidan.</p>
          ) : (
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100">
              {lista.map((r) => (
                <li key={r.id} className={`flex flex-wrap items-center gap-2 px-3 py-2.5 ${r.motivo ? "opacity-60" : ""}`}>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-carbon-dark">
                      {r.nombre} <span className={`${CLASE_BADGE} ${TIPOS_REGLA[r.tipo]?.clase || ""} ml-1`}>{TIPOS_REGLA[r.tipo]?.label}</span>
                    </p>
                    {r.descripcion && <p className="text-[11px] text-slate-500 line-clamp-1">{r.descripcion}</p>}
                    {r.motivo && <p className="text-[11px] text-amber-700">{r.motivo}</p>}
                  </div>
                  {!r.motivo && (
                    <>
                      <select aria-label={`Severidad de ${r.nombre}`} value={severidad[r.id] || "bloqueante"}
                        onChange={(e) => setSeveridad((s) => ({ ...s, [r.id]: e.target.value }))} className={`${CLASE_INPUT} w-auto`}>
                        {Object.entries(SEVERIDADES).map(([v, x]) => <option key={v} value={v}>{x.label}</option>)}
                      </select>
                      <button type="button" disabled={Boolean(ocupado)} onClick={() => agregar(r)} className={CLASE_PRIMARIO}>
                        <Plus className="w-3.5 h-3.5" /> {ocupado === r.id ? "Agregando..." : "Agregar"}
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};
