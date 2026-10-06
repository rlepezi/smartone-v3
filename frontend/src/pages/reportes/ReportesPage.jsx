import React, { useEffect, useState } from "react";
import {
  BarChart3,
  Building2,
  ClipboardCheck,
  CalendarClock,
  X,
} from "lucide-react";
import { reporteService } from "../../services/reporteService";
import { proyectoService } from "../../services/proyectoService";
import { ESTADOS_EXPEDIENTE } from "../../services/expedienteService";
import { formatFecha } from "../../utils/fechaFormatters";
import { PageHeader } from "../../components/shared/PageHeader";
import { ErrorBanner } from "../../components/shared/ErrorBanner";
import { StatusBadge, MAPA_EVALUACION } from "../../components/shared/StatusBadge";

const RANGOS_VENCIMIENTO = [15, 30, 60, 90];

const ESTADO_EXPEDIENTE_MAP = ESTADOS_EXPEDIENTE.reduce((acc, e) => {
  acc[e.value] = { label: e.label, className: e.color };
  return acc;
}, {});

const TITULOS_DETALLE = {
  vencidos: "Evidencias Vencidas",
  por_vencer: "Evidencias por Vencer",
  no_cumple: "Requerimientos No Cumple",
  pendientes: "Requerimientos Pendientes",
};

// avancePct puede venir null (nada evaluable todavía) — nunca se muestra
// como "0%", que induciría a pensar "no cumple nada" en vez de "sin datos".
const formatAvancePct = (avancePct) => (avancePct === null || avancePct === undefined ? "—" : `${avancePct}%`);

const KpiCard = ({ icon: Icon, title, value, color, bg }) => (
  <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-card flex flex-col justify-between">
    <div className={`w-11 h-11 rounded-xl ${bg} ${color} flex items-center justify-center font-bold mb-4`}>
      <Icon className="w-5 h-5" />
    </div>
    <div>
      <h3 className="text-2xl font-black text-carbon-dark tracking-tight">{value}</h3>
      <p className="text-xs font-semibold text-slate-500 mt-0.5">{title}</p>
    </div>
  </div>
);

