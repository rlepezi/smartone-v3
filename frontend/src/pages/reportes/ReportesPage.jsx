import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { BarChart3, FileSpreadsheet, Printer } from "lucide-react";
import { reporteService } from "../../services/reporteService";
import { useMandanteContexto } from "../../hooks/useMandanteContexto";
import { CampoMandante } from "../../components/shared/CampoMandante";
import { PageHeader } from "../../components/shared/PageHeader";
import { ErrorBanner } from "../../components/shared/ErrorBanner";
import { DateInput } from "../../components/ui/DateInput";
import {
  Indicadores, PorProyecto, PorTipoEntidad, Evolucion, Rechazos, PanelRechazos,
} from "../../components/reportes/SeccionesReporte";
import { getMandanteDisplayName } from "../../utils/mandanteDisplay";
import { formatFechaHora, hoyISO } from "../../utils/fechas";
import { ATAJOS_PERIODO, PERIODO_POR_DEFECTO, rangoDeAtajo, textoPeriodo } from "../../utils/reportePanel";
import { exportarPanelExcel } from "../../utils/reporteExcel";

const CLASE_SELECT = "w-full min-w-0 truncate px-3 py-2 bg-slate-50/50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all";
const CLASE_ETIQUETA = "text-[10px] font-bold text-slate-400 uppercase tracking-wider leading-none";

// Filtros que dependen del Mandante (se limpian al cambiarlo).
const FILTROS_DEPENDIENTES = ["proyecto", "perfil", "empresa"];

const Filtro = ({ etiqueta, children, className = "w-full sm:w-44" }) => (
  <div className={`flex flex-col gap-1 ${className}`}>
    <span className={CLASE_ETIQUETA}>{etiqueta}</span>
    {children}
  </div>
);

