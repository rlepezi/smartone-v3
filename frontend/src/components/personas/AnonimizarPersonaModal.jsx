import React, { useEffect, useState } from "react";
import { X, ShieldOff, AlertTriangle } from "lucide-react";
import { personaService } from "../../services/personaService";
import { ErrorBanner } from "../shared/ErrorBanner";
import { ActionButton } from "../shared/ActionButton";

const FRASE_CONFIRMACION = "ANONIMIZAR";

// Derecho de cancelación (Ley 21.719): anonimiza los datos personales de una Persona. Acción excepcional
// y sin "deshacer": exige un motivo y escribir ANONIMIZAR (misma fricción que la restauración de respaldos).
export const AnonimizarPersonaModal = ({ personaId, onCerrar, onAnonimizada }) => {
  const [motivo, setMotivo] = useState("");
  const [frase, setFrase] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);

  // Impacto sobre los documentos de identidad (cuántos y en cuántos días se eliminarían).
  const [impacto, setImpacto] = useState(undefined);
  useEffect(() => {
    personaService.impactoAnonimizacion(personaId).then(setImpacto).catch(() => setImpacto(null));
  }, [personaId]);

  const puedeConfirmar = motivo.trim().length > 0 && frase === FRASE_CONFIRMACION;

  const confirmar = async () => {
    setEnviando(true);
    setError(null);
    try {
      await personaService.anonimizar(personaId, motivo.trim());
      await onAnonimizada();
    } catch (err) {
      setError(err.message || "No se pudo anonimizar a la Persona.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={enviando ? undefined : onCerrar}>
      <div className="bg-white rounded-2xl shadow-dropdown w-full max-w-lg max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h3 className="flex items-center gap-2 text-sm font-bold text-carbon-dark uppercase tracking-wider">
            <ShieldOff className="w-4 h-4 text-red-500" /> Anonimizar datos personales
          </h3>
          <button type="button" onClick={onCerrar} disabled={enviando} className="text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <ErrorBanner message={error} />
          <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-100 text-red-700 text-xs">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>
              El nombre, el RUT y los datos de contacto de esta Persona se reemplazarán <b>de forma permanente</b>. Esta acción no se puede
              deshacer desde la aplicación: el dato original no se guarda en ningún lado.
            </span>
          </div>
          <p className="text-xs text-slate-600">
            Su historial (relaciones laborales, asignaciones, evaluaciones y expedientes) se conserva tal cual, sin la identidad real, para no
            afectar la trazabilidad de Empresas y Proyectos. Los documentos de identidad se eliminan tras el periodo de gracia; los demás documentos adjuntos no se modifican.
          </p>

          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs">
            {impacto === undefined ? "Calculando documentos de identidad afectados..." :
              impacto === null ? "No se pudo calcular cuántos documentos de identidad quedarán afectados." :
              impacto.documentos === 0 ? "No hay documentos de identidad marcados para eliminación (ningún Requerimiento de esta Persona está clasificado como documento de identidad)." :
              <>
                <b>{impacto.documentos}</b> {impacto.documentos === 1 ? "documento de identidad quedará marcado" : "documentos de identidad quedarán marcados"} para
                eliminación: su acceso se restringe de inmediato y el archivo se elimina físicamente en <b>{impacto.diasGracia} días</b>. Hasta entonces
                un superadmin puede cancelar la eliminación con un motivo.
              </>}
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">Motivo *</label>
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              disabled={enviando}
              rows={3}
              maxLength={500}
              placeholder="Ej: Solicitud de cancelación del titular, orden de la Agencia..."
              className="w-full px-3.5 py-2.5 bg-gray-50/50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all resize-none"
            />
            <p className="text-[11px] text-slate-400 mt-1">Queda registrado en la Bitácora junto con esta acción.</p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">
              Para continuar, escribe <span className="font-mono font-black">{FRASE_CONFIRMACION}</span>
            </label>
            <input
              type="text"
              value={frase}
              onChange={(e) => setFrase(e.target.value)}
              disabled={enviando}
              autoComplete="off"
              className="w-full px-3.5 py-2.5 bg-gray-50/50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <ActionButton disabled={enviando} onClick={onCerrar}>Cancelar</ActionButton>
            <ActionButton variant="primary" busy={enviando} busyLabel="Anonimizando..." disabled={!puedeConfirmar} onClick={confirmar}>
              Anonimizar definitivamente
            </ActionButton>
          </div>
        </div>
      </div>
    </div>
  );
};
