import React, { useEffect, useRef, useState } from "react";
import { getMandanteDisplayName } from "../../utils/mandanteDisplay";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  IdCard, Power, ListChecks, Pencil, Eye, Copy, LayoutGrid, List,
  ArrowUpDown, ArrowUp, ArrowDown, Building2, Tag, CheckCircle2, AlertTriangle,
  ChevronDown, ChevronRight, Users, Truck,
} from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { perfilParticipacionService } from "../../services/perfilParticipacionService";
import { mandanteService } from "../../services/mandanteService";
import { duplicarPerfilParticipacion } from "../../utils/duplicarPerfilParticipacion";
import { PageHeader } from "../../components/shared/PageHeader";
import { ErrorBanner } from "../../components/shared/ErrorBanner";
import { FilterBar } from "../../components/shared/FilterBar";
import { DataTable } from "../../components/shared/DataTable";
import { EntityIconTile } from "../../components/shared/EntityIconTile";
import { StatusBadge, MAPA_ACTIVO_INACTIVO } from "../../components/shared/StatusBadge";
import { ActionButton } from "../../components/shared/ActionButton";
import { RowActionsMenu } from "../../components/shared/RowActionsMenu";
import { Pagination } from "../../components/shared/Pagination";
import { MandanteChip } from "../../components/shared/MandanteChip";

const SortHeader = ({ label, sortKeyOf, sortKey, sortDir, onSort }) => {
  const activo = sortKey === sortKeyOf;
  const Icon = activo ? (sortDir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <button
      type="button"
      onClick={() => onSort(sortKeyOf)}
      className="inline-flex items-center gap-1 hover:text-slate-600 transition-colors"
    >
      {label}
      <Icon className={`w-3 h-3 ${activo ? "text-primary" : "text-slate-300"}`} />
    </button>
  );
};

const ROLES_MANDANTE_UNICO = ["mandante_admin", "mandante_lector"];

// Dispara la carga del resumen de un Perfil (desglose de Requerimientos
// por tipoEntidad) una sola vez por fila visible, sin renderizar
// nada — mismo patrón que CargadorResumen en EmpresasListPage.jsx.
const CargadorResumen = ({ perfilId, onNecesitaCargar }) => {
  useEffect(() => {
    onNecesitaCargar(perfilId);
  }, [perfilId, onNecesitaCargar]);
  return null;
};

// Desglose compacto de Requerimientos vinculados por nivel de aplicación
// (Empresa/Persona/Maquinaria) — `resumen` es `undefined` mientras carga,
// `null` si la carga falló.
const RequerimientosPorNivel = ({ resumen }) => {
  if (resumen === undefined) {
    return <span className="text-[11px] text-slate-400">…</span>;
  }
  if (resumen === null) {
    return <span className="text-[11px] text-slate-400 italic">-</span>;
  }
  const { empresa = 0, persona = 0, recurso = 0 } = resumen.requerimientosPorTipo || {};
  return (
    <div className="flex items-center gap-3 text-[11px] font-bold text-slate-500">
      <span className="inline-flex items-center gap-1" title="Requerimientos de nivel Empresa">
        <Building2 className="w-3 h-3 text-slate-400" /> {empresa}
      </span>
      <span className="inline-flex items-center gap-1" title="Requerimientos de nivel Persona">
        <Users className="w-3 h-3 text-slate-400" /> {persona}
      </span>
      <span className="inline-flex items-center gap-1" title="Requerimientos de nivel Maquinaria">
        <Truck className="w-3 h-3 text-slate-400" /> {recurso}
      </span>
    </div>
  );
};

