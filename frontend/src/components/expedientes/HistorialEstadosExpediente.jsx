import { ArrowRight, GitCommitVertical } from "lucide-react";
import { etiquetaEstadoExpediente, etiquetaMotivoCierre } from "../../services/expedienteService";
import { formatFechaHora } from "../../utils/fechas";

const etiquetaEstado = etiquetaEstadoExpediente;

// Motivo legible: los de cierre por su nombre; las correcciones con su propio rótulo.
const etiquetaMotivo = (motivo) => {
  if (!motivo) return null;
  if (motivo === "correccion") return "Corrección";
  if (motivo === "reapertura") return "Reapertura";
  return etiquetaMotivoCierre(motivo);
};

// "Historial de estados" (pestaña General del detalle): lista cronológica de los cambios de
// estado del Expediente (expedienteEstados), con fecha y hora, transición, origen, usuario y
// motivo. `historial`: null mientras carga. La creación encabeza la lista: el registro "creacion"
// (expedientes nuevos) o, en los anteriores a ese registro, la fecha y el creador de la cabecera.
export const HistorialEstadosExpediente = ({ historial: registros, expediente = null }) => {
  const conCreacion = registros && expediente && !registros.some((h) => h.origen === "creacion")
    ? [{ id: "creacion", estadoAnterior: null, estadoNuevo: "creado", origen: "creacion",
      createdAt: expediente.createdAt, actorNombre: expediente.creadoPorNombre || null }, ...registros]
    : registros;
  return <Historial historial={conCreacion} />;
};

const Historial = ({ historial }) => (
  <div className="rounded-2xl border border-slate-100 p-5 space-y-3">
    <h4 className="flex items-center gap-2 text-sm font-bold text-carbon-dark">
      <GitCommitVertical className="w-4 h-4 text-primary" />
      Historial de estados
    </h4>
    {historial === null ? (
      <p className="text-xs text-slate-400">Cargando...</p>
    ) : historial.length === 0 ? (
      <p className="text-xs text-slate-400">Sin cambios de estado registrados.</p>
    ) : (
      <ol className="space-y-2">
        {historial.map((h) => {
          const motivo = etiquetaMotivo(h.motivo);
          return (
            <li key={h.id} className="flex flex-wrap items-start gap-x-4 gap-y-1 px-3 py-2.5 rounded-xl border border-slate-100 text-xs">
              <span className="font-mono text-[11px] text-slate-500 whitespace-nowrap">{formatFechaHora(h.createdAt)}</span>
              <span className="flex items-center gap-1.5 font-bold text-carbon-dark">
                {h.origen === "creacion" ? (
                  <>Expediente creado <ArrowRight className="w-3.5 h-3.5 text-slate-400" /> {etiquetaEstado(h.estadoNuevo)}</>
                ) : (
                  <>
                    {etiquetaEstado(h.estadoAnterior)}
                    <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                    {etiquetaEstado(h.estadoNuevo)}
                  </>
                )}
              </span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                h.origen === "manual" || h.origen === "creacion"
                  ? "bg-primary-lighter text-primary-dark border-primary-light"
                  : "bg-slate-50 text-slate-500 border-slate-200"
              }`}
              >
                {h.origen === "creacion" ? "Creación" : h.origen === "manual" ? "Manual" : h.origen === "migracion" ? "Migración" : "Automático"}
              </span>
              <span className="text-slate-500">{h.actorNombre || "Sistema"}</span>
              {(motivo || h.detalle) && (
                <span className="basis-full text-slate-500">
                  {motivo && <strong className="font-semibold text-slate-600">{motivo}</strong>}
                  {motivo && h.detalle ? " · " : ""}
                  {h.detalle}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    )}
  </div>
);
