import { useState } from "react";
import { AlertTriangle, ArrowDownAZ, ChevronDown, FileSpreadsheet, Plus, UserPlus, X } from "lucide-react";
import { formatRutDisplay } from "../../../utils/rutFormatters";
import { registradaDe } from "../../../utils/listadoPersonal";
import { registradoDe } from "../../../utils/listadoVehiculos";
import { BadgesDisponibilidad } from "../../../components/acreditaciones/PanelSeleccionEntidades";
import { PatenteChip } from "../../../components/shared/PatenteChip";

const BOTON = "inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-[11px] font-bold text-carbon-dark hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap";

// Lo propio de cada tipo de listado: cómo se cruza con SmartOne y qué se muestra de cada fila.
const CONFIG = {
  persona: {
    coincide: registradaDe,
    nombre: (f) => f.nombreCompleto,
    // RUT (o el no válido, en ámbar).
    identificacion: (f) => (f.rut ? <span className="ml-1.5 font-mono text-[11px] text-slate-500">{formatRutDisplay(f.rut)}</span>
      : f.rutOriginal && <span className="ml-1.5 text-[11px] text-amber-700" title="RUT no válido en el listado">RUT {f.rutOriginal} (no válido)</span>),
    secundario: (f) => f.cargo,
    sinSecundario: "Sin perfil asignado",
    IconoCrear: UserPlus,
  },
  recurso: {
    coincide: registradoDe,
    nombre: (f) => f.nombre,
    // Patente (como placa) o N° de serie; una patente con formato no válido, en ámbar.
    identificacion: (f) => (f.patente ? (
      <span className="ml-1.5 inline-flex items-center gap-1">
        <PatenteChip valor={f.patente} tipo={f.tipoIdentificacion} />
        {f.tipoIdentificacion === "patente" && !f.patenteValida && (
          <span className="text-[10px] text-amber-700" title="No tiene formato de patente chilena">
            (formato no válido{f.motivoPatente ? `: ${f.motivoPatente}` : ""})
          </span>
        )}
      </span>
    ) : <span className="ml-1.5 text-[11px] text-amber-700">Sin patente ni N° de serie</span>),
    secundario: (f) => [f.descripcion, f.anio].filter(Boolean).join(" · "),
    sinSecundario: "Sin perfil asignado",
    IconoCrear: Plus,
  },
};

