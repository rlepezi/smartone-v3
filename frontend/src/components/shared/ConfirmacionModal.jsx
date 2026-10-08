import { AlertTriangle } from "lucide-react";

// Modal de confirmación de la aplicación (mismo patrón visual que la confirmación final del
// asistente de Nueva Acreditación): reemplaza a window.confirm cuando una acción necesita una
// confirmación explícita, opcionalmente con una lista (ej. asignaciones que se finalizarán).
//  - `titulo`, `mensaje`: texto principal.
//  - `items`: [{ key, principal, secundario }] opcional, se muestra como lista.
//  - `textoConfirmar` / `textoCancelar`: rótulos de los botones.
//  - `ocupado`: deshabilita los botones mientras se ejecuta la acción.
//  - `peligro`: estilo de advertencia (acción que finaliza o reemplaza algo).
export const ConfirmacionModal = ({
  titulo, mensaje, items = [], textoConfirmar = "Confirmar", textoCancelar = "Cancelar",
  onConfirmar, onCancelar, ocupado = false, peligro = false, children = null,
}) => (
  <div
    className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40"
    onClick={(e) => {
      // No propaga: suele abrirse sobre otro modal cuyo fondo también cierra.
      e.stopPropagation();
      if (!ocupado) onCancelar?.();
    }}
    role="dialog"
    aria-modal="true"
    aria-labelledby="confirmacion-modal-titulo"
  >
    <div className="bg-white rounded-2xl shadow-dropdown w-full max-w-lg p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-start gap-3">
        {peligro && (
          <span className="shrink-0 w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
            <AlertTriangle className="w-4 h-4" />
          </span>
        )}
        <div className="space-y-1">
          <h3 id="confirmacion-modal-titulo" className="text-sm font-bold text-carbon-dark">{titulo}</h3>
          {mensaje && <p className="text-xs text-slate-500">{mensaje}</p>}
        </div>
      </div>
      {items.length > 0 && (
        <ul className="max-h-64 overflow-y-auto divide-y divide-slate-100 rounded-xl border border-slate-100">
          {items.map((it) => (
            <li key={it.key} className="px-3 py-2 text-xs">
              <p className="font-semibold text-carbon-dark">{it.principal}</p>
              {it.secundario && <p className="text-[11px] text-slate-500">{it.secundario}</p>}
            </li>
          ))}
        </ul>
      )}
      {children}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancelar}
          disabled={ocupado}
          className="px-4 py-2.5 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 disabled:opacity-50"
        >
          {textoCancelar}
        </button>
        <button
          type="button"
          onClick={onConfirmar}
          disabled={ocupado}
          className={`px-5 py-2.5 text-xs font-semibold text-white rounded-xl shadow-md transition-all disabled:opacity-50 ${
            peligro ? "bg-amber-600 hover:bg-amber-700 shadow-amber-600/25" : "bg-primary hover:bg-primary-dark shadow-primary/25"
          }`}
        >
          {ocupado ? "Procesando..." : textoConfirmar}
        </button>
      </div>
    </div>
  </div>
);