// Página de Reportes: de lo general a lo específico (indicadores, por proyecto, por tipo de entidad,
// evolución e ítems con más rechazos), todo desde GET /reportes/panel. Los filtros viven en la URL;
// cambiar uno recalcula toda la página.
export const ReportesPage = () => {
  const [params, setParams] = useSearchParams();
  const contexto = useMandanteContexto({ mandanteId: params.get("mandante") });
  const { mandanteId, mandante, modo } = contexto;

  const periodo = params.get("periodo") || PERIODO_POR_DEFECTO;
  const hoy = hoyISO();
  const { desde, hasta } = periodo === "personalizado"
    ? { desde: params.get("desde") || "", hasta: params.get("hasta") || hoy }
    : rangoDeAtajo(periodo, hoy);
  const proyectoId = params.get("proyecto") || "";
  const perfilParticipacionId = params.get("perfil") || "";
  const empresaId = params.get("empresa") || "";

  // Respuesta de la última carga, con la clave (filtros + recargas) que la pidió: mientras la clave
  // actual no coincide, la página está cargando.
  const [resultado, setResultado] = useState({ clave: null, panel: null, error: null });
  const [recargas, setRecargas] = useState(0);
  const [errorExportar, setErrorExportar] = useState(null);
  const [perfilRanking, setPerfilRanking] = useState("todos");
  const [rechazoAbierto, setRechazoAbierto] = useState(null);
  const [exportando, setExportando] = useState(false);

  const actualizar = useCallback((cambios) => {
    const siguiente = new URLSearchParams(params);
    Object.entries(cambios).forEach(([clave, valor]) => {
      if (valor) siguiente.set(clave, valor);
      else siguiente.delete(clave);
    });
    setParams(siguiente, { replace: true });
  }, [params, setParams]);

  const listoParaCargar = modo === "fijo" || modo === "unico" || (modo === "seleccionable" && Boolean(mandanteId));

  const clave = JSON.stringify([mandanteId, desde, hasta, proyectoId, perfilParticipacionId, empresaId, recargas]);

  useEffect(() => {
    if (!listoParaCargar) return undefined;
    let vigente = true;
    reporteService.obtenerPanel({ mandanteId, desde, hasta, proyectoId, perfilParticipacionId, empresaId })
      .then((datos) => { if (vigente) setResultado({ clave, panel: datos, error: null }); })
      .catch((err) => {
        if (vigente) {
          setResultado((previo) => ({ clave, panel: previo.panel, error: err.message || "No se pudo cargar el reporte." }));
        }
      });
    return () => { vigente = false; };
  }, [clave, listoParaCargar, mandanteId, desde, hasta, proyectoId, perfilParticipacionId, empresaId]);

  const { panel } = resultado;
  const cargando = listoParaCargar && resultado.clave !== clave;
  const error = resultado.clave === clave ? resultado.error || errorExportar : errorExportar;

  const opciones = panel?.opciones;
  const perfilesActivos = useMemo(() => opciones?.perfilesActivos || [], [opciones]);
  const perfilRankingVigente = perfilRanking === "todos" || perfilesActivos.some((p) => p.id === perfilRanking)
    ? perfilRanking : "todos";
  const nombreDe = (lista, id) => (lista || []).find((x) => x.id === id)?.nombre;
  const nombreMandante = getMandanteDisplayName(mandante) || mandanteId || "—";
  const textoFiltros = [
    `Mandante: ${nombreMandante}`,
    `Período: ${textoPeriodo(desde, hasta)}`,
    `Proyecto: ${nombreDe(opciones?.proyectos, proyectoId) || "Todos"}`,
    `Perfil: ${nombreDe(opciones?.perfiles, perfilParticipacionId) || "Todos"}`,
    `Empresa: ${nombreDe(opciones?.empresas, empresaId) || "Todas"}`,
  ].join(" · ");

  const exportarExcel = async () => {
    if (!panel) return;
    setExportando(true);
    setErrorExportar(null);
    try {
      await exportarPanelExcel({
        panel, textoFiltros, perfilId: perfilRankingVigente,
        perfilNombre: nombreDe(perfilesActivos, perfilRankingVigente) || "Todos los perfiles",
      });
    } catch (err) {
      setErrorExportar(err.message || "No se pudo generar el Excel.");
    } finally {
      setExportando(false);
    }
  };

  const rechazosAbiertos = rechazoAbierto && panel
    ? (panel.rechazos.detalle[rechazoAbierto.requerimientoId] || []).filter((r) =>
      perfilRankingVigente === "todos" || r.perfilParticipacionId === perfilRankingVigente)
    : [];

  // Sin datos todavía (o recargando): cada sección muestra su placeholder.
  const enCarga = cargando || !panel;
  // Falló la carga y no hay datos previos: solo el mensaje de error, sin placeholders.
  const sinDatos = !cargando && !panel && Boolean(resultado.error);
  const acciones = (
    <div className="flex items-center gap-2 print:hidden">
      <button
        type="button"
        onClick={exportarExcel}
        disabled={!panel || cargando || exportando}
        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-carbon-dark hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <FileSpreadsheet className="w-4 h-4" /> {exportando ? "Generando..." : "Exportar Excel"}
      </button>
      <button
        type="button"
        onClick={() => window.print()}
        disabled={!panel || cargando}
        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-carbon-dark hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Printer className="w-4 h-4" /> Exportar PDF
      </button>
    </div>
  );

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto">
      <div className="print:hidden">
        <PageHeader
          title="Reportes"
          subtitle={modo === "fijo" || modo === "unico" ? `Estado de acreditación · ${nombreMandante}` : "Estado de acreditación"}
          icon={BarChart3}
          loading={cargando}
          onRefresh={() => setRecargas((n) => n + 1)}
          resumen={acciones}
        />
      </div>

      {/* Encabezado de impresión (PDF). */}
      <div className="hidden print:block border-b border-slate-200 pb-3">
        <h1 className="text-xl font-bold text-carbon-dark">Reporte de acreditación</h1>
        <p className="text-xs text-slate-600 mt-1">Mandante: {nombreMandante}</p>
        <p className="text-xs text-slate-600">Período: {textoPeriodo(desde, hasta)}</p>
        <p className="text-xs text-slate-600">{textoFiltros.split(" · ").slice(2).join(" · ")}</p>
        <p className="text-xs text-slate-400">Emitido el {formatFechaHora(new Date())}</p>
      </div>

      <div className="bg-white px-4 py-3 rounded-2xl border border-slate-100 shadow-card flex flex-col sm:flex-row sm:flex-wrap sm:items-end gap-x-3 gap-y-3 print:hidden">
        {modo === "seleccionable" && (
          <div className="w-full sm:w-56">
            <CampoMandante
              contexto={contexto}
              conFoco={false}
              onChange={(id) => actualizar({ mandante: id, ...Object.fromEntries(FILTROS_DEPENDIENTES.map((f) => [f, ""])) })}
            />
          </div>
        )}
        <Filtro etiqueta="Período">
          <select
            aria-label="Período"
            value={periodo}
            onChange={(e) => actualizar({
              periodo: e.target.value === PERIODO_POR_DEFECTO ? "" : e.target.value,
              desde: e.target.value === "personalizado" ? desde : "",
              hasta: e.target.value === "personalizado" ? hasta : "",
            })}
            className={CLASE_SELECT}
          >
            {ATAJOS_PERIODO.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
            <option value="personalizado">Personalizado</option>
          </select>
        </Filtro>
        <Filtro etiqueta="Desde" className="w-full sm:w-40">
          <DateInput
            aria-label="Desde"
            value={desde}
            max={hasta}
            onChange={(e) => actualizar({ periodo: "personalizado", desde: e.target.value, hasta })}
            className="w-full px-3 py-2 bg-slate-50/50 border border-slate-200 rounded-xl text-xs"
          />
        </Filtro>
        <Filtro etiqueta="Hasta" className="w-full sm:w-40">
          <DateInput
            aria-label="Hasta"
            value={hasta}
            min={desde || undefined}
            max={hoy}
            onChange={(e) => actualizar({ periodo: "personalizado", desde, hasta: e.target.value || hoy })}
            className="w-full px-3 py-2 bg-slate-50/50 border border-slate-200 rounded-xl text-xs"
          />
        </Filtro>
        <Filtro etiqueta="Proyecto">
          <select aria-label="Proyecto" value={proyectoId} onChange={(e) => actualizar({ proyecto: e.target.value })} className={CLASE_SELECT} disabled={!opciones}>
            <option value="">Todos</option>
            {(opciones?.proyectos || []).map((p) => (
              <option key={p.id} value={p.id}>{p.codigo ? `${p.codigo} · ${p.nombre}` : p.nombre}</option>
            ))}
          </select>
        </Filtro>
        <Filtro etiqueta="Perfil de Participación">
          <select aria-label="Perfil de Participación" value={perfilParticipacionId} onChange={(e) => actualizar({ perfil: e.target.value })} className={CLASE_SELECT} disabled={!opciones}>
            <option value="">Todos</option>
            {(opciones?.perfiles || []).map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </Filtro>
        <Filtro etiqueta="Empresa">
          <select aria-label="Empresa" value={empresaId} onChange={(e) => actualizar({ empresa: e.target.value })} className={CLASE_SELECT} disabled={!opciones}>
            <option value="">Todas</option>
            {(opciones?.empresas || []).map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
          </select>
        </Filtro>
      </div>

      <ErrorBanner message={error} />

      {modo === "ninguno" ? (
        <CampoMandante contexto={contexto} />
      ) : sinDatos ? null : modo === "seleccionable" && !mandanteId ? (
        <p className="py-10 text-center text-xs text-slate-400">Seleccione un Mandante para ver el reporte.</p>
      ) : (
        <>
          <Indicadores datos={panel?.indicadores} cargando={enCarga} />

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 print:block print:space-y-6 print:break-before-page">
            <PorProyecto filas={panel?.porProyecto} cargando={enCarga} />
            <div className="print:break-before-page">
              <PorTipoEntidad datos={panel?.porTipoEntidad} cargando={enCarga} />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 print:block print:space-y-6 print:break-before-page">
            <Evolucion datos={panel?.evolucion} cargando={enCarga} />
            <div className="print:break-before-page">
              <Rechazos
                datos={panel?.rechazos}
                perfiles={perfilesActivos}
                cargando={enCarga}
                perfilId={perfilRankingVigente}
                onPerfil={setPerfilRanking}
                onAbrir={setRechazoAbierto}
              />
            </div>
          </div>
        </>
      )}

      {rechazoAbierto && (
        <PanelRechazos fila={rechazoAbierto} rechazos={rechazosAbiertos} onCerrar={() => setRechazoAbierto(null)} />
      )}
    </div>
  );
};
