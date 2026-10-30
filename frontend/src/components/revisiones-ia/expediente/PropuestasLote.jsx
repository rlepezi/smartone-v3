import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { CheckCheck, CheckCircle2, Loader2, XCircle } from "lucide-react";
import { revisionRequerimientoIAService } from "../../../services/revisionRequerimientoIAService";
import { RESULTADOS_PROPUESTOS } from "../../../utils/reglasIA";
import { resumenPropuestas } from "../../../utils/loteRevision";
import { ErrorBanner } from "../../shared/ErrorBanner";

const CLASE_BOTON = "inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-colors disabled:opacity-50";
const PRIMARIO = `${CLASE_BOTON} bg-primary text-white hover:bg-primary-dark`;
const SECUNDARIO = `${CLASE_BOTON} border border-slate-200 bg-white text-carbon-dark hover:bg-slate-50`;
const CLASE_BADGE = "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap";
const EVALUACION = { cumple: "SI", no_cumple: "NO" };
// Mismos motivos que el backend (functions/src/reglasIA/lote.js).
const MOTIVOS = {
  no_encontrada: "No es de este expediente",
  ya_resuelta: "Ya estaba confirmada o descartada",
  requisito_inactivo: "El requisito ya no está activo",
  revision_manual: "Requiere revisión manual",
  sin_fecha_vencimiento: "Falta la fecha de vencimiento obligatoria",
  evaluado_despues: "Se evaluó después de la propuesta",
};

