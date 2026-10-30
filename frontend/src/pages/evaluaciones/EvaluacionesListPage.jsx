import React, { useEffect, useState } from "react";
import { getMandanteDisplayName } from "../../utils/mandanteDisplay";
import { Link, useSearchParams } from "react-router-dom";
import { CheckSquare, Eye } from "lucide-react";
import { evaluacionService, RESULTADOS_EVALUACION } from "../../services/evaluacionService";
import { expedienteService } from "../../services/expedienteService";
import { proyectoService } from "../../services/proyectoService";
import { empresaService } from "../../services/empresaService";
import { requerimientoService } from "../../services/requerimientoService";
import { personaService } from "../../services/personaService";
import { recursoService } from "../../services/recursoService";
import { mandanteService } from "../../services/mandanteService";
import { MandanteChip } from "../../components/shared/MandanteChip";
import { formatFecha } from "../../utils/fechas";
import { PageHeader } from "../../components/shared/PageHeader";
import { ErrorBanner } from "../../components/shared/ErrorBanner";
import { FilterBar } from "../../components/shared/FilterBar";
import { DataTable } from "../../components/shared/DataTable";
import { EntityIconTile } from "../../components/shared/EntityIconTile";
import { StatusBadge, MAPA_EVALUACION } from "../../components/shared/StatusBadge";
import { ActionButton } from "../../components/shared/ActionButton";
import { Pagination } from "../../components/shared/Pagination";

const COLUMNS = [
  { key: "requerimiento", label: "Requerimiento" },
  { key: "expediente", label: "Expediente" },
  { key: "mandante", label: "Mandante" },
  { key: "empresa", label: "Empresa" },
  { key: "proyecto", label: "Proyecto" },
  { key: "aplicaA", label: "Aplica a" },
  { key: "evaluador", label: "Evaluador" },
  { key: "estado", label: "Estado" },
  { key: "actualizado", label: "Última actualización" },
];