const NumeroClickeable = ({ value, label, className, onClick, clickeable }) => {
  const contenido = (
    <>
      <p className="text-xl font-black">{value}</p>
      <p className="text-[11px] font-semibold mt-0.5">{label}</p>
    </>
  );
  const base = `p-3 rounded-xl border text-center ${className}`;

  if (!clickeable) {
    return <div className={base}>{contenido}</div>;
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${base} hover:opacity-80 transition-opacity cursor-pointer`}
    >
      {contenido}
    </button>
  );
};

export const ReportesPage = () => {
  const [proyectos, setProyectos] = useState([]);
  const [proyectoId, setProyectoId] = useState("");
  const [diasVencimiento, setDiasVencimiento] = useState(30);

  const [reporte, setReporte] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [detalleTipo, setDetalleTipo] = useState(null);
  const [detalleItems, setDetalleItems] = useState(null);
  const [detalleLoading, setDetalleLoading] = useState(false);
  const [detalleError, setDetalleError] = useState(null);

  useEffect(() => {
    proyectoService
      .listar({})
      .then((data) => setProyectos(data || []))
      .catch((err) => console.error("Error al cargar proyectos:", err));
  }, []);

  const cargarReporte = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await reporteService.obtenerResumen({
        proyectoId: proyectoId || undefined,
        diasVencimiento,
      });
      setReporte(data);
    } catch (err) {
      console.error("Error al cargar el reporte:", err);
      setError(err.message || "No se pudo cargar el reporte.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarReporte();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proyectoId, diasVencimiento]);

  const abrirDetalle = async (tipo) => {
    setDetalleTipo(tipo);
    setDetalleItems(null);
    setDetalleError(null);
    setDetalleLoading(true);
    try {
      const data = await reporteService.obtenerDetalle({
        tipo,
        proyectoId: proyectoId || undefined,
        diasVencimiento,
      });
      setDetalleItems(data || []);
    } catch (err) {
      console.error("Error al cargar el detalle:", err);
      setDetalleError(err.message || "No se pudo cargar el detalle.");
    } finally {
      setDetalleLoading(false);
    }
  };

  const cerrarDetalle = () => {
    setDetalleTipo(null);
    setDetalleItems(null);
    setDetalleError(null);
  };

  const esDetalleEvidencia = detalleTipo === "vencidos" || detalleTipo === "por_vencer";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reportes"
        icon={BarChart3}
        subtitle="Reporte de cumplimiento on-demand, calculado en vivo."
        loading={loading}
        onRefresh={cargarReporte}
      />

      <ErrorBanner message={error} />

      {/* Filtros */}
      <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-card flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-500">Proyecto:</span>
          <select
            value={proyectoId}
            onChange={(e) => setProyectoId(e.target.value)}
            className="px-3 py-2 bg-slate-50/50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
          >
            <option value="">Todos los proyectos</option>
            {proyectos.map((p) => (
              <option key={p.id} value={p.id}>{p.nombre} ({p.codigo})</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-500">Ventana de vencimiento:</span>
          <select
            value={diasVencimiento}
            onChange={(e) => setDiasVencimiento(Number(e.target.value))}
            className="px-3 py-2 bg-slate-50/50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
          >
            {RANGOS_VENCIMIENTO.map((dias) => (
              <option key={dias} value={dias}>{dias} días</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="py-16 text-center text-slate-400 text-xs">Calculando reporte...</div>
      ) : !reporte ? null : (
        <>
          {/* KPIs de Empresas */}
          <div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
              <KpiCard icon={Building2} title="Empresas Acreditadas" value={reporte.empresas.acreditadas} color="text-sage-dark" bg="bg-sage-lighter" />
              <KpiCard icon={Building2} title="Empresas En Proceso" value={reporte.empresas.enProceso} color="text-primary-dark" bg="bg-primary-lighter" />
              <KpiCard icon={Building2} title="Empresas Observadas" value={reporte.empresas.observadas} color="text-red-600" bg="bg-red-50" />
              <KpiCard
                icon={BarChart3}
                title="% Avance Requerimientos"
                value={formatAvancePct(reporte.requerimientos.avancePct)}
                color={reporte.requerimientos.avancePct === null ? "text-slate-400" : "text-primary-dark"}
                bg={reporte.requerimientos.avancePct === null ? "bg-slate-100" : "bg-primary-lighter"}
              />
            </div>
            {!proyectoId && (
              <p className="text-[11px] text-slate-400 mt-2">
                Las tarjetas de Empresas cuentan por proceso de acreditación (Expediente) — una Empresa que participa en
                varios Proyectos puede aportar más de un proceso. La tabla "Cumplimiento por Empresa" de abajo sí está
                deduplicada por Empresa.
              </p>
            )}
          </div>

          {/* Detalle de Cumplimiento */}
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-card space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
              <ClipboardCheck className="w-4 h-4 text-slate-400" />
              <h2 className="text-sm font-bold text-carbon-dark uppercase tracking-wider">Detalle de Cumplimiento</h2>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <NumeroClickeable
                value={reporte.requerimientos.cumple}
                label="Cumple"
                className="bg-sage-lighter text-sage-darker border-sage-light"
              />
              <NumeroClickeable
                value={reporte.requerimientos.noCumple}
                label="No Cumple"
                className="bg-red-50 text-red-700 border-red-200"
                clickeable
                onClick={() => abrirDetalle("no_cumple")}
              />
              <NumeroClickeable
                value={reporte.requerimientos.pendiente}
                label="Pendiente"
                className="bg-amber-50 text-amber-700 border-amber-200"
                clickeable
                onClick={() => abrirDetalle("pendientes")}
              />
              <NumeroClickeable
                value={reporte.requerimientos.noAplica}
                label="No Aplica"
                className="bg-slate-100 text-slate-600 border-slate-200"
              />
            </div>
          </div>

          {/* Vencimientos */}
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-card space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
              <CalendarClock className="w-4 h-4 text-slate-400" />
              <h2 className="text-sm font-bold text-carbon-dark uppercase tracking-wider">
                Vencimientos ({diasVencimiento} días)
              </h2>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <NumeroClickeable
                value={reporte.vencimientos.vigente}
                label="Vigente"
                className="bg-sage-lighter text-sage-darker border-sage-light"
              />
              <NumeroClickeable
                value={reporte.vencimientos.porVencer}
                label="Por Vencer"
                className="bg-amber-50 text-amber-700 border-amber-200"
                clickeable
                onClick={() => abrirDetalle("por_vencer")}
              />
              <NumeroClickeable
                value={reporte.vencimientos.vencido}
                label="Vencido"
                className="bg-red-50 text-red-700 border-red-200"
                clickeable
                onClick={() => abrirDetalle("vencidos")}
              />
            </div>
          </div>

          {/* Cumplimiento por Empresa */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-card overflow-hidden">
            <div className="p-6 pb-0">
              <h2 className="text-sm font-bold text-carbon-dark uppercase tracking-wider">Cumplimiento por Empresa</h2>
            </div>
            <div className="overflow-x-auto p-6">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    <th className="py-3">Empresa</th>
                    <th className="py-3">% Avance</th>
                    <th className="py-3">Estado del Expediente</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {reporte.porEmpresa.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="py-8 text-center text-slate-400">Sin datos en este alcance.</td>
                    </tr>
                  ) : (
                    reporte.porEmpresa.map((row) => (
                      <tr key={row.empresaId}>
                        <td className="py-3 font-semibold text-carbon-dark">{row.empresaNombre}</td>
                        <td className={`py-3 font-bold ${row.avancePct === null ? "text-slate-400" : "text-carbon-dark"}`}>
                          {formatAvancePct(row.avancePct)}
                        </td>
                        <td className="py-3">
                          <StatusBadge value={row.expedienteEstado} map={ESTADO_EXPEDIENTE_MAP} />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Cumplimiento por Proyecto */}
          {reporte.porProyecto && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-card overflow-hidden">
              <div className="p-6 pb-0">
                <h2 className="text-sm font-bold text-carbon-dark uppercase tracking-wider">Cumplimiento por Proyecto</h2>
              </div>
              <div className="overflow-x-auto p-6">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                      <th className="py-3">Proyecto</th>
                      <th className="py-3">Acreditadas</th>
                      <th className="py-3">En Proceso</th>
                      <th className="py-3">Observadas</th>
                      <th className="py-3">% Avance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {reporte.porProyecto.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-slate-400">Sin datos en este alcance.</td>
                      </tr>
                    ) : (
                      reporte.porProyecto.map((row) => (
                        <tr key={row.proyectoId}>
                          <td className="py-3 font-semibold text-carbon-dark">{row.proyectoNombre}</td>
                          <td className="py-3 text-slate-600 font-medium">{row.empresas.acreditadas}</td>
                          <td className="py-3 text-slate-600 font-medium">{row.empresas.enProceso}</td>
                          <td className="py-3 text-slate-600 font-medium">{row.empresas.observadas}</td>
                          <td className={`py-3 font-bold ${row.requerimientos.avancePct === null ? "text-slate-400" : "text-carbon-dark"}`}>
                            {formatAvancePct(row.requerimientos.avancePct)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Modal de detalle */}
      {detalleTipo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={cerrarDetalle}>
          <div
            className="bg-white rounded-2xl shadow-dropdown w-full max-w-2xl max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h3 className="text-sm font-bold text-carbon-dark uppercase tracking-wider">
                {TITULOS_DETALLE[detalleTipo]}
              </h3>
              <button
                type="button"
                onClick={cerrarDetalle}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-y-auto p-5">
              {detalleLoading ? (
                <p className="text-xs text-slate-400 text-center py-8">Cargando...</p>
              ) : detalleError ? (
                <ErrorBanner message={detalleError} />
              ) : !detalleItems || detalleItems.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-8">Sin registros para este filtro.</p>
              ) : esDetalleEvidencia ? (
                <ul className="divide-y divide-slate-100">
                  {detalleItems.map((item) => (
                    <li key={item.id} className="py-3 flex items-center justify-between gap-3 text-xs">
                      <div>
                        <p className="font-semibold text-carbon-dark">{item.archivoNombre}</p>
                        <p className="text-[11px] text-slate-400">{item.empresaNombre || "-"}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-[11px] text-slate-500">{formatFecha(item.fechaVencimiento)}</p>
                        <p className={`text-[11px] font-bold ${item.diasRestantes < 0 ? "text-red-600" : "text-amber-600"}`}>
                          {item.diasRestantes < 0
                            ? `Vencido hace ${Math.abs(item.diasRestantes)} día${Math.abs(item.diasRestantes) === 1 ? "" : "s"}`
                            : `Vence en ${item.diasRestantes} día${item.diasRestantes === 1 ? "" : "s"}`}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {detalleItems.map((item) => (
                    <li key={item.id} className="py-3 space-y-1 text-xs">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-semibold text-carbon-dark">{item.requerimientoNombre}</p>
                        <StatusBadge value={item.resultado} map={MAPA_EVALUACION} />
                      </div>
                      <p className="text-[11px] text-slate-400">{item.empresaNombre || "-"}</p>
                      {item.observaciones && (
                        <p className="text-[11px] text-slate-600">{item.observaciones}</p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
