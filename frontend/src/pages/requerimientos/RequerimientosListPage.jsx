import React, { useEffect, useState } from "react";
import { getMandanteDisplayName } from "../../utils/mandanteDisplay";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  ClipboardCheck, Power, Pencil, Eye, CheckCircle2, EyeOff, Clock,
} from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { requerimientoService, TIPOS_ENTIDAD } from "../../services/requerimientoService";
import { mandanteService } from "../../services/mandanteService";
import { MandantesCelda } from "../../components/shared/MandantesCelda";
import { formatFecha } from "../../utils/fechaFormatters";
import { PageHeader } from "../../components/shared/PageHeader";
import { ErrorBanner } from "../../components/shared/ErrorBanner";
import { FilterBar } from "../../components/shared/FilterBar";
import { DataTable } from "../../components/shared/DataTable";
import { EntityIconTile } from "../../components/shared/EntityIconTile";
import { StatusBadge, MAPA_ACTIVO_INACTIVO } from "../../components/shared/StatusBadge";
import { ActionButton } from "../../components/shared/ActionButton";
import { RowActionsMenu } from "../../components/shared/RowActionsMenu";
import { Pagination } from "../../components/shared/Pagination";

const ORDENES = [
  { value: "recientes", label: "Más recientes primero" },
  { value: "nombre", label: "Nombre (A-Z)" },
];

const PALABRAS_CLAVE = [
  "Certificado", "Registro", "Listado", "Declaración",
  "Procedimiento", "Reglamento", "Recepción",
];

const createdAtMillis = (item) => {
  if (item.createdAt?._seconds) return item.createdAt._seconds * 1000;
  if (item.createdAt) return new Date(item.createdAt).getTime() || 0;
  return 0;
};