// Propuestas pendientes del expediente (de la revisión en lote o de "Revisar con IA"): se confirman
// en bloque —con un resumen previo por resultado propuesto— o se descartan. Confirmar guarda cada
// una como evaluación (igual que "Aplicar propuesta" + "Guardar Evaluación"); las de revisión
// manual quedan para el evaluador.
export const PropuestasLote = ({ expedienteId, version = 0, puedeConfirmar, onConfirmado }) => {
  const [lista, setLista] = useState(null);
  const [recarga, setRecarga] = useState(0);
  const [seleccion, setSeleccion] = useState(new Set());
  const [confirmando, setConfirmando] = useState(false);
  const [aplicando, setAplicando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let vigente = true;
    revisionRequerimientoIAService.listar(expedienteId, { estado: "propuesta" })
      .then((l) => {
        if (!vigente) return;
        setLista(l || []);
        setSeleccion(new Set((l || []).filter((r) => r.propuestaEvaluacion?.resultado).map((r) => r.id)));
        setError(null);
      })
      .catch((err) => { if (vigente) setError(err.message || "No se pudieron cargar las propuestas."); });
    return () => { vigente = false; };
  }, [expedienteId, version, recarga]);

  const elegidas = (lista || []).filter((r) => seleccion.has(r.id));
  const resumen = resumenPropuestas(elegidas);
  const alternar = (id) => setSeleccion((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const aplicar = async () => {
    setAplicando(true);
    setError(null);
    try {
      const r = await revisionRequerimientoIAService.confirmarLote(expedienteId, elegidas.map((x) => x.id));
      setResultado(r);
      setConfirmando(false);
      setRecarga((n) => n + 1);
      if (r.aplicadas.length) onConfirmado?.();
    } catch (err) {
      setError(err.message || "No se pudo confirmar.");
    } finally {
      setAplicando(false);
    }
  };
  const descartar = async (id) => {
    setError(null);
    try {
      await revisionRequerimientoIAService.descartar(id);
      setRecarga((n) => n + 1);
    } catch (err) {
      setError(err.message || "No se pudo descartar.");
    }
  };

  const nombreDe = (id) => (lista || []).find((r) => r.id === id);
  return (
    <div className="space-y-3">
      <ErrorBanner message={error} />
      {resultado && (
        <div className="p-3 rounded-xl border border-slate-200 bg-white text-xs space-y-1">
          <p className="flex items-center gap-1 font-bold text-sage-darker"><CheckCircle2 className="w-3.5 h-3.5" /> {resultado.aplicadas.length} {resultado.aplicadas.length === 1 ? "evaluación guardada" : "evaluaciones guardadas"}.</p>
          {resultado.omitidas.map((o) => (
            <p key={o.revisionId} className="text-[11px] text-slate-600">Sin guardar: {nombreDe(o.revisionId)?.requerimientoNombre || o.revisionId} — {MOTIVOS[o.motivo] || o.motivo}.</p>
          ))}
          {resultado.errores.map((e) => (
            <p key={e.revisionId} className="flex items-start gap-1 text-[11px] text-red-700"><XCircle className="w-3 h-3 mt-0.5" /> {e.mensaje}</p>
          ))}
        </div>
      )}
      {!lista ? <p className="text-xs text-slate-400">Cargando propuestas...</p> : lista.length === 0 ? (
        <p className="text-xs text-slate-400">No hay propuestas pendientes.</p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-slate-100">
            <table className="w-full min-w-[40rem] text-left text-xs">
              <thead>
                <tr className="bg-slate-50 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  <th className="px-3 py-2 w-8"><span className="sr-only">Incluir</span></th>
                  <th className="px-3 py-2">Requisito</th>
                  <th className="px-3 py-2">Persona / maquinaria</th>
                  <th className="px-3 py-2">Archivo</th>
                  <th className="px-3 py-2">Propuesta</th>
                  <th className="px-3 py-2"><span className="sr-only">Acciones</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lista.map((r) => {
                  const res = RESULTADOS_PROPUESTOS[r.resultadoPropuesto?.resultado];
                  const ev = EVALUACION[r.propuestaEvaluacion?.resultado];
                  return (
                    <tr key={r.id}>
                      <td className="px-3 py-2"><input type="checkbox" disabled={!puedeConfirmar} checked={seleccion.has(r.id)} onChange={() => alternar(r.id)} aria-label={`Incluir ${r.requerimientoNombre}`} className="rounded text-primary" /></td>
                      <td className="px-3 py-2 font-semibold text-carbon-dark">{r.requerimientoNombre}</td>
                      <td className="px-3 py-2 text-slate-600">{r.sujetoNombre || "—"}</td>
                      <td className="px-3 py-2 text-slate-600 max-w-[14rem] truncate" title={r.archivo?.nombre}>{r.archivo?.nombre}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {res && <span className={`${CLASE_BADGE} ${res.clase}`}>{res.label}</span>}
                        {ev && <span className="ml-1 text-[10px] font-bold text-slate-500">→ {ev}</span>}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {puedeConfirmar && <button type="button" onClick={() => descartar(r.id)} className="text-[11px] font-bold text-slate-500 hover:underline">Descartar</button>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {puedeConfirmar && (
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" disabled={!elegidas.length} onClick={() => setConfirmando(true)} className={PRIMARIO}>
                <CheckCheck className="w-3.5 h-3.5" /> Confirmar en bloque ({elegidas.length})
              </button>
              <span className="text-[11px] text-slate-400">Se muestra un resumen antes de guardar.</span>
            </div>
          )}
        </>
      )}

      {confirmando && createPortal(
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40" onClick={() => !aplicando && setConfirmando(false)}>
          <div role="dialog" aria-modal="true" aria-label="Confirmar en bloque" onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl shadow-dropdown w-full max-w-md p-5 space-y-3">
            <h3 className="text-sm font-bold text-carbon-dark">Confirmar {resumen.total} {resumen.total === 1 ? "propuesta" : "propuestas"}</h3>
            <ul className="text-xs text-slate-700 space-y-1">
              {Object.entries(resumen.porResultado).filter(([, n]) => n > 0).map(([k, n]) => (
                <li key={k} className="flex items-center gap-2">
                  <span className={`${CLASE_BADGE} ${RESULTADOS_PROPUESTOS[k]?.clase || ""}`}>{RESULTADOS_PROPUESTOS[k]?.label || k}</span>
                  <b>{n}</b>
                  <span className="text-slate-500">{k === "revision_manual" ? "quedan para revisión manual" : `se guardan como ${k === "no_cumple" ? "NO" : "SI"}`}</span>
                </li>
              ))}
            </ul>
            <p className="text-[11px] text-slate-500">
              Se guardarán <b>{resumen.aplicables}</b> {resumen.aplicables === 1 ? "evaluación" : "evaluaciones"} con la observación de la IA.
              {resumen.manuales > 0 && ` ${resumen.manuales} no se guardan: la IA no propone resultado.`} Si a una que cumple le falta la fecha de vencimiento obligatoria, queda pendiente para completarla en la planilla.
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" disabled={aplicando} onClick={() => setConfirmando(false)} className={SECUNDARIO}>Cancelar</button>
              <button type="button" disabled={aplicando || !resumen.aplicables} onClick={aplicar} className={PRIMARIO}>
                {aplicando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCheck className="w-3.5 h-3.5" />} Guardar {resumen.aplicables}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
};
