import { useEffect, useState } from "react";
import { Search, Building2 } from "lucide-react";
import { mandanteService } from "../../../services/mandanteService";
import { getMandanteDisplayName } from "../../../utils/mandanteDisplay";
import { formatRutDisplay } from "../../../utils/rutFormatters";
import { ErrorBanner } from "../../../components/shared/ErrorBanner";
import { EntityIconTile } from "../../../components/shared/EntityIconTile";

// Paso 1 del wizard "Nueva Acreditación": el Mandante elegido acá es la ÚNICA fuente del Mandante
// del flujo (los pasos siguientes filtran Proyectos y Perfiles por él). Mismo patrón visual que el
// Paso Empresa. Sin opción de crear Mandante. Lo usan los roles sin Mandante fijo; para
// mandante_admin el paso se omite (ver AcreditacionWizardPage).
export const PasoMandante = ({ mandanteId, onSeleccionar }) => {
  const [mandantes, setMandantes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let vigente = true;
    mandanteService.listar("activo")
      .then((data) => {
        if (!vigente) return;
        const lista = data || [];
        setMandantes(lista);
        // Un único Mandante activo: viene preseleccionado (el paso igual se muestra).
        if (lista.length === 1 && !mandanteId) onSeleccionar(lista[0]);
      })
      .catch((err) => { if (vigente) setError(err.message || "No se pudieron cargar los mandantes."); })
      .finally(() => { if (vigente) setLoading(false); });
    return () => { vigente = false; };
    // Solo al montar: la preselección no debe repetirse si el usuario cambia de Mandante.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const term = search.trim().toLowerCase();
  const filtrados = mandantes
    .filter((m) => !term || [getMandanteDisplayName(m), m.razonSocial, m.rut]
      .some((v) => v?.toLowerCase().includes(term)))
    .sort((a, b) => getMandanteDisplayName(a).localeCompare(getMandanteDisplayName(b), "es"));

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-bold text-gray-900">Selecciona el Mandante</h3>
        <p className="text-xs text-gray-500 mt-0.5">
          Los Proyectos y Perfiles de Participación de los pasos siguientes se acotan a este Mandante.
        </p>
      </div>

      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
        <input
          type="text" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre, razón social o RUT..."
          className="w-full pl-10 pr-3.5 py-2.5 bg-gray-50/50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
        />
      </div>

      <ErrorBanner message={error} />

      {loading ? (
        <p className="text-xs text-slate-400 py-8 text-center">Cargando mandantes...</p>
      ) : filtrados.length === 0 ? (
        <p className="text-xs text-slate-400 py-8 text-center">No se encontraron mandantes activos.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filtrados.map((m) => {
            const nombre = getMandanteDisplayName(m);
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => onSeleccionar(m)}
                className={`text-left p-4 rounded-xl border-2 transition-all ${
                  mandanteId === m.id ? "border-primary bg-primary-lighter" : "border-gray-100 hover:border-gray-200 bg-white"
                }`}
              >
                <div className="flex items-start gap-3">
                  {m.logoUrl ? (
                    <img src={m.logoUrl} alt="" className="w-9 h-9 rounded-full object-contain border border-slate-100 shrink-0" />
                  ) : (
                    <EntityIconTile icon={Building2} />
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-carbon-dark truncate">{nombre}</p>
                    <p className="text-[11px] text-slate-400 font-mono">{formatRutDisplay(m.rut)}</p>
                    {m.razonSocial && m.razonSocial !== nombre && (
                      <p className="text-[11px] text-slate-400 mt-1">{m.razonSocial}</p>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
