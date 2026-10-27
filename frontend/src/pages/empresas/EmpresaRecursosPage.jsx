import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, HardHat, Users, Truck, UserPlus, Plus, RefreshCw } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { empresaService } from "../../services/empresaService";
import { formatRutDisplay } from "../../utils/rutFormatters";
import { ErrorBanner } from "../../components/shared/ErrorBanner";
import { FilterBar } from "../../components/shared/FilterBar";
import { DataTable } from "../../components/shared/DataTable";
import { Pagination } from "../../components/shared/Pagination";
import { EmpresaChip } from "../../components/shared/EmpresaChip";
import { StatusBadge, MAPA_ACTIVO_INACTIVO } from "../../components/shared/StatusBadge";
import { ModalCrearPersona } from "../../components/shared/ModalCrearPersona";
import { ModalCrearRecurso } from "../../components/shared/ModalCrearRecurso";
import { cn } from "../../utils/cn";

// Personas y Maquinarias con relación (vigente o histórica) con una Empresa (empresaPersonas /
// empresaRecursos), con los Proyectos donde tienen asignación activa. Todo viene resuelto del
// backend en una sola llamada (empresaService.obtenerRecursos), con el alcance del actor: un rol
// de Mandante solo ve los Proyectos de su Mandante. La ruta no existe para admin_comercial (el
// backend responde 403) y mandante_lector/evaluador la ven sin los botones de alta.
const ROLES_ALTA = ["superadmin", "mandante_admin"];

const COLUMNS = [
  { key: "tipo", label: "Tipo" },
  { key: "nombre", label: "Nombre" },
  { key: "identificacion", label: "Identificación / Patente" },
  { key: "detalle", label: "Cargo / Tipo de maquinaria" },
  { key: "proyectos", label: "Proyectos activos" },
  { key: "relacion", label: "Relación" },
];

const MAPA_RELACION = {
  activa: { label: "Vigente", className: "bg-sage-lighter text-sage-darker border-sage-light" },
  finalizada: { label: "Terminada", className: "bg-slate-100 text-slate-500 border-slate-200" },
};

const TIPO_FILA = {
  persona: { label: "Persona", icon: Users, className: "bg-sky-50 text-sky-700 border-sky-200" },
  maquinaria: { label: "Maquinaria", icon: Truck, className: "bg-violet-50 text-violet-700 border-violet-200" },
};

const textoIdentificacion = (identificacion) => {
  if (!identificacion?.numero) return "-";
  if (identificacion.tipo === "RUT") return formatRutDisplay(identificacion.numero);
  if (identificacion.tipo === "PASAPORTE") return `Pasaporte ${identificacion.numero}`;
  return identificacion.numero;
};

