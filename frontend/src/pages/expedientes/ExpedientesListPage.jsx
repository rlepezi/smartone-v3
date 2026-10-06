import React, { useEffect, useRef, useState } from "react";
import { getMandanteDisplayName } from "../../utils/mandanteDisplay";
import { useNavigate, useSearchParams } from "react-router-dom";
import { FileCheck2, Gauge, ClipboardList, Clock, Users, Truck } from "lucide-react";
import { expedienteService, ESTADOS_EXPEDIENTE } from "../../services/expedienteService";
import { proyectoService } from "../../services/proyectoService";
import { empresaService } from "../../services/empresaService";
import { evaluacionService } from "../../services/evaluacionService";
import { perfilParticipacionService } from "../../services/perfilParticipacionService";
import { mandanteService } from "../../services/mandanteService";
import { MandanteChip } from "../../components/shared/MandanteChip";
import { formatFecha } from "../../utils/fechaFormatters";
import {
  calcularConteosEvaluacion,
  calcularSinEvaluar,
  calcularConteosPorEstadoExpediente,
} from "../../utils/cumplimientoCalculos";
import { PageHeader } from "../../components/shared/PageHeader";
import { ErrorBanner } from "../../components/shared/ErrorBanner";
import { FilterBar } from "../../components/shared/FilterBar";
import { DataTable } from "../../components/shared/DataTable";
import { EntityIconTile } from "../../components/shared/EntityIconTile";
import { EstadoExpedienteStepper } from "../../components/shared/EstadoExpedienteStepper";
import { Pagination } from "../../components/shared/Pagination";
import { EstadoCumplimientoPanel } from "../../components/shared/EstadoCumplimientoPanel";
import { ExpedientesPorEstadoBars } from "../../components/shared/ExpedientesPorEstadoBars";

const COLUMNS = [
  { key: "empresa", label: "Empresa" },
  { key: "mandante", label: "Mandante" },
  { key: "proyecto", label: "Proyecto" },
  { key: "perfil", label: "Perfil de Participación" },
  { key: "recursos", label: "Recursos" },
  { key: "estado", label: "Estado" },
  { key: "cumplimiento", label: "Cumplimiento" },
  { key: "fechaCreacion", label: "Fecha Creación" },
];

const createdAtMillis = (item) => {
  if (item.createdAt?._seconds) return item.createdAt._seconds * 1000;
  if (item.createdAt) return new Date(item.createdAt).getTime() || 0;
  return 0;
};

// Personas y Maquinarias activas del Expediente (conteo del backend), con los mismos íconos que el
// panel "Resumen de la Acreditación". Un 0 se muestra como 0.
const RecursosCelda = ({ personas = 0, maquinarias = 0 }) => {
  const textoPersonas = `${personas} ${personas === 1 ? "persona" : "personas"}`;
  const textoMaquinarias = `${maquinarias} ${maquinarias === 1 ? "maquinaria" : "maquinarias"}`;
  return (
    <div className="flex items-center gap-3 whitespace-nowrap">
      <span className="sr-only">{`${textoPersonas}, ${textoMaquinarias}`}</span>
      <span className="inline-flex items-center gap-1" title={textoPersonas} aria-hidden="true">
        <Users className="w-3.5 h-3.5 text-slate-400" />
        <span className="text-xs font-bold text-carbon-dark tabular-nums">{personas}</span>
      </span>
      <span className="inline-flex items-center gap-1" title={textoMaquinarias} aria-hidden="true">
        <Truck className="w-3.5 h-3.5 text-slate-400" />
        <span className="text-xs font-bold text-carbon-dark tabular-nums">{maquinarias}</span>
      </span>
    </div>
  );
};

// Mismos umbrales que pidió el usuario — no hay ningún umbral de color
// por % ya definido en otro lado de la app (se revisó ReportesPage.jsx,
// que muestra el % en texto plano, sin semáforo) con el que ser
// consistente.
const claseCumplimiento = (pct) => {
  if (pct === null || pct === undefined) return "bg-slate-100 text-slate-500 border-slate-200";
  if (pct >= 70) return "bg-sage-lighter text-sage-darker border-sage-light";
  if (pct >= 40) return "bg-amber-50 text-amber-700 border-amber-200";
  return "bg-red-50 text-red-700 border-red-200";
};

