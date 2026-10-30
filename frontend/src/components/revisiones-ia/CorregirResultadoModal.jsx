import { useState } from "react";
import { ETIQUETA_TIPO_DOCUMENTAL } from "../../utils/revisionIA";
import { DateInput } from "../ui/DateInput";

// Fecha de vencimiento leída por la IA (aaaa-mm-dd), si la hay.
const fechaLeida = (resultado) => {
  const d = resultado.datosConsolidados || {};
  const valor = d.cedula?.fechaVencimiento || d.licencia?.fechaProximoControl || "";
  return /^d{4}-d{2}-d{2}/.test(valor) ? valor.slice(0, 10) : "";
};

const OPCIONES = [
  { value: "cumple", label: "Cumple" },
  { value: "no_cumple", label: "No cumple" },
];

// Corregir la propuesta de la IA: resultado final y observación (obligatoria).
export const CorregirResultadoModal = ({ resultado, ocupado, onConfirmar, onCancelar }) => {
  const [resultadoFinal, setResultadoFinal] = useState(resultado.propuesta === "no_cumple" ? "no_cumple" : "cumple");
  const [observacion, setObservacion] = useState("");
  const [fechaVencimiento, setFechaVencimiento] = useState(() => fechaLeida(resultado));
  const [intento, setIntento] = useState(false);
  const falta = !observacion.trim();

  const confirmar = (e) => {
    e.preventDefault();
    setIntento(true);
    if (!falta) {
      onConfirmar({
        resultadoFinal, observacion: observacion.trim(),
        fechaVencimiento: resultadoFinal === "cumple" ? fechaVencimiento || undefined : undefined,
      });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => !ocupado && onCancelar()}>
      <form
        role="dialog" aria-modal="true" aria-labelledby="corregir-titulo"
        onSubmit={confirmar} onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-dropdown w-full max-w-md p-6 space-y-4"
      >
        <div>
          <h3 id="corregir-titulo" className="text-sm font-bold text-carbon-dark">Corregir resultado</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            {ETIQUETA_TIPO_DOCUMENTAL[resultado.tipoDocumentalCodigo]} · {resultado.entidadCarpeta || resultado.carpetaRelativa}
          </p>
        </div>
        <fieldset>
          <legend className="block text-xs font-semibold text-gray-700 mb-1.5">Resultado final</legend>
          <div className="flex gap-4">
            {OPCIONES.map((o) => (
              <label key={o.value} className="flex items-center gap-2 text-xs cursor-pointer">
                <input type="radio" name="resultadoFinal" value={o.value} checked={resultadoFinal === o.value} onChange={() => setResultadoFinal(o.value)} className="text-primary focus:ring-primary/30" />
                {o.label}
              </label>
            ))}
          </div>
        </fieldset>
        {resultadoFinal === "cumple" && (
          <div>
            <label htmlFor="corregir-vencimiento" className="block text-xs font-semibold text-gray-700 mb-1.5">Fecha de vencimiento del documento</label>
            <DateInput
              id="corregir-vencimiento" value={fechaVencimiento} onChange={(e) => setFechaVencimiento(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-gray-50/50 border border-gray-200 rounded-xl text-sm"
            />
            <p className="text-[11px] text-slate-400 mt-1">
              {fechaLeida(resultado) ? "Leída por la IA; corríjala si no coincide con el documento." : "La IA no la leyó: si el requisito exige vencimiento, indíquela."}
            </p>
          </div>
        )}
        <div>
          <label htmlFor="corregir-observacion" className="block text-xs font-semibold text-gray-700 mb-1.5">Observación *</label>
          <textarea
            id="corregir-observacion" rows={3} autoFocus value={observacion} onChange={(e) => setObservacion(e.target.value)} maxLength={1000}
            className={`w-full px-3.5 py-2.5 bg-gray-50/50 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none ${intento && falta ? "border-red-400 bg-red-50/30" : "border-gray-200"}`}
          />
          {intento && falta && <p className="text-xs text-red-500 mt-1">La observación es obligatoria.</p>}
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancelar} disabled={ocupado} className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50">Cancelar</button>
          <button type="submit" disabled={ocupado} className="px-4 py-2 rounded-xl bg-primary hover:bg-primary-dark text-white text-xs font-bold disabled:opacity-50">
            {ocupado ? "Guardando..." : "Corregir y evaluar"}
          </button>
        </div>
      </form>
    </div>
  );
};
