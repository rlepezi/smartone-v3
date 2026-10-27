import React, { useEffect, useRef, useState } from "react";
import { getMandanteDisplayName } from "../../utils/mandanteDisplay";
import { useNavigate } from "react-router-dom";
import {
  Truck, Power, Pencil, Eye, CheckCircle2, Clock, XCircle,
} from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { recursoService } from "../../services/recursoService";
import { formatCatalogo } from "../../utils/formatCatalogo";
import { proyectoService } from "../../services/proyectoService";
import { sujetoService } from "../../services/participacionSujetoService";
import { evaluacionService } from "../../services/evaluacionService";
import { expedienteService } from "../../services/expedienteService";
import { mandanteService } from "../../services/mandanteService";
import { empresaService } from "../../services/empresaService";
import { calcularDeltaPeriodo } from "../../utils/deltaCalculos";
import { PageHeader } from "../../components/shared/PageHeader";
import { ErrorBanner } from "../../components/shared/ErrorBanner";
import { FilterBar } from "../../components/shared/FilterBar";
import { DataTable } from "../../components/shared/DataTable";
import { EntityIconTile } from "../../components/shared/EntityIconTile";
import { StatusBadge, MAPA_ACTIVO_INACTIVO } from "../../components/shared/StatusBadge";
import { RowActionsMenu } from "../../components/shared/RowActionsMenu";
import { MandanteChip } from "../../components/shared/MandanteChip";
import { EvaluacionCelda } from "../../components/shared/EvaluacionCelda";
import { evaluarSujeto } from "../../utils/cumplimientoCalculos";
import { CLASE_LINEA } from "../../utils/lineasAlineadas";
import { Pagination } from "../../components/shared/Pagination";

// No existe un endpoint tipo reporteService para Recurso — se deriva acá
// mismo, sobre sus propias Evaluaciones vigentes de nivel Maquinaria.
// Misma regla de prioridad (peor caso primero) que ya se usa para
// Persona — "En Proceso" es la misma categoría que ahí se llama
// "Pendiente" (mismo resultado "pendiente"), solo con el nombre que usa
// esta pantalla.
const ACREDITACION_RECURSO_MAP = {
  acreditado: { label: "Acreditado", className: "bg-sage-lighter text-sage-darker border-sage-light" },
  en_proceso: { label: "En Proceso", className: "bg-amber-50 text-amber-700 border-amber-200" },
  no_acreditado: { label: "No Acreditado", className: "bg-red-50 text-red-700 border-red-200" },
};

