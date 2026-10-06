import React from "react";
import { AlertTriangle, History } from "lucide-react";
import { formatFecha } from "../../../utils/fechaFormatters";

// Paso 4 del wizard: fechas de la nueva participación/asignación, más el
// contexto de lo que se va a cerrar (Participación/Asignación activa más
// reciente de la entidad, en cualquier Proyecto — calculado por el
// wizard padre, ver `useOrigenAcreditacion` en
// ReemplazarAcreditacionWizardPage) y una advertencia dura si la entidad
// ya tiene una Participación/Asignación activa específicamente en el
// Proyecto destino (el backend la rechaza con 409).
export const PasoParticipacionFechas = ({
  entidadSel, origen, cargandoOrigen, conflictoDestino,
  fechaInicio, onFechaInicioChange, fechaFin, onFechaFinChange,
}) => {
  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-bold text-gray-900">Fechas de la nueva Participación</h3>
        <p className="text-xs text-gray-500 mt-0.5">
          Define el período en el Proyecto destino. La acreditación actual se cerrará automáticamente.
        </p>
      </div>

      {cargandoOrigen ? (
        <p className="text-xs text-slate-400 py-4 text-center">Verificando la acreditación actual...</p>
      ) : (
        <>
          {origen && (
            <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-slate-50 border border-slate-100 text-xs">
              <History className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
              <p>
                <b>{entidadSel?.nombre}</b> tiene una acreditación activa en <b>{origen.proyectoNombre}</b>{" "}
                desde el {formatFecha(origen.fechaInicio)}
                {origen.fechaTermino ? ` hasta el ${formatFecha(origen.fechaTermino)}` : ""} — se cerrará
                automáticamente al confirmar el reemplazo.
              </p>
            </div>
          )}

          {conflictoDestino && (
            <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>
                ⚠ {entidadSel?.nombre} ya tiene una participación activa en el Proyecto destino — no se puede
                continuar hasta resolver ese conflicto.
              </span>
            </div>
          )}
        </>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-xl">
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1.5">Fecha de Inicio *</label>
          <input
            type="date"
            value={fechaInicio}
            onChange={(e) => onFechaInicioChange(e.target.value)}
            className="w-full px-3.5 py-2.5 bg-gray-50/50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1.5">Fecha de Término (opcional)</label>
          <input
            type="date"
            value={fechaFin}
            min={fechaInicio || undefined}
            onChange={(e) => onFechaFinChange(e.target.value)}
            className="w-full px-3.5 py-2.5 bg-gray-50/50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
        </div>
      </div>
    </div>
  );
};