export const EmpresaRecursosPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const puedeAgregar = ROLES_ALTA.includes(profile?.rol);

  const [datos, setDatos] = useState(null); // { empresa, filas }
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filtroTipo, setFiltroTipo] = useState("");
  const [filtroProyecto, setFiltroProyecto] = useState("");
  const [filtroRelacion, setFiltroRelacion] = useState("activa");
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [modalAlta, setModalAlta] = useState(null); // "persona" | "maquinaria"

  const pedir = () => empresaService.obtenerRecursos(id)
    .then((data) => { setDatos(data); setError(null); })
    .catch((err) => {
      console.error("Error al cargar los recursos de la empresa:", err);
      setError(err.message || "No se pudieron cargar las personas y maquinarias de la empresa.");
    })
    .finally(() => setLoading(false));

  useEffect(() => {
    pedir();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const cargar = () => {
    setLoading(true);
    pedir();
  };

  // Cambiar un filtro o la búsqueda vuelve a la primera página.
  const conPrimeraPagina = (setter) => (valor) => {
    setter(valor);
    setPage(1);
  };

  const empresa = datos?.empresa || null;
  const filas = datos?.filas || [];

  // Proyectos presentes en las filas (ya acotados al alcance del actor por el backend).
  const proyectos = [...new Map(
    filas.flatMap((f) => f.proyectos).map((p) => [p.id, p]),
  ).values()].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

  const filasFiltradas = filas.filter((f) => {
    const term = searchTerm.trim().toLowerCase();
    const identificacion = f.identificacion?.numero || "";
    const matchTerm = !term ||
      f.nombre?.toLowerCase().includes(term) ||
      identificacion.toLowerCase().includes(term) ||
      textoIdentificacion(f.identificacion).toLowerCase().includes(term);
    const matchTipo = !filtroTipo || f.tipo === filtroTipo;
    const matchProyecto = !filtroProyecto || f.proyectos.some((p) => p.id === filtroProyecto);
    const matchRelacion = !filtroRelacion || f.relacion?.estado === filtroRelacion;
    return matchTerm && matchTipo && matchProyecto && matchRelacion;
  });
  const filasPaginadas = filasFiltradas.slice((page - 1) * pageSize, page * pageSize);

  const alCrear = () => {
    setModalAlta(null);
    cargar();
  };

  return (
    <div className="space-y-6">
      {/* Encabezado: datos de la Empresa */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => navigate("/empresas")}
            title="Volver al listado de Empresas"
            aria-label="Volver al listado de Empresas"
            className="p-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 transition-colors shadow-sm shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          {empresa ? (
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <EmpresaChip nombre={empresa.razonSocial} logoUrl={empresa.logoUrl} size="lg" conIniciales />
                <StatusBadge value={empresa.estado} map={MAPA_ACTIVO_INACTIVO} />
              </div>
              <p className="text-xs text-slate-500 mt-1">
                RUT <span className="font-mono font-semibold">{formatRutDisplay(empresa.rut || "")}</span>
                {" · "}Personas y maquinarias de la empresa
              </p>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary-lighter text-primary-dark flex items-center justify-center">
                <HardHat className="w-5 h-5" />
              </div>
              <p className="text-sm text-slate-400">{loading ? "Cargando empresa..." : "Empresa"}</p>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={cargar}
            title="Refrescar"
            aria-label="Refrescar"
            className="p-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition-colors shadow-sm"
          >
            <RefreshCw className={cn("w-4 h-4", loading && "animate-spin text-primary")} />
          </button>
          {puedeAgregar && empresa && (
            <>
              <button
                type="button"
                onClick={() => setModalAlta("persona")}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary hover:bg-primary-dark text-white font-bold text-xs shadow-md shadow-primary/20 transition-all"
              >
                <UserPlus className="w-4 h-4" />
                Agregar persona
              </button>
              <button
                type="button"
                onClick={() => setModalAlta("maquinaria")}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary hover:bg-primary-dark text-white font-bold text-xs shadow-md shadow-primary/20 transition-all"
              >
                <Plus className="w-4 h-4" />
                Agregar maquinaria
              </button>
            </>
          )}
        </div>
      </div>

      <ErrorBanner message={error} />

      <FilterBar
        searchValue={searchTerm}
        onSearchChange={conPrimeraPagina(setSearchTerm)}
        searchPlaceholder="Buscar por nombre, RUT, pasaporte o patente..."
        filters={[
          {
            label: "Tipo",
            value: filtroTipo,
            onChange: conPrimeraPagina(setFiltroTipo),
            options: [
              { value: "", label: "Todos" },
              { value: "persona", label: "Personas" },
              { value: "maquinaria", label: "Maquinarias" },
            ],
          },
          {
            label: "Proyecto",
            value: filtroProyecto,
            onChange: conPrimeraPagina(setFiltroProyecto),
            options: [
              { value: "", label: "Todos los proyectos" },
              ...proyectos.map((p) => ({ value: p.id, label: p.codigo ? `${p.nombre} (${p.codigo})` : p.nombre })),
            ],
          },
          {
            label: "Relación",
            value: filtroRelacion,
            onChange: conPrimeraPagina(setFiltroRelacion),
            options: [
              { value: "activa", label: "Vigentes" },
              { value: "finalizada", label: "Terminadas" },
              { value: "", label: "Todas" },
            ],
          },
        ]}
      />

      <DataTable
        columns={COLUMNS}
        data={filasPaginadas}
        loading={loading}
        loadingLabel="Cargando personas y maquinarias..."
        emptyLabel="No hay personas ni maquinarias que coincidan con los filtros."
        renderRow={(f) => {
          const tipo = TIPO_FILA[f.tipo];
          const Icono = tipo.icon;
          const destino = f.tipo === "persona" ? `/personas/${f.id}` : `/recursos/${f.id}`;
          return (
            <tr
              key={`${f.tipo}-${f.id}`}
              onClick={() => navigate(destino)}
              className="hover:bg-slate-50/60 transition-colors cursor-pointer"
            >
              <td className="py-4 px-6">
                <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] font-bold border whitespace-nowrap ${tipo.className}`}>
                  <Icono className="w-3 h-3" /> {tipo.label}
                </span>
              </td>
              <td className="py-4 px-6">
                <a
                  href={destino}
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigate(destino); }}
                  className="font-bold text-carbon-dark hover:text-primary"
                >
                  {f.nombre}
                </a>
              </td>
              <td className="py-4 px-6 font-mono font-semibold text-slate-700 whitespace-nowrap">
                {textoIdentificacion(f.identificacion)}
              </td>
              <td className="py-4 px-6 text-slate-600 font-medium">{f.detalle || "-"}</td>
              <td className="py-4 px-6">
                {f.proyectos.length === 0 ? (
                  <span className="text-[11px] text-slate-300 italic">Sin asignación activa</span>
                ) : (
                  <div className="flex flex-col gap-1">
                    {f.proyectos.map((p) => (
                      <span key={p.id} className="text-xs font-semibold text-carbon-dark">
                        {p.nombre}
                        {p.codigo && <span className="ml-1 text-[11px] font-mono text-slate-400">{p.codigo}</span>}
                      </span>
                    ))}
                  </div>
                )}
              </td>
              <td className="py-4 px-6">
                <StatusBadge value={f.relacion?.estado} map={MAPA_RELACION} />
              </td>
            </tr>
          );
        }}
      />

      <Pagination
        page={page}
        pageSize={pageSize}
        total={filasFiltradas.length}
        onPageChange={setPage}
        onPageSizeChange={(n) => { setPageSize(n); setPage(1); }}
      />

      {modalAlta === "persona" && (
        <ModalCrearPersona empresaId={id} onCreada={alCrear} onCerrar={() => setModalAlta(null)} />
      )}
      {modalAlta === "maquinaria" && (
        <ModalCrearRecurso empresaId={id} onCreada={alCrear} onCerrar={() => setModalAlta(null)} />
      )}
    </div>
  );
};
