import React, { useEffect, useRef, useState } from "react";
import { getMandanteDisplayName } from "../../utils/mandanteDisplay";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  HardHat, Power, Pencil, Eye, Users,
  CheckCircle2, Clock, AlertTriangle, Repeat,
} from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { empresaService } from "../../services/empresaService";
import { reporteService } from "../../services/reporteService";
import { participacionService } from "../../services/participacionService";
import { proyectoService } from "../../services/proyectoService";
import { mandanteService } from "../../services/mandanteService";
import { formatRutDisplay } from "../../utils/rutFormatters";
import { calcularDeltaPeriodo } from "../../utils/deltaCalculos";
import { PageHeader } from "../../components/shared/PageHeader";
import { ErrorBanner } from "../../components/shared/ErrorBanner";
import { FilterBar } from "../../components/shared/FilterBar";
import { DataTable } from "../../components/shared/DataTable";
import { EntityIconTile } from "../../components/shared/EntityIconTile";
import { StatusBadge } from "../../components/shared/StatusBadge";
import { RowActionsMenu } from "../../components/shared/RowActionsMenu";
import { Pagination } from "../../components/shared/Pagination";
import { EmpresaChip } from "../../components/shared/EmpresaChip";
import { MandanteChip } from "../../components/shared/MandanteChip";
import { ParticipantesCell } from "../../components/shared/ParticipantesCell";
import { CLASE_LINEA } from "../../utils/lineasAlineadas";

// Espejo manual de MAPEO_ESTADO_KPI_EMPRESA en
// functions/src/services/reporteService.js (fuente única de verdad) —
// "rechazada"/"no acreditada" NO existe: la máquina de estados de
// Expediente no tiene un estado terminal de rechazo, brecha conocida y
// aceptada también ahí.
const CATEGORIA_ACREDITACION = {
  aprobado: "acreditada",
  en_ejecucion: "acreditada",
  cerrado: "acreditada",
  creado: "en_proceso",
  en_revision: "en_proceso",
  con_observaciones: "con_observaciones",
};

const ACREDITACION_MAP = {
  acreditada: { label: "Acreditada", className: "bg-sage-lighter text-sage-darker border-sage-light" },
  en_proceso: { label: "En Proceso", className: "bg-amber-50 text-amber-700 border-amber-200" },
  con_observaciones: { label: "Con Observaciones", className: "bg-red-50 text-red-700 border-red-200" },
};

// Mismos umbrales que ya usa ProyectosListPage.jsx para la barra de
// Cumplimiento — sin criterio propio inventado para esta columna.
const claseCumplimiento = (pct) => {
  if (pct === null || pct === undefined) return "bg-slate-400";
  if (pct >= 70) return "bg-sage-dark";
  if (pct >= 40) return "bg-amber-400";
  return "bg-red-500";
};

// Dispara la carga del resumen compartido (Proyectos/Personas/Recursos)
// una sola vez por fila visible, sin renderizar nada — las celdas que
// muestran el valor leen directo de resumenesMap (mismo patrón que ya
// usaba EmpresaResumen, ahora repartido en columnas separadas).
const CargadorResumen = ({ empresaId, onNecesitaCargar }) => {
  useEffect(() => {
    onNecesitaCargar(empresaId);
  }, [empresaId, onNecesitaCargar]);
  return null;
};

