import React, { useEffect, useRef, useState } from "react";
import { getMandanteDisplayName } from "../../utils/mandanteDisplay";
import { Link } from "react-router-dom";
import {
  Link2, Eye, LayoutGrid, List, ArrowUpDown, ArrowUp, ArrowDown,
  Building2, Users, CalendarCheck, AlertTriangle, Search,
} from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { participacionService } from "../../services/participacionService";
import { proyectoService } from "../../services/proyectoService";
import { empresaService } from "../../services/empresaService";
import { perfilParticipacionService } from "../../services/perfilParticipacionService";
import { mandanteService } from "../../services/mandanteService";
import { formatFecha } from "../../utils/fechaFormatters";
import { NuevaParticipacionModal } from "../../components/shared/NuevaParticipacionModal";
import { PageHeader } from "../../components/shared/PageHeader";
import { ErrorBanner } from "../../components/shared/ErrorBanner";
import { DataTable } from "../../components/shared/DataTable";
import { EntityIconTile } from "../../components/shared/EntityIconTile";
import { StatusBadge, MAPA_ESTADO_PARTICIPACION } from "../../components/shared/StatusBadge";
import { ActionButton } from "../../components/shared/ActionButton";
import { Pagination } from "../../components/shared/Pagination";
import { EmpresaChip } from "../../components/shared/EmpresaChip";
import { MandanteChip } from "../../components/shared/MandanteChip";

const DIAS_VENTANA_POR_VENCER = 30;

// "Por vencer" es un badge derivado, no un estado real de Participación
// (el catálogo real es pendiente/activa/suspendida/finalizada) — se
// calcula sobre fechaTermino, que SÍ es un campo real y opcional
// (se puede fijar al crear la Participación como fecha de término
// planificada, antes de finalizarla de verdad).
const MAPA_ESTADO_PARTICIPACION_EXTENDIDO = {
  ...MAPA_ESTADO_PARTICIPACION,
  por_vencer: { label: "Por Vencer", className: "bg-amber-50 text-amber-700 border-amber-200" },
};

const diasRestantesDe = (fechaTermino) => {
  if (!fechaTermino) return null;
  const fecha = fechaTermino._seconds ? new Date(fechaTermino._seconds * 1000) : new Date(fechaTermino);
  if (isNaN(fecha.getTime())) return null;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  return Math.ceil((fecha - hoy) / (1000 * 60 * 60 * 24));
};

const esPorVencer = (item) => {
  if (item.estado !== "activa") return false;
  const dias = diasRestantesDe(item.fechaTermino);
  return dias !== null && dias >= 0 && dias <= DIAS_VENTANA_POR_VENCER;
};

const estadoVisualDe = (item) => (esPorVencer(item) ? "por_vencer" : item.estado);

const createdAtMillisFecha = (item) => {
  if (item.fechaInicio?._seconds) return item.fechaInicio._seconds * 1000;
  if (item.fechaInicio) return new Date(item.fechaInicio).getTime() || 0;
  return 0;
};

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

// Acento de color por Empresa: determinístico (hash simple del empresaId sobre una paleta
// fija), así una Empresa conserva su color entre cargas y filtros.
const PALETA_ACENTOS = ["#2563eb", "#7c3aed", "#db2777", "#ea580c", "#059669", "#0891b2", "#ca8a04", "#4f46e5"];
const colorAcentoEmpresa = (empresaId = "") => {
  let hash = 0;
  for (let i = 0; i < empresaId.length; i++) hash = (hash * 31 + empresaId.charCodeAt(i)) >>> 0;
  return PALETA_ACENTOS[hash % PALETA_ACENTOS.length];
};

