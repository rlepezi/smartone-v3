import React, { useEffect, useState } from "react";
import { X, FileWarning } from "lucide-react";
import { personaService } from "../../services/personaService";
import { evidenciaService } from "../../services/evidenciaService";
import { TarjetaPanel } from "../shared/DetalleUI";
import { ErrorBanner } from "../shared/ErrorBanner";
import { ActionButton } from "../shared/ActionButton";
import { formatFecha } from "../../utils/fechaFormatters";

// Documentos de identidad de una Persona anonimizada y su estado de purga: los pendientes con su fecha
// límite de eliminación (con la excepción manual "Cancelar eliminación programada", con motivo) y los ya
// eliminados. Solo lo ve el superadmin.
export const DocumentosIdentidadPurga = ({ personaId }) => {
  const [documentos, setDocumentos] = useState(undefined); // undefined = cargando
  const [cancelando, setCancelando] = useState(null); // documento cuya purga se cancela
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);

  const cargar = () => personaService.documentosPurga(personaId)
    .then(setDocumentos)
    .catch((err) => { setDocumentos([]); setError(err.message); });

  useEffect(() => { cargar(); }, [personaId]);

  const confirmarCancelacion = async () => {
    setEnviando(true);
    setError(null);
    try {
      await evidenciaService.cancelarPurga(cancelando.id, motivo.trim());
      setCancelando(null);
      setMotivo("");
      await cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  };

  const etiqueta = (d) => (
    d.eliminadaFisicamente ? { texto: "Eliminado", clase: "bg-slate-100 text-slate-600 border-slate-200" } :
    d.pendiente ? { texto: `Se elimina el ${formatFecha(d.fechaLimiteEliminacion)}`, clase: "bg-amber-50 text-amber-700 border-amber-200" } :
    { texto: "Conservado (eliminación cancelada)", clase: "bg-sage-lighter text-sage-darker border-sage-light" }
  );

  return (
    <TarjetaPanel titulo="Documentos de identidad">
      <ErrorBanner message={error} />
      {documentos === undefined ? (
        <p className="text-xs text-slate-400">Cargando...</p>
      ) : documentos.length === 0 ? (
        <p className="text-xs text-slate-400">No había documentos de identidad marcados para eliminación.</p>
      ) : (
        <ul className="space-y-2">
          {documentos.map((d) => {
            const e = etiqueta(d);
            return (
              <li key={d.id} className="p-2.5 rounded-lg bg-slate-50 border border-slate-100 space-y-1.5">
                <p className="text-xs font-semibold text-slate-700 break-words">{d.archivoNombre}</p>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${e.clase}`}>{e.texto}</span>
                  {d.pendiente && (
                    <button type="button" onClick={() => { setCancelando(d); setMotivo(""); setError(null); }} className="text-[11px] font-bold text-primary hover:text-primary-dark">
                      Cancelar eliminación programada
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {cancelando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={enviando ? undefined : () => setCancelando(null)}>
          <div className="bg-white rounded-2xl shadow-dropdown w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h3 className="flex items-center gap-2 text-sm font-bold text-carbon-dark uppercase tracking-wider">
                <FileWarning className="w-4 h-4 text-amber-500" /> Cancelar eliminación
              </h3>
              <button type="button" onClick={() => setCancelando(null)} disabled={enviando} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 space-y-3">
              <ErrorBanner message={error} />
              <p className="text-xs text-slate-600">
                El documento <b>{cancelando.archivoNombre}</b> dejará de estar programado para eliminarse. Se conserva con acceso restringido.
                Queda registrado en la Bitácora con el motivo.
              </p>
              <textarea
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                disabled={enviando}
                rows={3}
                maxLength={500}
                placeholder="Motivo (p. ej. razón legal para conservarlo)..."
                className="w-full px-3.5 py-2.5 bg-gray-50/50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all resize-none"
              />
              <div className="flex justify-end gap-2">
                <ActionButton disabled={enviando} onClick={() => setCancelando(null)}>Volver</ActionButton>
                <ActionButton variant="primary" busy={enviando} busyLabel="Cancelando..." disabled={!motivo.trim()} onClick={confirmarCancelacion}>
                  Cancelar eliminación
                </ActionButton>
              </div>
            </div>
          </div>
        </div>
      )}
    </TarjetaPanel>
  );
};