export const EmpresasListPage = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const puedeEscribir = ["superadmin", "mandante_admin", "admin_comercial"].includes(profile?.rol);
  const veRecursos = profile?.rol !== "admin_comercial";

  // Filtro inicial desde la URL (ej. desde la KPI "Empresas Activas" del
  // Dashboard, "?estado=activo") — se lee una sola vez al montar.
  const [searchParams] = useSearchParams();
  const [empresas, setEmpresas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filtroAcreditacion, setFiltroAcreditacion] = useState(() => searchParams.get("acreditacion") || "");
  const [filtroMandante, setFiltroMandante] = useState("");
  const [filtroProyecto, setFiltroProyecto] = useState("");

  // Base de los filtros Mandante/Proyecto: Participaciones activas de todas las
  // Empresas + Proyectos (con su Mandante) + nombre/logo de cada Mandante.
  const [participacionesActivas, setParticipacionesActivas] = useState([]);
  const [proyectosMap, setProyectosMap] = useState({});
  const [mandantesCache, setMandantesCache] = useState({});
  const mandantesEnCursoRef = useRef(new Set());
  const [searchTerm, setSearchTerm] = useState("");
  const [toggleandoId, setToggleandoId] = useState(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [resumenesMap, setResumenesMap] = useState({});
  const resumenesEnCursoRef = useRef(new Set());

  // Datos para los 4 paneles KPI y las columnas nuevas — ninguno se pedía
  // antes en esta pantalla, pero los 2 endpoints ya existen (Reportes ya
  // los usa) y expedienteService.listar ya se usa en Dashboard/Proyectos.
  const [empresasTodas, setEmpresasTodas] = useState([]);
  const [cargandoEmpresasTodas, setCargandoEmpresasTodas] = useState(true);
  const [resumenGeneral, setResumenGeneral] = useState(null);
  const [cargandoResumenGeneral, setCargandoResumenGeneral] = useState(true);

  const obtenerResumen = (empresaId) => {
    if (empresaId in resumenesMap || resumenesEnCursoRef.current.has(empresaId)) return;
    resumenesEnCursoRef.current.add(empresaId);
    empresaService
      .obtenerResumen(empresaId)
      .then((data) => setResumenesMap((prev) => ({ ...prev, [empresaId]: data })))
      .catch(() => setResumenesMap((prev) => ({ ...prev, [empresaId]: null })))
      .finally(() => resumenesEnCursoRef.current.delete(empresaId));
  };

  const cargarEmpresas = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await empresaService.listar();
      setEmpresas(data || []);
    } catch (err) {
      console.error("Error al cargar empresas:", err);
      setError(err.message || "Error al obtener la lista de empresas.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarEmpresas();
  }, []);

  useEffect(() => {
    empresaService.listar()
      .then((data) => setEmpresasTodas(data || []))
      .catch((err) => console.error("Error al cargar empresas:", err))
      .finally(() => setCargandoEmpresasTodas(false));

    participacionService.listar({ estado: "activa" })
      .then((data) => setParticipacionesActivas(data || []))
      .catch((err) => console.error("Error al cargar participaciones:", err));

    proyectoService.listar({})
      .then((data) => {
        const map = {};
        (data || []).forEach((p) => { map[p.id] = p; });
        setProyectosMap(map);
      })
      .catch((err) => console.error("Error al cargar proyectos:", err));

    reporteService.obtenerResumen({})
      .then((data) => setResumenGeneral(data))
      .catch((err) => console.error("Error al cargar el resumen de acreditación:", err))
      .finally(() => setCargandoResumenGeneral(false));
  }, []);

  // Mandantes de los Proyectos (nombre + logo), uno por id distinto.
  // Mandantes a resolver: los de los Proyectos y los asociados a cada Empresa (empresaMandantes).
  const idsMandanteKey = [...new Set([
    ...Object.values(proyectosMap).map((p) => p.mandanteId),
    ...empresas.flatMap((e) => e.mandanteIds || []),
  ].filter(Boolean))].join(",");
  useEffect(() => {
    if (!idsMandanteKey) return;
    const faltantes = idsMandanteKey.split(",").filter(
      (mid) => !(mid in mandantesCache) && !mandantesEnCursoRef.current.has(mid),
    );
    if (faltantes.length === 0) return;
    faltantes.forEach((mid) => mandantesEnCursoRef.current.add(mid));
    Promise.all(
      faltantes.map((mid) =>
        mandanteService
          .obtenerPorId(mid)
          .then((data) => [mid, { nombre: getMandanteDisplayName(data) || mid, logoUrl: data?.logoUrl || null }])
          .catch(() => [mid, { nombre: mid }]),
      ),
    ).then((pares) => {
      setMandantesCache((prev) => {
        const next = { ...prev };
        pares.forEach(([mid, info]) => { next[mid] = info; });
        return next;
      });
      faltantes.forEach((mid) => mandantesEnCursoRef.current.delete(mid));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsMandanteKey]);

  const handleToggleEstado = async (item) => {
    setToggleandoId(item.id);
    try {
      if (item.estado === "activo") {
        await empresaService.desactivar(item.id);
      } else {
        await empresaService.actualizar(item.id, { estado: "activo" });
      }
      await cargarEmpresas();
    } catch (err) {
      console.error("Error al cambiar estado de la empresa:", err);
      setError(err.message || "No se pudo cambiar el estado de la empresa.");
    } finally {
      setToggleandoId(null);
    }
  };

  useEffect(() => {
    setPage(1);
  }, [filtroAcreditacion, filtroMandante, filtroProyecto, searchTerm]);

  // Estado de Acreditación por Empresa: viene de porEmpresa (Expediente
  // más reciente de cada una) — mismo dato que ya calcula reporteService,
  // una sola llamada para todo el listado.
  const categoriaAcreditacionDe = (empresaId) => {
    const row = (resumenGeneral?.porEmpresa || []).find((r) => r.empresaId === empresaId);
    if (!row?.expedienteEstado) return null;
    return CATEGORIA_ACREDITACION[row.expedienteEstado] || null;
  };

  const empresasFiltradas = empresas.filter((e) => {
    const term = searchTerm.toLowerCase();
    const matchTerm =
      e.razonSocial?.toLowerCase().includes(term) ||
      e.nombreFantasia?.toLowerCase().includes(term) ||
      e.rut?.toLowerCase().includes(term);
    const matchAcreditacion = !filtroAcreditacion || (
      filtroAcreditacion === "sin_expediente"
        ? !categoriaAcreditacionDe(e.id)
        : categoriaAcreditacionDe(e.id) === filtroAcreditacion
    );
    const matchParticipacion = (!filtroMandante && !filtroProyecto) || participacionesActivas.some((p) =>
      p.empresaId === e.id &&
      (!filtroProyecto || p.proyectoId === filtroProyecto) &&
      (!filtroMandante || proyectosMap[p.proyectoId]?.mandanteId === filtroMandante),
    ) || (
      // Sin filtro de Proyecto, una Empresa asociada al Mandante también cuenta aunque aún no participe.
      !filtroProyecto && Boolean(filtroMandante) && (e.mandanteIds || []).includes(filtroMandante)
    );
    return matchTerm && matchAcreditacion && matchParticipacion;
  });

  const empresasPaginadas = empresasFiltradas.slice((page - 1) * pageSize, page * pageSize);

  // KPIs — sobre el alcance completo del actor (empresasTodas, sin el
  // filtro de Estado de la tabla), igual que en Dashboard/Proyectos.
  const empresasActivasCount = empresasTodas.filter((e) => e.estado === "activo").length;
  const deltaEmpresasActivas = calcularDeltaPeriodo(empresasTodas, 7);
  const totalCategorias = resumenGeneral?.empresas?.total ?? 0;
  const acreditadasCount = resumenGeneral?.empresas?.acreditadas ?? 0;
  const enProcesoCount = resumenGeneral?.empresas?.enProceso ?? 0;
  const observadasCount = resumenGeneral?.empresas?.observadas ?? 0;
  const pctDelTotal = (n) => (totalCategorias > 0 ? Math.round((n / totalCategorias) * 100) : 0);

  const kpiCards = [
    {
      key: "activas", title: "Empresas Activas", icon: HardHat,
      color: "text-violet-600", bg: "bg-violet-100",
      loading: cargandoEmpresasTodas, value: empresasActivasCount,
      subtexto: !cargandoEmpresasTodas && deltaEmpresasActivas !== null
        ? `${deltaEmpresasActivas >= 0 ? "+" : ""}${deltaEmpresasActivas} esta semana` : null,
      subtextoClass: deltaEmpresasActivas >= 0 ? "text-sage-dark" : "text-red-600",
    },
    {
      key: "acreditadas", title: "Acreditadas", icon: CheckCircle2,
      color: "text-sage-dark", bg: "bg-sage-lighter",
      loading: cargandoResumenGeneral, value: acreditadasCount,
      subtexto: !cargandoResumenGeneral ? `${pctDelTotal(acreditadasCount)}% del total` : null,
      subtextoClass: "text-sage-dark",
    },
    {
      key: "enProceso", title: "En Proceso", icon: Clock,
      color: "text-amber-600", bg: "bg-amber-100",
      loading: cargandoResumenGeneral, value: enProcesoCount,
      subtexto: !cargandoResumenGeneral ? `${pctDelTotal(enProcesoCount)}% del total` : null,
      subtextoClass: "text-amber-600",
    },
    {
      key: "observadas", title: "Con Observaciones", icon: AlertTriangle,
      color: "text-red-600", bg: "bg-red-100",
      loading: cargandoResumenGeneral, value: observadasCount,
      subtexto: !cargandoResumenGeneral ? `${pctDelTotal(observadasCount)}% del total` : null,
      subtextoClass: "text-red-600",
    },
  ];

  const columns = [
    { key: "razonSocial", label: "Razón Social / Fantasía" },
    { key: "rut", label: "RUT" },
    { key: "mandante", label: "Mandante" },
    { key: "proyecto", label: "Proyecto" },
    { key: "participantes", label: "Recursos" },
    { key: "evaluacion", label: "Evaluación" },
    { key: "acciones", label: "Acciones" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Empresas"
        icon={HardHat}
        subtitle="Gestiona las empresas contratistas y proveedoras que participan en los proyectos."
        loading={loading}
        onRefresh={cargarEmpresas}
        action={puedeEscribir ? { to: "/empresas/nuevo", label: "Nueva Empresa" } : null}
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
              {item.loading ? (
                <div className="h-8 w-14 rounded-lg bg-slate-100 animate-pulse" />
              ) : (
                <h3 className="text-2xl font-black text-carbon-dark tracking-tight">{item.value}</h3>
              )}
              <p className="text-xs font-semibold text-slate-500 mt-0.5">{item.title}</p>
              {item.subtexto && (
                <p className={`text-[11px] font-bold mt-1.5 ${item.subtextoClass}`}>{item.subtexto}</p>
              )}
            </div>
          );
        })}
      </div>

      <FilterBar
        searchValue={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="Buscar por razón social, fantasía o RUT..."
        filters={[
          {
            label: "Mandante",
            value: filtroMandante,
            onChange: setFiltroMandante,
            options: [
              { value: "", label: "Todos los mandantes" },
              ...Object.entries(mandantesCache).map(([mid, info]) => ({ value: mid, label: info.nombre })),
            ],
          },
          {
            label: "Proyecto",
            value: filtroProyecto,
            onChange: setFiltroProyecto,
            options: [
              { value: "", label: "Todos los proyectos" },
              // Si hay un Mandante elegido, solo sus Proyectos.
              ...Object.values(proyectosMap)
                .filter((p) => !filtroMandante || p.mandanteId === filtroMandante)
                .map((p) => ({ value: p.id, label: p.nombre })),
            ],
          },
          {
            label: "Estado de Acreditación",
            value: filtroAcreditacion,
            onChange: setFiltroAcreditacion,
            options: [
              { value: "", label: "Todos" },
              { value: "acreditada", label: "Acreditada" },
              { value: "en_proceso", label: "En Proceso" },
              { value: "con_observaciones", label: "Con Observaciones" },
              { value: "sin_expediente", label: "Sin Expediente" },
            ],
          },
        ]}
      />

      <DataTable
        columns={columns}
        data={empresasPaginadas}
        loading={loading}
        loadingLabel="Cargando empresas..."
        emptyLabel="No se encontraron empresas registradas."
        renderRow={(item) => {
          const resumen = resumenesMap[item.id];
          const participaciones = resumen?.participacionesActivas || [];
          return (
            <tr
              key={item.id}
              onClick={() => navigate(`/empresas/${item.id}`)}
              className="hover:bg-slate-50/60 transition-colors cursor-pointer"
            >
              <td className="py-4 px-6">
                <div className="flex items-center gap-3">
                  <EntityIconTile icon={HardHat} />
                  <div>
                    <div className="font-bold text-carbon-dark">
                      <EmpresaChip nombre={item.razonSocial} logoUrl={item.logoUrl} />
                    </div>
                    <p className="text-[11px] text-slate-400">{item.nombreFantasia || "-"}</p>
                  </div>
                </div>
              </td>
              <td className="py-4 px-6 font-mono font-semibold text-slate-700 whitespace-nowrap">
                {formatRutDisplay(item.rut)}
              </td>
              <td className="py-2 px-6 text-slate-600 font-medium">
                <CargadorResumen empresaId={item.id} onNecesitaCargar={obtenerResumen} />
                {resumen === undefined ? (
                  <span className="text-[11px] text-slate-400">…</span>
                ) : participaciones.length === 0 ? (
                  // Sin Proyecto activo: los Mandantes a los que está asociada (empresaMandantes).
                  (item.mandanteIds || []).length === 0 ? (
                    <span className="text-[11px] text-slate-300 italic">-</span>
                  ) : (
                    item.mandanteIds.map((mid) => (
                      <div key={mid} className={CLASE_LINEA}>
                        <MandanteChip nombre={mandantesCache[mid]?.nombre || "…"} logoUrl={mandantesCache[mid]?.logoUrl} />
                      </div>
                    ))
                  )
                ) : (
                  participaciones.map((p) => (
                    <div key={p.participacionId} className={CLASE_LINEA}>
                      <MandanteChip nombre={p.mandanteNombre || "Sin mandante"} logoUrl={p.mandanteLogoUrl} />
                    </div>
                  ))
                )}
              </td>
              {/*
                Mandante / Proyecto / Perfil / Participantes / Evaluación: UNA línea por
                Participación activa, todas del mismo alto para que la línea N
                de cada columna quede alineada con la línea N de las demás.
                Cada valor es el de esa Participación puntual, sin agregar.
              */}
              <td className="py-2 px-6">
                {resumen === undefined ? (
                  <span className="text-[11px] text-slate-400">…</span>
                ) : participaciones.length === 0 ? (
                  <span className="text-[11px] text-slate-300 italic">Sin proyecto activo</span>
                ) : (
                  participaciones.map((p) => (
                    <div key={p.participacionId} className={CLASE_LINEA}>
                      <p className="text-xs font-bold text-carbon-dark">{p.proyectoNombre || "-"}</p>
                    </div>
                  ))
                )}
              </td>
              <td className="py-2 px-6">
                {resumen === undefined ? (
                  <span className="text-[11px] text-slate-400">…</span>
                ) : participaciones.length === 0 ? (
                  <ParticipantesCell personas="-" maquinarias="-" />
                ) : (
                  participaciones.map((p) => (
                    <div key={p.participacionId} className={CLASE_LINEA}>
                      <ParticipantesCell personas={p.personasCount} maquinarias={p.recursosCount} />
                    </div>
                  ))
                )}
              </td>
              <td className="py-2 px-6">
                {resumen === undefined ? (
                  <span className="text-[11px] text-slate-400">…</span>
                ) : participaciones.length === 0 ? (
                  <span className="text-[11px] text-slate-300 italic">Sin evaluar</span>
                ) : (
                  participaciones.map((p) => {
                    const avance = p.evaluacion?.avancePct ?? null;
                    const categoria = CATEGORIA_ACREDITACION[p.evaluacion?.expedienteEstado] || null;
                    return (
                      <div key={p.participacionId} className={CLASE_LINEA}>
                        {avance === null ? (
                          <span className="text-[11px] text-slate-300 italic">Sin evaluar</span>
                        ) : (
                          <div>
                            <div className="flex items-center gap-2">
                              <div className="w-14 h-1.5 rounded-full bg-slate-100 overflow-hidden shrink-0">
                                <div className={`h-full rounded-full ${claseCumplimiento(avance)}`} style={{ width: `${avance}%` }} />
                              </div>
                              <span className="text-xs font-bold text-carbon-dark">{avance}%</span>
                            </div>
                            <div className="flex items-center gap-1.5 mt-1">
                              {categoria && <StatusBadge value={categoria} map={ACREDITACION_MAP} />}
                              <span className="text-[10px] text-slate-400 whitespace-nowrap">{p.evaluacion.evaluados} evaluados</span>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </td>
              <td className="py-4 px-6" onClick={(e) => e.stopPropagation()}>
                <RowActionsMenu
                  actions={[
                    {
                      label: "Ver",
                      icon: Eye,
                      onClick: () => navigate(`/empresas/${item.id}`),
                    },
                    // Personas y Maquinarias de la Empresa: no existe para admin_comercial.
                    veRecursos && {
                      label: "Recursos",
                      icon: Users,
                      onClick: () => navigate(`/empresas/${item.id}/recursos`),
                    },
                    puedeEscribir && {
                      label: "Editar",
                      icon: Pencil,
                      onClick: () => navigate(`/empresas/${item.id}?editar=1`),
                    },
                    puedeEscribir && {
                      label: "Reemplazar Acreditación",
                      icon: Repeat,
                      onClick: () => navigate(`/acreditaciones/reemplazar?entidadTipo=empresa&entidadId=${item.id}`),
                    },
                    puedeEscribir && {
                      label: item.estado === "activo" ? "Desactivar" : "Activar",
                      icon: Power,
                      disabled: toggleandoId === item.id,
                      onClick: () => handleToggleEstado(item),
                    },
                  ].filter(Boolean)}
                />
              </td>
            </tr>
          );
        }}
      />

      <Pagination
        page={page}
        pageSize={pageSize}
        total={empresasFiltradas.length}
        onPageChange={setPage}
        onPageSizeChange={(n) => { setPageSize(n); setPage(1); }}
      />

    </div>
  );
};