// "Desde el listado «archivo» (N)": personas (nombre, RUT, cargo) o maquinarias (descripción,
// patente, marca y modelo) leídas de una planilla abierta en la vista de la carpeta, cruzadas con las
// de la empresa. Las registradas se seleccionan con un clic (o todas); las no registradas se crean de
// a una con el formulario prellenado, que el usuario revisa. Es la lista del paso mientras está
// abierto: bajo cada seleccionada va su Perfil de Recurso (`renderPerfil`).
//  - tipo: "persona" | "recurso".  listado: { ruta, nombre, filas }.  sujetos: los de la empresa.
//  - renderPerfil(sujeto) → el selector de perfil de ese sujeto seleccionado (o null).
//  - refDe(sujeto) → identificador para "Ir a" desde los problemas del asistente.
//  - faltaPerfil(sujeto): true si está seleccionado sin Perfil de Recurso (el cargo o la descripción
//    se marca en amarillo con un ícono de aviso).
//  - proyectoActualId: proyecto de la acreditación (las registradas muestran si están disponibles, en
//    otro proyecto —requieren traslado— o ya en este).
export const ListadoSujetos = ({
  tipo, listado, sujetos, estaSeleccionado, esSeleccionable, onAlternar, onSeleccionarTodas, onCrear, onQuitar,
  renderPerfil = null, refDe = null, proyectoActualId = null, faltaPerfil = null,
}) => {
  const cfg = CONFIG[tipo];
  const [abierto, setAbierto] = useState(true);
  // Orden: el de la planilla, o por nombre (A–Z / Z–A). La numeración sigue el orden mostrado.
  const [orden, setOrden] = useState("listado");
  const porNombre = (a, b) => cfg.nombre(a.fila).localeCompare(cfg.nombre(b.fila), "es", { sensitivity: "base" });
  const filas = listado.filas.map((fila) => ({ fila, sujeto: cfg.coincide(fila, sujetos) }));
  const filasOrdenadas = orden === "az" ? [...filas].sort(porNombre) : orden === "za" ? [...filas].sort((a, b) => porNombre(b, a)) : filas;
  const registradas = filas.filter((f) => f.sujeto).map((f) => f.sujeto);
  const pendientes = registradas.filter((s) => esSeleccionable(s) && !estaSeleccionado(s.id));
  const { IconoCrear } = cfg;

  return (
    <div className="rounded-xl border border-primary/20 bg-primary-lighter/20">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        <button type="button" onClick={() => setAbierto((v) => !v)} aria-expanded={abierto} className="inline-flex items-center gap-1.5 mr-auto min-w-0 text-xs font-bold text-carbon-dark">
          <ChevronDown className={`w-4 h-4 shrink-0 text-slate-400 transition-transform ${abierto ? "" : "-rotate-90"}`} />
          <FileSpreadsheet className="w-4 h-4 shrink-0 text-primary" />
          <span className="truncate" title={listado.ruta}>Desde el listado «{listado.nombre}» ({filas.length})</span>
        </button>
        <span className="text-[11px] text-slate-500">{registradas.length} registradas · {filas.length - registradas.length} no registradas</span>
        <label className="inline-flex items-center gap-1 text-[11px] text-slate-500">
          <ArrowDownAZ className="w-3.5 h-3.5 text-slate-400" />
          <span className="sr-only">Ordenar</span>
          <select value={orden} onChange={(e) => setOrden(e.target.value)} aria-label="Ordenar el listado"
            className="px-2 py-1 rounded-lg border border-slate-200 bg-white text-[11px] font-semibold text-carbon-dark">
            <option value="listado">Orden del listado</option>
            <option value="az">Nombre A–Z</option>
            <option value="za">Nombre Z–A</option>
          </select>
        </label>
        <button type="button" onClick={() => onSeleccionarTodas(pendientes)} disabled={!pendientes.length} className={BOTON}>
          Seleccionar todas las registradas ({pendientes.length})
        </button>
        <button type="button" onClick={onQuitar} aria-label="Quitar listado" title="Quitar listado" className="p-1 rounded text-slate-400 hover:bg-white hover:text-slate-600">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      {abierto && (
        <ul className="max-h-[32rem] overflow-y-auto divide-y divide-slate-100 border-t border-primary/10 bg-white rounded-b-xl">
          {filasOrdenadas.map(({ fila, sujeto }, indice) => {
            const seleccionada = sujeto && estaSeleccionado(sujeto.id);
            const bloqueada = sujeto && !esSeleccionable(sujeto);
            const secundario = cfg.secundario(fila);
            return (
              <li key={`${fila.hoja}-${fila.fila}`} data-asistente-ref={sujeto && refDe ? refDe(sujeto) : undefined}
                className="flex flex-wrap items-center gap-2 px-3 py-1.5 text-xs scroll-mt-24 data-[asistente-resaltado]:ring-2 data-[asistente-resaltado]:ring-amber-400 data-[asistente-resaltado]:bg-amber-50">
                {sujeto ? (
                  <input type="checkbox" checked={Boolean(seleccionada)} disabled={bloqueada} onChange={() => onAlternar(sujeto)}
                    aria-label={`Seleccionar ${cfg.nombre(fila)}`} className="w-3.5 h-3.5 accent-primary" />
                ) : <span className="w-3.5" />}
                <span className="w-6 shrink-0 text-right tabular-nums text-[11px] text-slate-400">{indice + 1}.</span>
                <span className="min-w-0 flex-1">
                  <span className="font-semibold text-carbon-dark">{cfg.nombre(fila)}</span>
                  {cfg.identificacion(fila)}
                  {sujeto && faltaPerfil?.(sujeto) ? (
                    <span title="Sin Perfil de Recurso asignado" className="ml-1.5 inline-flex items-center gap-1 px-1.5 rounded bg-amber-100 text-[11px] font-semibold text-amber-800">
                      <AlertTriangle className="w-3 h-3 shrink-0" />{secundario || cfg.sinSecundario}
                    </span>
                  ) : secundario && <span className="ml-1.5 text-[11px] text-slate-500">· {secundario}</span>}
                </span>
                {sujeto ? (
                  <BadgesDisponibilidad item={sujeto} proyectoActualId={proyectoActualId} seleccionada={Boolean(seleccionada)} />
                ) : (
                  <button type="button" onClick={() => onCrear(fila)} className={BOTON}><IconoCrear className="w-3 h-3" /> Crear</button>
                )}
                {seleccionada && renderPerfil && <div className="w-full pl-14">{renderPerfil(sujeto)}</div>}
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