export const EvaluacionesListPage = () => {
  // Filtro inicial desde la URL (ej. desde las KPI cards del Dashboard,
  // "?resultado=pendiente") — se lee una sola vez al montar, el usuario
  // puede cambiarlo libremente después sin que se resetee.
  const [searchParams] = useSearchParams();
  const [evaluaciones, setEvaluaciones] = useState([]);
  const [expedientesMap, setExpedientesMap] = useState({});
  const [proyectosMap, setProyectosMap] = useState({});
  const [empresasMap, setEmpresasMap] = useState({});
  const [requerimientosMap, setRequerimientosMap] = useState({});
  const [personasMap, setPersonasMap] = useState({});
  const [recursosMap, setRecursosMap] = useState({});

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filtroProyecto, setFiltroProyecto] = useState("");
  const [filtroEmpresa, setFiltroEmpresa] = useState("");
  const [filtroEstado, setFiltroEstado] = useState(() => searchParams.get("resultado") || "");
  const [filtroMandante, setFiltroMandante] = useState("");
  const [filtroAplicaA, setFiltroAplicaA] = useState("");
  const [mandantesInfo, setMandantesInfo] = useState({}); // id -> { nombre, logoUrl }
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const cargarEvaluaciones = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await evaluacionService.listarGlobal({
        proyectoId: filtroProyecto || undefined,
        empresaId: filtroEmpresa || undefined,
      });
      setEvaluaciones(data || []);
    } catch (err) {
      console.error("Error al cargar evaluaciones:", err);
      setError(err.message || "Error al obtener la lista de evaluaciones.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarEvaluaciones();
  }, [filtroProyecto, filtroEmpresa]);

  useEffect(() => {
    setPage(1);
  }, [filtroProyecto, filtroEmpresa, filtroEstado, filtroMandante, filtroAplicaA, searchTerm]);

  useEffect(() => {
    expedienteService.listar({})
      .then((data) => {
        const map = {};
        (data || []).forEach((e) => { map[e.id] = e; });
        setExpedientesMap(map);
      })
      .catch((err) => console.error("Error al cargar expedientes:", err));

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
        (data || []).forEach((e) => { map[e.id] = e.razonSocial; });
        setEmpresasMap(map);
      })
      .catch((err) => console.error("Error al cargar empresas:", err));


    personaService.listar()
      .then((data) => {
        const map = {};
        (data || []).forEach((p) => { map[p.id] = `${p.nombre} ${p.apellido}`.trim(); });
        setPersonasMap(map);
      })
      .catch((err) => console.error("Error al cargar personas:", err));

    recursoService.listar()
      .then((data) => {
        const map = {};
        (data || []).forEach((r) => { map[r.id] = r.nombre; });
        setRecursosMap(map);
      })
      .catch((err) => console.error("Error al cargar recursos:", err));
  }, []);

  // El Mandante ya viene denormalizado en la Evaluación (se deriva del Expediente al crearla); si falta,
  // se toma del Expediente.
  const mandanteDe = (ev) => ev.mandanteId || expedientesMap[ev.expedienteId]?.mandanteId || null;
  // Nivel de aplicación: el mismo dato de la columna "Aplica a".
  const aplicaADe = (ev) => (ev.personaId ? "persona" : ev.recursoId ? "maquinaria" : "empresa");

  const mandanteIdsKey = [...new Set(evaluaciones.map(mandanteDe).filter(Boolean))].sort().join(",");
  useEffect(() => {
    if (!mandanteIdsKey) return;
    Promise.all(
      mandanteIdsKey.split(",").map((id) =>
        mandanteService.obtenerPorId(id)
          .then((m) => [id, { nombre: getMandanteDisplayName(m) || id, logoUrl: m?.logoUrl || null }])
          .catch(() => [id, { nombre: id, logoUrl: null }]),
      ),
    ).then((pares) => setMandantesInfo((prev) => ({ ...prev, ...Object.fromEntries(pares) })));
    // Nombres de Requerimiento: la Evaluación solo guarda el requerimientoId, así que se piden los
    // Requerimientos de los Mandantes presentes en el listado (nunca el catálogo completo).
    requerimientoService.nombresDeMandantes(mandanteIdsKey.split(","))
      .then((mapa) => setRequerimientosMap((prev) => ({ ...prev, ...mapa })))
      .catch((err) => console.error("Error al cargar requerimientos:", err));
  }, [mandanteIdsKey]);

  const resolverAplicaA = (item) => {
    if (item.personaId) return `Persona: ${personasMap[item.personaId] || item.personaId}`;
    if (item.recursoId) return `Maquinaria: ${recursosMap[item.recursoId] || item.recursoId}`;
    const expediente = expedientesMap[item.expedienteId];
    const empresaNombre = expediente ? empresasMap[expediente.empresaId] : null;
    return `Empresa: ${empresaNombre || "-"}`;
  };

  const evaluacionesFiltradas = evaluaciones
    .filter((ev) => !filtroEstado || ev.resultado === filtroEstado)
    .filter((ev) => !filtroMandante || mandanteDe(ev) === filtroMandante)
    .filter((ev) => !filtroAplicaA || aplicaADe(ev) === filtroAplicaA)
    .filter((ev) => {
      const term = searchTerm.toLowerCase();
      if (!term) return true;
      const expediente = expedientesMap[ev.expedienteId];
      const requerimientoLabel = requerimientosMap[ev.requerimientoId] || "";
      const empresaLabel = expediente ? empresasMap[expediente.empresaId] || "" : "";
      const proyectoLabel = expediente ? proyectosMap[expediente.proyectoId] || "" : "";
      return (
        requerimientoLabel.toLowerCase().includes(term) ||
        empresaLabel.toLowerCase().includes(term) ||
        proyectoLabel.toLowerCase().includes(term)
      );
    });

  const totales = {
    total: evaluacionesFiltradas.length,
    cumple: evaluacionesFiltradas.filter((ev) => ev.resultado === "cumple").length,
    no_cumple: evaluacionesFiltradas.filter((ev) => ev.resultado === "no_cumple").length,
    pendiente: evaluacionesFiltradas.filter((ev) => ev.resultado === "pendiente").length,
  };

  const kpiCards = [
    { key: "total", title: "Total", value: totales.total, color: "text-primary-dark", bg: "bg-primary-lighter" },
    { key: "cumple", title: "Cumple", value: totales.cumple, color: "text-sage-darker", bg: "bg-sage-lighter" },
    { key: "no_cumple", title: "No Cumple", value: totales.no_cumple, color: "text-red-700", bg: "bg-red-50" },
    { key: "pendiente", title: "Pendiente", value: totales.pendiente, color: "text-amber-700", bg: "bg-amber-50" },
  ];

  const evaluacionesPaginadas = evaluacionesFiltradas.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Evaluaciones"
        icon={CheckSquare}
        subtitle="Resultados de evaluación de Requerimientos en todos tus Expedientes."
        loading={loading}
        onRefresh={cargarEvaluaciones}
      />

      <ErrorBanner message={error} />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {kpiCards.map((card) => (
          <div
            key={card.key}
            className="bg-white p-5 rounded-2xl border border-slate-100 shadow-card flex items-center gap-4"
          >
            <div className={`w-11 h-11 rounded-xl ${card.bg} ${card.color} flex items-center justify-center font-bold flex-shrink-0`}>
              <CheckSquare className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-2xl font-black text-carbon-dark tracking-tight">{card.value}</h3>
              <p className="text-xs font-semibold text-slate-500 mt-0.5">{card.title}</p>
            </div>
          </div>
        ))}
      </div>

      <FilterBar
        searchValue={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="Buscar por requerimiento, empresa o proyecto..."
        filters={[
          {
            label: "Mandante",
            conBusqueda: true,
            value: filtroMandante,
            onChange: setFiltroMandante,
            options: [
              { value: "", label: "Todos los mandantes" },
              ...Object.entries(mandantesInfo)
                .map(([value, info]) => ({ value, label: info.nombre }))
                .sort((a, b) => a.label.localeCompare(b.label, "es")),
            ],
          },
          {
            label: "Proyecto",
            value: filtroProyecto,
            onChange: setFiltroProyecto,
            options: [
              { value: "", label: "Todos los proyectos" },
              ...Object.entries(proyectosMap).map(([id, label]) => ({ value: id, label })),
            ],
          },
          {
            label: "Empresa",
            value: filtroEmpresa,
            onChange: setFiltroEmpresa,
            options: [
              { value: "", label: "Todas las empresas" },
              ...Object.entries(empresasMap).map(([id, label]) => ({ value: id, label })),
            ],
          },
          {
            label: "Aplica a",
            value: filtroAplicaA,
            onChange: setFiltroAplicaA,
            options: [
              { value: "", label: "Todos" },
              { value: "empresa", label: "Empresa" },
              { value: "persona", label: "Persona" },
              { value: "maquinaria", label: "Maquinaria" },
            ],
          },
          {
            label: "Estado",
            value: filtroEstado,
            onChange: setFiltroEstado,
            options: [
              { value: "", label: "Todos los estados" },
              ...RESULTADOS_EVALUACION.map((r) => ({ value: r.value, label: r.label })),
            ],
          },
        ]}
      />

      <DataTable
        columns={COLUMNS}
        data={evaluacionesPaginadas}
        loading={loading}
        loadingLabel="Cargando evaluaciones..."
        emptyLabel="No se encontraron evaluaciones registradas."
        renderRow={(item) => {
          const expediente = expedientesMap[item.expedienteId];
          return (
            <tr key={item.id} className="hover:bg-slate-50/60 transition-colors">
              <td className="py-4 px-6">
                <div className="flex items-center gap-3">
                  <EntityIconTile icon={CheckSquare} />
                  <p className="font-bold text-carbon-dark">
                    {requerimientosMap[item.requerimientoId] || item.requerimientoId}
                  </p>
                </div>
              </td>
              <td className="py-4 px-6">
                <ActionButton as={Link} to={`/expedientes/${item.expedienteId}`} icon={Eye}>
                  Ver Expediente
                </ActionButton>
              </td>
              <td className="py-4 px-6 text-slate-600 font-medium">
                {mandanteDe(item) && mandanteDe(item) in mandantesInfo ? (
                  <MandanteChip nombre={mandantesInfo[mandanteDe(item)].nombre} logoUrl={mandantesInfo[mandanteDe(item)].logoUrl} />
                ) : mandanteDe(item) ? (
                  <span className="inline-block h-3.5 w-24 rounded bg-slate-100 animate-pulse" />
                ) : (
                  <span className="text-slate-300">-</span>
                )}
              </td>
              <td className="py-4 px-6 text-slate-600 font-medium">
                {expediente ? empresasMap[expediente.empresaId] || expediente.empresaId : "-"}
              </td>
              <td className="py-4 px-6 text-slate-600 font-medium">
                {expediente ? proyectosMap[expediente.proyectoId] || expediente.proyectoId : "-"}
              </td>
              <td className="py-4 px-6 text-slate-600 font-medium">
                {resolverAplicaA(item)}
              </td>
              <td className="py-4 px-6 text-slate-600 font-medium">
                {item.evaluadorNombre || "-"}
              </td>
              <td className="py-4 px-6">
                <StatusBadge value={item.resultado} map={MAPA_EVALUACION} />
              </td>
              <td className="py-4 px-6 text-slate-600 font-medium">
                {formatFecha(item.createdAt)}
              </td>
            </tr>
          );
        }}
      />

      <Pagination
        page={page}
        pageSize={pageSize}
        total={evaluacionesFiltradas.length}
        onPageChange={setPage}
        onPageSizeChange={(n) => { setPageSize(n); setPage(1); }}
      />
    </div>
  );
};
