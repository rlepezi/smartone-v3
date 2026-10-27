import { useEffect, useState } from "react";
import { Building2, Users, Truck, RefreshCw, Eye, CalendarClock } from "lucide-react";
import { formatFecha } from "../../utils/fechas";
import { formatRutDisplay } from "../../utils/rutFormatters";
import { textoVencimiento, CLASE_VENCIMIENTO, UMBRAL_PROXIMO_DIAS } from "../../utils/vencimientos";
import { CLASE_RESALTADO, enfocarElemento } from "../../pages/acreditaciones/asistenteNavegacion";

const ICONO_TIPO = { empresa: Building2, persona: Users, recurso: Truck };

// Indicadores clickeables (filtran la lista por clasificación).
const INDICADORES = [
  { key: "vencido", label: "Vencidos", total: "vencidos", clase: "text-red-700 bg-red-50 border-red-200" },
  { key: "vence_hoy", label: "Vence hoy", total: "venceHoy", clase: "text-orange-700 bg-orange-50 border-orange-200" },
  { key: "proximo_7", label: "≤ 7 días", total: "proximos7", clase: "text-orange-700 bg-orange-50 border-orange-200" },
  { key: "proximo_30", label: `≤ ${UMBRAL_PROXIMO_DIAS} días`, total: "proximos30", clase: "text-amber-700 bg-amber-50 border-amber-200" },
];
const TIPOS = [
  { value: "", label: "Todos" },
  { value: "empresa", label: "Empresa" },
  { value: "persona", label: "Personas" },
  { value: "recurso", label: "Maquinaria" },
];
const ESTADOS = [
  { value: "todos", label: "Todos" },
  { value: "vencidos", label: "Vencidos" },
  { value: "proximos", label: "Próximos" },
];

const refVencimiento = (instanciaId) => `vencimiento-${instanciaId}`;

const claseChip = (activo) => `px-2.5 py-1 rounded-full text-[11px] font-bold border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
  activo ? "bg-primary text-white border-primary" : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"
}`;

const identificacionDe = (item) => {
  const id = item.sujeto?.identificacion;
  if (!id) return null;
  // Patente o pasaporte tal cual; un RUT con su formato.
  return item.tipoEntidad !== "recurso" && /^\d{7,8}[\dkK]$/.test(id) ? formatRutDisplay(id) : id;
};

// Pestaña "Vencimientos" del detalle de Expediente: lista consolidada de documentos vencidos o
// que vencen dentro del umbral, con indicadores que filtran y la acción "Renovar" (abre la
// evaluación de esa instancia) o "Ver requerimiento". `datos`: respuesta de
// GET /expedientes/:id/vencimientos (null mientras carga). `itemInicial`: instancia a la que ir
// (enlace directo ?item=): se hace scroll, se resalta unos segundos y recibe el foco.
export const VencimientosExpediente = ({ datos, puedeRenovar, onRenovar, onVer, itemInicial = null }) => {
  const [clasificacion, setClasificacion] = useState("");
  const [tipo, setTipo] = useState("");
  const [estado, setEstado] = useState("todos");

  useEffect(() => {
    if (!itemInicial || !datos) return undefined;
    return enfocarElemento(refVencimiento(itemInicial));
  }, [itemInicial, datos]);

  if (!datos) return <p className="py-8 text-center text-xs text-slate-400">Cargando vencimientos...</p>;

  const { items = [], totales = {} } = datos;
  const visibles = items.filter((it) =>
    (!clasificacion || it.clasificacion === clasificacion) &&
    (!tipo || it.tipoEntidad === tipo) &&
    (estado === "todos" || (estado === "vencidos" ? it.clasificacion === "vencido" : it.clasificacion !== "vencido")));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {INDICADORES.map((ind) => {
          const activo = clasificacion === ind.key;
          return (
            <button
              key={ind.key}
              type="button"
              aria-pressed={activo}
              onClick={() => setClasificacion(activo ? "" : ind.key)}
              className={`flex items-center justify-between gap-2 px-4 py-3 rounded-xl border text-left transition-shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${ind.clase} ${activo ? "ring-2 ring-primary/40 shadow-sm" : "hover:shadow-sm"}`}
            >
              <span className="text-[11px] font-bold uppercase tracking-wider">{ind.label}</span>
              <span className="text-lg font-black">{totales[ind.total] || 0}</span>
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-x-6 gap-y-2 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap" role="group" aria-label="Tipo de sujeto">
          {TIPOS.map((t) => (
            <button key={t.value || "todos"} type="button" aria-pressed={tipo === t.value} onClick={() => setTipo(t.value)} className={claseChip(tipo === t.value)}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap" role="group" aria-label="Estado">
          {ESTADOS.map((e) => (
            <button key={e.value} type="button" aria-pressed={estado === e.value} onClick={() => setEstado(e.value)} className={claseChip(estado === e.value)}>
              {e.label}
            </button>
          ))}
        </div>
      </div>

      {items.length === 0 ? (
        <div className="py-10 text-center space-y-2">
          <CalendarClock className="w-6 h-6 text-slate-300 mx-auto" />
          <p className="text-xs text-slate-400">
            No hay documentos vencidos ni próximos a vencer en los próximos {UMBRAL_PROXIMO_DIAS} días.
          </p>
        </div>
      ) : visibles.length === 0 ? (
        <p className="py-8 text-center text-xs text-slate-400">Ningún vencimiento coincide con este filtro.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-100">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                <th className="px-4 py-2.5">Sujeto</th>
                <th className="px-3 py-2.5">Requerimiento</th>
                <th className="px-3 py-2.5">Vence</th>
                <th className="px-3 py-2.5">Estado</th>
                <th className="px-3 py-2.5"><span className="sr-only">Acción</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibles.map((it) => {
                const Icono = ICONO_TIPO[it.tipoEntidad] || Building2;
                const identificacion = identificacionDe(it);
                return (
                  <tr
                    key={it.instanciaId}
                    data-asistente-ref={refVencimiento(it.instanciaId)}
                    tabIndex={-1}
                    className={`focus:outline-none ${CLASE_RESALTADO}`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Icono className="w-4 h-4 text-slate-400 shrink-0" />
                        <div className="min-w-0">
                          <p className="font-bold text-carbon-dark truncate">{it.sujeto?.nombre || "—"}</p>
                          {identificacion && <p className="text-[11px] text-slate-400 font-mono">{identificacion}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-slate-600" title={it.requerimiento?.nombre || undefined}>
                      {it.requerimiento?.nombreCorto || it.requerimiento?.nombre || "—"}
                    </td>
                    <td className="px-3 py-3 text-slate-600 whitespace-nowrap">{formatFecha(it.fechaVencimiento)}</td>
                    <td className="px-3 py-3">
                      <span className={`inline-flex px-2.5 py-1 rounded-full text-[11px] font-bold border whitespace-nowrap ${CLASE_VENCIMIENTO[it.clasificacion] || ""}`}>
                        {textoVencimiento(it.dias)}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right">
                      {puedeRenovar ? (
                        <button
                          type="button"
                          data-asistente-foco=""
                          onClick={() => onRenovar(it)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary hover:bg-primary-dark text-white text-[11px] font-bold whitespace-nowrap"
                        >
                          <RefreshCw className="w-3.5 h-3.5" /> Renovar
                        </button>
                      ) : (
                        <button
                          type="button"
                          data-asistente-foco=""
                          onClick={() => onVer(it)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-[11px] font-bold text-carbon-dark hover:bg-slate-50 whitespace-nowrap"
                        >
                          <Eye className="w-3.5 h-3.5" /> Ver requerimiento
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
