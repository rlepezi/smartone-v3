import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, AlertTriangle, CheckCircle2 } from "lucide-react";
import { perfilRequerimientoService } from "../../services/perfilRequerimientoService";
import { requerimientoService } from "../../services/requerimientoService";
import { ErrorBanner } from "../shared/ErrorBanner";

// Tras crear un Perfil de Recurso (persona o maquinaria) desde un Expediente: pregunta qué
// Requerimientos de ese nivel, ya vinculados al Perfil de Participación del Expediente, deben
// aplicar también al perfil nuevo. Sin esto el sujeto queda sin requisitos.
// Marcar uno agrega el perfil a su "Aplica a" (requerimientoService.actualizar con su
// aplicabilidad, la misma edición que usa "Configurar Requerimientos"): el backend lo propaga a los
// Expedientes no cerrados. Los que aplican a "Todos" ya lo incluyen y se muestran marcados y fijos.
//  - `perfilParticipacionId`: el del Expediente.  `perfil`: { id, nombre, tipo: "persona"|"recurso" }.
//  - `onCerrar({ agregados })`: al terminar u omitir (agregados = cuántos se agregaron).
export const RequerimientosNuevoPerfilModal = ({ perfilParticipacionId, perfil, onCerrar }) => {
  const [requerimientos, setRequerimientos] = useState(null);
  const [marcados, setMarcados] = useState([]);
  const [error, setError] = useState(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    let vigente = true;
    perfilRequerimientoService.obtenerMatriz(perfilParticipacionId)
      .then((matriz) => {
        if (!vigente) return;
        setRequerimientos((matriz || [])
          .filter((r) => r.vinculado && r.tipoEntidad === perfil.tipo && r.estado !== "inactivo")
          .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0)));
      })
      .catch((err) => { if (vigente) { setRequerimientos([]); setError(err.message || "No se pudieron cargar los requerimientos."); } });
    return () => { vigente = false; };
  }, [perfilParticipacionId, perfil.tipo]);

  const yaIncluido = (r) => r.perfilRecursoIds === null || r.perfilRecursoIds === undefined
    || r.perfilRecursoIds.includes(perfil.id);
  const elegibles = (requerimientos || []).filter((r) => !yaIncluido(r));
  const alternar = (id) => setMarcados((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const todosMarcados = elegibles.length > 0 && elegibles.every((r) => marcados.includes(r.id));

  // Uno por uno: cada edición propaga a los Expedientes abiertos; en paralelo competirían.
  const agregar = async () => {
    setGuardando(true);
    setError(null);
    let agregados = 0;
    try {
      for (const r of elegibles.filter((x) => marcados.includes(x.id))) {
        await requerimientoService.actualizar(r.id, {
          aplicabilidad: {
            perfilParticipacionIds: r.perfilParticipacionIds || [perfilParticipacionId],
            perfilRecursoIds: [...(r.perfilRecursoIds || []), perfil.id],
          },
        });
        agregados += 1;
      }
      onCerrar({ agregados });
    } catch (err) {
      setError(`${agregados ? `Se agregaron ${agregados}; ` : ""}no se pudo agregar el resto: ${err.message || "error desconocido"}.`);
      setGuardando(false);
    }
  };

  const etiquetaNivel = perfil.tipo === "persona" ? "personas" : "maquinarias";

  return createPortal(
    // Los eventos de un portal suben por el árbol de React: sin cortarlos, un clic acá llegaría al
    // fondo del modal de ingreso que lo abrió y lo cerraría.
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/40"
      onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
      <div role="dialog" aria-modal="true" aria-label={`Requerimientos para el perfil ${perfil.nombre}`}
        className="bg-white rounded-2xl shadow-dropdown w-full max-w-lg max-h-[85vh] flex flex-col">
        <div className="flex items-start justify-between gap-3 p-5 border-b border-slate-100">
          <div>
            <h3 className="text-sm font-bold text-carbon-dark uppercase tracking-wider">Requerimientos del perfil nuevo</h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Elija qué requerimientos debe cumplir <strong>{perfil.nombre}</strong>. Se aplican a todos los expedientes
              abiertos de este perfil de participación.
            </p>
          </div>
          <button type="button" onClick={() => onCerrar({ agregados: 0 })} disabled={guardando} aria-label="Cerrar"
            className="text-slate-400 hover:text-slate-600 disabled:opacity-50">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          <ErrorBanner message={error} />
          {requerimientos === null ? (
            <p className="text-xs text-slate-400 py-6 text-center">Cargando requerimientos...</p>
          ) : requerimientos.length === 0 ? (
            <p className="text-xs text-slate-500 py-6 text-center">
              Este perfil de participación no tiene requerimientos de {etiquetaNivel}. Agréguelos con «Configurar requisitos».
            </p>
          ) : (
            <>
              {elegibles.length > 1 && (
                <button type="button" disabled={guardando}
                  onClick={() => setMarcados(todosMarcados ? [] : elegibles.map((r) => r.id))}
                  className="text-[11px] font-bold text-primary hover:text-primary-dark">
                  {todosMarcados ? "Quitar todos" : "Marcar todos"}
                </button>
              )}
              <ul className="space-y-1.5">
                {requerimientos.map((r) => {
                  const incluido = yaIncluido(r);
                  const marcado = incluido || marcados.includes(r.id);
                  return (
                    <li key={r.id}>
                      <label className={`flex items-start gap-3 px-3 py-2.5 rounded-xl border transition-colors ${
                        incluido ? "border-slate-100 bg-slate-50 cursor-default"
                          : marcado ? "border-primary bg-primary-lighter cursor-pointer" : "border-slate-100 hover:bg-slate-50 cursor-pointer"
                      }`}>
                        <input type="checkbox" checked={marcado} disabled={incluido || guardando}
                          onChange={() => alternar(r.id)} className="mt-0.5 w-4 h-4 accent-primary" />
                        <span className="min-w-0">
                          <span className="block text-xs font-bold text-carbon-dark">{r.nombreCorto || r.nombre}</span>
                          <span className="block text-[11px] text-slate-400">
                            {r.perfilRecursoIds === null || r.perfilRecursoIds === undefined
                              ? "Aplica a todos: ya incluido" : incluido ? "Ya incluido" : "Se agregará a este perfil"}
                          </span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>

        <div className="p-5 border-t border-slate-100 space-y-3">
          {requerimientos && elegibles.length > 0 && marcados.length === 0 && !requerimientos.some(yaIncluido) && (
            <p className="flex items-start gap-1.5 text-[11px] text-amber-700">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              Si no elige ninguno, las {etiquetaNivel} con este perfil quedarán sin requisitos hasta configurarlos.
            </p>
          )}
          {requerimientos && requerimientos.some(yaIncluido) && marcados.length === 0 && (
            <p className="flex items-start gap-1.5 text-[11px] text-sage-darker">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              Los requerimientos que aplican a todos ya quedan incluidos.
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => onCerrar({ agregados: 0 })} disabled={guardando}
              className="px-4 py-2 text-xs font-semibold text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 rounded-xl disabled:opacity-50">
              {elegibles.length ? "Omitir por ahora" : "Cerrar"}
            </button>
            {elegibles.length > 0 && (
              <button type="button" onClick={agregar} disabled={guardando || marcados.length === 0}
                className="px-5 py-2 text-xs font-semibold text-white bg-primary hover:bg-primary-dark rounded-xl shadow-md shadow-primary/25 disabled:opacity-50">
                {guardando ? "Agregando..." : `Agregar ${marcados.length || ""} ${marcados.length === 1 ? "requerimiento" : "requerimientos"}`.replace("  ", " ")}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};
