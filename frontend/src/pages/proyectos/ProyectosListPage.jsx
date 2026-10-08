import React, { Fragment, useEffect, useRef, useState } from "react";
import { getMandanteDisplayName } from "../../utils/mandanteDisplay";
import { Link, useNavigate } from "react-router-dom";
import {
  FolderKanban, Clock, PlayCircle, PauseCircle, CheckCircle2, Archive,
  Pencil, Eye, LayoutGrid, List, HardHat, Gauge,
  ChevronRight, ChevronDown, Users, Truck, Building2,
} from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { proyectoService, ESTADOS_PROYECTO } from "../../services/proyectoService";
import { mandanteService } from "../../services/mandanteService";
import { sujetoService } from "../../services/participacionSujetoService";
import { participacionService } from "../../services/participacionService";
import { reporteService } from "../../services/reporteService";
import { calcularDeltaPeriodo } from "../../utils/deltaCalculos";
import { formatFecha } from "../../utils/fechaFormatters";
import { PageHeader } from "../../components/shared/PageHeader";
import { ErrorBanner } from "../../components/shared/ErrorBanner";
import { FilterBar } from "../../components/shared/FilterBar";
import { DataTable } from "../../components/shared/DataTable";
import { EntityIconTile } from "../../components/shared/EntityIconTile";
import { StatusBadge } from "../../components/shared/StatusBadge";
import { RowActionsMenu } from "../../components/shared/RowActionsMenu";
import { Pagination } from "../../components/shared/Pagination";
import { MandanteChip } from "../../components/shared/MandanteChip";
import { ParticipantesCell } from "../../components/shared/ParticipantesCell";
import {
  EmpresasParticipantesTable, BarraCumplimiento,
} from "../../components/proyectos/EmpresasParticipantesTable";

const ROLES_MANDANTE_UNICO = ["mandante_admin", "mandante_lector"];

const ESTADO_BADGE = {
  planificado: { className: "bg-primary-lighter text-primary-dark border-primary-light", Icon: Clock },
  en_ejecucion: { className: "bg-sage-lighter text-sage-darker border-sage-light", Icon: PlayCircle },
  suspendido: { className: "bg-amber-50 text-amber-700 border-amber-200", Icon: PauseCircle },
  finalizado: { className: "bg-slate-100 text-slate-600 border-slate-200", Icon: CheckCircle2 },
  archivado: { className: "bg-slate-100 text-slate-600 border-slate-200", Icon: Archive },
};

const ESTADO_MAP = ESTADOS_PROYECTO.reduce((acc, e) => {
  const badge = ESTADO_BADGE[e.value] || ESTADO_BADGE.planificado;
  acc[e.value] = { label: e.label, className: badge.className, Icon: badge.Icon };
  return acc;
}, {});

// Mini barra + % de Cumplimiento por Proyecto — carga bajo demanda solo
// para las filas visibles en la página actual (mismo patrón que
// ProyectoResumen ya usaba para Empresas/Personas/Recursos). Reusa
// reporteService.obtenerResumen({ proyectoId }), el mismo endpoint que ya
// usa ReportesPage.jsx — sin backend nuevo.
const ProyectoCumplimiento = ({ proyectoId }) => {
  const [avance, setAvance] = useState(undefined); // undefined = cargando

  useEffect(() => {
    let activo = true;
    setAvance(undefined);
    reporteService
      .obtenerResumen({ proyectoId })
      .then((data) => {
        if (activo) setAvance(data?.requerimientos?.avancePct ?? null);
      })
      .catch(() => {
        if (activo) setAvance(null);
      });
    return () => {
      activo = false;
    };
  }, [proyectoId]);

  if (avance === undefined) {
    return <span className="text-[11px] text-slate-400">…</span>;
  }
  return <BarraCumplimiento pct={avance} />;
};

const pluralEmpresas = (n) => `${n} ${n === 1 ? "empresa" : "empresas"}`;

