import { useState } from "react";
import { ChevronDown, FileSpreadsheet, UserPlus, X } from "lucide-react";
import { formatRutDisplay, cleanRut } from "../../../utils/rutFormatters";
import { claveTexto } from "../../../utils/carpetasSujetos";

const BOTON = "inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-[11px] font-bold text-carbon-dark hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap";

// Persona de SmartOne (de la empresa) que corresponde a una fila del listado: por RUT; sin RUT
// válido, por nombre completo exacto (normalizado).
const registradaDe = (fila, personas) => personas.find((p) => fila.rut && cleanRut(p.rut || "") === fila.rut)
  || (!fila.rut ? personas.find((p) => claveTexto(`${p.nombre} ${p.apellido || ""}`) === claveTexto(fila.nombreCompleto)) : null)
  || null;

// "Desde el listado «archivo» (N)": personas leídas de una planilla del personal (nombre, RUT y
// cargo), cruzadas con las de la empresa. Las registradas se seleccionan con un clic (o todas); las
// no registradas se crean de a una con el formulario prellenado, que el usuario revisa.
export const ListadoPersonal = ({ listado, personas, estaSeleccionado, esSeleccionable, onAlternar, onSeleccionarTodas, onCrear, onQuitar }) => {
  const [abierto, setAbierto] = useState(true);
  const filas = listado.personas.map((fila) => ({ fila, persona: registradaDe(fila, personas) }));
  const registradas = filas.filter((f) => f.persona).map((f) => f.persona);
  const pendientes = registradas.filter((p) => esSeleccionable(p) && !estaSeleccionado(p.id));

  return (
    <div className="rounded-xl border border-primary/20 bg-primary-lighter/20">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        <button type="button" onClick={() => setAbierto((v) => !v)} aria-expanded={abierto} className="inline-flex items-center gap-1.5 mr-auto min-w-0 text-xs font-bold text-carbon-dark">
          <ChevronDown className={`w-4 h-4 shrink-0 text-slate-400 transition-transform ${abierto ? "" : "-rotate-90"}`} />
          <FileSpreadsheet className="w-4 h-4 shrink-0 text-primary" />
          <span className="truncate" title={listado.ruta}>Desde el listado «{listado.nombre}» ({filas.length})</span>
        </button>
        <span className="text-[11px] text-slate-500">{registradas.length} registradas · {filas.length - registradas.length} no registradas</span>
        <button type="button" onClick={() => onSeleccionarTodas(pendientes)} disabled={!pendientes.length} className={BOTON}>
          Seleccionar todas las registradas ({pendientes.length})
        </button>
        <button type="button" onClick={onQuitar} aria-label="Quitar listado" title="Quitar listado" className="p-1 rounded text-slate-400 hover:bg-white hover:text-slate-600">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      {abierto && (
        <ul className="max-h-72 overflow-y-auto divide-y divide-slate-100 border-t border-primary/10 bg-white rounded-b-xl">
          {filas.map(({ fila, persona }) => {
            const seleccionada = persona && estaSeleccionado(persona.id);
            const bloqueada = persona && !esSeleccionable(persona);
            return (
              <li key={`${fila.hoja}-${fila.fila}`} className="flex flex-wrap items-center gap-2 px-3 py-1.5 text-xs">
                {persona ? (
                  <input type="checkbox" checked={Boolean(seleccionada)} disabled={bloqueada} onChange={() => onAlternar(persona)}
                    aria-label={`Seleccionar ${fila.nombreCompleto}`} className="w-3.5 h-3.5 accent-primary" />
                ) : <span className="w-3.5" />}
                <span className="min-w-0 flex-1">
                  <span className="font-semibold text-carbon-dark">{fila.nombreCompleto}</span>
                  {fila.rut ? <span className="ml-1.5 font-mono text-[11px] text-slate-500">{formatRutDisplay(fila.rut)}</span>
                    : fila.rutOriginal && <span className="ml-1.5 text-[11px] text-amber-700" title="RUT no válido en el listado">RUT {fila.rutOriginal} (no válido)</span>}
                  {fila.cargo && <span className="ml-1.5 text-[11px] text-slate-500">· {fila.cargo}</span>}
                </span>
                {persona ? (
                  <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold ${bloqueada ? "bg-slate-100 text-slate-500 border-slate-200" : "bg-sage-lighter text-sage-darker border-sage-light"}`}>
                    {bloqueada ? "Ya en este proyecto" : "Registrada"}
                  </span>
                ) : (
                  <button type="button" onClick={() => onCrear(fila)} className={BOTON}><UserPlus className="w-3 h-3" /> Crear</button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p className="px-3 py-1.5 text-[10px] text-slate-500">
        Leído de la planilla abierta en la vista de la carpeta. «Crear» abre el formulario con los datos del listado para revisarlos.
      </p>
    </div>
  );
};
