import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Building2 } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { getMandanteDisplayName } from "../../utils/mandanteDisplay";

const ROLES_CREAN_MANDANTE = ["superadmin", "admin_comercial"];

// Campo Mandante de los formularios de alta. Único componente: recibe el `contexto` que devuelve
// useMandanteContexto (el formulario es el dueño del hook, porque también necesita el mandanteId
// para guardar) y decide qué mostrar:
//  - "fijo" y "unico": tarjeta de solo lectura con logo y nombre, sin selector ni foco.
//  - "seleccionable": el selector, obligatorio y con el foco inicial.
//  - "ninguno": aviso de que no hay Mandantes activos (quien lo usa deshabilita Guardar).
//  - cargando: un espacio del mismo alto que la tarjeta, sin dibujar el selector.
// `focoRef`: primer campo editable del formulario; recibe el foco cuando no hay selector.
// `error`: mensaje de validación. `ayuda`: texto bajo el selector. `disabled`: selector bloqueado.
// `conFoco`: en false el selector no toma el foco inicial (cuando no es el primer campo).
export const CampoMandante = ({
  contexto, error = null, ayuda = null, focoRef = null, disabled = false, conFoco = true, onChange,
}) => {
  const { profile } = useAuth();
  const { modo, cargando, mandante, mandanteId, mandantes, elegir } = contexto;
  const sinSelector = modo === "fijo" || modo === "unico";

  useEffect(() => {
    if (sinSelector) focoRef?.current?.focus();
  }, [sinSelector, focoRef]);

  if (cargando && !sinSelector) {
    return <div className="h-31 rounded-2xl bg-primary-lighter/50 border border-primary/10" aria-hidden="true" />;
  }

  // Misma tarjeta que el catálogo de Requerimientos: el Mandante es el contexto del formulario.
  if (sinSelector) {
    return (
      <section className="p-4 rounded-2xl bg-primary-lighter/50 border border-primary/10 space-y-3">
        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Mandante</p>
        <div className="flex items-center gap-4 p-3 rounded-2xl bg-white border border-primary/20 shadow-card">
          {mandante?.logoUrl ? (
            <img src={mandante.logoUrl} alt="" className="w-12 h-12 rounded-xl object-contain bg-white border border-slate-100 shrink-0" />
          ) : (
            <span className="w-12 h-12 rounded-xl bg-primary text-white flex items-center justify-center shrink-0">
              <Building2 className="w-6 h-6" />
            </span>
          )}
          <div className="min-w-0">
            <p className="text-base font-bold text-carbon-dark truncate">
              {cargando ? "…" : getMandanteDisplayName(mandante) || mandanteId}
            </p>
            <p className="text-xs text-slate-500">Mandante seleccionado</p>
          </div>
        </div>
      </section>
    );
  }

  if (modo === "ninguno") {
    return (
      <p role="alert" className="text-xs font-semibold text-amber-700">
        {contexto.error || "No hay Mandantes activos. Crea uno antes de continuar"}
        {!contexto.error && ROLES_CREAN_MANDANTE.includes(profile?.rol) && (
          <>
            {" · "}
            <Link to="/mandantes/nuevo" className="font-bold text-primary hover:text-primary-dark hover:underline">
              Crear Mandante
            </Link>
          </>
        )}
      </p>
    );
  }

  return (
    <div>
      <label className="block text-xs font-semibold text-gray-700 mb-1.5">Mandante *</label>
      <select
        name="mandanteId"
        value={mandanteId}
        autoFocus={conFoco}
        disabled={disabled}
        onChange={(e) => {
          elegir(e.target.value);
          onChange?.(e.target.value);
        }}
        className={`w-full px-3.5 py-2.5 bg-gray-50/50 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed ${
          error ? "border-red-400 bg-red-50/30" : "border-gray-200"
        }`}
      >
        <option value="">Seleccione un Mandante...</option>
        {mandantes.map((m) => (
          <option key={m.id} value={m.id}>{getMandanteDisplayName(m)}</option>
        ))}
      </select>
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
      {ayuda && <p className="text-[11px] text-slate-400 mt-1">{ayuda}</p>}
    </div>
  );
};
