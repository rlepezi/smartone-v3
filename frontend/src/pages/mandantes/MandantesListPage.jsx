import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Building2, Pencil, CheckCircle2, Lock, EyeOff,
} from "lucide-react";
import { mandanteService } from "../../services/mandanteService";
import { formatRutDisplay } from "../../utils/rutFormatters";
import { getMandanteDisplayName } from "../../utils/mandanteDisplay";
import { formatFecha } from "../../utils/fechas";
import { calcularDeltaPeriodo } from "../../utils/deltaCalculos";
import { PageHeader } from "../../components/shared/PageHeader";
import { ErrorBanner } from "../../components/shared/ErrorBanner";
import { FilterBar } from "../../components/shared/FilterBar";
import { DataTable } from "../../components/shared/DataTable";
import { EntityIconTile } from "../../components/shared/EntityIconTile";
import { StatusBadge, MAPA_ACTIVO_INACTIVO_BLOQUEADO } from "../../components/shared/StatusBadge";
import { ActionButton } from "../../components/shared/ActionButton";
import { Pagination } from "../../components/shared/Pagination";
import { MandanteChip } from "../../components/shared/MandanteChip";

const COLUMNS = [
  { key: "mandante", label: "Mandante" },
  { key: "rut", label: "RUT" },
  { key: "razonSocial", label: "Razón Social" },
  { key: "contacto", label: "Contacto" },
  { key: "estado", label: "Estado" },
  { key: "fechaAlta", label: "Fecha de Alta" },
  { key: "acciones", label: "Acciones" },
];

