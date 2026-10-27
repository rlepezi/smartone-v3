import { useState } from "react";
import {
  Users, Truck, Search, Plus, X, Clock, CheckCircle2, FileText,
  History, ChevronDown, ChevronUp, IdCard, CalendarDays, Building2, FolderOpen, Tags, AlertTriangle,
} from "lucide-react";
import { IngresarRecursoModal } from "./IngresarRecursoModal";
import { ResumenCumplimientoLista } from "../shared/ResumenCumplimientoLista";
import { personaService } from "../../services/personaService";
import { recursoService } from "../../services/recursoService";
import { describirEvento } from "../../utils/bitacoraFormatters";
import { formatFecha, formatTiempoRelativo } from "../../utils/fechas";

const SUBTABS = [
  { key: "pendiente", label: "Pendientes" },
  { key: "evaluada", label: "Evaluadas" },
];

const TEXTOS = {
  persona: {
    Icono: Users,
    titulo: "Personas asignadas",
    ingresar: "Ingresar persona",
    buscar: "Buscar por nombre o RUT...",
    colNombre: "Persona", colClasificacion: "Perfil", colIdentificador: "RUT",
    filtroTodos: "Todos los perfiles",
    vacio: "No hay personas asignadas a este expediente aún.",
    detalle: "Detalle de persona",
    requisitos: "Requisitos de la persona",
    sinRequisitos: "Esta persona no tiene requerimientos configurados para su perfil",
    evaluadas: "Evaluadas",
  },
  recurso: {
    Icono: Truck,
    titulo: "Recursos asignados",
    ingresar: "Ingresar recurso",
    buscar: "Buscar por nombre o patente...",
    colNombre: "Recurso", colClasificacion: "Tipo", colIdentificador: "Identificador",
    filtroTodos: "Todos los tipos",
    vacio: "No hay recursos asignados a este expediente aún.",
    detalle: "Detalle del recurso",
    requisitos: "Requerimientos del recurso",
    sinRequisitos: "Este recurso no tiene requerimientos configurados para su clasificación",
    evaluadas: "Evaluados",
  },
};

const InsigniaEstado = ({ estado }) => (
  estado === "evaluada" ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border bg-sage-lighter text-sage-darker border-sage-light whitespace-nowrap">
      <CheckCircle2 className="w-3 h-3" /> Evaluada
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border bg-amber-50 text-amber-700 border-amber-200 whitespace-nowrap">
      <Clock className="w-3 h-3" /> Pendiente
    </span>
  )
);

const FilaDetalle = ({ Icono, etiqueta, children }) => (
  <div className="flex items-start gap-2.5 text-xs">
    <Icono className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
    <span className="w-24 shrink-0 text-slate-500">{etiqueta}</span>
    <span className="min-w-0 font-semibold text-carbon-dark break-words">{children || "—"}</span>
  </div>
);