export const RecursosListPage = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const puedeEscribir = ["superadmin", "mandante_admin"].includes(profile?.rol);

  const [recursos, setRecursos] = useState([]);
  const [proyectosMap, setProyectosMap] = useState({});
  // Para las columnas Mandante / Empresa / Evaluación (una línea por participación activa).
  const [proyectosPorId, setProyectosPorId] = useState({});
  const [expedientesTodos, setExpedientesTodos] = useState([]);
  const [mandantesCache, setMandantesCache] = useState({});
  // Mandantes asociados a cada Empresa (empresaMandantes activos): el Mandante de una Maquinaria
  // que todavía no está asignada a ningún Proyecto.
  const [mandantesDeEmpresa, setMandantesDeEmpresa] = useState({});
  useEffect(() => {
    empresaService.listar()
      .then((data) => setMandantesDeEmpresa(Object.fromEntries((data || []).map((e) => [e.id, e.mandanteIds || []]))))
      .catch(() => setMandantesDeEmpresa({}));
  }, []);
  const mandantesEnCursoRef = useRef(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filtroTipo, setFiltroTipo] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");
  const [filtroProyecto, setFiltroProyecto] = useState("");
  const [filtroMandante, setFiltroMandante] = useState("");
  const [filtroEmpresa, setFiltroEmpresa] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [toggleandoId, setToggleandoId] = useState(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Datos para las 4 tarjetas KPI, "Proyecto Asignado", "Estado de
  // Acreditación" y "Última Actividad" — ninguno se pedía antes en esta
  // pantalla. sujetoService/evaluacionService ya se usan en otras
  // pantallas; acá se cruzan por recursoId en el cliente, sin endpoint
  // nuevo.
  const [recursosTodos, setRecursosTodos] = useState([]);
  const [cargandoRecursosTodos, setCargandoRecursosTodos] = useState(true);
  const [sujetosActivos, setSujetosActivos] = useState([]);
  const [cargandoSujetos, setCargandoSujetos] = useState(true);
  const [evaluacionesTodas, setEvaluacionesTodas] = useState([]);
  const [cargandoEvaluaciones, setCargandoEvaluaciones] = useState(true);
  const [tiposDisponibles, setTiposDisponibles] = useState([]);

  const cargarRecursos = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await recursoService.listar(filtroEstado || undefined);
      setRecursos(data || []);
    } catch (err) {
      console.error("Error al cargar recursos:", err);
      setError(err.message || "Error al obtener la lista de maquinarias.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarRecursos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroEstado]);

  useEffect(() => {
    proyectoService.listar({})
      .then((data) => {
        const map = {};
        const porId = {};
        (data || []).forEach((p) => { map[p.id] = `${p.nombre} (${p.codigo})`; porId[p.id] = p; });
        setProyectosMap(map);
        setProyectosPorId(porId);
      })
      .catch((err) => console.error("Error al cargar proyectos:", err));

    expedienteService.listar({})
      .then((data) => setExpedientesTodos(data || []))
      .catch((err) => console.error("Error al cargar expedientes:", err));

    recursoService.listar()
      .then((data) => setRecursosTodos(data || []))
      .catch((err) => console.error("Error al cargar recursos:", err))
      .finally(() => setCargandoRecursosTodos(false));

    sujetoService.listar({ estado: "activa" })
      .then((data) => setSujetosActivos(data || []))
      .catch((err) => console.error("Error al cargar participaciones de maquinarias:", err))
      .finally(() => setCargandoSujetos(false));

    evaluacionService.listarVigentes()
      .then((data) => setEvaluacionesTodas(data || []))
      .catch((err) => console.error("Error al cargar evaluaciones:", err))
      .finally(() => setCargandoEvaluaciones(false));

    recursoService.listarTipos()
      .then((data) => setTiposDisponibles(data || []))
      .catch((err) => console.error("Error al cargar tipos de recurso:", err));
  }, []);

  // Mandantes de los Proyectos (nombre + logo), uno por id distinto.
  const idsMandanteKey = [...new Set([
    ...Object.values(proyectosPorId).map((p) => p.mandanteId),
    ...Object.values(mandantesDeEmpresa).flat(),
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
          .catch(() => [mid, { nombre: mid, logoUrl: null }]),
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

  // Una línea por participación activa de la Maquinaria, con SU Proyecto, Mandante
  // y Evaluación (Expediente de su Empresa en ese Proyecto) — nunca agregados.
  const partesDe = (recurso) =>
    sujetosActivos
      .filter((a) => a.recursoId === recurso.id)
      .map((a) => {
        const proyecto = proyectosPorId[a.proyectoId];
        const expediente = expedientesTodos.find(
          (e) => e.participacionId === a.participacionId && e.estado !== "cerrado",
        );
        return {
          key: a.id,
          proyectoNombre: proyectosMap[a.proyectoId] || "-",
          mandanteId: proyecto?.mandanteId || null,
          mandante: proyecto?.mandanteId ? mandantesCache[proyecto.mandanteId] : null,
          evaluacion: evaluarSujeto({
            expediente, vigentes: evaluacionesTodas, campo: "recursoId", sujetoId: recurso.id,
            perfilRecursoIds: a.perfilRecursoIds,
          }),
        };
      });

  const handleToggleEstado = async (item) => {
    setToggleandoId(item.id);
    try {
      if (item.estado === "activo") {
        await recursoService.desactivar(item.id);
      } else {
        await recursoService.actualizar(item.id, { estado: "activo" });
      }
      await cargarRecursos();
    } catch (err) {
      console.error("Error al cambiar estado del recurso:", err);
      setError(err.message || "No se pudo cambiar el estado de la maquinaria.");
    } finally {
      setToggleandoId(null);
    }
  };

  const tipoLabel = (tipo) => formatCatalogo(tipo);

  useEffect(() => {
    setPage(1);
  }, [filtroTipo, filtroEstado, filtroProyecto, filtroMandante, filtroEmpresa, searchTerm]);

  // Proyecto(s) Asignado(s): vía participación activa del Recurso — no es un
  // campo propio de Recurso.
  const proyectosAsignadosDe = (recursoId) =>
    sujetosActivos.filter((a) => a.recursoId === recursoId).map((a) => a.proyectoId);

  const evaluacionesDe = (recursoId) => evaluacionesTodas.filter((ev) => ev.recursoId === recursoId);

  const categoriaAcreditacionDe = (recursoId) => {
    const propias = evaluacionesDe(recursoId);
    if (propias.length === 0) return null;
    if (propias.some((ev) => ev.resultado === "no_cumple")) return "no_acreditado";
    if (propias.some((ev) => ev.resultado === "pendiente")) return "en_proceso";
    if (propias.some((ev) => ev.resultado === "cumple")) return "acreditado";
    return null;
  };

  const recursosFiltrados = recursos.filter((r) => {
    const term = searchTerm.toLowerCase();
    const matchTerm =
      r.nombre?.toLowerCase().includes(term) ||
      r.patente?.toLowerCase().includes(term);
    const matchTipo = !filtroTipo || r.tipo === filtroTipo;
    const matchProyecto = !filtroProyecto || proyectosAsignadosDe(r.id).includes(filtroProyecto);
    // Mandante: el de alguno de sus Proyectos asignados (igual que la columna Mandante).
    // Sin asignación, cuenta el Mandante de su Empresa actual (empresaMandantes).
    const asignados = proyectosAsignadosDe(r.id);
    const matchMandante = !filtroMandante || (asignados.length > 0
      ? asignados.some((pid) => proyectosPorId[pid]?.mandanteId === filtroMandante)
      : (mandantesDeEmpresa[r.empresaActual?.empresaId] || []).includes(filtroMandante));
    const matchEmpresa = !filtroEmpresa || r.empresaActual?.empresaId === filtroEmpresa;
    return matchTerm && matchTipo && matchProyecto && matchMandante && matchEmpresa;
  });

  const recursosPaginados = recursosFiltrados.slice((page - 1) * pageSize, page * pageSize);

  // Empresas presentes en el listado (su empresa actual), para el filtro Empresa.
  const empresasOpciones = [...new Map(recursos
    .filter((r) => r.empresaActual?.empresaId)
    .map((r) => [r.empresaActual.empresaId, r.empresaActual.empresaNombre || r.empresaActual.empresaId])).entries()]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label, "es"));

  // KPIs — sobre el alcance completo del actor (recursosTodos, sin el
  // filtro de Estado de la tabla), igual que en Dashboard/Proyectos/
  // Empresas/Personas.
  const recursosActivosCount = recursosTodos.filter((r) => r.estado === "activo").length;
  const deltaRecursosActivos = calcularDeltaPeriodo(recursosTodos, 7);
  const categoriasCount = { acreditado: 0, en_proceso: 0, no_acreditado: 0 };
  recursosTodos.forEach((r) => {
    const cat = categoriaAcreditacionDe(r.id);
    if (cat) categoriasCount[cat]++;
  });
  const totalConEvaluacion = categoriasCount.acreditado + categoriasCount.en_proceso + categoriasCount.no_acreditado;
  const pctDelTotal = (n) => (totalConEvaluacion > 0 ? Math.round((n / totalConEvaluacion) * 100) : 0);

  const resumenListo = !cargandoEvaluaciones && !cargandoRecursosTodos;

  const kpiCards = [
    {
      key: "activos", title: "Maquinarias Activas", icon: Truck,
      color: "text-primary-dark", bg: "bg-primary-lighter",
      loading: cargandoRecursosTodos, value: recursosActivosCount,
      subtexto: !cargandoRecursosTodos && deltaRecursosActivos !== null
        ? `${deltaRecursosActivos >= 0 ? "+" : ""}${deltaRecursosActivos} esta semana` : null,
      subtextoClass: deltaRecursosActivos >= 0 ? "text-sage-dark" : "text-red-600",
    },
    {
      key: "acreditados", title: "Acreditados", icon: CheckCircle2,
      color: "text-sage-dark", bg: "bg-sage-lighter",
      loading: !resumenListo, value: categoriasCount.acreditado,
      subtexto: resumenListo ? `${pctDelTotal(categoriasCount.acreditado)}% del total` : null,
      subtextoClass: "text-sage-dark",
    },
    {
      key: "enProceso", title: "En Proceso", icon: Clock,
      color: "text-amber-600", bg: "bg-amber-100",
      loading: !resumenListo, value: categoriasCount.en_proceso,
      subtexto: resumenListo ? `${pctDelTotal(categoriasCount.en_proceso)}% del total` : null,
      subtextoClass: "text-amber-600",
    },
    {
      key: "noAcreditados", title: "No Acreditados", icon: XCircle,
      color: "text-red-600", bg: "bg-red-100",
      loading: !resumenListo, value: categoriasCount.no_acreditado,
      subtexto: resumenListo ? `${pctDelTotal(categoriasCount.no_acreditado)}% del total` : null,
      subtextoClass: "text-red-600",
    },
  ];

  const columns = [
    { key: "recurso", label: "Maquinaria" },
    { key: "tipo", label: "Tipo" },
    { key: "identificacion", label: "Identificación" },
    { key: "mandante", label: "Mandante" },
    { key: "empresa", label: "Empresa" },
    { key: "proyecto", label: "Proyecto Asignado" },
    { key: "estado", label: "Estado" },
    { key: "evaluacion", label: "Evaluación" },
    { key: "acciones", label: "Acciones" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Maquinarias"
        icon={Truck}
        subtitle="Gestiona las maquinarias, vehículos y equipos que participan en los proyectos."
        loading={loading}
        onRefresh={cargarRecursos}
        action={puedeEscribir ? { to: "/recursos/nuevo", label: "Nueva Maquinaria" } : null}
      />

      <ErrorBanner message={error} />

      <div>
        <div className="space-y-6">
          {/* Tarjetas KPI */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
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
            searchPlaceholder="Buscar por nombre o patente de la maquinaria..."
            filters={[
              {
                label: "Mandante",
                value: filtroMandante,
                onChange: setFiltroMandante,
                options: [
                  { value: "", label: "Todos los mandantes" },
                  ...Object.entries(mandantesCache)
                    .filter(([, info]) => info)
                    .map(([mid, info]) => ({ value: mid, label: info.nombre }))
                    .sort((a, b) => a.label.localeCompare(b.label, "es")),
                ],
              },
              {
                label: "Proyecto",
                value: filtroProyecto,
                onChange: setFiltroProyecto,
                options: [
                  { value: "", label: "Todos" },
                  // Si hay un Mandante elegido, solo sus Proyectos.
                  ...Object.entries(proyectosMap)
                    .filter(([id]) => !filtroMandante || proyectosPorId[id]?.mandanteId === filtroMandante)
                    .map(([id, label]) => ({ value: id, label })),
                ],
              },
              {
                label: "Empresa",
                value: filtroEmpresa,
                onChange: setFiltroEmpresa,
                options: [{ value: "", label: "Todas las empresas" }, ...empresasOpciones],
              },
              {
                label: "Estado",
                value: filtroEstado,
                onChange: setFiltroEstado,
                options: [
                  { value: "", label: "Todos" },
                  { value: "activo", label: "Activos" },
                  { value: "inactivo", label: "Inactivos" },
                ],
              },
              {
                label: "Tipo de Maquinaria",
                value: filtroTipo,
                onChange: setFiltroTipo,
                options: [
                  { value: "", label: "Todos" },
                  ...tiposDisponibles.map((t) => ({ value: t.value, label: t.label })),
                ],
              },
            ]}
          />

          <DataTable
            columns={columns}
            data={recursosPaginados}
            loading={loading}
            loadingLabel="Cargando maquinarias..."
            emptyLabel="No se encontraron maquinarias registradas."
            renderRow={(item) => {
              const categoriaAcreditacion = categoriaAcreditacionDe(item.id);
              const partes = partesDe(item);
              const vacio = (texto, cursiva = false) => (
                <span className={`text-[11px] ${cursiva ? "text-slate-400 italic" : "text-slate-400"}`}>{texto}</span>
              );
              // Una línea alineada por participación activa en cada columna desglosada.
              const lineas = (renderParte, textoVacio = "-") =>
                cargandoSujetos ? vacio("…")
                  : partes.length === 0 ? vacio(textoVacio, true)
                    : partes.map((pt) => <div key={pt.key} className={CLASE_LINEA}>{renderParte(pt)}</div>);
              return (
                <tr
                  key={item.id}
                  onClick={() => navigate(`/recursos/${item.id}`)}
                  className="hover:bg-slate-50/60 transition-colors cursor-pointer"
                >
                  <td className="py-4 px-6">
                    <div className="flex items-center gap-3">
                      <EntityIconTile icon={Truck} />
                      <p className="font-bold text-carbon-dark">{item.nombre}</p>
                    </div>
                  </td>
                  <td className="py-4 px-6">
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold border bg-slate-100 text-slate-600 border-slate-200">
                      {tipoLabel(item.tipo)}
                    </span>
                  </td>
                  <td className="py-4 px-6 text-slate-600 font-mono text-sm">
                    {item.patente || <span className="text-slate-400 italic font-sans">-</span>}
                  </td>
                  <td className="py-2 px-6 text-slate-600 font-medium">
                    {partes.length === 0 && (mandantesDeEmpresa[item.empresaActual?.empresaId] || []).length > 0 ? (
                      // Sin asignación activa: los Mandantes de su Empresa actual.
                      mandantesDeEmpresa[item.empresaActual.empresaId].map((mid) => (
                        <div key={mid} className={CLASE_LINEA}>
                          <MandanteChip nombre={mandantesCache[mid]?.nombre || "…"} logoUrl={mandantesCache[mid]?.logoUrl} />
                        </div>
                      ))
                    ) : lineas((pt) => (
                      <MandanteChip
                        nombre={pt.mandante?.nombre || (pt.mandanteId ? "…" : "Sin mandante")}
                        logoUrl={pt.mandante?.logoUrl}
                      />
                    ))}
                  </td>
                  <td className="py-4 px-6 text-slate-600 font-medium">
                    {item.empresaActual?.empresaNombre || <span className="text-slate-400 italic">-</span>}
                  </td>
                  <td className="py-2 px-6 text-slate-600 font-medium">
                    {lineas((pt) => <p className="text-xs">{pt.proyectoNombre}</p>, "Sin asignación activa")}
                  </td>
                  <td className="py-4 px-6">
                    <div className="flex flex-col gap-1.5 items-start">
                      <StatusBadge value={item.estado} map={MAPA_ACTIVO_INACTIVO} />
                      {!cargandoEvaluaciones && (
                        categoriaAcreditacion ? (
                          <StatusBadge value={categoriaAcreditacion} map={ACREDITACION_RECURSO_MAP} />
                        ) : (
                          <span className="text-[10px] text-slate-400 italic">Sin Evaluar</span>
                        )
                      )}
                    </div>
                  </td>
                  <td className="py-2 px-6">
                    {cargandoEvaluaciones ? vacio("…") : lineas((pt) => <EvaluacionCelda evaluacion={pt.evaluacion} />)}
                  </td>
                  <td className="py-4 px-6" onClick={(e) => e.stopPropagation()}>
                    <RowActionsMenu
                      actions={[
                        { label: "Ver", icon: Eye, onClick: () => navigate(`/recursos/${item.id}`) },
                        puedeEscribir && { label: "Editar", icon: Pencil, onClick: () => navigate(`/recursos/${item.id}?editar=1`) },
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
            total={recursosFiltrados.length}
            onPageChange={setPage}
            onPageSizeChange={(n) => { setPageSize(n); setPage(1); }}
          />
        </div>

      </div>
    </div>
  );
};
