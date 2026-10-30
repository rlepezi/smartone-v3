import { useEffect } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, X } from "lucide-react";

const DURACION_MS = 5000;

// Aviso breve abajo a la derecha que se cierra solo. `mensaje` null no muestra nada; `onCerrar`
// lo limpia (al expirar o con la ×).
export const Toast = ({ mensaje, onCerrar }) => {
  useEffect(() => {
    if (!mensaje) return undefined;
    const temporizador = setTimeout(onCerrar, DURACION_MS);
    return () => clearTimeout(temporizador);
  }, [mensaje, onCerrar]);

  if (!mensaje) return null;
  return createPortal(
    <div role="status" className="fixed bottom-4 right-4 z-[80] max-w-sm flex items-start gap-2 p-3 rounded-xl bg-sage-lighter border border-sage-light text-sage-darker text-xs font-semibold shadow-lg">
      <CheckCircle2 className="w-4 h-4 shrink-0" />
      <span className="mr-2">{mensaje}</span>
      <button type="button" onClick={onCerrar} aria-label="Cerrar aviso" className="ml-auto text-sage-darker/70 hover:text-sage-darker"><X className="w-3.5 h-3.5" /></button>
    </div>,
    document.body,
  );
};
