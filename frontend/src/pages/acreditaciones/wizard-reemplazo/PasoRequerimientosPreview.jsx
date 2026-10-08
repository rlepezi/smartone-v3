import React, { useEffect, useState } from "react";
import { Building2, Users, Truck } from "lucide-react";
import { acreditacionService } from "../../../services/acreditacionService";
import { ErrorBanner } from "../../../components/shared/ErrorBanner";

const BLOQUES = [
  { key: "empresa", label: "Empresa", icon: Building2 },
  { key: "persona", label: "Persona", icon: Users },
  { key: "maquinaria", label: "Maquinaria", icon: Truck },
];

// Paso 5 del wizard: previsualiza, sin escribir nada, cuántos
// Requerimientos aplicarán al nuevo contexto y qué porcentaje quedará
// pre-cumplido por reutilización documental, desglosado por bloque
// (empresa/persona/maquinaria) — mismo cálculo que ejecutará el
// reemplazo real (acreditacionService.previewRequerimientos).
export const PasoRequerimientosPreview = ({
  entidadTipo, entidadId, perfilParticipacionId, fechaInicio, perfilRecursoIds = [],
}) => {
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!perfilParticipacionId || !fechaInicio || !entidadId) return;
    setLoading(true);
    setError(null);
    acreditacionService
      .previewRequerimientos({ entidadTipo, entidadId, perfilParticipacionId, fechaInicio, perfilRecursoIds })
      .then(setPreview)
      .catch((err) => setError(err.message || "No se pudo calcular la previsualización."))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entidadTipo, entidadId, perfilParticipacionId, fechaInicio, perfilRecursoIds.join(",")]);

  const pct = preview && preview.total > 0 ?
      Math.round((preview.reutilizados / preview.total) * 100) :
      0;

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-bold text-gray-900">Requerimientos aplicables</h3>
        <p className="text-xs text-gray-500 mt-0.5">
          Calculados automáticamente para el nuevo contexto — los que tengan documentación vigente quedarán
          pre-cumplidos por reutilización, sin intervención manual.
        </p>
      </div>

      <ErrorBanner message={error} />

      {loading ? (
        <p className="text-xs text-slate-400 py-8 text-center">Calculando...</p>
      ) : preview ? (
        <>
          <div className="p-5 rounded-2xl bg-primary-lighter/50 border border-primary/20 text-center">
            <p className="text-3xl font-black text-primary">{pct}%</p>
            <p className="text-xs font-semibold text-primary-dark mt-1">
              {preview.reutilizados} de {preview.total} Requerimientos quedarán pre-cumplidos por
              reutilización documental
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {BLOQUES.map(({ key, label, icon: Icon }) => {
              const bloque = preview[key];
              if (!bloque || bloque.total === 0) {
                return (
                  <div key={key} className="p-4 rounded-xl border border-slate-100 bg-white text-center">
                    <Icon className="w-5 h-5 text-slate-300 mx-auto mb-1" />
                    <p className="text-xs font-bold text-slate-400">{label}</p>
                    <p className="text-[11px] text-slate-400 mt-1">Sin Requerimientos</p>
                  </div>
                );
              }
              return (
                <div key={key} className="p-4 rounded-xl border border-slate-100 bg-white">
                  <div className="flex items-center gap-2 mb-2">
                    <Icon className="w-4 h-4 text-primary" />
                    <p className="text-xs font-bold text-carbon-dark">{label}</p>
                  </div>
                  <p className="text-xs text-slate-600">{bloque.total} Requerimientos</p>
                  <div className="flex items-center gap-3 mt-1.5 text-[11px]">
                    <span className="text-sage-dark font-bold">{bloque.reutilizados} reutilizados</span>
                    <span className="text-amber-600 font-bold">{bloque.pendientes} pendientes</span>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <p className="text-xs text-slate-400 py-8 text-center">
          No se pudo determinar el Perfil de Participación para calcular la previsualización.
        </p>
      )}
    </div>
  );
};
