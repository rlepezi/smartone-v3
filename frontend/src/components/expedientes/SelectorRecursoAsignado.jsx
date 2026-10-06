import React, { useState } from "react";
import { Users, Truck, Search, UserPlus } from "lucide-react";
import { ActionButton } from "../shared/ActionButton";
import { IngresarRecursoModal } from "./IngresarRecursoModal";

const SUBTABS = [
  { key: "pendiente", label: "Pendientes" },
  { key: "evaluada", label: "Evaluadas" },
];

const claseAvance = (pct) => (
  pct === null ? "bg-slate-100 text-slate-500 border-slate-200" :
  pct >= 70 ? "bg-sage-lighter text-sage-darker border-sage-light" :
  pct >= 40 ? "bg-amber-50 text-amber-700 border-amber-200" :
  "bg-red-50 text-red-700 border-red-200"
);

const ItemRecursoAsignado = ({ item, activo, onSeleccionar }) => (
  <li>
    <button
      type="button"
      onClick={() => onSeleccionar(item.id)}
      className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl border text-left transition-colors ${
        activo ? "border-primary bg-primary-lighter" : "border-slate-100 hover:bg-slate-50"
      }`}
    >
      <span className="min-w-0">
        <span className="block text-xs font-bold text-carbon-dark truncate">{item.nombre}</span>
        {item.subtitulo && <span className="block text-[11px] text-slate-400 truncate">{item.subtitulo}</span>}
      </span>
      <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap ${claseAvance(item.avancePct)}`}>
        {item.avancePct === null ? "Sin datos" : `${item.avancePct}%`}
      </span>
    </button>
  </li>
);

// Lista de Personas o Maquinarias asignadas a un Expediente, para elegir cuál ver en el panel de
// al lado. Reutilizable para ambos tipos — cambia solo el ícono y las etiquetas de cabecera.
// `items`: [{ id, nombre, subtitulo (rol/tipo), busqueda (RUT/patente), avancePct: number|null,
// estado: "pendiente"|"evaluada" }]. Se le pasa `key={nivelActivo}` desde quien la usa para que
// remonte (y así reinicie sub-pestaña y buscador a su estado inicial) cada vez que se entra a
// esta pestaña, sin importar desde cuál otra se venga.
// `empresaId`/`mandanteId`/`proyectoDestinoId`/`proyectoDestinoNombre`/`onIngresado`: datos que
// necesita el botón "+ Ingresar" para abrir IngresarRecursoModal y, al confirmar, avisarle a quien
// usa este componente que refresque los datos del Expediente.
export const SelectorRecursoAsignado = ({
  tipo, items, seleccionadoId, onSeleccionar,
  empresaId, mandanteId, proyectoDestinoId, proyectoDestinoNombre, onIngresado,
}) => {
  const [subTab, setSubTab] = useState("pendiente");
  const [busqueda, setBusqueda] = useState("");
  const [modalAbierto, setModalAbierto] = useState(false);

  const Icono = tipo === "persona" ? Users : Truck;
  const titulo = tipo === "persona" ? "Personas asignadas" : "Maquinarias asignadas";
  const etiquetaIngresar = tipo === "persona" ? "Ingresar Persona" : "Ingresar Maquinaria";
  const vacioTotal = tipo === "persona"
    ? "No hay personas asignadas a este expediente aún."
    : "No hay maquinarias asignadas a este expediente aún.";
  const placeholderBusqueda = tipo === "persona" ? "Buscar por nombre o RUT..." : "Buscar por nombre o patente...";

  const pendientes = items.filter((i) => i.estado !== "evaluada");
  const evaluadas = items.filter((i) => i.estado === "evaluada");

  const termino = busqueda.trim().toLowerCase();
  const coincide = (item) =>
    !termino ||
    item.nombre.toLowerCase().includes(termino) ||
    (item.busqueda || "").toLowerCase().includes(termino);

  const listaSinFiltrar = subTab === "pendiente" ? pendientes : evaluadas;
  const listaActiva = listaSinFiltrar.filter(coincide);

  const handleIngresado = () => {
    setModalAbierto(false);
    onIngresado?.();
  };

  return (
    // h-full + flex-col: cuando el grid de la fila estira esta tarjeta a la misma altura que sus
    // vecinas (Cumplimiento Documental/Resumen), la lista de abajo (flex-1) es la que crece para
    // llenar ese espacio — con su propio scroll interno si aun así no alcanza — en vez de quedar
    // arriba con espacio vacío debajo. El botón "+ Ingresar" queda siempre pinneado abajo.
    // max-h-96 (mismo valor que ALTURA_MAX_FILA_CUMPLIMIENTO en PlanillaEvaluacion.jsx): con
    // 30-50 Personas/Maquinarias asignadas, sin este tope la lista estiraría toda la fila
    // (Cumplimiento Documental/Resumen) a una altura enorme — acá scrollea, ellas no crecen más.
    <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-card flex flex-col h-full max-h-96 space-y-3">
      <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
        <Icono className="w-4 h-4 text-primary" />
        <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider">{titulo}</h3>
        <span className="ml-auto text-[11px] font-bold text-slate-400">{items.length}</span>
      </div>

      {items.length === 0 ? (
        <p className="text-xs text-slate-400">{vacioTotal}</p>
      ) : (
        <>
          <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-50 border border-slate-100">
            {SUBTABS.map((t) => {
              const count = t.key === "pendiente" ? pendientes.length : evaluadas.length;
              const activo = subTab === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setSubTab(t.key)}
                  className={`flex-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-colors whitespace-nowrap ${
                    activo ? "bg-white text-primary-dark shadow-sm border border-primary-light" : "text-slate-500 hover:text-carbon-dark"
                  }`}
                >
                  {t.label} ({count})
                </button>
              );
            })}
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder={placeholderBusqueda}
              className="w-full pl-8 pr-3 py-2 bg-gray-50/50 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>

          <div className="flex-1 min-h-0">
            {listaActiva.length === 0 ? (
              <p className="text-xs text-slate-400 italic py-2">
                {termino
                  ? "Ningún resultado para esta búsqueda."
                  : subTab === "pendiente"
                    ? "No hay pendientes — todos completaron su evaluación."
                    : "Nadie ha completado su evaluación todavía."}
              </p>
            ) : (
              <ul className="h-full space-y-1.5 overflow-y-auto pr-0.5">
                {listaActiva.map((item) => (
                  <ItemRecursoAsignado
                    key={item.id}
                    item={item}
                    activo={item.id === seleccionadoId}
                    onSeleccionar={onSeleccionar}
                  />
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      <ActionButton icon={UserPlus} onClick={() => setModalAbierto(true)} className="w-full justify-center">
        {etiquetaIngresar}
      </ActionButton>

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