export const RequerimientosListPage = () => {
  const { profile } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const puedeEscribir = ["superadmin", "mandante_admin"].includes(profile?.rol);

  const [requerimientos, setRequerimientos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filtroEstado, setFiltroEstado] = useState("");
  // Al volver de "Editar" (RequerimientoFormPage.jsx) hay que quedar en la MISMA pestaña del
  // Requerimiento editado, no siempre en la primera — viaja en location.state, se limpia enseguida
  // (mismo patrón que el resaltado de fila recién creada en PerfilesRecursoListPage.jsx) para que
  // no sobreviva a una recarga ni quede pegado en visitas futuras.
  const [activeTab, setActiveTab] = useState(location.state?.nivelActivo || TIPOS_ENTIDAD[0]?.value);
  const [searchTerm, setSearchTerm] = useState("");
  const [ordenarPor, setOrdenarPor] = useState("recientes");
  const [filtroMandante, setFiltroMandante] = useState("");
  // Uso por Mandante { [requerimientoId]: mandanteIds[] }: única fuente de la columna
  // "Mandantes" y del filtro por Mandante. `undefined` = todavía cargando.
  const [usoMandantes, setUsoMandantes] = useState(undefined);
  const [mandantesInfo, setMandantesInfo] = useState({}); // id -> { nombre, logoUrl }
  const [toggleandoId, setToggleandoId] = useState(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    if (!location.state?.nivelActivo) return;
    navigate(location.pathname, { replace: true, state: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cargarRequerimientos = async () => {
    setLoading(true);
    setError(null);
    try {
      // Sin filtro de nivel en el server: las pestañas necesitan el conteo
      // de TODOS los niveles a la vez para mostrar "Persona (18)", etc.
      const data = await requerimientoService.listar({
        estado: filtroEstado || undefined,
      });
      setRequerimientos(data || []);
    } catch (err) {
      console.error("Error al cargar requerimientos:", err);
      setError(err.message || "Error al obtener la lista de requerimientos.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarRequerimientos();
  }, [filtroEstado]);

  useEffect(() => {
    requerimientoService.obtenerUso()
      .then(setUsoMandantes)
      .catch((err) => {
        console.error("Error al cargar el uso por Mandante:", err);
        setUsoMandantes({});
      });
  }, []);

  // Nombres de los Mandantes que aparecen en el uso (GET /mandantes/:id, accesible a todos los roles).
  const mandanteIdsKey = usoMandantes
    ? [...new Set(Object.values(usoMandantes).flat())].sort().join(",")
    : "";
  useEffect(() => {
    if (!mandanteIdsKey) return;
    Promise.all(
      mandanteIdsKey.split(",").map((id) =>
        mandanteService.obtenerPorId(id).then((m) => [id, { nombre: getMandanteDisplayName(m) || id, logoUrl: m?.logoUrl || null }]).catch(() => [id, { nombre: id, logoUrl: null }]),
      ),
    ).then((pares) => setMandantesInfo(Object.fromEntries(pares)));
  }, [mandanteIdsKey]);

  const handleToggleEstado = async (item) => {
    setToggleandoId(item.id);
    try {
      if (item.estado === "activo") {
        await requerimientoService.desactivar(item.id);
      } else {
        await requerimientoService.actualizar(item.id, { estado: "activo" });
      }
      await cargarRequerimientos();
    } catch (err) {
      console.error("Error al cambiar estado del requerimiento:", err);
      setError(err.message || "No se pudo cambiar el estado del requerimiento.");
    } finally {
      setToggleandoId(null);
    }
  };

  useEffect(() => {
    setPage(1);
  }, [filtroEstado, activeTab, searchTerm, ordenarPor, filtroMandante]);

  const requerimientosDelNivel = requerimientos.filter((r) => r.tipoEntidad === activeTab);

  const requerimientosDelNivelYMandante = requerimientosDelNivel.filter((r) => (
    !filtroMandante || (usoMandantes?.[r.id] || []).includes(filtroMandante)
  ));

  const requerimientosFiltrados = requerimientosDelNivelYMandante.filter((r) => {
    const term = searchTerm.toLowerCase();
    return (
      r.nombre?.toLowerCase().includes(term) ||
      r.nombreCorto?.toLowerCase().includes(term) ||
      r.descripcion?.toLowerCase().includes(term)
    );
  });

  const requerimientosOrdenados = [...requerimientosFiltrados].sort((a, b) => {
    if (ordenarPor === "nombre") {
      return (a.nombreCorto || a.nombre || "").localeCompare(b.nombreCorto || b.nombre || "", "es");
    }
    return createdAtMillis(b) - createdAtMillis(a);
  });

  const requerimientosPaginados = requerimientosOrdenados.slice((page - 1) * pageSize, page * pageSize);

  const handleChipClick = (palabra) => {
    setSearchTerm((prev) => (prev.toLowerCase() === palabra.toLowerCase() ? "" : palabra));
  };

  // KPI sobre el catálogo completo (todos los niveles, ya cargado en
  // `requerimientos` — sin llamada nueva). "Requieren Vencimiento" es un
  // campo real (requiereVencimiento) que hoy no se mostraba en ningún
  // lado como cifra agregada.
  const totalRequerimientos = requerimientos.length;
  const activosCount = requerimientos.filter((r) => r.estado === "activo").length;
  const inactivosCount = requerimientos.filter((r) => r.estado === "inactivo").length;
  const requierenVencimientoCount = requerimientos.filter((r) => r.requiereVencimiento).length;

  const kpiCards = [
    { key: "total", title: "Total Requerimientos", icon: ClipboardCheck, color: "text-primary-dark", bg: "bg-primary-lighter", value: totalRequerimientos },
    { key: "activos", title: "Activos", icon: CheckCircle2, color: "text-sage-dark", bg: "bg-sage-lighter", value: activosCount },
    { key: "inactivos", title: "Inactivos", icon: EyeOff, color: "text-slate-500", bg: "bg-slate-100", value: inactivosCount },
    { key: "vencimiento", title: "Requieren Vencimiento", icon: Clock, color: "text-amber-600", bg: "bg-amber-100", value: requierenVencimientoCount },
  ];

  const columns = [
    { key: "numero", label: "#" },
    { key: "requerimiento", label: "Requerimiento" },
    { key: "estado", label: "Estado" },
    { key: "mandantes", label: "Mandantes" },
    { key: "ultimaActualizacion", label: "Última Actualización" },
    { key: "acciones", label: "Acciones" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Requerimientos"
        icon={ClipboardCheck}
        subtitle="Catálogo de condiciones documentales evaluables."
        loading={loading}
        onRefresh={cargarRequerimientos}
        action={puedeEscribir ? { to: "/requerimientos/nuevo", label: "Nuevo Requerimiento" } : null}
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
            </div>
          );
        })}
      </div>

      {/* Grilla de una columna con hijo `min-w-0`: sin esto, el ancho mínimo
          de la tabla empuja todo el layout y aparece scroll en la página en
          vez de dentro de la tabla (ver comentario en DataTable.jsx). */}
      <div className="grid grid-cols-1">
        <div className="min-w-0 space-y-6">
      <div className="flex gap-1 border-b border-gray-100">
        {TIPOS_ENTIDAD.map((nivel) => {
          const cantidad = requerimientos.filter((r) => r.tipoEntidad === nivel.value).length;
          const isActive = activeTab === nivel.value;
          return (
            <button
              key={nivel.value}
              type="button"
              onClick={() => setActiveTab(nivel.value)}
              className={`px-4 py-2.5 text-sm font-bold border-b-2 -mb-px transition-colors ${
                isActive ? "border-primary text-primary" : "border-transparent text-gray-400 hover:text-gray-600"
              }`}
            >
              {nivel.label}
              <span className="ml-1.5 text-[11px] font-semibold text-gray-400">({cantidad})</span>
            </button>
          );
        })}
      </div>

      <FilterBar
        searchValue={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="Buscar por nombre o descripción..."
        busquedaFlexible
        filters={[
          {
            label: "Mandante",
            conBusqueda: true,
            value: filtroMandante,
            onChange: setFiltroMandante,
            options: [
              { value: "", label: "Todos" },
              ...Object.entries(mandantesInfo)
                .map(([value, info]) => ({ value, label: info.nombre }))
                .sort((a, b) => a.label.localeCompare(b.label, "es")),
            ],
          },
          {
            label: "Estado",
            value: filtroEstado,
            onChange: setFiltroEstado,
            options: [
              { value: "", label: "Todos los estados" },
              { value: "activo", label: "Activos" },
              { value: "inactivo", label: "Inactivos" },
            ],
          },
          {
            label: "Ordenar por",
            value: ordenarPor,
            onChange: setOrdenarPor,
            options: ORDENES,
          },
        ]}
      />

      <div className="flex flex-wrap gap-2">
        {PALABRAS_CLAVE.map((palabra) => {
          const activo = searchTerm.toLowerCase() === palabra.toLowerCase();
          return (
            <button
              key={palabra}
              type="button"
              onClick={() => handleChipClick(palabra)}
              className={`px-3 py-1.5 rounded-full text-[11px] font-semibold border transition-colors ${
                activo
                  ? "bg-primary text-white border-primary"
                  : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"
              }`}
            >
              {palabra}
            </button>
          );
        })}
      </div>

      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
        Lista de Requerimientos ({requerimientosOrdenados.length})
      </p>

      <DataTable
        columns={columns}
        data={requerimientosPaginados}
        loading={loading}
        loadingLabel="Cargando requerimientos..."
        emptyLabel="No se encontraron requerimientos registrados."
        compact
        renderRow={(item, index) => (
          <tr key={item.id} className="hover:bg-slate-50/60 transition-colors">
            <td className="py-4 px-4 text-slate-400 font-bold">
              {(page - 1) * pageSize + index + 1}
            </td>
            <td className="py-4 px-4 min-w-[16rem]">
              <div className="flex items-center gap-3">
                <EntityIconTile icon={ClipboardCheck} />
                <div>
                  <p className="font-bold text-carbon-dark">{item.nombreCorto || item.nombre}</p>
                  <p className="text-[11px] text-slate-400">{item.nombre}</p>
                </div>
              </div>
            </td>
            <td className="py-4 px-4">
              <StatusBadge value={item.estado} map={MAPA_ACTIVO_INACTIVO} />
            </td>
            <td className="py-4 px-4 text-slate-600 font-medium whitespace-nowrap">
              {usoMandantes === undefined ? (
                <span className="inline-block h-3.5 w-16 rounded bg-slate-100 animate-pulse" />
              ) : (usoMandantes[item.id]?.length || 0) === 0 ? (
                <span className="text-slate-400 italic">Sin uso</span>
              ) : (
                <MandantesCelda
                  mandantes={usoMandantes[item.id]
                    .map((id) => ({ id, nombre: mandantesInfo[id]?.nombre || "…", logoUrl: mandantesInfo[id]?.logoUrl || null }))
                    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))}
                />
              )}
            </td>
            <td className="py-4 px-4 text-slate-600 font-medium">
              {formatFecha(item.updatedAt)}
            </td>
            <td className="py-4 px-4">
              <div className="flex items-center gap-2">
                <ActionButton as={Link} to={`/requerimientos/${item.id}`} icon={puedeEscribir ? Pencil : Eye}>
                  {puedeEscribir ? "Editar" : "Ver"}
                </ActionButton>
                {puedeEscribir && (
                  <RowActionsMenu
                    actions={[
                      {
                        label: item.estado === "activo" ? "Desactivar" : "Activar",
                        icon: Power,
                        disabled: toggleandoId === item.id,
                        onClick: () => handleToggleEstado(item),
                      },
                    ]}
                  />
                )}
              </div>
            </td>
          </tr>
        )}
      />

      <Pagination
        page={page}
        pageSize={pageSize}
        total={requerimientosOrdenados.length}
        onPageChange={setPage}
        onPageSizeChange={(n) => { setPageSize(n); setPage(1); }}
      />
        </div>
      </div>
    </div>
  );
};
