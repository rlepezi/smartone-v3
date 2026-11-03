import React, { useEffect, useState } from "react";
import { Search, Plus, HardHat } from "lucide-react";
import { empresaService } from "../../../services/empresaService";
import { formatRutDisplay } from "../../../utils/rutFormatters";
import { ErrorBanner } from "../../../components/shared/ErrorBanner";
import { ActionButton } from "../../../components/shared/ActionButton";
import { EntityIconTile } from "../../../components/shared/EntityIconTile";
import { NuevaEmpresaForm } from "../../../components/empresas/NuevaEmpresaForm";

// `mandanteId`: Mandante del flujo; solo se listan las Empresas asociadas a él (empresaMandantes).
export const PasoEmpresa = ({ mandanteId, empresaId, onSeleccionar }) => {
  const [empresas, setEmpresas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [mostrarCrear, setMostrarCrear] = useState(false);

  const cargar = () => {
    if (!mandanteId) return;
    setLoading(true);
    setError(null);
    empresaService.listar("activo", { mandanteId })
      .then((data) => setEmpresas(data || []))
      .catch((err) => setError(err.message || "No se pudieron cargar las empresas."))
      .finally(() => setLoading(false));
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { cargar(); }, [mandanteId]);

  const filtradas = empresas.filter((e) => {
    const term = search.toLowerCase();
    return (
      e.razonSocial?.toLowerCase().includes(term) ||
      e.rut?.toLowerCase().includes(term)
    );
  });

  const handleCreada = (empresa) => {
    setMostrarCrear(false);
    cargar();
    onSeleccionar(empresa);
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-bold text-gray-900">Selecciona la Empresa a acreditar</h3>
        <p className="text-xs text-gray-500 mt-0.5">Elige una Empresa activa asociada al Mandante, o crea una nueva sin salir de este flujo.</p>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por razón social o RUT..."
            className="w-full pl-10 pr-3.5 py-2.5 bg-gray-50/50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
          />
        </div>
        <ActionButton variant="primary" icon={Plus} onClick={() => setMostrarCrear((v) => !v)}>
          {mostrarCrear ? "Cancelar" : "Crear nueva Empresa"}
        </ActionButton>
      </div>

      <ErrorBanner message={error} />

      {mostrarCrear && (
        <NuevaEmpresaForm variante="compacta" mandanteId={mandanteId} onCreada={handleCreada} onCancelar={() => setMostrarCrear(false)} />
      )}

      {loading ? (
        <p className="text-xs text-slate-400 py-8 text-center">Cargando empresas...</p>
      ) : filtradas.length === 0 ? (
        <p className="text-xs text-slate-400 py-8 text-center">No se encontraron empresas activas asociadas a este Mandante.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filtradas.map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => onSeleccionar(e)}
              className={`text-left p-4 rounded-xl border-2 transition-all ${
                empresaId === e.id ? "border-primary bg-primary-lighter" : "border-gray-100 hover:border-gray-200 bg-white"
              }`}
            >
              <div className="flex items-start gap-3">
                {e.logoUrl ? (
                  <img
                    src={e.logoUrl}
                    alt=""
                    className="w-9 h-9 rounded-full object-contain border border-slate-100 flex-shrink-0"
                  />
                ) : (
                  <EntityIconTile icon={HardHat} />
                )}
                <div className="min-w-0">
                  <p className="text-sm font-bold text-carbon-dark truncate">{e.razonSocial}</p>
                  <p className="text-[11px] text-slate-400 font-mono">{formatRutDisplay(e.rut)}</p>
                  <p className="text-[11px] text-slate-400 mt-1">{e.giro}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
