import React from "react";
import { Link } from "react-router-dom";
import { X, ArrowUpRight } from "lucide-react";
import { StatusBadge } from "./StatusBadge";

// Panel lateral de vista rápida — genérico, sin conocimiento de ninguna
// entidad puntual (Empresa/Persona/etc.). Cada página arma sus propias
// listas de infoGeneral/metricas y se las pasa ya resueltas.
export const QuickViewPanel = ({
  open,
  onClose,
  icon: Icon,
  logoUrl,
  eyebrow,
  title,
  badge,
  infoGeneral = [],
  metricas = [],
  extra,
  accionLabel,
  accionTo,
}) => {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40"
      style={{ animation: "qvp-fade-in 0.15s ease-out" }}
      onClick={onClose}
    >
      <style>{`
        @keyframes qvp-fade-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes qvp-slide-in { from { transform: translateX(100%); } to { transform: translateX(0); } }
      `}</style>
      <div
        className="ml-auto h-full w-full max-w-md bg-white shadow-dropdown flex flex-col"
        style={{ animation: "qvp-slide-in 0.2s ease-out" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <div className="flex items-center gap-3 min-w-0">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt=""
                className="w-11 h-11 rounded-xl object-contain border border-slate-100 flex-shrink-0"
              />
            ) : (
              Icon && (
                <div className="w-11 h-11 rounded-xl bg-primary-lighter text-primary-dark flex items-center justify-center flex-shrink-0">
                  <Icon className="w-5 h-5" />
                </div>
              )
            )}
            <div className="min-w-0">
              {eyebrow && <div className="mb-1">{eyebrow}</div>}
              <h3 className="text-sm font-bold text-carbon-dark truncate">{title}</h3>
              {badge && <div className="mt-1"><StatusBadge value={badge.value} map={badge.map} /></div>}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition-colors flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {infoGeneral.length > 0 && (
            <div className="space-y-3">
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Información General
              </p>
              <dl className="space-y-2.5">
                {infoGeneral.map((item) => (
                  <div key={item.label} className="flex items-start justify-between gap-3 text-xs">
                    <dt className="font-semibold text-slate-500 flex-shrink-0">{item.label}</dt>
                    <dd className="text-carbon-dark font-medium text-right">{item.value || "-"}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          {metricas.length > 0 && (
            <div className="space-y-3 pt-4 border-t border-slate-100">
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Resumen de Actividad
              </p>
              <div className="grid grid-cols-2 gap-3">
                {metricas.map((m) => {
                  const MetricIcon = m.icon;
                  return (
                    <div key={m.label} className="p-3 rounded-xl bg-slate-50 border border-slate-100 flex items-center gap-2.5">
                      {MetricIcon && <MetricIcon className="w-4 h-4 text-primary flex-shrink-0" />}
                      <div>
                        <p className="text-sm font-black text-carbon-dark leading-none">{m.value}</p>
                        <p className="text-[11px] font-semibold text-slate-500 mt-1">{m.label}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {extra && <div className="pt-2">{extra}</div>}
        </div>

        {accionTo && (
          <div className="p-5 border-t border-slate-100">
            <Link
              to={accionTo}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary hover:bg-primary-dark text-white font-bold text-xs shadow-md shadow-primary/20 transition-all"
            >
              {accionLabel || "Ver Detalle Completo"}
              <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        )}
      </div>
    </div>
  );
};
