import React, { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search } from "lucide-react";

// Dropdown con caja de búsqueda para listas largas (Mandantes, Empresas,
// Proyectos). Misma interfaz que un <select>: `options` [{ value, label }],
// `value` y `onChange(value)`; la opción con value "" actúa como "Todos".
// Opcionales: `conAvatar` muestra el logo (`option.logoUrl`) o la inicial de cada opción;
// `ancho completo` (`bloque`) y lista en flujo normal, para usarlo dentro de formularios/modales
// con scroll donde una lista flotante quedaría recortada; `disabled`, `invalido`; `autoFocus`
// (foco inicial en el botón, como el autoFocus de un <select>).
const Avatar = ({ opcion }) => (
  opcion.logoUrl ? (
    <img src={opcion.logoUrl} alt="" className="w-6 h-6 rounded-full object-contain border border-slate-100 shrink-0" />
  ) : (
    <span className="w-6 h-6 rounded-full bg-slate-100 border border-slate-200 text-slate-500 font-black text-[10px] flex items-center justify-center shrink-0">
      {(opcion.label || "?").charAt(0).toUpperCase()}
    </span>
  )
);

export const SelectConBusqueda = ({
  value, onChange, options = [], placeholder = "Buscar...",
  conAvatar = false, bloque = false, disabled = false, invalido = false, textoVacio = "Todos",
  autoFocus = false, anchoCompleto = false, ariaLabel,
}) => {
  const [abierto, setAbierto] = useState(false);
  const [termino, setTermino] = useState("");
  const contenedorRef = useRef(null);

  useEffect(() => {
    const alClicFuera = (e) => {
      if (!contenedorRef.current?.contains(e.target)) setAbierto(false);
    };
    document.addEventListener("mousedown", alClicFuera);
    return () => document.removeEventListener("mousedown", alClicFuera);
  }, []);

  const seleccionada = options.find((o) => o.value === value);
  const visibles = useMemo(() => {
    const t = termino.trim().toLowerCase();
    return t ? options.filter((o) => `${o.label} ${o.buscar || ""}`.toLowerCase().includes(t)) : options;
  }, [options, termino]);

  const elegir = (nuevo) => {
    onChange(nuevo);
    setAbierto(false);
    setTermino("");
  };

  return (
    <div ref={contenedorRef} className={bloque ? "w-full" : "relative"}>
      <button
        type="button"
        disabled={disabled}
        autoFocus={autoFocus}
        onClick={() => setAbierto((v) => !v)}
        aria-label={ariaLabel}
        className={bloque
          ? `w-full flex items-center justify-between gap-2 px-3.5 py-2.5 bg-gray-50/50 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all disabled:bg-gray-100 disabled:text-gray-500 ${invalido ? "border-red-400 bg-red-50/30" : "border-gray-200"}`
          : `flex items-center justify-between gap-2 ${anchoCompleto ? "w-full" : "min-w-[9rem] max-w-[14rem]"} px-3 py-2 bg-slate-50/50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all`}
      >
        <span className="flex items-center gap-2 min-w-0">
          {conAvatar && seleccionada && seleccionada.value !== "" && <Avatar opcion={seleccionada} />}
          <span className={`truncate ${bloque && !seleccionada?.value ? "text-gray-500" : ""}`}>{seleccionada?.label || textoVacio}</span>
        </span>
        <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
      </button>
      {abierto && (
        <div className={bloque
          ? "mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-sm p-2"
          : "absolute z-30 mt-1 w-64 right-0 sm:left-0 sm:right-auto bg-white border border-slate-200 rounded-xl shadow-lg p-2"}>
          <div className="relative mb-2">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
            <input
              autoFocus
              type="text"
              value={termino}
              onChange={(e) => setTermino(e.target.value)}
              placeholder={placeholder}
              className="w-full pl-8 pr-2.5 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>
          <ul className="max-h-56 overflow-y-auto">
            {visibles.length === 0 && (
              <li className="px-2.5 py-2 text-xs text-slate-400 italic">Sin resultados</li>
            )}
            {visibles.map((o) => (
              <li key={o.value}>
                {/* Opción con `deshabilitada: true`: visible pero no elegible, con su `nota`. */}
                <button
                  type="button"
                  disabled={o.deshabilitada}
                  onClick={() => elegir(o.value)}
                  title={o.deshabilitada ? o.nota : undefined}
                  className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs flex items-center gap-2 ${
                    o.deshabilitada ? "text-slate-400 cursor-not-allowed"
                      : o.value === value ? "font-bold text-primary-dark bg-primary-lighter hover:bg-slate-50" : "text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {conAvatar && o.value !== "" && <Avatar opcion={o} />}
                  <span className="truncate">{o.label}</span>
                  {o.deshabilitada && o.nota && <span className="ml-auto shrink-0 text-[10px] font-semibold text-slate-400">{o.nota}</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