// Historial (Bitácora) de la persona o maquinaria: se pide recién al desplegarlo.
const HistorialSujeto = ({ tipo, id }) => {
  const [abierto, setAbierto] = useState(false);
  const [eventos, setEventos] = useState(null); // null = sin pedir, "error" = falló
  const alternar = () => {
    const abriendo = !abierto;
    setAbierto(abriendo);
    if (abriendo && eventos === null) {
      (tipo === "persona" ? personaService : recursoService)
        .obtenerEventos(id, { limit: 15 })
        .then((data) => setEventos(data || []))
        .catch(() => setEventos("error"));
    }
  };
  return (
    <div className="pt-3 border-t border-slate-100">
      <button type="button" onClick={alternar} aria-expanded={abierto} className="w-full flex items-center justify-between">
        <span className="flex items-center gap-2 text-xs font-bold text-carbon-dark">
          <History className="w-4 h-4 text-primary" /> Historial
        </span>
        {abierto ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
      </button>
      {abierto && (
        eventos === null ? <p className="text-[11px] text-slate-400 py-3 text-center">Cargando historial...</p>
          : eventos === "error" ? <p className="text-[11px] text-red-600 py-3 text-center">No se pudo cargar el historial.</p>
            : eventos.length === 0 ? <p className="text-[11px] text-slate-400 py-3 text-center">Sin eventos registrados.</p>
              : (
                <ul className="mt-2 divide-y divide-slate-100 max-h-56 overflow-y-auto">
                  {eventos.map((ev) => (
                    <li key={ev.id} className="py-2 text-[11px]">
                      <p className="font-semibold text-slate-700">{describirEvento(ev)}</p>
                      <p className="text-slate-400">{ev.actorNombre} · {formatTiempoRelativo(ev.createdAt)}</p>
                    </li>
                  ))}
                </ul>
              )
      )}
    </div>
  );
};

// Pestañas Personas / Recursos del Detalle de Expediente: tabla de las personas o maquinarias
// asignadas (sub-pestañas Pendientes/Evaluadas, búsqueda, filtro por perfil o tipo, botón de
// ingreso) y, a la derecha, el panel de detalle de la fila elegida. La evaluación (planilla de
// requisitos) la dibuja quien usa este componente, en un modal que se abre al elegir una fila o
// con "Evaluar requisitos" (`onIrARequisitos`).
// `items`: [{ id, nombre, subtitulo (perfiles / tipo), busqueda (RUT / patente), requerimientos,
// resumen (contadores del sujeto), estado: "pendiente"|"evaluada", fechaInicio }].
// `alertasVencimiento`: { sujetoId: { texto, vencidos } } — ícono de alerta junto al nombre con
// el detalle en su tooltip ("1 vencido, 2 próximos a vencer"); rojo si hay vencidos.
// `puedeIngresar`: false en un Expediente cerrado (solo lectura: sin "Ingresar").
// `seleccionadoId` puede ser null (panel cerrado). `key={tipo}` desde quien lo usa reinicia
// sub-pestaña, búsqueda y filtro al cambiar de pestaña.
export const SujetosAsignados = ({
  tipo, items, seleccionadoId, onSeleccionar,
  empresaId, empresaNombre, mandanteId, proyectoDestinoId, proyectoDestinoNombre, proyectoTexto,
  perfilParticipacionNombre, onIngresado, puedeConfigurar = false, onConfigurar, onIrARequisitos,
  puedeIngresar = true, alertasVencimiento = {},
}) => {
  const t = TEXTOS[tipo];
  // Sub-pestaña elegida por el usuario; mientras no elija, parte en Pendientes, o en Evaluadas si
  // no queda ningún pendiente (derivado: se ajusta también cuando los ítems terminan de cargar).
  const [subTabElegida, setSubTab] = useState(null);
  const [busqueda, setBusqueda] = useState("");
  const [filtroClasificacion, setFiltroClasificacion] = useState("");
  const [modalAbierto, setModalAbierto] = useState(false);

  const pendientes = items.filter((i) => i.estado !== "evaluada");
  const evaluadas = items.filter((i) => i.estado === "evaluada");
  const subTab = subTabElegida ?? (pendientes.length === 0 && evaluadas.length > 0 ? "evaluada" : "pendiente");
  const clasificaciones = [...new Set(items.map((i) => i.subtitulo).filter(Boolean))].sort();

  const termino = busqueda.trim().toLowerCase();
  const lista = (subTab === "pendiente" ? pendientes : evaluadas).filter((i) => (
    (!termino || i.nombre.toLowerCase().includes(termino) || (i.busqueda || "").toLowerCase().includes(termino)) &&
    (!filtroClasificacion || i.subtitulo === filtroClasificacion)
  ));

  const seleccionado = items.find((i) => i.id === seleccionadoId) || null;

  const handleIngresado = () => {
    setModalAbierto(false);
    onIngresado?.();
  };

  return (
    <div className={`grid gap-6 items-start ${seleccionado ? "lg:grid-cols-[minmax(0,1fr)_20rem]" : ""}`}>
      {/* Tabla */}
      <div className="min-w-0 space-y-4">
        <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <h3 className="flex items-center gap-2 text-base font-bold text-carbon-dark">
            <t.Icono className="w-5 h-5 text-primary" /> {t.titulo}
          </h3>
          <span className="px-2.5 py-1 rounded-lg bg-primary-lighter text-primary-dark text-[11px] font-bold whitespace-nowrap">
            Total: {items.length}
          </span>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-50 border border-slate-100">
            {SUBTABS.map((s) => {
              const activo = subTab === s.key;
              const cuenta = s.key === "pendiente" ? pendientes.length : evaluadas.length;
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setSubTab(s.key)}
                  className={`px-4 py-1.5 rounded-lg text-[11px] font-bold transition-colors whitespace-nowrap ${
                    activo ? "bg-primary text-white shadow-sm" : "text-slate-500 hover:text-carbon-dark"
                  }`}
                >
                  {s.key === "evaluada" ? t.evaluadas : s.label} ({cuenta})
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[12rem]">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text" value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
              placeholder={t.buscar}
              className="w-full pl-9 pr-3 py-2 bg-gray-50/50 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>
          <select
            value={filtroClasificacion}
            onChange={(e) => setFiltroClasificacion(e.target.value)}
            aria-label={t.colClasificacion}
            className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          >
            <option value="">{t.filtroTodos}</option>
            {clasificaciones.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          {puedeIngresar && (
            <button
              type="button"
              onClick={() => setModalAbierto(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary hover:bg-primary-dark text-white font-bold text-xs shadow-md shadow-primary/20 transition-all whitespace-nowrap"
            >
              <Plus className="w-4 h-4" /> {t.ingresar}
            </button>
          )}
        </div>

        {items.length === 0 ? (
          <p className="text-xs text-slate-400 py-8 text-center">{t.vacio}</p>
        ) : lista.length === 0 ? (
          <p className="text-xs text-slate-400 italic py-8 text-center">
            {termino || filtroClasificacion
              ? "Ningún resultado con estos filtros."
              : subTab === "pendiente"
                ? "No hay pendientes: todos completaron su evaluación."
                : "Nadie ha completado su evaluación todavía."}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-100">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-50 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  <th className="px-4 py-2.5">{t.colNombre}</th>
                  <th className="px-3 py-2.5">{t.colClasificacion}</th>
                  <th className="px-3 py-2.5">{t.colIdentificador}</th>
                  <th className="px-3 py-2.5 text-center">Requerimientos</th>
                  <th className="px-3 py-2.5">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lista.map((i) => {
                  const activo = i.id === seleccionadoId;
                  return (
                    <tr
                      key={i.id}
                      onClick={() => onSeleccionar(i.id)}
                      aria-selected={activo}
                      className={`cursor-pointer transition-colors ${activo ? "bg-primary-lighter/60" : "hover:bg-slate-50"}`}
                    >
                      <td className="px-4 py-3 font-bold text-carbon-dark">
                        <span className="inline-flex items-center gap-1.5">
                          {i.nombre}
                          {alertasVencimiento[i.id] && (
                            <AlertTriangle
                              className={`w-3.5 h-3.5 shrink-0 ${alertasVencimiento[i.id].vencidos ? "text-red-500" : "text-amber-500"}`}
                              aria-label={alertasVencimiento[i.id].texto}
                            >
                              <title>{alertasVencimiento[i.id].texto}</title>
                            </AlertTriangle>
                          )}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-slate-600">{i.subtitulo || "—"}</td>
                      <td className="px-3 py-3 font-mono text-slate-600 whitespace-nowrap">{i.busqueda || "Sin datos"}</td>
                      <td className="px-3 py-3 text-center font-semibold text-slate-700 tabular-nums">{i.requerimientos}</td>
                      <td className="px-3 py-3"><InsigniaEstado estado={i.estado} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Panel de detalle de la fila elegida */}
      {seleccionado && (
        <aside className="rounded-2xl border border-slate-100 p-5 space-y-4 min-w-0">
          <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100">
            <h3 className="flex items-center gap-2 text-sm font-bold text-carbon-dark">
              <t.Icono className="w-4 h-4 text-primary" /> {t.detalle}
            </h3>
            <button
              type="button" onClick={() => onSeleccionar(null)} aria-label="Cerrar detalle"
              className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-1.5">
            <p className="text-sm font-bold text-carbon-dark break-words">{seleccionado.nombre}</p>
            <InsigniaEstado estado={seleccionado.estado} />
          </div>

          <div className="space-y-2.5">
            <FilaDetalle Icono={Tags} etiqueta={t.colClasificacion}>{seleccionado.subtitulo}</FilaDetalle>
            <FilaDetalle Icono={IdCard} etiqueta={t.colIdentificador}>
              {seleccionado.busqueda ? <span className="font-mono">{seleccionado.busqueda}</span> : null}
            </FilaDetalle>
            <FilaDetalle Icono={CalendarDays} etiqueta="Inicio asignación">
              {seleccionado.fechaInicio ? formatFecha(seleccionado.fechaInicio) : null}
            </FilaDetalle>
            <FilaDetalle Icono={Building2} etiqueta="Empresa">{empresaNombre}</FilaDetalle>
            <FilaDetalle Icono={FolderOpen} etiqueta="Proyecto">{proyectoTexto}</FilaDetalle>
            <FilaDetalle Icono={FileText} etiqueta="Participación">{perfilParticipacionNombre}</FilaDetalle>
          </div>

          <div className="pt-3 border-t border-slate-100 space-y-3">
            <p className="flex items-center gap-2 text-xs font-bold text-carbon-dark">
              <FileText className="w-4 h-4 text-primary" /> {t.requisitos}
            </p>
            {seleccionado.requerimientos === 0 ? (
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 text-center space-y-3">
                <div className="w-10 h-10 rounded-full bg-white border border-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                  <FileText className="w-4 h-4" />
                </div>
                <p className="text-[11px] text-slate-500">{t.sinRequisitos}</p>
                {puedeConfigurar && (
                  <button
                    type="button" onClick={onConfigurar}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-primary/30 bg-white text-primary text-[11px] font-bold hover:bg-primary-lighter"
                  >
                    <Plus className="w-3.5 h-3.5" /> Configurar requisitos
                  </button>
                )}
              </div>
            ) : (
              <>
                <ResumenCumplimientoLista resumen={seleccionado.resumen} />
                <button
                  type="button" onClick={onIrARequisitos}
                  className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 text-[11px] font-bold text-carbon-dark hover:bg-slate-50"
                >
                  Evaluar requisitos
                </button>
              </>
            )}
          </div>

          <HistorialSujeto key={seleccionado.id} tipo={tipo} id={seleccionado.id} />
        </aside>
      )}

      {modalAbierto && (
        <IngresarRecursoModal
          tipo={tipo}
          empresaId={empresaId}
          mandanteId={mandanteId}
          proyectoDestinoId={proyectoDestinoId}
          proyectoDestinoNombre={proyectoDestinoNombre}
          onIngresado={handleIngresado}
          onCerrar={() => setModalAbierto(false)}
        />
      )}
    </div>
  );
};
