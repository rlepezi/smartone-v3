import React, { useMemo, useState } from "react";
import { X, Search } from "lucide-react";
import { formatRutDisplay } from "../../utils/rutFormatters";
import { SelectConBusqueda } from "../shared/SelectConBusqueda";

// Disponibilidad de una Persona/Maquinaria respecto del Proyecto de la acreditación:
//  - "disponible": sin Asignación activa.
//  - "otro": activa en otro Proyecto (seleccionarla implica traslado al confirmar el wizard).
//  - "este": ya está activa en ESTE Proyecto (no se puede volver a asignar).
export const disponibilidadDe = (item, proyectoActualId) => {
  const activa = item.participacionActiva;
  if (!activa) return "disponible";
  return activa.proyectoId === proyectoActualId ? "este" : "otro";
};

const BADGES = {
  disponible: { label: "Disponible", className: "bg-sage-lighter text-sage-darker border-sage-light", punto: "bg-emerald-500" },
  otro: { label: "En otro proyecto", className: "bg-amber-50 text-amber-700 border-amber-200", punto: "bg-amber-500" },
  este: { label: "Ya en este proyecto", className: "bg-slate-100 text-slate-500 border-slate-200", punto: "bg-slate-400" },
};

// Badges de estado de una fila: la disponibilidad y, si está elegida, "Seleccionada" (se combinan).
export const BadgesDisponibilidad = ({ item, proyectoActualId, seleccionada }) => {
  const clave = disponibilidadDe(item, proyectoActualId);
  const b = BADGES[clave];
  return (
    <span className="inline-flex items-center gap-1.5 flex-wrap">
      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap ${b.className}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${b.punto}`} />
        {b.label}
        {clave === "otro" && item.participacionActiva?.proyectoNombre ? ` · ${item.participacionActiva.proyectoNombre}` : ""}
      </span>
      {seleccionada && (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap bg-sky-50 text-sky-700 border-sky-200">
          <span className="w-1.5 h-1.5 rounded-full bg-sky-500" />
          Seleccionada
          {clave === "otro" ? " · Requiere traslado" : ""}
        </span>
      )}
    </span>
  );
};

const CHIPS = [
  { key: "todas", label: "Todas" },
  { key: "disponible", label: "Disponibles" },
  { key: "otro", label: "En otro proyecto" },
  { key: "seleccionadas", label: "Seleccionadas" },
];

// Configuración propia de cada tipo: el panel es el mismo para Personas y Maquinarias.
const CONFIG = {
  persona: {
    titulo: "Personas",
    colPrincipal: "Persona / RUT",
    colClasificacion: "Función",
    nombre: (i) => `${i.nombre} ${i.apellido || ""}`.trim(),
    secundario: (i) => (i.rut ? formatRutDisplay(i.rut) : ""),
    clasificacion: (i) => i.cargoActivo || "",
    textoBusqueda: (i) => `${i.nombre} ${i.apellido || ""} ${i.rut || ""} ${i.cargoActivo || ""}`,
    etiquetaFiltroClasificacion: "Función",
  },
  recurso: {
    titulo: "Maquinarias",
    colPrincipal: "Maquinaria / Patente",
    colClasificacion: "Tipo",
    nombre: (i) => i.nombre,
    secundario: (i) => i.patente || "",
    clasificacion: (i) => i.tipo || "",
    textoBusqueda: (i) => `${i.nombre} ${i.patente || ""} ${i.tipo || ""}`,
    etiquetaFiltroClasificacion: "Tipo",
  },
};

// Panel lateral "Ver todas" del Paso 4 de Nueva Acreditación. Trabaja sobre una selección de
// borrador (`draft`) y solo la entrega al confirmar con "Aplicar selección". No escribe nada.
export const PanelSeleccionEntidades = ({ tipo, items, seleccionIds, proyectoActualId, onAplicar, onCerrar }) => {
  const cfg = CONFIG[tipo];
  const [draft, setDraft] = useState(() => new Set(seleccionIds));
  const [busqueda, setBusqueda] = useState("");
  const [chip, setChip] = useState("todas");
  const [filtroProyecto, setFiltroProyecto] = useState("");
  const [filtroClasificacion, setFiltroClasificacion] = useState("");

  const proyectosOpciones = useMemo(() => {
    const mapa = new Map();
    items.forEach((i) => {
      if (i.participacionActiva) mapa.set(i.participacionActiva.proyectoId, i.participacionActiva.proyectoNombre);
    });
    return [{ value: "", label: "Todos" }, ...[...mapa].map(([value, label]) => ({ value, label }))];
  }, [items]);

  const clasificacionOpciones = useMemo(() => {
    const valores = [...new Set(items.map(cfg.clasificacion).filter(Boolean))].sort();
    return [{ value: "", label: "Todos" }, ...valores.map((v) => ({ value: v, label: v }))];
  }, [items, cfg]);

  const filtrados = items.filter((i) => {
    const disp = disponibilidadDe(i, proyectoActualId);
    if (chip === "disponible" && disp !== "disponible") return false;
    if (chip === "otro" && disp !== "otro") return false;
    if (chip === "seleccionadas" && !draft.has(i.id)) return false;
    if (filtroProyecto && i.participacionActiva?.proyectoId !== filtroProyecto) return false;
    if (filtroClasificacion && cfg.clasificacion(i) !== filtroClasificacion) return false;
    const t = busqueda.trim().toLowerCase();
    return !t || cfg.textoBusqueda(i).toLowerCase().includes(t);
  });

  const alternar = (id) => {
    setDraft((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onCerrar}>
      <div className="bg-white w-full max-w-4xl h-full flex flex-col shadow-dropdown" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <div>
            <h3 className="text-sm font-bold text-carbon-dark uppercase tracking-wider">{cfg.titulo} de la Empresa</h3>
            <p className="text-[11px] text-slate-400 mt-0.5">{draft.size} seleccionadas de {items.length}</p>
          </div>
          <button type="button" onClick={onCerrar} className="text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-3 border-b border-slate-100">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text" value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
              placeholder={tipo === "persona" ? "Buscar por nombre, RUT o función..." : "Buscar por nombre, patente o tipo..."}
              className="w-full pl-9 pr-3 py-2 bg-gray-50/50 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {CHIPS.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => setChip(c.key)}
                className={`px-3 py-1.5 rounded-full text-[11px] font-bold border transition-colors ${
                  chip === c.key ? "bg-primary text-white border-primary" : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-500">Proyecto actual:</span>
              <SelectConBusqueda value={filtroProyecto} onChange={setFiltroProyecto} options={proyectosOpciones} placeholder="Buscar proyecto..." />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-500">{cfg.etiquetaFiltroClasificacion}:</span>
              <SelectConBusqueda value={filtroClasificacion} onChange={setFiltroClasificacion} options={clasificacionOpciones} placeholder="Buscar..." />
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filtrados.length === 0 ? (
            <p className="text-xs text-slate-400 py-10 text-center">Ningún resultado con estos filtros.</p>
          ) : (
            <table className="w-full text-left border-collapse text-xs">
              <thead className="sticky top-0 bg-slate-50 z-10">
                <tr className="border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  <th className="py-3 px-4 w-10" />
                  <th className="py-3 px-4">{cfg.colPrincipal}</th>
                  <th className="py-3 px-4">{cfg.colClasificacion}</th>
                  <th className="py-3 px-4">Estado</th>
                  <th className="py-3 px-4">Proyecto actual</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtrados.map((i) => {
                  const disp = disponibilidadDe(i, proyectoActualId);
                  const deshabilitada = disp === "este";
                  return (
                    <tr key={i.id} className={`${draft.has(i.id) ? "bg-sky-50/40" : ""} ${deshabilitada ? "opacity-60" : "hover:bg-slate-50/60"}`}>
                      <td className="py-3 px-4">
                        <input
                          type="checkbox"
                          checked={draft.has(i.id)}
                          disabled={deshabilitada}
                          onChange={() => alternar(i.id)}
                          className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary/30"
                        />
                      </td>
                      <td className="py-3 px-4">
                        <p className="font-bold text-carbon-dark">{cfg.nombre(i)}</p>
                        {cfg.secundario(i) && <p className="text-[11px] text-slate-400 font-mono">{cfg.secundario(i)}</p>}
                      </td>
                      <td className="py-3 px-4 text-slate-600">{cfg.clasificacion(i) || <span className="text-slate-300">-</span>}</td>
                      <td className="py-3 px-4">
                        <BadgesDisponibilidad item={i} proyectoActualId={proyectoActualId} seleccionada={draft.has(i.id)} />
                      </td>
                      <td className="py-3 px-4 text-slate-600">
                        {i.participacionActiva?.proyectoNombre || <span className="text-slate-300">-</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 p-4 border-t border-slate-100">
          <button type="button" onClick={onCerrar} className="px-4 py-2.5 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50">
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => onAplicar([...draft])}
            className="px-5 py-2.5 text-xs font-semibold text-white bg-primary hover:bg-primary-dark rounded-xl shadow-md shadow-primary/25 transition-all"
          >
            Aplicar selección
          </button>
        </div>
      </div>
    </div>
  );
};
