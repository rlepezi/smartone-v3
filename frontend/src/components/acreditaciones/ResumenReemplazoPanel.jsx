import React from "react";
import { Info, ArrowRight } from "lucide-react";
import { StatusBadge, MAPA_ESTADO_PARTICIPACION } from "../shared/StatusBadge";
import { formatFecha } from "../../utils/fechaFormatters";
import { formatCatalogo } from "../../utils/formatCatalogo";
import { nombresPerfiles } from "../../services/participacionSujetoService";
import { usePerfilesRecurso } from "../../hooks/usePerfilesRecurso";

const ETIQUETA_TIPO = { persona: "Persona", maquinaria: "Maquinaria", empresa: "Empresa" };

// Panel lateral derecho, visible en los 6 pasos del wizard de Reemplazar
// Acreditación — se recalcula en cada paso a partir del estado del
// wizard (ver ReemplazarAcreditacionWizardPage). Replica el mockup: la
// acreditación actual (izquierda del reemplazo), un aviso informativo, y
// la nueva acreditación (destino), más la nota de reutilización.
export const ResumenReemplazoPanel = ({
  entidadTipo, entidadSel, empresaNombre,
  origen, cargandoOrigen,
  proyectoSel, perfilSel, perfilExistenteNombre, perfilRecursoIds = [],
  fechaInicio, fechaFin,
}) => {
  const perfilesPorId = usePerfilesRecurso();
  if (!entidadSel) {
    return (
      <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-card">
        <p className="text-xs text-slate-400 text-center py-6">
          Selecciona una entidad para ver el resumen de su acreditación.
        </p>
      </div>
    );
  }

  const perfilNuevoNombre = perfilSel?.nombre || perfilExistenteNombre || null;

  return (
    <div className="space-y-4">
      <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-card space-y-3">
        <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider">
          Resumen de la acreditación actual
        </h3>
        <div className="space-y-1.5 text-xs">
          <p className="font-bold text-carbon-dark">{entidadSel.nombre}</p>
          {entidadSel.rut && <p className="text-slate-400 font-mono">{entidadSel.rut}</p>}
        </div>
        {cargandoOrigen ? (
          <p className="text-[11px] text-slate-400">Cargando...</p>
        ) : origen ? (
          <div className="space-y-1.5 text-[11px] text-slate-600 pt-2 border-t border-slate-100">
            <p><span className="font-semibold text-slate-400">Proyecto actual:</span> {origen.proyectoNombre}</p>
            {empresaNombre && entidadTipo !== "empresa" && (
              <p><span className="font-semibold text-slate-400">Empresa:</span> {empresaNombre}</p>
            )}
            {entidadSel.cargo && (
              <p><span className="font-semibold text-slate-400">Cargo:</span> {formatCatalogo(entidadSel.cargo)}</p>
            )}
            <p>
              <span className="font-semibold text-slate-400">Vigencia:</span>{" "}
              {formatFecha(origen.fechaInicio)}
              {origen.fechaTermino ? ` – ${formatFecha(origen.fechaTermino)}` : " – sin término"}
            </p>
            <div className="pt-1">
              <StatusBadge value="activa" map={MAPA_ESTADO_PARTICIPACION} />
            </div>
          </div>
        ) : (
          <p className="text-[11px] text-slate-400 pt-2 border-t border-slate-100">
            {ETIQUETA_TIPO[entidadTipo]} no tiene una acreditación activa vigente.
          </p>
        )}
      </div>

      <div className="flex items-start gap-2.5 p-4 rounded-2xl bg-primary-lighter/50 border border-primary/20 text-[11px] text-primary-dark">
        <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <span>
          Al reemplazar la acreditación, se mantendrá el historial de {ETIQUETA_TIPO[entidadTipo].toLowerCase()} y
          se creará una nueva acreditación para el proyecto seleccionado.
        </span>
      </div>

      <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-card space-y-3">
        <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider flex items-center gap-1.5">
          <ArrowRight className="w-3.5 h-3.5 text-primary" /> Nueva acreditación
        </h3>
        {proyectoSel ? (
          <div className="space-y-1.5 text-[11px] text-slate-600">
            <p><span className="font-semibold text-slate-400">Proyecto destino:</span> {proyectoSel.nombre}</p>
            {entidadTipo !== "empresa" && perfilRecursoIds.length > 0 && (
              <p><span className="font-semibold text-slate-400">Perfil de Recurso:</span> {nombresPerfiles(perfilRecursoIds, perfilesPorId)}</p>
            )}
            {perfilNuevoNombre && (
              <p><span className="font-semibold text-slate-400">Perfil:</span> {perfilNuevoNombre}</p>
            )}
            {fechaInicio && (
              <p>
                <span className="font-semibold text-slate-400">Vigencia:</span> {fechaInicio}
                {fechaFin ? ` – ${fechaFin}` : " – sin término"}
              </p>
            )}
          </div>
        ) : (
          <p className="text-[11px] text-slate-400">Selecciona el Proyecto destino para ver el detalle.</p>
        )}
      </div>

      <p className="text-[11px] text-slate-400 italic px-1">
        Se reutilizará la documentación vigente cuando corresponda.
      </p>
    </div>
  );
};
