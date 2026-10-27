import React, { useEffect, useState } from "react";
import { getMandanteDisplayName } from "../../utils/mandanteDisplay";
import { useNavigate, useSearchParams } from "react-router-dom";
import { FileCheck2, Users, Truck, AlertTriangle } from "lucide-react";
import { problemasEnEjecucion, textoProblemas } from "../../utils/alertasExpediente";
import { expedienteService, ESTADOS_EXPEDIENTE } from "../../services/expedienteService";
import { estadoVencimientosExpediente } from "../../utils/vencimientos";
import { proyectoService } from "../../services/proyectoService";
import { empresaService } from "../../services/empresaService";
import { perfilParticipacionService } from "../../services/perfilParticipacionService";
import { mandanteService } from "../../services/mandanteService";
import { MandanteChip } from "../../components/shared/MandanteChip";
import { formatFecha } from "../../utils/fechas";
import { porcentajeCumplimiento, resumenDeExpedientes } from "../../utils/cumplimientoCalculos";
import { PageHeader } from "../../components/shared/PageHeader";
import { ErrorBanner } from "../../components/shared/ErrorBanner";
import { FilterBar } from "../../components/shared/FilterBar";
import { DataTable } from "../../components/shared/DataTable";
import { EntityIconTile } from "../../components/shared/EntityIconTile";
import { EstadoExpedienteStepper } from "../../components/shared/EstadoExpedienteStepper";
import { Pagination } from "../../components/shared/Pagination";
import { EstadoCumplimientoPanel } from "../../components/shared/EstadoCumplimientoPanel";

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
  const [expedientes, setExpedientes] = useState([]);
  const [proyectosMap, setProyectosMap] = useState({});
  const [empresasMap, setEmpresasMap] = useState({});
  const [perfilesMap, setPerfilesMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filtroProyecto, setFiltroProyecto] = useState("");
  const [filtroEmpresa, setFiltroEmpresa] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");
  // Vencimientos: "" | "vencidos" | "proximos". Se puede abrir filtrado desde el Dashboard
  // ("Ver todos" de Vencimientos próximos: ?vencimientos=vencidos|proximos).
  const [searchParams] = useSearchParams();
  const [filtroVencimientos, setFiltroVencimientos] = useState(() => (
    ["vencidos", "proximos"].includes(searchParams.get("vencimientos")) ? searchParams.get("vencimientos") : ""
  ));
  const [filtroMandante, setFiltroMandante] = useState("");
  // Nombre y logo de los Mandantes presentes en los Expedientes (Expediente ya guarda mandanteId).
  const [mandantesInfo, setMandantesInfo] = useState({});
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const cargarExpedientes = async () => {
    setLoading(true);
    setError(null);
    try {
      // incluirConteo: cantidadPersonas/cantidadMaquinarias por expediente en esta misma respuesta.
      const data = await expedienteService.listar({ incluirConteo: true });
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
  }, []);

  useEffect(() => {
    setPage(1);
  }, [filtroProyecto, filtroEmpresa, filtroMandante, filtroEstado, filtroVencimientos, searchTerm]);

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

  // % de cumplimiento por Expediente: de sus contadores (cumple / (activas − no aplica)).
  const avancePorExpediente = (expediente) => porcentajeCumplimiento(expediente.resumen);

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
    const matchEstado = !filtroEstado || item.estado === filtroEstado;
    // Desde resumen.fechaVencimientoMasProxima contra hoy, sin consultas por fila.
    const matchVencimientos = !filtroVencimientos || estadoVencimientosExpediente(item) === filtroVencimientos;
    return matchTerm && matchProyecto && matchEmpresa && matchMandante && matchEstado && matchVencimientos;
  });

  const expedientesPaginados = expedientesFiltrados.slice((page - 1) * pageSize, page * pageSize);

  // El resumen de cumplimiento del encabezado refleja el MISMO conjunto ya filtrado que se ve en la
  // tabla de abajo (Mandante + Proyecto + Empresa + Estado + buscador) — "esto es lo
  // que estás viendo", no un resumen aparte del total global.
  const resumenFiltrado = resumenDeExpedientes(expedientesFiltrados);

  const resumenListo = !loading;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Expedientes"
        icon={FileCheck2}
        subtitle="Proceso de acreditación por Empresa y Proyecto."
        loading={loading}
        onRefresh={cargarExpedientes}
        resumen={(
          <EstadoCumplimientoPanel
            variante="encabezado"
            resumen={resumenFiltrado}
            cargando={!resumenListo}
            vacio={expedientesFiltrados.length === 0}
          />
        )}
      />

      <ErrorBanner message={error} />

      <FilterBar
        searchValue={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="Buscar por proyecto o empresa..."
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
            label: "Estado",
            value: filtroEstado,
            onChange: setFiltroEstado,
            options: [
              { value: "", label: "Todos los estados" },
              ...ESTADOS_EXPEDIENTE.map((e) => ({ value: e.value, label: e.label })),
            ],
          },
          {
            label: "Vencimientos",
            value: filtroVencimientos,
            onChange: setFiltroVencimientos,
            options: [
              { value: "", label: "Todos" },
              { value: "vencidos", label: "Con vencidos" },
              { value: "proximos", label: "Próximos a vencer" },
            ],
          },
        ]}
      />

      {/* Grilla de una columna con hijo `min-w-0`: sin esto, el ancho mínimo de la tabla empuja todo
          el layout y aparece scroll en la página en vez de dentro de la tabla (ver DataTable.jsx). */}
      <div className="grid grid-cols-1">
        <div className="min-w-0">
        <DataTable
          columns={COLUMNS}
          data={expedientesPaginados}
          loading={loading}
          loadingLabel="Cargando expedientes..."
          emptyLabel="No se encontraron expedientes registrados."
          compact
          renderRow={(item) => {
            const pct = avancePorExpediente(item);
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
                  <div className="flex items-start gap-1.5">
                    <EstadoExpedienteStepper estado={item.estado} />
                    {problemasEnEjecucion(item) && (
                      <AlertTriangle
                        className="w-4 h-4 text-amber-500 shrink-0"
                        aria-label={`En ejecución con ${textoProblemas(problemasEnEjecucion(item))}`}
                      >
                        <title>{`En ejecución con ${textoProblemas(problemasEnEjecucion(item))}`}</title>
                      </AlertTriangle>
                    )}
                  </div>
                </td>
                <td className="py-4 px-4">
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold border ${claseCumplimiento(pct)}`}>
                    {pct === null ? "—" : `${pct}%`}
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