export const MandantesListPage = () => {
  const [mandantes, setMandantes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filtroEstado, setFiltroEstado] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const cargarMandantes = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await mandanteService.listar(filtroEstado || undefined);
      setMandantes(data || []);
    } catch (err) {
      console.error("Error al cargar mandantes:", err);
      setError(err.message || "Error al obtener la lista de mandantes.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarMandantes();
  }, [filtroEstado]);

  useEffect(() => {
    setPage(1);
  }, [filtroEstado, searchTerm]);

  const mandantesFiltrados = mandantes.filter((m) => {
    const term = searchTerm.toLowerCase();
    return (
      m.nombreFantasia?.toLowerCase().includes(term) ||
      m.rut?.toLowerCase().includes(term) ||
      m.razonSocial?.toLowerCase().includes(term)
    );
  });

  const mandantesPaginados = mandantesFiltrados.slice((page - 1) * pageSize, page * pageSize);

  // KPI sobre el total ya cargado (todos los estados, sin el filtro de la
  // tabla) — mismo criterio "xxxTodos" usado en el resto de list pages.
  const totalMandantes = mandantes.length;
  const activosCount = mandantes.filter((m) => (m.estado || "activo") === "activo").length;
  const bloqueadosCount = mandantes.filter((m) => m.estado === "bloqueado").length;
  const inactivosCount = mandantes.filter((m) => m.estado === "inactivo").length;
  const deltaTotal = calcularDeltaPeriodo(mandantes, 30);
  const pct = (n) => (totalMandantes > 0 ? Math.round((n / totalMandantes) * 100) : 0);

  const kpiCards = [
    {
      key: "total", title: "Total Mandantes", icon: Building2,
      color: "text-primary-dark", bg: "bg-primary-lighter", value: totalMandantes,
      subtexto: deltaTotal !== null ? `${deltaTotal >= 0 ? "+" : ""}${deltaTotal} este mes` : null,
    },
    {
      key: "activos", title: "Activos", icon: CheckCircle2,
      color: "text-sage-dark", bg: "bg-sage-lighter", value: activosCount,
      subtexto: `${pct(activosCount)}% del total`,
    },
    {
      key: "bloqueados", title: "Bloqueados", icon: Lock,
      color: "text-red-600", bg: "bg-red-100", value: bloqueadosCount,
      subtexto: `${pct(bloqueadosCount)}% del total`,
    },
    {
      key: "inactivos", title: "Inactivos", icon: EyeOff,
      color: "text-slate-500", bg: "bg-slate-100", value: inactivosCount,
      subtexto: `${pct(inactivosCount)}% del total`,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mandantes"
        icon={Building2}
        subtitle="Gestión de empresas mandantes y clientes principales."
        loading={loading}
        onRefresh={cargarMandantes}
        action={{ to: "/mandantes/nuevo", label: "Nuevo Mandante" }}
      />

      <ErrorBanner message={error} />

      {/* Tarjetas KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {kpiCards.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.key} className="bg-white p-5 rounded-2xl border border-slate-100 shadow-card">
              <div className={`w-11 h-11 rounded-xl ${item.bg} ${item.color} flex items-center justify-center font-bold mb-4`}>
                <Icon className="w-5 h-5" />
              </div>
              {loading ? (
                <div className="h-8 w-14 rounded-lg bg-slate-100 animate-pulse" />
              ) : (
                <h3 className="text-2xl font-black text-carbon-dark tracking-tight">{item.value}</h3>
              )}
              <p className="text-xs font-semibold text-slate-500 mt-0.5">{item.title}</p>
              {item.subtexto && (
                <p className="text-[11px] font-bold text-slate-400 mt-1.5">{item.subtexto}</p>
              )}
            </div>
          );
        })}
      </div>

      {/* Grilla de una columna con hijo `min-w-0`: sin esto, el ancho mínimo
          de la tabla empuja todo el layout y aparece scroll en la página en
          vez de dentro de la tabla (ver comentario en DataTable.jsx). */}
      <div className="grid grid-cols-1">
      <div className="min-w-0 space-y-6">
      <FilterBar
        searchValue={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="Buscar por nombre de fantasía, RUT o razón social..."
        filters={[
          {
            label: "Estado",
            value: filtroEstado,
            onChange: setFiltroEstado,
            options: [
              { value: "", label: "Todos los estados" },
              { value: "activo", label: "Activos" },
              { value: "inactivo", label: "Inactivos" },
              { value: "bloqueado", label: "Bloqueados" },
            ],
          },
        ]}
      />

      <DataTable
        columns={COLUMNS}
        data={mandantesPaginados}
        loading={loading}
        loadingLabel="Cargando mandantes..."
        emptyLabel="No se encontraron mandantes registrados."
        compact
        renderRow={(item) => (
          <tr key={item.id} className="hover:bg-slate-50/60 transition-colors">
            <td className="py-4 px-4">
              <div className="flex items-center gap-3">
                <EntityIconTile icon={Building2} />
                <div className="font-bold text-carbon-dark">
                  <MandanteChip nombre={getMandanteDisplayName(item)} logoUrl={item.logoUrl} />
                </div>
              </div>
            </td>
            <td className="py-4 px-4 font-mono font-semibold text-slate-700 whitespace-nowrap">
              {formatRutDisplay(item.rut)}
            </td>
            <td className="py-4 px-4 min-w-[11rem] text-slate-600 font-medium">
              {item.razonSocial}
            </td>
            <td className="py-4 px-4">
              {item.contacto ? (
                <div>
                  <p className="font-medium text-slate-700">{item.contacto.nombre}</p>
                  <p className="text-[11px] text-slate-400 max-w-[9rem] truncate" title={item.contacto.email}>{item.contacto.email}</p>
                </div>
              ) : (
                <span className="text-slate-400 italic">-</span>
              )}
            </td>
            <td className="py-4 px-4 whitespace-nowrap">
              <StatusBadge value={item.estado || "activo"} map={MAPA_ACTIVO_INACTIVO_BLOQUEADO} />
            </td>
            <td className="py-4 px-4 text-slate-600 font-medium whitespace-nowrap">
              {formatFecha(item.createdAt)}
            </td>
            <td className="py-4 px-4">
              <ActionButton as={Link} to={`/mandantes/${item.id}`} icon={Pencil}>
                Editar
              </ActionButton>
            </td>
          </tr>
        )}
      />

      <Pagination
        page={page}
        pageSize={pageSize}
        total={mandantesFiltrados.length}
        onPageChange={setPage}
        onPageSizeChange={(n) => { setPageSize(n); setPage(1); }}
      />
      </div>
      </div>
    </div>
  );
};
