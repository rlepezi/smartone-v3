import React, { useEffect, useState } from "react";
import { Search, User, Truck, Building2 } from "lucide-react";
import { acreditacionService } from "../../../services/acreditacionService";
import { empresaService } from "../../../services/empresaService";
import { ErrorBanner } from "../../../components/shared/ErrorBanner";
import { StatusBadge, MAPA_ACTIVO_INACTIVO } from "../../../components/shared/StatusBadge";
import { formatRutDisplay } from "../../../utils/rutFormatters";
import { formatCatalogo } from "../../../utils/formatCatalogo";

const TABS = [
  { tipo: "persona", label: "Personas", icon: User },
  { tipo: "maquinaria", label: "Maquinarias", icon: Truck },
  { tipo: "empresa", label: "Empresas", icon: Building2 },
];

const PAGE_SIZE = 5;

// Paso 2 del wizard de Reemplazar Acreditación: tabs Persona/Maquinaria/
// Empresa, búsqueda por nombre/RUT/cargo y selección única. Se omite por
// completo cuando el usuario entra desde el detalle de una entidad
// (ver ReemplazarAcreditacionWizardPage — query params entidadTipo/
// entidadId ya prefiltrados).
export const PasoEntidad = ({ entidadTipo, onCambiarTipo, entidadSel, onSeleccionar }) => {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [resultado, setResultado] = useState({ data: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [empresasMap, setEmpresasMap] = useState({});

  useEffect(() => {
    empresaService
      .listar()
      .then((data) => {
        const map = {};
        (data || []).forEach((e) => {
          map[e.id] = e.razonSocial;
        });
        setEmpresasMap(map);
      })
      .catch(() => setEmpresasMap({}));
  }, []);

  useEffect(() => {
    setPage(1);
  }, [entidadTipo, search]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    acreditacionService
      .listarEntidades({ tipo: entidadTipo, search, page, pageSize: PAGE_SIZE })
      .then((res) => setResultado(res || { data: [], total: 0 }))
      .catch((err) => setError(err.message || "No se pudo cargar el listado."))
      .finally(() => setLoading(false));
  }, [entidadTipo, search, page]);

  const totalPaginas = Math.max(1, Math.ceil((resultado.total || 0) / PAGE_SIZE));
  const tabActual = TABS.find((t) => t.tipo === entidadTipo);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-bold text-gray-900">Selecciona la entidad a mover</h3>
        <p className="text-xs text-gray-500 mt-0.5">
          Elige la Persona, Maquinaria o Empresa cuya acreditación quieres reemplazar.
        </p>
      </div>

      <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.tipo}
              type="button"
              onClick={() => onCambiarTipo(t.tipo)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                entidadTipo === t.tipo ? "bg-primary-lighter text-primary" : "text-slate-500 hover:bg-slate-50"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre, RUT o cargo..."
          className="w-full pl-10 pr-3.5 py-2.5 bg-gray-50/50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
        />
      </div>

      <ErrorBanner message={error} />

      {loading ? (
        <p className="text-xs text-slate-400 py-8 text-center">Cargando...</p>
      ) : (resultado.data || []).length === 0 ? (
        <p className="text-xs text-slate-400 py-8 text-center">Sin resultados para este criterio de búsqueda.</p>
      ) : (
        <div className="overflow-x-auto -mx-2">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                <th className="py-2.5 px-2"></th>
                <th className="py-2.5 px-2">Nombre / RUT</th>
                <th className="py-2.5 px-2">Cargo</th>
                <th className="py-2.5 px-2">Empresa</th>
                <th className="py-2.5 px-2">Participaciones</th>
                <th className="py-2.5 px-2">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {resultado.data.map((fila) => (
                <tr
                  key={fila.id}
                  onClick={() => onSeleccionar(fila)}
                  className={`cursor-pointer transition-colors ${
                    entidadSel?.id === fila.id ? "bg-primary-lighter/60" : "hover:bg-slate-50/60"
                  }`}
                >
                  <td className="py-2.5 px-2">
                    <input
                      type="radio"
                      readOnly
                      checked={entidadSel?.id === fila.id}
                      className="w-4 h-4 text-primary focus:ring-primary/30"
                    />
                  </td>
                  <td className="py-2.5 px-2">
                    <p className="font-bold text-carbon-dark">{fila.nombre}</p>
                    {fila.rut && (
                      <p className="text-[11px] text-slate-400 font-mono">
                        {entidadTipo === "maquinaria" ? fila.rut : formatRutDisplay(fila.rut)}
                      </p>
                    )}
                  </td>
                  <td className="py-2.5 px-2 text-slate-600 font-medium">
                    {fila.cargo ? formatCatalogo(fila.cargo) : "-"}
                  </td>
                  <td className="py-2.5 px-2 text-slate-600 font-medium">
                    {entidadTipo === "empresa" ? "-" : empresasMap[fila.empresaId] || "-"}
                  </td>
                  <td className="py-2.5 px-2 text-slate-600">
                    {fila.participacionesActivas + fila.participacionesFinalizadas} participaciones
                    <span className="text-slate-400">
                      {" "}({fila.participacionesActivas} activas, {fila.participacionesFinalizadas} finalizadas)
                    </span>
                  </td>
                  <td className="py-2.5 px-2">
                    <StatusBadge value={fila.estado} map={MAPA_ACTIVO_INACTIVO} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {resultado.total > 0 && (
        <div className="flex items-center justify-between text-[11px] text-slate-400 pt-2">
          <span>
            Mostrando {resultado.data.length} de {resultado.total} {tabActual?.label.toLowerCase()}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="px-2 py-1 rounded-lg border border-slate-200 disabled:opacity-40 font-semibold"
            >
              Anterior
            </button>
            <span>Página {page} de {totalPaginas}</span>
            <button
              type="button"
              disabled={page >= totalPaginas}
              onClick={() => setPage((p) => p + 1)}
              className="px-2 py-1 rounded-lg border border-slate-200 disabled:opacity-40 font-semibold"
            >
              Siguiente
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