export const ParticipacionesListPage = () => {
  const { profile } = useAuth();
  const puedeEscribir = ["superadmin", "mandante_admin"].includes(profile?.rol);

  const [participaciones, setParticipaciones] = useState([]);
  const [proyectosMap, setProyectosMap] = useState({});
  const [empresasMap, setEmpresasMap] = useState({});
  const [perfilesMap, setPerfilesMap] = useState({});
  const [mandantesCache, setMandantesCache] = useState({});
  const [mandantesLogos, setMandantesLogos] = useState({});
  const mandantesEnCursoRef = useRef(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filtroEstado, setFiltroEstado] = useState("");
  const [filtroMandante, setFiltroMandante] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [transicionandoId, setTransicionandoId] = useState(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [mostrandoNueva, setMostrandoNueva] = useState(false);
  const [vista, setVista] = useState("agrupado");
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState("asc");

  // KPI sobre el alcance completo del actor (participacionesTodas, sin el
  // filtro de Estado de la tabla) — mismo criterio ya usado en el resto
  // de las pantallas de esta sesión.
  const [participacionesTodas, setParticipacionesTodas] = useState([]);
  const [cargandoTodas, setCargandoTodas] = useState(true);

  const cargarParticipaciones = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await participacionService.listar({ estado: filtroEstado || undefined });
      setParticipaciones(data || []);
    } catch (err) {
      console.error("Error al cargar participaciones:", err);
      setError(err.message || "Error al obtener la lista de participaciones.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarParticipaciones();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroEstado]);

  useEffect(() => {
    setPage(1);
  }, [filtroEstado, filtroMandante, searchTerm]);

  useEffect(() => {
    proyectoService.listar({})
      .then((data) => {
        const map = {};
        (data || []).forEach((p) => { map[p.id] = `${p.nombre} (${p.codigo})`; });
        setProyectosMap(map);
      })
      .catch((err) => console.error("Error al cargar proyectos:", err));

    empresaService.listar()
      .then((data) => {
        const map = {};
        (data || []).forEach((e) => { map[e.id] = { nombre: e.razonSocial, logoUrl: e.logoUrl || null }; });
        setEmpresasMap(map);
      })
      .catch((err) => console.error("Error al cargar empresas:", err));

    perfilParticipacionService.listar({})
      .then((data) => {
        const map = {};
        (data || []).forEach((p) => { map[p.id] = p.nombre; });
        setPerfilesMap(map);
      })
      .catch((err) => console.error("Error al cargar perfiles de participación:", err));

    participacionService.listar({})
      .then((data) => setParticipacionesTodas(data || []))
      .catch((err) => console.error("Error al cargar participaciones:", err))
      .finally(() => setCargandoTodas(false));
  }, []);

  // Resuelve TODOS los mandanteId distintos del listado completo, vía
  // GET /mandantes/:id (el único endpoint al que "evaluador" tiene
  // acceso) — alimenta la columna implícita y el filtro "Mandante".
  const idsDistintosKey = [...new Set(participacionesTodas.map((p) => p.mandanteId).filter(Boolean))].join(",");

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
          .then((data) => [id, getMandanteDisplayName(data) || id, data?.logoUrl || null])
          .catch(() => [id, id, null]),
      ),
    ).then((pares) => {
      setMandantesCache((prev) => {
        const next = { ...prev };
        pares.forEach(([id, nombre]) => { next[id] = nombre; });
        return next;
      });
      setMandantesLogos((prev) => {
        const next = { ...prev };
        pares.forEach(([id, , logo]) => { next[id] = logo; });
        return next;
      });
      idsFaltantes.forEach((id) => mandantesEnCursoRef.current.delete(id));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsDistintosKey]);

  const handleTransicionar = async (id, estado, mensajeConfirmacion) => {
    if (!window.confirm(mensajeConfirmacion)) {
      return;
    }
    setTransicionandoId(id);
    try {
      await participacionService.transicionar(id, estado);
      await cargarParticipaciones();
    } catch (err) {
      console.error("Error al transicionar participación:", err);
      setError(err.message || "No se pudo actualizar la participación.");
    } finally {
      setTransicionandoId(null);
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

  const participacionesFiltradas = participaciones.filter((p) => {
    const term = searchTerm.toLowerCase();
    const proyectoLabel = proyectosMap[p.proyectoId] || "";
    const empresaLabel = empresasMap[p.empresaId]?.nombre || "";
    const perfilLabel = perfilesMap[p.perfilParticipacionId] || "";
    const mandanteLabel = mandantesCache[p.mandanteId] || "";
    const matchTerm =
      proyectoLabel.toLowerCase().includes(term) ||
      empresaLabel.toLowerCase().includes(term) ||
      perfilLabel.toLowerCase().includes(term) ||
      mandanteLabel.toLowerCase().includes(term);
    const matchMandante = !filtroMandante || p.mandanteId === filtroMandante;
    const matchEstadoDerivado = filtroEstado !== "por_vencer" || esPorVencer(p);
    return matchTerm && matchMandante && matchEstadoDerivado;
  });

  const participacionesOrdenadas = [...participacionesFiltradas].sort((a, b) => {
    if (!sortKey) return 0;
    if (sortKey === "fechaInicio") {
      const cmp = createdAtMillisFecha(a) - createdAtMillisFecha(b);
      return sortDir === "asc" ? cmp : -cmp;
    }
    let va = "";
    let vb = "";
    if (sortKey === "proyecto") { va = proyectosMap[a.proyectoId] || ""; vb = proyectosMap[b.proyectoId] || ""; }
    else if (sortKey === "empresa") { va = empresasMap[a.empresaId]?.nombre || ""; vb = empresasMap[b.empresaId]?.nombre || ""; }
    else if (sortKey === "perfil") { va = perfilesMap[a.perfilParticipacionId] || ""; vb = perfilesMap[b.perfilParticipacionId] || ""; }
    else if (sortKey === "estado") { va = estadoVisualDe(a); vb = estadoVisualDe(b); }
    const cmp = va.localeCompare(vb, "es");
    return sortDir === "asc" ? cmp : -cmp;
  });

  const participacionesPaginadas = participacionesOrdenadas.slice((page - 1) * pageSize, page * pageSize);

  // Vista "Agrupado por Empresa": agrupa sobre `participacionesFiltradas`
  // (ya respeta búsqueda/Mandante/Estado) — un grupo cuyas Participaciones
  // quedaron todas fuera del filtro simplemente no aparece, porque se
  // deriva del array ya filtrado. Ordenado alfabéticamente por nombre de
  // Empresa. Sin paginación propia: se listan todas (regla explícita de
  // "nunca requiere un clic para ver el contenido completo").
  const gruposPorEmpresa = Object.values(
    participacionesFiltradas.reduce((acc, p) => {
      const id = p.empresaId || "sin-empresa";
      if (!acc[id]) acc[id] = { empresaId: p.empresaId, participaciones: [] };
      acc[id].mandanteIds = [...new Set([...(acc[id].mandanteIds || []), p.mandanteId].filter(Boolean))];
      acc[id].participaciones.push(p);
      return acc;
    }, {}),
  )
    .map((g) => ({
      ...g,
      nombre: empresasMap[g.empresaId]?.nombre || g.empresaId || "Empresa",
      logoUrl: empresasMap[g.empresaId]?.logoUrl || null,
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

  // KPIs
  const totalParticipaciones = participacionesTodas.length;
  const mandantesDistintos = new Set(participacionesTodas.map((p) => p.mandanteId)).size;
  const empresasDistintas = new Set(participacionesTodas.map((p) => p.empresaId)).size;
  const vigentesCount = participacionesTodas.filter((p) => p.estado === "activa").length;
  const porVencerCount = participacionesTodas.filter(esPorVencer).length;

  const kpiCards = [
    {
      key: "total", title: "Total de Participaciones", icon: Link2,
      color: "text-primary-dark", bg: "bg-primary-lighter",
      loading: cargandoTodas, value: totalParticipaciones, subtexto: "Registradas en el sistema",
    },
    {
      key: "mandantes", title: "Mandantes", icon: Building2,
      color: "text-violet-600", bg: "bg-violet-100",
      loading: cargandoTodas, value: mandantesDistintos, subtexto: "Con participaciones",
    },
    {
      key: "empresas", title: "Empresas", icon: Users,
      color: "text-sky-600", bg: "bg-sky-100",
      loading: cargandoTodas, value: empresasDistintas, subtexto: "Empresas vinculadas",
    },
    {
      key: "vigentes", title: "Vigentes", icon: CalendarCheck,
      color: "text-sage-dark", bg: "bg-sage-lighter",
      loading: cargandoTodas, value: vigentesCount, subtexto: "En estado activo",
    },
    {
      key: "porVencer", title: "Por Vencer", icon: AlertTriangle,
      color: "text-amber-600", bg: "bg-amber-100",
      loading: cargandoTodas, value: porVencerCount, subtexto: "Requiere atención",
    },
  ];

  const columns = [
    { key: "proyecto", label: <SortHeader label="Proyecto" sortKeyOf="proyecto" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} /> },
    { key: "empresa", label: <SortHeader label="Empresa" sortKeyOf="empresa" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} /> },
    { key: "perfil", label: <SortHeader label="Perfil" sortKeyOf="perfil" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} /> },
    { key: "fechaInicio", label: <SortHeader label="Fecha Inicio" sortKeyOf="fechaInicio" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} /> },
    { key: "estado", label: <SortHeader label="Estado" sortKeyOf="estado" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} /> },
    { key: "acciones", label: "Acciones" },
  ];

  const renderAcciones = (item) => (
    <div className="flex items-center gap-2 flex-wrap">
      <ActionButton as={Link} to={`/participaciones/${item.id}`} icon={Eye}>
        Ver
      </ActionButton>
      {puedeEscribir && item.estado === "activa" && (
        <ActionButton
          busy={transicionandoId === item.id}
          busyLabel="..."
          onClick={() => handleTransicionar(
            item.id,
            "suspendida",
            "¿Suspender esta Participación? Podrás reactivarla después.",
          )}
        >
          Suspender
        </ActionButton>
      )}
      {puedeEscribir && item.estado === "suspendida" && (
        <ActionButton
          busy={transicionandoId === item.id}
          busyLabel="..."
          onClick={() => handleTransicionar(item.id, "activa", "¿Reactivar esta Participación?")}
        >
          Reactivar
        </ActionButton>
      )}
      {puedeEscribir && ["activa", "suspendida", "pendiente"].includes(item.estado) && (
        <ActionButton
          busy={transicionandoId === item.id}
          busyLabel="..."
          onClick={() => handleTransicionar(
            item.id,
            "finalizada",
            "¿Finalizar esta Participación? No podrá revertirse ni editarse después.",
          )}
        >
          Finalizar
        </ActionButton>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Participaciones"
        icon={Link2}
        subtitle="Vinculación de Empresas a Proyectos bajo un Perfil de Participación."
        loading={loading}
        onRefresh={cargarParticipaciones}
        action={puedeEscribir ? { onClick: () => setMostrandoNueva(true), label: "Nueva Participación" } : null}
      />

      {mostrandoNueva && (
        <NuevaParticipacionModal
          onCerrar={() => setMostrandoNueva(false)}
          onCreada={() => { setMostrandoNueva(false); cargarParticipaciones(); }}
        />
      )}

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
              {!item.loading && (
                <p className="text-[11px] font-bold text-slate-400 mt-1.5">{item.subtexto}</p>
              )}
            </div>
          );
        })}
      </div>

      {/*
        Fila de búsqueda/filtros propia de esta pantalla (no se usa el
        FilterBar.jsx compartido, que tiene el buscador a un ancho fijo
        `w-72`) — acá el buscador es `flex-1` para ocupar la mayor parte
        del ancho disponible, dejando los selectores a la derecha.
      */}
      <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-card flex flex-col lg:flex-row items-center gap-3">
        <div className="relative w-full lg:flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por proyecto, empresa, mandante o perfil..."
            className="w-full pl-10 pr-3.5 py-2 bg-slate-50/50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
          />
        </div>
        <div className="flex items-center gap-3 w-full lg:w-auto flex-wrap">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <span className="text-xs font-semibold text-slate-500">Mandante:</span>
            <select
              value={filtroMandante}
              onChange={(e) => setFiltroMandante(e.target.value)}
              className="px-3 py-2 bg-slate-50/50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
            >
              <option value="">Todos</option>
              {Object.entries(mandantesCache).map(([id, nombre]) => (
                <option key={id} value={id}>{nombre}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <span className="text-xs font-semibold text-slate-500">Estado:</span>
            <select
              value={filtroEstado}
              onChange={(e) => setFiltroEstado(e.target.value)}
              className="px-3 py-2 bg-slate-50/50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
            >
              <option value="">Todos los estados</option>
              <option value="pendiente">Pendientes</option>
              <option value="activa">Activas</option>
              <option value="por_vencer">Por Vencer</option>
              <option value="suspendida">Suspendidas</option>
              <option value="finalizada">Finalizadas</option>
            </select>
          </div>
        </div>
      </div>

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
          title="Vista agrupada por Empresa"
          className={`p-2 rounded-lg border transition-colors ${vista === "agrupado" ? "bg-primary-lighter border-primary-light text-primary-dark" : "bg-white border-slate-200 text-slate-400 hover:bg-slate-50"}`}
        >
          <Building2 className="w-4 h-4" />
        </button>
      </div>

      {vista === "lista" ? (
        <DataTable
          columns={columns}
          data={participacionesPaginadas}
          loading={loading}
          loadingLabel="Cargando participaciones..."
          emptyLabel="No se encontraron participaciones registradas."
          renderRow={(item) => (
            <tr key={item.id} className="hover:bg-slate-50/60 transition-colors">
              <td className="py-4 px-6">
                <div className="flex items-center gap-3">
                  <EntityIconTile icon={Link2} />
                  <p className="font-bold text-carbon-dark">{proyectosMap[item.proyectoId] || item.proyectoId}</p>
                </div>
              </td>
              <td className="py-4 px-6 text-slate-600 font-medium">
                <EmpresaChip
                  nombre={empresasMap[item.empresaId]?.nombre || item.empresaId}
                  logoUrl={empresasMap[item.empresaId]?.logoUrl}
                />
              </td>
              <td className="py-4 px-6 text-slate-600 font-medium">
                {perfilesMap[item.perfilParticipacionId] || item.perfilParticipacionId}
              </td>
              <td className="py-4 px-6 text-slate-600 font-medium">
                {formatFecha(item.fechaInicio)}
              </td>
              <td className="py-4 px-6">
                <StatusBadge value={estadoVisualDe(item)} map={MAPA_ESTADO_PARTICIPACION_EXTENDIDO} />
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
            <div className="col-span-full py-10 text-center text-slate-400 text-xs">Cargando participaciones...</div>
          ) : participacionesPaginadas.length === 0 ? (
            <div className="col-span-full py-10 text-center text-slate-400 text-xs">No se encontraron participaciones registradas.</div>
          ) : (
            participacionesPaginadas.map((item) => (
              <div key={item.id} className="bg-white p-5 rounded-2xl border border-slate-100 shadow-card space-y-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <EntityIconTile icon={Link2} />
                    <div className="min-w-0">
                      <Link to={`/participaciones/${item.id}`} className="font-bold text-carbon-dark hover:text-primary transition-colors truncate block">
                        {proyectosMap[item.proyectoId] || item.proyectoId}
                      </Link>
                      <p className="text-[11px] text-slate-400 truncate">
                        <EmpresaChip
                          nombre={empresasMap[item.empresaId]?.nombre || item.empresaId}
                          logoUrl={empresasMap[item.empresaId]?.logoUrl}
                        />
                      </p>
                    </div>
                  </div>
                  <StatusBadge value={estadoVisualDe(item)} map={MAPA_ESTADO_PARTICIPACION_EXTENDIDO} />
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-500 pt-3 border-t border-slate-100">
                  <span>{perfilesMap[item.perfilParticipacionId] || "-"}</span>
                  <span>{formatFecha(item.fechaInicio)}</span>
                </div>
                {renderAcciones(item)}
              </div>
            ))
          )}
        </div>
      ) : (
        // Vista "Agrupado por Empresa" — sin paginación propia, sin
        // colapsar: cada grupo se lista completo siempre (ver
        // `gruposPorEmpresa`).
        <div className="space-y-4">
          {loading ? (
            <div className="py-10 text-center text-slate-400 text-xs">Cargando participaciones...</div>
          ) : gruposPorEmpresa.length === 0 ? (
            <div className="py-10 text-center text-slate-400 text-xs">No se encontraron participaciones registradas.</div>
          ) : (
            gruposPorEmpresa.map((grupo) => (
              <div
                key={grupo.empresaId || "sin-empresa"}
                className="bg-white rounded-2xl border border-slate-100 shadow-card overflow-hidden border-l-[6px]"
                style={{ borderLeftColor: colorAcentoEmpresa(grupo.empresaId) }}
              >
                <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100">
                  {/* Mandante primero, en columna de ancho fijo: el nombre de la Empresa arranca en el
                      mismo punto en todos los bloques */}
                  <div className="flex flex-col justify-center gap-2 w-60 shrink-0">
                    {grupo.mandanteIds.map((mid) => (
                      <MandanteChip key={mid} size="xl" nombre={mandantesCache[mid] || "..."} logoUrl={mandantesLogos[mid] || null} />
                    ))}
                  </div>
                  <div className="self-stretch border-l border-slate-200 mx-2" />
                  <div className="font-bold text-carbon-dark">
                    <EmpresaChip nombre={grupo.nombre} logoUrl={grupo.logoUrl} size="lg" conIniciales />
                  </div>
                  <span className="ml-auto text-[11px] font-bold text-primary-dark bg-primary-lighter px-2.5 py-1 rounded-full whitespace-nowrap">
                    {grupo.participaciones.length} participaci{grupo.participaciones.length === 1 ? "ón" : "ones"}
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50/75 border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                        <th className="py-3 px-6">Proyecto</th>
                        <th className="py-3 px-6">Perfil</th>
                        <th className="py-3 px-6">Fecha Inicio</th>
                        <th className="py-3 px-6">Estado</th>
                        <th className="py-3 px-6">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {grupo.participaciones.map((item) => (
                        <tr key={item.id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="py-3.5 px-6">
                            <div className="flex items-center gap-3">
                              <EntityIconTile icon={Link2} />
                              <p className="font-bold text-carbon-dark">{proyectosMap[item.proyectoId] || item.proyectoId}</p>
                            </div>
                          </td>
                          <td className="py-3.5 px-6 text-slate-600 font-medium">
                            {perfilesMap[item.perfilParticipacionId] || item.perfilParticipacionId}
                          </td>
                          <td className="py-3.5 px-6 text-slate-600 font-medium">
                            {formatFecha(item.fechaInicio)}
                          </td>
                          <td className="py-3.5 px-6">
                            <StatusBadge value={estadoVisualDe(item)} map={MAPA_ESTADO_PARTICIPACION_EXTENDIDO} />
                          </td>
                          <td className="py-3.5 px-6">
                            {renderAcciones(item)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {vista !== "agrupado" && (
        <Pagination
          page={page}
          pageSize={pageSize}
          total={participacionesOrdenadas.length}
          onPageChange={setPage}
          onPageSizeChange={(n) => { setPageSize(n); setPage(1); }}
        />
      )}
    </div>
  );
};