export const ProyectosListPage = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const puedeEscribir = ["superadmin", "mandante_admin"].includes(profile?.rol);
  const esRolMandanteUnico = ROLES_MANDANTE_UNICO.includes(profile?.rol);
  const mostrarColumnaMandante = !esRolMandanteUnico;

  const [proyectos, setProyectos] = useState([]);
  const [miMandanteNombre, setMiMandanteNombre] = useState(null);
  const [miMandanteLogoUrl, setMiMandanteLogoUrl] = useState(null);
  const [mandantesCache, setMandantesCache] = useState({});
  const mandantesEnCursoRef = useRef(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filtroEstado, setFiltroEstado] = useState("");
  const [filtroMandante, setFiltroMandante] = useState("");
  const [filtroProyecto, setFiltroProyecto] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [archivandoId, setArchivandoId] = useState(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [vista, setVista] = useState("lista");

  // Datos para los 4 paneles KPI — ninguno se pedía antes en esta
  // pantalla, pero los 3 endpoints ya existen y ya se usan en otras
  // pantallas (Dashboard/ExpedientesListPage/ReportesPage).
  const [proyectosTodos, setProyectosTodos] = useState([]);
  const [cargandoProyectosTodos, setCargandoProyectosTodos] = useState(true);
  const [sujetosActivos, setSujetosActivos] = useState([]);
  const [cargandoSujetos, setCargandoSujetos] = useState(true);
  const [participacionesActivas, setParticipacionesActivas] = useState([]);
  const [cargandoParticipaciones, setCargandoParticipaciones] = useState(true);
  const [resumenGeneral, setResumenGeneral] = useState(null);
  const [cargandoResumenGeneral, setCargandoResumenGeneral] = useState(true);

  // Filas expandidas y sus Empresas: se piden la primera vez que se expande
  // cada Proyecto (undefined = cargando, null = falló, array = cargado).
  const [expandidos, setExpandidos] = useState({});
  const [participantesMap, setParticipantesMap] = useState({});
  const participantesEnCursoRef = useRef(new Set());

  const alternarExpandido = (proyectoId) => {
    setExpandidos((prev) => ({ ...prev, [proyectoId]: !prev[proyectoId] }));
    // Una carga fallida (null) no se cachea: al volver a expandir se reintenta.
    const yaCargado = Array.isArray(participantesMap[proyectoId]);
    if (yaCargado || participantesEnCursoRef.current.has(proyectoId)) return;
    if (participantesMap[proyectoId] === null) {
      setParticipantesMap((prev) => {
        const next = { ...prev };
        delete next[proyectoId];
        return next;
      });
    }
    participantesEnCursoRef.current.add(proyectoId);
    reporteService
      .obtenerParticipantesPorProyecto(proyectoId)
      .then((data) => setParticipantesMap((prev) => ({ ...prev, [proyectoId]: data || [] })))
      .catch(() => setParticipantesMap((prev) => ({ ...prev, [proyectoId]: null })))
      .finally(() => participantesEnCursoRef.current.delete(proyectoId));
  };

  const cargarProyectos = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await proyectoService.listar({ estado: filtroEstado || undefined });
      setProyectos(data || []);
    } catch (err) {
      console.error("Error al cargar proyectos:", err);
      setError(err.message || "Error al obtener la lista de proyectos.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarProyectos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroEstado]);

  useEffect(() => {
    setPage(1);
  }, [filtroEstado, filtroMandante, filtroProyecto, searchTerm]);

  useEffect(() => {
    proyectoService.listar({})
      .then((data) => setProyectosTodos(data || []))
      .catch((err) => console.error("Error al cargar proyectos (KPI Mandante):", err))
      .finally(() => setCargandoProyectosTodos(false));

    sujetoService.listar({ estado: "activa" })
      .then((data) => setSujetosActivos(data || []))
      .catch((err) => console.error("Error al cargar personas y maquinarias asignadas:", err))
      .finally(() => setCargandoSujetos(false));

    participacionService.listar({ estado: "activa" })
      .then((data) => setParticipacionesActivas(data || []))
      .catch((err) => console.error("Error al cargar participaciones:", err))
      .finally(() => setCargandoParticipaciones(false));

    reporteService.obtenerResumen({})
      .then((data) => setResumenGeneral(data))
      .catch((err) => console.error("Error al cargar el resumen de cumplimiento:", err))
      .finally(() => setCargandoResumenGeneral(false));
  }, []);

  // mandante_admin/mandante_lector: sus proyectos son siempre de un único
  // Mandante (el suyo) — una sola llamada al montar, va al header/subtítulo
  // en vez de a una columna que repetiría el mismo valor en cada fila.
  useEffect(() => {
    if (!esRolMandanteUnico || !profile?.mandanteId) return;
    mandanteService
      .obtenerPorId(profile.mandanteId)
      .then((data) => {
        setMiMandanteNombre(getMandanteDisplayName(data) || null);
        setMiMandanteLogoUrl(data?.logoUrl || null);
      })
      .catch((err) => console.error("Error al cargar el mandante:", err));
  }, [esRolMandanteUnico, profile?.mandanteId]);

  // superadmin/evaluador: la columna "Mandante" sí varía fila a fila, y
  // además alimenta el filtro "Mandante" del FilterBar. Resuelve TODOS los
  // mandanteId distintos del listado completo (no solo la página visible)
  // vía GET /mandantes/:id — el único endpoint de Mandante al que
  // "evaluador" tiene acceso (el listado completo es solo superadmin/
  // admin_comercial), con una cache que evita pedir el mismo dos veces.
  const idsDistintosKey = mostrarColumnaMandante
    ? [...new Set(proyectos.map((p) => p.mandanteId).filter(Boolean))].join(",")
    : "";

  useEffect(() => {
    if (!mostrarColumnaMandante || !idsDistintosKey) return;
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
  }, [mostrarColumnaMandante, idsDistintosKey]);

  const handleArchivar = async (id) => {
    if (!window.confirm("¿Archivar este proyecto? Esta acción no se puede deshacer.")) {
      return;
    }
    setArchivandoId(id);
    try {
      await proyectoService.archivar(id);
      await cargarProyectos();
    } catch (err) {
      console.error("Error al archivar proyecto:", err);
      setError(err.message || "No se pudo archivar el proyecto.");
    } finally {
      setArchivandoId(null);
    }
  };

  const proyectosFiltrados = proyectos.filter((p) => {
    const term = searchTerm.toLowerCase();
    const matchTerm =
      p.nombre?.toLowerCase().includes(term) ||
      p.codigo?.toLowerCase().includes(term);
    const matchMandante = !filtroMandante || p.mandanteId === filtroMandante;
    const matchProyecto = !filtroProyecto || p.id === filtroProyecto;
    return matchTerm && matchMandante && matchProyecto;
  });

  const proyectosPaginados = proyectosFiltrados.slice((page - 1) * pageSize, page * pageSize);

  // Conteos por Proyecto — derivados de las listas activas ya cargadas
  // (Participaciones y personas/maquinarias asignadas), sin pedir nada extra por fila.
  const empresasDe = (proyectoId) =>
    new Set(participacionesActivas.filter((p) => p.proyectoId === proyectoId).map((p) => p.empresaId)).size;
  const personasDe = (proyectoId) =>
    sujetosActivos.filter((a) => a.proyectoId === proyectoId && a.personaId).length;
  const recursosDe = (proyectoId) =>
    sujetosActivos.filter((a) => a.proyectoId === proyectoId && a.recursoId).length;

  // KPIs — sobre el alcance completo del actor (mismo criterio que las
  // tarjetas KPI del Dashboard: no varían con los filtros de la tabla).
  const proyectosActivosCount = proyectos.filter((p) => p.estado === "en_ejecucion").length;
  const empresasParticipandoCount = new Set(participacionesActivas.map((p) => p.empresaId)).size;
  // Recursos: mismas personas/maquinarias activas que alimentan las columnas
  // "Recursos" de la tabla (personasDe/recursosDe), sumadas en total.
  const personasActivasCount = sujetosActivos.filter((a) => a.personaId).length;
  const maquinariasActivasCount = sujetosActivos.filter((a) => a.recursoId).length;
  // Mandantes distintos en el alcance del actor. Se cuenta sobre el listado
  // completo de Proyectos (no el filtrado por Estado de la tabla). Un
  // mandante_admin/lector siempre ve solo el suyo.
  const mandantesCount = esRolMandanteUnico
    ? 1
    : new Set(proyectosTodos.map((p) => p.mandanteId).filter(Boolean)).size;
  const cumplimientoPromedio = resumenGeneral?.requerimientos?.avancePct ?? null;

  const kpiCards = [
    {
      key: "mandantes", title: "Mandante", icon: Building2,
      color: "text-primary-dark", bg: "bg-primary-lighter",
      loading: cargandoProyectosTodos && !esRolMandanteUnico, value: mandantesCount, delta: null,
    },
    {
      key: "proyectosActivos", title: "Proyectos Activos", icon: FolderKanban,
      color: "text-sage-dark", bg: "bg-sage-lighter",
      loading, value: proyectosActivosCount, delta: calcularDeltaPeriodo(proyectos, 30),
    },
    {
      key: "empresasParticipando", title: "Empresas Participando", icon: HardHat,
      color: "text-violet-600", bg: "bg-violet-100",
      loading: cargandoParticipaciones, value: empresasParticipandoCount,
      delta: calcularDeltaPeriodo(participacionesActivas, 30),
    },
    {
      // Una sola tarjeta con dos valores (Personas y Maquinarias): `recursos`
      // reemplaza a `value` en el render.
      key: "recursos", title: "Recursos", icon: Users,
      color: "text-sky-600", bg: "bg-sky-100",
      loading: cargandoSujetos, value: null, delta: null,
      recursos: [
        { label: "Personas", icon: Users, valor: personasActivasCount },
        { label: "Maquinarias", icon: Truck, valor: maquinariasActivasCount },
      ],
    },
    {
      key: "cumplimientoPromedio", title: "Cumplimiento Promedio", icon: Gauge,
      color: "text-sky-600", bg: "bg-sky-100",
      loading: cargandoResumenGeneral, value: cumplimientoPromedio === null ? "—" : `${cumplimientoPromedio}%`,
      // Sin delta: reconstruir "cómo estaba el % hace un mes" requeriría
      // una foto histórica del cumplimiento que hoy no se guarda (solo
      // tenemos el estado VIGENTE de las evaluaciones) — mostrar algo acá
      // sería inventado, se omite a propósito.
      delta: null,
    },
  ];

  // Fechas y contadores de participantes van UNA columna cada grupo (no
  // una por dato) — con las 3+ columnas sueltas que tenía antes, la tabla
  // completa dejaba de entrar en el ancho disponible y aparecía scroll
  // horizontal incluso en pantallas grandes.
  // Mandante se muestra SIEMPRE (incluso para mandante_admin/lector, que
  // solo ven el suyo) — antes se ocultaba para esos roles asumiendo que
  // ya lo ven arriba en el chip de cabecera, pero conviene que quede
  // igual de visible fila por fila, consistente con Empresas/Personas.
  const mandanteDe = (item) =>
    esRolMandanteUnico
      ? { nombre: miMandanteNombre, logoUrl: miMandanteLogoUrl }
      : mandantesCache[item.mandanteId];

  const columns = [
    { key: "expandir", label: "" },
    { key: "proyecto", label: "Proyecto / Código" },
    { key: "mandante", label: "Mandante" },
    { key: "empresas", label: "Empresas Participantes" },
    { key: "cumplimiento", label: "Cumplimiento General" },
    { key: "participantes", label: "Recursos" },
    { key: "estado", label: "Estado" },
    { key: "acciones", label: "Acciones" },
  ];

  // Personas y Maquinarias activas del Proyecto — bloque compacto
  // reutilizado por la tabla y por la tarjeta de la vista en grilla.
  const participantesResumen = (proyectoId) => (
    <ParticipantesCell
      personas={cargandoSujetos ? "…" : personasDe(proyectoId)}
      maquinarias={cargandoSujetos ? "…" : recursosDe(proyectoId)}
    />
  );

  return (
    <div className="space-y-6">
      {esRolMandanteUnico && (
        <MandanteChip nombre={miMandanteNombre || "Tu Mandante"} logoUrl={miMandanteLogoUrl} size="lg" />
      )}

      <PageHeader
        title="Proyectos"
        icon={FolderKanban}
        subtitle={esRolMandanteUnico ? "Gestión de tus proyectos." : "Gestión de proyectos por Mandante."}
        loading={loading}
        onRefresh={cargarProyectos}
        action={puedeEscribir ? { to: "/proyectos/nuevo", label: "Nuevo Proyecto" } : null}
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
              ) : item.recursos ? (
                <div className="flex items-end gap-5">
                  {item.recursos.map(({ label, icon: RecursoIcon, valor }) => (
                    <div key={label}>
                      <div className="flex items-center gap-1.5">
                        <RecursoIcon className="w-4 h-4 text-slate-400" />
                        <span className="text-2xl font-black text-carbon-dark tracking-tight">{valor}</span>
                      </div>
                      <p className="text-[11px] font-semibold text-slate-500 mt-0.5">{label}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <h3 className="text-2xl font-black text-carbon-dark tracking-tight">{item.value}</h3>
              )}
              <p className="text-xs font-semibold text-slate-500 mt-0.5">{item.title}</p>
              {!item.loading && item.delta !== null && item.delta !== undefined && (
                <p className={`text-[11px] font-bold mt-1.5 ${item.delta >= 0 ? "text-sage-dark" : "text-red-600"}`}>
                  {item.delta >= 0 ? "+" : ""}{item.delta} vs mes anterior
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/*
        El listado ocupa todo el ancho disponible — antes compartía la
        fila con un sidebar de 20rem, lo que dejaba muy poco espacio para
        las columnas de la tabla y forzaba scroll horizontal. Las
        tarjetas informativas (antes en ese sidebar) ahora van más abajo,
        en una fila horizontal propia.
      */}
      <div className="space-y-6">
        <div className="min-w-0 space-y-6">
          <FilterBar
            searchValue={searchTerm}
            onSearchChange={setSearchTerm}
            searchPlaceholder="Buscar por nombre o código..."
            filters={[
              {
                label: "Estado",
                value: filtroEstado,
                onChange: setFiltroEstado,
                options: [
                  { value: "", label: "Todos los estados" },
                  ...ESTADOS_PROYECTO.map((e) => ({ value: e.value, label: e.label })),
                ],
              },
              ...(mostrarColumnaMandante ? [{
                label: "Mandante",
                value: filtroMandante,
                onChange: setFiltroMandante,
                options: [
                  { value: "", label: "Todos los mandantes" },
                  ...Object.entries(mandantesCache).map(([id, info]) => ({ value: id, label: info.nombre })),
                ],
              }] : []),
              {
                label: "Proyecto",
                value: filtroProyecto,
                onChange: setFiltroProyecto,
                options: [
                  { value: "", label: "Todos los proyectos" },
                  // Si hay un Mandante elegido, solo sus Proyectos.
                  ...proyectos
                    .filter((p) => !filtroMandante || p.mandanteId === filtroMandante)
                    .map((p) => ({ value: p.id, label: p.nombre })),
                ],
              },
            ]}
          />

          <div className="flex items-center justify-end gap-1">
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
              onClick={() => setVista("lista")}
              title="Vista en lista"
              className={`p-2 rounded-lg border transition-colors ${vista === "lista" ? "bg-primary-lighter border-primary-light text-primary-dark" : "bg-white border-slate-200 text-slate-400 hover:bg-slate-50"}`}
            >
              <List className="w-4 h-4" />
            </button>
          </div>

          {vista === "lista" ? (
            <DataTable
              columns={columns}
              data={proyectosPaginados}
              loading={loading}
              loadingLabel="Cargando proyectos..."
              emptyLabel="No se encontraron proyectos registrados."
              renderRow={(item) => {
                const abierto = !!expandidos[item.id];
                return (
                  <Fragment key={item.id}>
                    <tr
                      onClick={() => alternarExpandido(item.id)}
                      className="hover:bg-slate-50/60 transition-colors cursor-pointer"
                    >
                      <td className="py-4 pl-4 pr-0 w-8">
                        <button
                          type="button"
                          aria-expanded={abierto}
                          aria-label={abierto ? "Contraer empresas" : "Ver empresas participantes"}
                          className="p-1 rounded-lg text-slate-400 hover:text-primary hover:bg-slate-100 transition-colors"
                        >
                          {abierto ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </button>
                      </td>
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-3">
                          <EntityIconTile icon={FolderKanban} />
                          <div>
                            <Link
                              to={`/proyectos/${item.id}`}
                              onClick={(e) => e.stopPropagation()}
                              className="font-bold text-carbon-dark hover:text-primary transition-colors"
                            >
                              {item.nombre}
                            </Link>
                            <p className="text-[11px] text-slate-400 font-mono">{item.codigo}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-6 text-slate-600 font-medium">
                        <MandanteChip
                          nombre={mandanteDe(item)?.nombre || "…"}
                          logoUrl={mandanteDe(item)?.logoUrl}
                        />
                      </td>
                      <td className="py-4 px-6 text-xs font-bold text-carbon-dark whitespace-nowrap">
                        {cargandoParticipaciones ? "…" : pluralEmpresas(empresasDe(item.id))}
                      </td>
                      <td className="py-4 px-6">
                        <ProyectoCumplimiento proyectoId={item.id} />
                      </td>
                      <td className="py-4 px-6">
                        {participantesResumen(item.id)}
                      </td>
                      <td className="py-4 px-6">
                        <StatusBadge value={item.estado} map={ESTADO_MAP} />
                      </td>
                      <td className="py-4 px-6" onClick={(e) => e.stopPropagation()}>
                        <RowActionsMenu
                          actions={[
                            { label: "Ver", icon: Eye, onClick: () => navigate(`/proyectos/${item.id}`) },
                            puedeEscribir && {
                              label: "Editar",
                              icon: Pencil,
                              onClick: () => navigate(`/proyectos/${item.id}?editar=1`),
                            },
                            puedeEscribir && item.estado !== "archivado" && {
                              label: archivandoId === item.id ? "Archivando..." : "Archivar",
                              icon: Archive,
                              disabled: archivandoId === item.id,
                              onClick: () => handleArchivar(item.id),
                            },
                          ].filter(Boolean)}
                        />
                      </td>
                    </tr>
                    {abierto && (
                      <tr className="bg-slate-50/60">
                        <td colSpan={columns.length} className="px-6 py-4">
                          <EmpresasParticipantesTable
                            datos={participantesMap[item.id]}
                            onIrEmpresa={(empresaId) => navigate(`/empresas/${empresaId}`)}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              }}
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-5">
              {loading ? (
                <div className="col-span-full py-10 text-center text-slate-400 text-xs">Cargando proyectos...</div>
              ) : proyectosPaginados.length === 0 ? (
                <div className="col-span-full py-10 text-center text-slate-400 text-xs">No se encontraron proyectos registrados.</div>
              ) : (
                proyectosPaginados.map((item) => (
                  <div key={item.id} className="bg-white p-5 rounded-2xl border border-slate-100 shadow-card space-y-4">
                    {/*
                      Título en su propia fila (ancho completo) en vez de
                      compartir la fila con el ícono y el StatusBadge —
                      así el nombre del proyecto ya no se trunca contra el
                      badge de estado en nombres largos.
                    */}
                    <div className="flex items-center gap-3">
                      <EntityIconTile icon={FolderKanban} />
                      <div className="min-w-0 flex-1">
                        <Link to={`/proyectos/${item.id}`} className="font-bold text-carbon-dark hover:text-primary transition-colors block leading-snug">
                          {item.nombre}
                        </Link>
                        <p className="text-[11px] text-slate-400 font-mono">{item.codigo}</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <StatusBadge value={item.estado} map={ESTADO_MAP} />
                      <MandanteChip
                        nombre={mandanteDe(item)?.nombre || "…"}
                        logoUrl={mandanteDe(item)?.logoUrl}
                      />
                    </div>
                    <p className="text-[11px] text-slate-500">
                      {formatFecha(item.fechaInicio)} – {item.fechaTermino ? formatFecha(item.fechaTermino) : <span className="text-slate-300 italic">sin término</span>}
                    </p>
                    <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2 flex-wrap">
                      <span className="text-xs font-bold text-carbon-dark">
                        {cargandoParticipaciones ? "…" : pluralEmpresas(empresasDe(item.id))}
                      </span>
                      {participantesResumen(item.id)}
                    </div>
                    <div className="pt-3 border-t border-slate-100">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Cumplimiento General</p>
                      <ProyectoCumplimiento proyectoId={item.id} />
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <Link
                        to={`/proyectos/${item.id}`}
                        className="flex-1 text-center px-3 py-2 rounded-xl bg-slate-50 hover:bg-slate-100 text-xs font-bold text-carbon-dark transition-colors"
                      >
                        Ver
                      </Link>
                      {puedeEscribir && (
                        <Link
                          to={`/proyectos/${item.id}?editar=1`}
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
          )}

          <Pagination
            page={page}
            pageSize={pageSize}
            total={proyectosFiltrados.length}
            onPageChange={setPage}
            onPageSizeChange={(n) => { setPageSize(n); setPage(1); }}
          />
        </div>
      </div>
    </div>
  );
};
