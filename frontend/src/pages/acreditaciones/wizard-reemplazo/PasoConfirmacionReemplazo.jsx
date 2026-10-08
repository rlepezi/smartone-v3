import React from "react";
import { CheckCircle2 } from "lucide-react";
import { ErrorBanner } from "../../../components/shared/ErrorBanner";
import { nombresPerfiles } from "../../../services/participacionSujetoService";
import { usePerfilesRecurso } from "../../../hooks/usePerfilesRecurso";

const ETIQUETA_TIPO = { persona: "Persona", maquinaria: "Maquinaria", empresa: "Empresa" };

// Paso 6 (final) del wizard: resumen completo antes de ejecutar, y botón
// que llama a acreditacionService.reemplazar — la única escritura real
// de todo el wizard, ejecutada en una sola transacción en el backend.
export const PasoConfirmacionReemplazo = ({
  entidadTipo, entidadSel, proyectoSel, perfilSel, perfilRecursoIds = [], fechaInicio, fechaFin,
  ejecutando, error, resultado, onConfirmar,
}) => {
  const perfilesPorId = usePerfilesRecurso();
  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-bold text-gray-900">Confirmación</h3>
        <p className="text-xs text-gray-500 mt-0.5">
          Revisa el resumen antes de ejecutar el reemplazo.
        </p>
      </div>

      <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 space-y-2 text-xs">
        <p><span className="font-semibold text-slate-500">{ETIQUETA_TIPO[entidadTipo]}:</span> <b>{entidadSel?.nombre}</b></p>
        <p><span className="font-semibold text-slate-500">Proyecto destino:</span> <b>{proyectoSel?.nombre}</b> ({proyectoSel?.codigo})</p>
        {entidadTipo !== "empresa" && perfilRecursoIds.length > 0 && (
          <p><span className="font-semibold text-slate-500">Perfil de Recurso:</span> <b>{nombresPerfiles(perfilRecursoIds, perfilesPorId)}</b></p>
        )}
        {perfilSel && (
          <p><span className="font-semibold text-slate-500">Perfil de Participación (nuevo):</span> <b>{perfilSel.nombre}</b></p>
        )}
        <p><span className="font-semibold text-slate-500">Fecha de inicio:</span> <b>{fechaInicio}</b></p>
        {fechaFin && <p><span className="font-semibold text-slate-500">Fecha de término:</span> <b>{fechaFin}</b></p>}
      </div>

      <ErrorBanner message={error} />

      {resultado && (
        <div className="flex items-center gap-2.5 p-4 rounded-xl bg-sage-lighter border border-sage-light text-sage-darker text-xs font-semibold">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          Acreditación reemplazada exitosamente — {resultado.requerimientosReutilizados} de{" "}
          {resultado.requerimientosTotal} Requerimientos quedaron reutilizados automáticamente.
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={onConfirmar}
          disabled={ejecutando || Boolean(resultado)}
          className="px-6 py-2.5 text-sm font-semibold text-white bg-primary hover:bg-primary-dark rounded-xl shadow-md shadow-primary/25 transition-all disabled:opacity-50"
        >
          {ejecutando ? "Procesando..." : resultado ? "Reemplazo completado" : "Reemplazar acreditación"}
        </button>
      </div>
    </div>
  );
};