export const PerfilesParticipacionListPage = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const puedeEscribir = ["superadmin", "mandante_admin"].includes(profile?.rol);
  const esRolMandanteUnico = ROLES_MANDANTE_UNICO.includes(profile?.rol);
  // Permite llegar con el filtro Mandante ya aplicado (ej. desde el
  // enlace "Ver todos los perfiles del mandante" en el detalle de un
  // Perfil) — solo se lee al montar, no se sincroniza de vuelta a la URL.
  const [searchParams] = useSearchParams();

  const [perfiles, setPerfiles] = useState([]);
  const [mandantesCache, setMandantesCache] = useState({});
  const mandantesEnCursoRef = useRef(new Set());
  const [resumenesMap, setResumenesMap] = useState({});
  const resumenesEnCursoRef = useRef(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filtroEstado, setFiltroEstado] = useState("");
  const [filtroMandante, setFiltroMandante] = useState(searchParams.get("mandante") || "");
  const [searchTerm, setSearchTerm] = useState("");
  const [toggleandoId, setToggleandoId] = useState(null);
  const [duplicandoId, setDuplicandoId] = useState(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [vista, setVista] = useState("agrupado");
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState("asc");
  const [gruposExpandidosIds, setGruposExpandidosIds] = useState(() => new Set());

  // KPI sobre el alcance completo del actor (perfilesTodos, sin el
  // filtro de Estado de la tabla) — mismo criterio ya usado en
  // Dashboard/Proyectos/Empresas/Personas/Recursos.
  const [perfilesTodos, setPerfilesTodos] = useState([]);
  const [cargandoPerfilesTodos, setCargandoPerfilesTodos] = useState(true);

  const cargarPerfiles = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await perfilParticipacionService.listar({ estado: filtroEstado || undefined });
      setPerfiles(data || []);
    } catch (err) {
      console.error("Error al cargar perfiles de participación:", err);
      setError(err.message || "Error al obtener la lista de perfiles de participación.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarPerfiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroEstado]);

  useEffect(() => {
    perfilParticipacionService.listar({})
      .then((data) => setPerfilesTodos(data || []))
      .catch((err) => console.error("Error al cargar perfiles de participación:", err))
      .finally(() => setCargandoPerfilesTodos(false));
  }, []);

  const obtenerResumen = (perfilId) => {
    if (perfilId in resumenesMap || resumenesEnCursoRef.current.has(perfilId)) return;
    resumenesEnCursoRef.current.add(perfilId);
    perfilParticipacionService
      .obtenerResumen(perfilId)
      .then((data) => setResumenesMap((prev) => ({ ...prev, [perfilId]: data })))
      .catch(() => setResumenesMap((prev) => ({ ...prev, [perfilId]: null })))
      .finally(() => resumenesEnCursoRef.current.delete(perfilId));
  };

  const handleToggleEstado = async (item) => {
    setToggleandoId(item.id);
    try {
      if (item.estado === "activo") {
        await perfilParticipacionService.desactivar(item.id);
      } else {
        await perfilParticipacionService.actualizar(item.id, { estado: "activo" });
      }
      await cargarPerfiles();
    } catch (err) {
      console.error("Error al cambiar estado del perfil:", err);
      setError(err.message || "No se pudo cambiar el estado del perfil.");
    } finally {
      setToggleandoId(null);
    }
  };

  const handleDuplicar = async (item) => {
    if (!window.confirm(
      `¿Duplicar el Perfil "${item.nombre}"? Se creará una copia con los mismos Requerimientos vinculados.`,
    )) return;
    setDuplicandoId(item.id);
    setError(null);
    try {
      const nuevo = await duplicarPerfilParticipacion(item);
      navigate(`/perfiles-participacion/${nuevo.id}`);
    } catch (err) {
      console.error("Error al duplicar el perfil:", err);
      setError(err.message || "No se pudo duplicar el perfil.");
    } finally {
      setDuplicandoId(null);
    }
  };

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  useEffect(() => {
    setPage(1);
  }, [filtroEstado, filtroMandante, searchTerm]);

  const perfilesFiltrados = perfiles.filter((p) => {
    const term = searchTerm.toLowerCase();
    const mandanteNombre = mandantesCache[p.mandanteId]?.nombre || "";
    const matchTerm =
      p.nombre?.toLowerCase().includes(term) ||
      p.descripcion?.toLowerCase().includes(term) ||
      mandanteNombre.toLowerCase().includes(term);
    const matchMandante = !filtroMandante || p.mandanteId === filtroMandante;
    return matchTerm && matchMandante;
  });

  const perfilesOrdenados = [...perfilesFiltrados].sort((a, b) => {
    if (!sortKey) return 0;
    let va = "";
    let vb = "";
    if (sortKey === "nombre") { va = a.nombre || ""; vb = b.nombre || ""; }
    else if (sortKey === "mandante") { va = mandantesCache[a.mandanteId]?.nombre || ""; vb = mandantesCache[b.mandanteId]?.nombre || ""; }
    else if (sortKey === "estado") { va = a.estado || ""; vb = b.estado || ""; }
    const cmp = va.localeCompare(vb, "es");
    return sortDir === "asc" ? cmp : -cmp;
  });

  const perfilesPaginados = perfilesOrdenados.slice((page - 1) * pageSize, page * pageSize);

  // Botones de Acciones — reutilizados TAL CUAL por la vista de lista y
  // la vista agrupada, para no duplicar la lógica de permisos
  // (puedeEscribir) ni las acciones disponibles.
  const renderAcciones = (item) => (
    <div className="flex items-center gap-2 flex-wrap">
      <ActionButton as={Link} to={`/perfiles-participacion/${item.id}`} icon={Eye}>
        Ver
      </ActionButton>
      {puedeEscribir && (
        <ActionButton as={Link} to={`/perfiles-participacion/${item.id}/editar`} icon={Pencil}>
          Editar
        </ActionButton>
      )}
      <ActionButton as={Link} to={`/perfiles-participacion/${item.id}/requerimientos`} icon={ListChecks}>
        Configurar
      </ActionButton>
      {puedeEscribir && (
        <RowActionsMenu
          actions={[
            { label: "Duplicar perfil", icon: Copy, disabled: duplicandoId === item.id, onClick: () => handleDuplicar(item) },
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
  );

  // Vista agrupada por Mandante: agrupa `perfilesFiltrados` (respeta los
  // mismos filtros de Estado/Mandante/búsqueda que la tabla plana) por
  // mandanteId, ordenado alfabéticamente por nombre de Mandante. Sin
  // paginación propia — se listan todos los perfiles de cada grupo.
  const gruposPorMandante = Object.values(
    perfilesFiltrados.reduce((acc, p) => {
      const id = p.mandanteId || "sin-mandante";
      if (!acc[id]) acc[id] = { mandanteId: p.mandanteId, perfiles: [] };
      acc[id].perfiles.push(p);
      return acc;
    }, {}),
  )
    .map((g) => {
      // `resuelto` distingue "todavía no llegó la respuesta de
      // GET /mandantes/:id" (mandanteId ausente del cache → mostrar
      // skeleton) de "ya resolvió, con o sin nombre real" — antes se
      // usaba `|| g.mandanteId` como fallback INMEDIATO, que mostraba el
      // ID crudo durante toda la carga, no solo si la llamada fallaba.
      const resuelto = Boolean(g.mandanteId) && g.mandanteId in mandantesCache;
      return {
        ...g,
        resuelto,
        nombre: resuelto ? mandantesCache[g.mandanteId].nombre : (g.mandanteId || "Sin Mandante"),
        logoUrl: resuelto ? mandantesCache[g.mandanteId].logoUrl : null,
        tiposDistintos: new Set(g.perfiles.map((p) => p.nombre)).size,
        activosCount: g.perfiles.filter((p) => p.estado === "activo").length,
        inactivosCount: g.perfiles.filter((p) => p.estado === "inactivo").length,
      };
    })
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

  const grupoEstaExpandido = (mandanteId) =>
    gruposPorMandante.length === 1 || gruposExpandidosIds.has(mandanteId);

  const toggleGrupo = (mandanteId) => {
    setGruposExpandidosIds((prev) => {
      const next = new Set(prev);
      if (next.has(mandanteId)) next.delete(mandanteId);
      else next.add(mandanteId);
      return next;
    });
  };

  // Resuelve TODOS los mandanteId distintos del listado completo (no solo
  // la página visible) — alimenta la columna Mandante y el filtro
  // "Mandante", vía GET /mandantes/:id (el único endpoint de Mandante al
  // que "evaluador" tiene acceso; el listado completo es solo superadmin/
  // admin_comercial), con una cache que evita pedir el mismo dos veces.
  const idsDistintosKey = [...new Set(perfilesTodos.map((p) => p.mandanteId).filter(Boolean))].join(",");

  useEffect(() => {
    if (!idsDistintosKey) return;
    const idsVisibles = [...new Set(idsDistintosKey.split(","))];
    const idsFaltantes = idsVisibles.filter(
      (id) => !(id in mandantesCache) && !mandantesEnCursoRef.current.has(id),
    );
    if (idsFaltantes.length === 0) return;

    idsFaltantes.forEach((id) => mandantesEnCursoRef.current.add(id));
    Promise.all(
      idsFaltantes.map((id) =>
        mandanteService
          .obtenerPorId(id)
          .then((data) => [id, { nombre: getMandanteDisplayName(data) || id, logoUrl: data?.logoUrl || null }])
          .catch(() => [id, { nombre: id, logoUrl: null }]),
      ),
    ).then((pares) => {
      setMandantesCache((prev) => {
        const next = { ...prev };
        pares.forEach(([id, info]) => { next[id] = info; });
        return next;
      });
      idsFaltantes.forEach((id) => mandantesEnCursoRef.current.delete(id));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsDistintosKey]);

  // KPIs
  const totalPerfiles = perfilesTodos.length;
  const mandantesDistintos = new Set(perfilesTodos.map((p) => p.mandanteId)).size;
  const tiposDistintos = new Set(perfilesTodos.map((p) => p.nombre)).size;
  const activosCount = perfilesTodos.filter((p) => p.estado === "activo").length;
  const inactivosCount = perfilesTodos.filter((p) => p.estado === "inactivo").length;
  const pctDelTotal = (n) => (totalPerfiles > 0 ? Math.round((n / totalPerfiles) * 100) : 0);

  const kpiCards = [
    {
      key: "total", title: "Total de Perfiles", icon: IdCard,
      color: "text-primary-dark", bg: "bg-primary-lighter",
      loading: cargandoPerfilesTodos, value: totalPerfiles, subtexto: "Activos en el sistema",
    },
    {
      key: "mandantes", title: "Mandantes", icon: Building2,
      color: "text-violet-600", bg: "bg-violet-100",
      loading: cargandoPerfilesTodos, value: mandantesDistintos, subtexto: "Con perfiles definidos",
    },
    {
      key: "tipos", title: "Tipos de Participación", icon: Tag,
      color: "text-sky-600", bg: "bg-sky-100",
      loading: cargandoPerfilesTodos, value: tiposDistintos, subtexto: "Disponibles",
    },
    {
      key: "activos", title: "Perfiles Activos", icon: CheckCircle2,
      color: "text-sage-dark", bg: "bg-sage-lighter",
      loading: cargandoPerfilesTodos, value: activosCount,
      // Sin subtexto cuando es 100% (no hay inactivos) — el "% del
      // total" no aporta nada en ese caso.
      subtexto: inactivosCount > 0 ? `${pctDelTotal(activosCount)}% del total` : null,
    },
    {
      key: "inactivos", title: "Perfiles Inactivos", icon: AlertTriangle,
      color: "text-red-600", bg: "bg-red-100",
      loading: cargandoPerfilesTodos, value: inactivosCount, subtexto: `${pctDelTotal(inactivosCount)}% del total`,
    },
  ];

  const columns = [
    { key: "nombre", label: "Nombre" },
    { key: "mandante", label: "Mandante" },
    { key: "requerimientos", label: "Requerimientos" },
    { key: "estado", label: "Estado" },
    { key: "acciones", label: "Acciones" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Perfiles de Participación"
        icon={IdCard}
        subtitle="Tipos de participación definidos por cada Mandante."
        loading={loading}
        onRefresh={cargarPerfiles}
        action={puedeEscribir ? { to: "/perfiles-participacion/nuevo", label: "Nuevo Perfil" } : null}
      />

      <ErrorBanner message={error} />

      {/* Tarjetas KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-5">
        {kpiCards.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.key} className="bg-white p-5 rounded-2xl border border-slate-100 shadow-card">
              <div className={`w-11 h-11 rounded-xl ${item.bg} ${item.color} flex items-center justify-center font-bold mb-4`}>
                <Icon className="w-5 h-5" />
              </div>
              {item.loading ? (
                <div className="h-8 w-14 rounded-lg bg-slate-100 animate-pulse" />
              ) : (
                <h3 className="text-2xl font-black text-carbon-dark tracking-tight">{item.value}</h3>
              )}
              <p className="text-xs font-semibold text-slate-500 mt-0.5">{item.title}</p>
              {!item.loading && item.subtexto && (
                <p className="text-[11px] font-bold text-slate-400 mt-1.5">{item.subtexto}</p>
              )}
            </div>
          );
        })}
      </div>

      <FilterBar
        searchValue={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="Buscar por nombre, mandante o descripción..."
        filters={[
          ...(esRolMandanteUnico ? [] : [{
            label: "Mandante",
            value: filtroMandante,
            onChange: setFiltroMandante,
            options: [
              { value: "", label: "Todos" },
              ...Object.entries(mandantesCache).map(([id, info]) => ({ value: id, label: info.nombre })),
            ],
          }]),
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
        ]}
      />

      <div className="flex items-center justify-end gap-1">
        <button
          type="button"
          onClick={() => setVista("lista")}
          title="Vista en lista"
          className={`p-2 rounded-lg border transition-colors ${vista === "lista" ? "bg-primary-lighter border-primary-light text-primary-dark" : "bg-white border-slate-200 text-slate-400 hover:bg-slate-50"}`}
        >
          <List className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => setVista("grilla")}
          title="Vista en grilla"
          className={`p-2 rounded-lg border transition-colors ${vista === "grilla" ? "bg-primary-lighter border-primary-light text-primary-dark" : "bg-white border-slate-200 text-slate-400 hover:bg-slate-50"}`}
        >
          <LayoutGrid className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => setVista("agrupado")}
          title="Vista agrupada por Mandante"
          className={`p-2 rounded-lg border transition-colors ${vista === "agrupado" ? "bg-primary-lighter border-primary-light text-primary-dark" : "bg-white border-slate-200 text-slate-400 hover:bg-slate-50"}`}
        >
          <Building2 className="w-4 h-4" />
        </button>
      </div>

      {vista === "lista" ? (
        <DataTable
          columns={columns.map((c) => {
            if (c.key === "nombre") return { ...c, label: <SortHeader label="Nombre" sortKeyOf="nombre" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} /> };
            if (c.key === "mandante") return { ...c, label: <SortHeader label="Mandante" sortKeyOf="mandante" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} /> };
            if (c.key === "estado") return { ...c, label: <SortHeader label="Estado" sortKeyOf="estado" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} /> };
            return c;
          })}
          data={perfilesPaginados}
          loading={loading}
          loadingLabel="Cargando perfiles de participación..."
          emptyLabel="No se encontraron perfiles de participación registrados."
          renderRow={(item) => (
            <tr key={item.id} className="hover:bg-slate-50/60 transition-colors">
              <td className="py-4 px-6">
                <div className="flex items-center gap-3">
                  <EntityIconTile icon={IdCard} />
                  <p className="font-bold text-carbon-dark">{item.nombre}</p>
                </div>
              </td>
              <td className="py-4 px-6 text-slate-600 font-medium">
                {item.mandanteId in mandantesCache ? (
                  <MandanteChip
                    nombre={mandantesCache[item.mandanteId].nombre}
                    logoUrl={mandantesCache[item.mandanteId].logoUrl}
                  />
                ) : (
                  <span className="inline-flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-slate-100 animate-pulse shrink-0" />
                    <span className="h-3.5 w-24 rounded bg-slate-100 animate-pulse" />
                  </span>
                )}
              </td>
              <td className="py-4 px-6">
                <CargadorResumen perfilId={item.id} onNecesitaCargar={obtenerResumen} />
                <RequerimientosPorNivel resumen={resumenesMap[item.id]} />
              </td>
              <td className="py-4 px-6">
                <StatusBadge value={item.estado} map={MAPA_ACTIVO_INACTIVO} />
              </td>
              <td className="py-4 px-6">
                {renderAcciones(item)}
              </td>
            </tr>
          )}
        />
      ) : vista === "grilla" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
          {loading ? (
            <div className="col-span-full py-10 text-center text-slate-400 text-xs">Cargando perfiles...</div>
          ) : perfilesPaginados.length === 0 ? (
            <div className="col-span-full py-10 text-center text-slate-400 text-xs">No se encontraron perfiles de participación registrados.</div>
          ) : (
            perfilesPaginados.map((item) => (
              <div key={item.id} className="bg-white p-5 rounded-2xl border border-slate-100 shadow-card space-y-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <EntityIconTile icon={IdCard} />
                    <div className="min-w-0">
                      <Link to={`/perfiles-participacion/${item.id}`} className="font-bold text-carbon-dark hover:text-primary transition-colors truncate block">
                        {item.nombre}
                      </Link>
                      {item.mandanteId in mandantesCache ? (
                        <MandanteChip
                          nombre={mandantesCache[item.mandanteId].nombre}
                          logoUrl={mandantesCache[item.mandanteId].logoUrl}
                        />
                      ) : (
                        <span className="inline-flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full bg-slate-100 animate-pulse shrink-0" />
                          <span className="h-3.5 w-24 rounded bg-slate-100 animate-pulse" />
                        </span>
                      )}
                    </div>
                  </div>
                  <StatusBadge value={item.estado} map={MAPA_ACTIVO_INACTIVO} />
                </div>
                <div className="pt-1 border-t border-slate-100">
                  <CargadorResumen perfilId={item.id} onNecesitaCargar={obtenerResumen} />
                  <RequerimientosPorNivel resumen={resumenesMap[item.id]} />
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <Link
                    to={`/perfiles-participacion/${item.id}`}
                    className="flex-1 text-center px-3 py-2 rounded-xl bg-slate-50 hover:bg-slate-100 text-xs font-bold text-carbon-dark transition-colors"
                  >
                    Ver
                  </Link>
                  {puedeEscribir && (
                    <Link
                      to={`/perfiles-participacion/${item.id}/editar`}
                      className="flex-1 text-center px-3 py-2 rounded-xl bg-primary-lighter hover:bg-primary/10 text-xs font-bold text-primary-dark transition-colors"
                    >
                      Editar
                    </Link>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        // Vista agrupada por Mandante — sin paginación propia, lista
        // todos los perfiles de cada grupo (ver `gruposPorMandante`).
        <div className="space-y-4">
          {loading ? (
            <div className="py-10 text-center text-slate-400 text-xs">Cargando perfiles...</div>
          ) : gruposPorMandante.length === 0 ? (
            <div className="py-10 text-center text-slate-400 text-xs">No se encontraron perfiles de participación registrados.</div>
          ) : (
            gruposPorMandante.map((grupo) => {
              const expandido = grupoEstaExpandido(grupo.mandanteId);
              return (
                <div key={grupo.mandanteId || "sin-mandante"} className="bg-white rounded-2xl border border-slate-100 shadow-card overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggleGrupo(grupo.mandanteId)}
                    disabled={gruposPorMandante.length === 1}
                    className="w-full flex items-center justify-between gap-4 px-6 py-4 hover:bg-slate-50/60 transition-colors disabled:cursor-default"
                  >
                    {grupo.resuelto ? (
                      <MandanteChip nombre={grupo.nombre} logoUrl={grupo.logoUrl} />
                    ) : (
                      <span className="inline-flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-slate-100 animate-pulse shrink-0" />
                        <span className="h-3.5 w-32 rounded bg-slate-100 animate-pulse" />
                      </span>
                    )}
                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <p className="text-sm font-black text-carbon-dark">{grupo.tiposDistintos}</p>
                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Tipos</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-black text-sage-dark">{grupo.activosCount}</p>
                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Activos</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-black text-red-600">{grupo.inactivosCount}</p>
                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Inactivos</p>
                      </div>
                      {gruposPorMandante.length > 1 && (
                        expandido
                          ? <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                          : <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                      )}
                    </div>
                  </button>
                  {expandido && (
                    <div className="border-t border-slate-100">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-slate-50/75 border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                            <th className="py-3 px-6">Tipo de Participación</th>
                            <th className="py-3 px-6">Requerimientos</th>
                            <th className="py-3 px-6">Estado</th>
                            <th className="py-3 px-6">Acciones</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {grupo.perfiles.map((item) => (
                            <tr key={item.id} className="hover:bg-slate-50/60 transition-colors">
                              <td className="py-3.5 px-6">
                                <div className="flex items-center gap-3">
                                  <EntityIconTile icon={IdCard} />
                                  <p className="font-bold text-carbon-dark">{item.nombre}</p>
                                </div>
                              </td>
                              <td className="py-3.5 px-6">
                                <CargadorResumen perfilId={item.id} onNecesitaCargar={obtenerResumen} />
                                <RequerimientosPorNivel resumen={resumenesMap[item.id]} />
                              </td>
                              <td className="py-3.5 px-6">
                                <StatusBadge value={item.estado} map={MAPA_ACTIVO_INACTIVO} />
                              </td>
                              <td className="py-3.5 px-6">
                                {renderAcciones(item)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {vista !== "agrupado" && (
      <Pagination
        page={page}
        pageSize={pageSize}
        total={perfilesOrdenados.length}
        onPageChange={setPage}
        onPageSizeChange={(n) => { setPageSize(n); setPage(1); }}
      />
      )}
    </div>
  );
};