export const ExpedientesListPage = () => {
  const navigate = useNavigate();
  // Filtro inicial desde la URL (ej. "?estado=con_observaciones") — se lee
  // una sola vez al montar.
  const [searchParams] = useSearchParams();

  const [expedientes, setExpedientes] = useState([]);
  const [proyectosMap, setProyectosMap] = useState({});
  const [empresasMap, setEmpresasMap] = useState({});
  const [perfilesMap, setPerfilesMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filtroEstado, setFiltroEstado] = useState(() => searchParams.get("estado") || "");
  const [filtroProyecto, setFiltroProyecto] = useState("");
  const [filtroEmpresa, setFiltroEmpresa] = useState("");
  const [filtroMandante, setFiltroMandante] = useState("");
  // Nombre y logo de los Mandantes presentes en los Expedientes (Expediente ya guarda mandanteId).
  const [mandantesInfo, setMandantesInfo] = useState({});
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Evaluaciones vigentes en alcance del actor — mismo endpoint que ya
  // usa el Dashboard, esta pantalla no lo llamaba antes. Necesario para
  // los 4 paneles resumen y para la columna "Cumplimiento" por fila.
  const [evaluacionesTodas, setEvaluacionesTodas] = useState([]);
  const [cargandoEvaluaciones, setCargandoEvaluaciones] = useState(true);

  const tablaRef = useRef(null);

  const cargarExpedientes = async () => {
    setLoading(true);
    setError(null);
    try {
      // incluirConteo: cantidadPersonas/cantidadMaquinarias por expediente en esta misma respuesta.
      const data = await expedienteService.listar({ estado: filtroEstado || undefined, incluirConteo: true });
      setExpedientes(data || []);
    } catch (err) {
      console.error("Error al cargar expedientes:", err);
      setError(err.message || "Error al obtener la lista de expedientes.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarExpedientes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroEstado]);

  useEffect(() => {
    evaluacionService.listarVigentes()
      .then((data) => setEvaluacionesTodas(data || []))
      .catch((err) => console.error("Error al cargar evaluaciones:", err))
      .finally(() => setCargandoEvaluaciones(false));
  }, []);

  useEffect(() => {
    setPage(1);
  }, [filtroEstado, filtroProyecto, filtroEmpresa, filtroMandante, searchTerm]);

  const mandanteIdsKey = [...new Set(expedientes.map((e) => e.mandanteId).filter(Boolean))].sort().join(",");
  useEffect(() => {
    if (!mandanteIdsKey) return;
    Promise.all(
      mandanteIdsKey.split(",").map((id) =>
        mandanteService.obtenerPorId(id)
          .then((m) => [id, { nombre: getMandanteDisplayName(m) || id, logoUrl: m?.logoUrl || null }])
          .catch(() => [id, { nombre: id, logoUrl: null }]),
      ),
    ).then((pares) => setMandantesInfo((prev) => ({ ...prev, ...Object.fromEntries(pares) })));
  }, [mandanteIdsKey]);

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
        (data || []).forEach((e) => { map[e.id] = e.razonSocial; });
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
  }, []);

  // avancePct por Expediente puntual — mismo criterio "evaluables excluye
  // no_aplica" que ya usan reporteService.js/EvaluarExpedientePage (no es
  // el % del donut de "Estado General", que además incluye "Sin Evaluar"
  // en el denominador — son dos cálculos con propósitos distintos).
  const avancePorExpediente = (expedienteId) => {
    const propias = evaluacionesTodas.filter((ev) => ev.expedienteId === expedienteId);
    return calcularConteosEvaluacion(propias).avancePct;
  };

  const expedientesFiltrados = expedientes.filter((item) => {
    const term = searchTerm.toLowerCase();
    const proyectoLabel = proyectosMap[item.proyectoId] || "";
    const empresaLabel = empresasMap[item.empresaId] || "";
    const matchTerm =
      proyectoLabel.toLowerCase().includes(term) ||
      empresaLabel.toLowerCase().includes(term);
    const matchProyecto = !filtroProyecto || item.proyectoId === filtroProyecto;
    const matchEmpresa = !filtroEmpresa || item.empresaId === filtroEmpresa;
    const matchMandante = !filtroMandante || item.mandanteId === filtroMandante;
    return matchTerm && matchProyecto && matchEmpresa && matchMandante;
  });

  const expedientesPaginados = expedientesFiltrados.slice((page - 1) * pageSize, page * pageSize);

  // Los 4 paneles resumen reflejan el MISMO conjunto ya filtrado que se
  // ve en la tabla de abajo (Estado + Proyecto + Empresa + buscador) —
  // "esto es lo que estás viendo", no un resumen aparte del total global.
  const idsFiltrados = new Set(expedientesFiltrados.map((e) => e.id));
  const evaluacionesEnAlcance = evaluacionesTodas.filter((ev) => idsFiltrados.has(ev.expedienteId));
  const { conteos: conteosEvaluacion } = calcularConteosEvaluacion(evaluacionesEnAlcance);
  const sinEvaluarCount = calcularSinEvaluar(expedientesFiltrados, evaluacionesEnAlcance);
  const conteosPorEstadoExp = calcularConteosPorEstadoExpediente(expedientesFiltrados, ESTADOS_EXPEDIENTE);
  const recientes = [...expedientesFiltrados]
    .sort((a, b) => createdAtMillis(b) - createdAtMillis(a))
    .slice(0, 3);

  const resumenListo = !loading && !cargandoEvaluaciones;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Expedientes"
        icon={FileCheck2}
        subtitle="Proceso de acreditación por Empresa y Proyecto."
        loading={loading}
        onRefresh={cargarExpedientes}
      />

      <ErrorBanner message={error} />

      {/* Paneles resumen */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-card space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
            <Gauge className="w-4 h-4 text-slate-400" />
            <h2 className="text-sm font-bold text-carbon-dark uppercase tracking-wider">Estado General</h2>
          </div>
          {!resumenListo ? (
            <div className="py-8 text-center text-slate-400 text-xs">Cargando...</div>
          ) : (
            <EstadoCumplimientoPanel conteos={conteosEvaluacion} sinEvaluar={sinEvaluarCount} size={110} strokeWidth={12} />
          )}
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-card space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
            <FileCheck2 className="w-4 h-4 text-slate-400" />
            <h2 className="text-sm font-bold text-carbon-dark uppercase tracking-wider">Total de Expedientes</h2>
          </div>
          {!resumenListo ? (
            <div className="py-8 text-center text-slate-400 text-xs">Cargando...</div>
          ) : (
            <div>
              <p className="text-3xl font-black text-carbon-dark">{expedientesFiltrados.length}</p>
              <div className="grid grid-cols-3 gap-2 mt-4">
                <div className="text-center">
                  <p className="text-base font-black text-sage-dark">{conteosEvaluacion.cumple}</p>
                  <p className="text-[10px] font-semibold text-slate-400 mt-0.5">Cumple</p>
                </div>
                <div className="text-center">
                  <p className="text-base font-black text-primary-dark">{conteosPorEstadoExp.en_revision || 0}</p>
                  <p className="text-[10px] font-semibold text-slate-400 mt-0.5">En Revisión</p>
                </div>
                <div className="text-center">
                  <p className="text-base font-black text-amber-600">{conteosEvaluacion.pendiente}</p>
                  <p className="text-[10px] font-semibold text-slate-400 mt-0.5">Pendientes</p>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-card space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
            <ClipboardList className="w-4 h-4 text-slate-400" />
            <h2 className="text-sm font-bold text-carbon-dark uppercase tracking-wider">Expedientes por Estado</h2>
          </div>
          {!resumenListo ? (
            <div className="py-8 text-center text-slate-400 text-xs">Cargando...</div>
          ) : (
            <ExpedientesPorEstadoBars conteos={conteosPorEstadoExp} />
          )}
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-card space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-slate-400" />
              <h2 className="text-sm font-bold text-carbon-dark uppercase tracking-wider">Expedientes Recientes</h2>
            </div>
            <button
              type="button"
              onClick={() => tablaRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
              className="text-xs font-bold text-primary hover:text-primary-dark"
            >
              Ver todos
            </button>
          </div>
          {!resumenListo ? (
            <div className="py-8 text-center text-slate-400 text-xs">Cargando...</div>
          ) : recientes.length === 0 ? (
            <div className="py-8 text-center text-slate-400 text-xs">Sin expedientes registrados.</div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {recientes.map((exp) => (
                <li key={exp.id} className="py-2.5 text-xs">
                  <p className="font-bold text-carbon-dark truncate">{empresasMap[exp.empresaId] || exp.empresaId}</p>
                  <p className="text-[11px] text-slate-400">{formatFecha(exp.createdAt)}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <FilterBar
        searchValue={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="Buscar por proyecto o empresa..."
        filters={[
          {
            label: "Estado",
            value: filtroEstado,
            onChange: setFiltroEstado,
            options: [
              { value: "", label: "Todos los estados" },
              ...ESTADOS_EXPEDIENTE.map((e) => ({ value: e.value, label: e.label })),
            ],
          },
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
        ]}
      />

      {/* Grilla de una columna con hijo `min-w-0`: sin esto, el ancho mínimo de la tabla empuja todo
          el layout y aparece scroll en la página en vez de dentro de la tabla (ver DataTable.jsx). */}
      <div ref={tablaRef} className="grid grid-cols-1">
        <div className="min-w-0">
        <DataTable
          columns={COLUMNS}
          data={expedientesPaginados}
          loading={loading}
          loadingLabel="Cargando expedientes..."
          emptyLabel="No se encontraron expedientes registrados."
          compact
          renderRow={(item) => {
            const pct = avancePorExpediente(item.id);
            return (
              <tr
                key={item.id}
                onClick={() => navigate(`/expedientes/${item.id}`)}
                className="hover:bg-slate-50/60 transition-colors cursor-pointer"
              >
                <td className="py-4 px-4">
                  <div className="flex items-center gap-3">
                    <EntityIconTile icon={FileCheck2} />
                    <p className="font-bold text-carbon-dark">{empresasMap[item.empresaId] || item.empresaId}</p>
                  </div>
                </td>
                <td className="py-4 px-4 text-slate-600 font-medium">
                  {item.mandanteId in mandantesInfo ? (
                    <MandanteChip nombre={mandantesInfo[item.mandanteId].nombre} logoUrl={mandantesInfo[item.mandanteId].logoUrl} />
                  ) : item.mandanteId ? (
                    <span className="inline-block h-3.5 w-24 rounded bg-slate-100 animate-pulse" />
                  ) : (
                    <span className="text-slate-300">-</span>
                  )}
                </td>
                <td className="py-4 px-4 text-slate-600 font-medium">
                  {proyectosMap[item.proyectoId] || item.proyectoId}
                </td>
                <td className="py-4 px-4">
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold bg-primary-lighter text-primary-dark border border-primary-light">
                    {perfilesMap[item.perfilParticipacionId] || "-"}
                  </span>
                </td>
                <td className="py-4 px-4">
                  <RecursosCelda personas={item.cantidadPersonas} maquinarias={item.cantidadMaquinarias} />
                </td>
                <td className="py-4 px-4">
                  <EstadoExpedienteStepper estado={item.estado} />
                </td>
                <td className="py-4 px-4">
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold border ${claseCumplimiento(pct)}`}>
                    {pct === null ? "-" : `${pct}%`}
                  </span>
                </td>
                <td className="py-4 px-4 text-slate-600 font-medium">
                  <p>{formatFecha(item.createdAt)}</p>
                  {item.creadoPorNombre && (
                    <p className="text-[11px] text-slate-400 font-normal mt-0.5">por {item.creadoPorNombre}</p>
                  )}
                </td>
              </tr>
            );
          }}
        />
        </div>
      </div>

      <Pagination
        page={page}
        pageSize={pageSize}
        total={expedientesFiltrados.length}
        onPageChange={setPage}
        onPageSizeChange={(n) => { setPageSize(n); setPage(1); }}
      />
    </div>
  );
};
