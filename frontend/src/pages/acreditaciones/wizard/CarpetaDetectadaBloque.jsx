import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, KeyRound, RefreshCw, UserPlus } from "lucide-react";
import { SelectorCarpeta } from "../../../components/expedientes/documentacion/SelectorCarpeta";
import { formatRutDisplay } from "../../../utils/rutFormatters";

const BOTON = "inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-[11px] font-bold text-carbon-dark hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap";
const ELEGIR = { persona: "📁 Elegir carpeta del personal", recurso: "📁 Elegir carpeta de maquinarias" };
const ESTADO = {
  sugerida: { texto: "Coincidencia sugerida", filtro: "Sugeridas", clase: "bg-sage-lighter text-sage-darker border-sage-light" },
  ambigua: { texto: "Ambigua", filtro: "Ambiguas", clase: "bg-amber-50 text-amber-700 border-amber-200" },
  otra_empresa: { texto: "Existe en otra empresa", filtro: "Otra empresa", clase: "bg-sky-50 text-sky-700 border-sky-200" },
  no_registrada: { texto: "No registrada", filtro: "No registradas", clase: "bg-slate-100 text-slate-600 border-slate-200" },
};

const nombreDe = (tipo, s) => (tipo === "persona" ? `${s.nombre} ${s.apellido || ""}`.trim() : s.nombre);
const identificadorDe = (tipo, s) => (tipo === "persona" ? (s.rut ? formatRutDisplay(s.rut) : null) : s.patente || null);
const conIdentificador = (tipo, s) => `${nombreDe(tipo, s)}${identificadorDe(tipo, s) ? ` (${identificadorDe(tipo, s)})` : ""}`;

// Control de carpeta para el encabezado de la pestaña: "📁 <ruta> · Cambiar", "Elegir carpeta…" o
// "Re-autorizar". Nada si no hay carpeta local vinculada.
export const CarpetaCabecera = ({ tipo, carpeta, ruta, onElegirRuta }) => {
  const [eligiendo, setEligiendo] = useState(false);
  if (!carpeta) return null;
  if (!carpeta.lista) {
    return carpeta.handle && carpeta.permiso !== "granted" ? (
      <button type="button" onClick={carpeta.reautorizar} className={BOTON}><KeyRound className="w-3 h-3" /> Re-autorizar</button>
    ) : null;
  }
  return (
    <>
      {!ruta ? (
        <button type="button" onClick={() => setEligiendo(true)} className={BOTON}>{ELEGIR[tipo]}</button>
      ) : (
        <span className="min-w-0 max-w-[22rem] truncate text-[11px] text-slate-600" title={ruta}>
          📁 <b className="text-carbon-dark">{ruta}</b> · <button type="button" onClick={() => setEligiendo(true)} className="font-bold text-primary hover:underline">Cambiar</button>
        </span>
      )}
      {eligiendo && (
        <SelectorCarpeta
          handle={carpeta.handle}
          tipo={tipo}
          rutaInicial={ruta ? ruta.split("/").slice(0, -1).join("/") : ""}
          titulo={tipo === "persona" ? "Carpeta del personal" : "Carpeta de maquinarias"}
          onElegir={(r) => { setEligiendo(false); onElegirRuta(r); }}
          onCerrar={() => setEligiendo(false)}
        />
      )}
    </>
  );
};

// "Detectadas en carpeta (N)": una línea por subcarpeta, cruzada con la BD; chips por estado (junto
// con el buscador de la pestaña) y scroll dentro de la lista, con el título fijo. Detectar NUNCA
// escribe: elegir una fila solo la agrega a la selección del asistente (con su carpetaRelativa).
export const CarpetaDetectadaLista = ({
  tipo, filas, cargando, onRecargar, seleccion, termino, onSeleccionar, onQuitar, onCrearDesdeCarpeta, esSeleccionable,
}) => {
  const [filtroEstado, setFiltroEstado] = useState(null);
  const seleccionDe = (id) => seleccion.find((s) => s.id === id) || null;
  const t = termino.trim().toLowerCase();
  const porBusqueda = useMemo(() => filas.filter((f) => !t || f.limpio.display.toLowerCase().includes(t) ||
    f.carpeta.nombre.toLowerCase().includes(t) || f.candidatos.some((c) => nombreDe(tipo, c).toLowerCase().includes(t))), [filas, t, tipo]);
  const visibles = filtroEstado ? porBusqueda.filter((f) => f.estado === filtroEstado) : porBusqueda;
  const sugeridas = filas.filter((f) => f.estado === "sugerida" && esSeleccionable(f.candidatos[0]));
  const cuenta = (estado) => porBusqueda.filter((f) => f.estado === estado).length;

  const detener = (e) => { e.preventDefault(); e.stopPropagation(); };

  return (
    <details open className="rounded-xl border border-slate-200 [&_summary::-webkit-details-marker]:hidden">
      <summary className="flex flex-wrap items-center gap-2 px-3 py-2 cursor-pointer select-none bg-white rounded-t-xl">
        <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
        <span className="text-[11px] font-bold text-carbon-dark mr-auto">Detectadas en carpeta ({cargando ? "…" : filas.length})</span>
        <button type="button" disabled={!sugeridas.length}
          onClick={(e) => { detener(e); sugeridas.forEach((f) => onSeleccionar(f.candidatos[0], f.carpeta.ruta)); }} className={BOTON}>
          Seleccionar todas las sugeridas ({sugeridas.length})
        </button>
        <button type="button" onClick={(e) => { detener(e); onRecargar(); }} className={BOTON}><RefreshCw className="w-3 h-3" /> Volver a leer carpeta</button>
      </summary>
      <div className="px-3 pb-2 space-y-2 border-t border-slate-100">
        <div className="flex flex-wrap gap-1.5 pt-2" role="group" aria-label="Filtrar por estado">
          {[[null, `Todas (${porBusqueda.length})`], ...Object.entries(ESTADO).map(([k, v]) => [k, `${v.filtro} (${cuenta(k)})`])].map(([k, texto]) => (
            <button key={k || "todas"} type="button" aria-pressed={filtroEstado === k} onClick={() => setFiltroEstado(k)}
              className={`px-2 py-0.5 rounded-full border text-[10px] font-bold ${filtroEstado === k ? "bg-primary text-white border-primary" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>
              {texto}
            </button>
          ))}
        </div>
        {cargando ? <p className="py-2 text-[11px] text-slate-400">Leyendo carpeta...</p> : visibles.length === 0 ? (
          <p className="py-2 text-[11px] text-slate-400">{filas.length ? "Ninguna coincide con la búsqueda o el filtro." : "La carpeta no tiene subcarpetas."}</p>
        ) : (
          <ul className="divide-y divide-slate-100 overflow-y-auto max-h-[calc(100vh-24rem)] min-h-[12rem]">
            {visibles.map((f) => {
              const estado = ESTADO[f.estado];
              const elegidoAmbiguo = f.candidatos.find((c) => seleccionDe(c.id)?.carpetaRelativa === f.carpeta.ruta) || null;
              return (
                <li key={f.carpeta.ruta} className="flex items-center gap-2 py-1 text-[11px] whitespace-nowrap">
                  {f.estado === "sugerida" ? (
                    <input type="checkbox" aria-label={`Seleccionar ${nombreDe(tipo, f.candidatos[0])}`}
                      checked={Boolean(seleccionDe(f.candidatos[0].id))} disabled={!esSeleccionable(f.candidatos[0])}
                      onChange={(e) => (e.target.checked ? onSeleccionar(f.candidatos[0], f.carpeta.ruta) : onQuitar(f.candidatos[0]))}
                      className="w-3.5 h-3.5 shrink-0 rounded border-gray-300 text-primary" />
                  ) : <span className="w-3.5 shrink-0" aria-hidden="true" />}
                  <span className="min-w-0 flex-1 truncate" title={f.carpeta.nombre}>
                    <b className="text-carbon-dark">{f.limpio.display || f.carpeta.nombre}</b>
                    {f.estado === "sugerida" && <span className="text-slate-500"> → {conIdentificador(tipo, f.candidatos[0])}</span>}
                  </span>
                  {f.estado === "ambigua" && (
                    <select aria-label={`Quién es ${f.limpio.display}`} value={elegidoAmbiguo?.id || ""}
                      onChange={(e) => {
                        if (elegidoAmbiguo) onQuitar(elegidoAmbiguo);
                        const elegido = f.candidatos.find((c) => c.id === e.target.value);
                        if (elegido) onSeleccionar(elegido, f.carpeta.ruta);
                      }}
                      className="shrink-0 max-w-[16rem] px-1.5 py-0.5 rounded border border-slate-200 bg-white text-[11px]">
                      <option value="">Ninguna</option>
                      {f.candidatos.map((c) => <option key={c.id} value={c.id} disabled={!esSeleccionable(c)}>{conIdentificador(tipo, c)}</option>)}
                    </select>
                  )}
                  {f.estado === "otra_empresa" && (
                    <span className="shrink-0 max-w-[16rem] truncate">
                      {f.candidatos.map((c) => (
                        <Link key={c.id} to={`/${tipo === "persona" ? "personas" : "recursos"}/${c.id}`} target="_blank" rel="noopener noreferrer"
                          className="text-primary hover:underline mr-2" title={`${nombreDe(tipo, c)} · ${c.empresaActual?.empresaNombre || "otra empresa"}`}>
                          {c.empresaActual?.empresaNombre || "Ver ficha"}
                        </Link>
                      ))}
                    </span>
                  )}
                  {f.estado === "no_registrada" && (
                    <button type="button" onClick={() => onCrearDesdeCarpeta(f)} className={`${BOTON} shrink-0`}><UserPlus className="w-3 h-3" /> Crear desde carpeta</button>
                  )}
                  <span className={`shrink-0 px-1.5 rounded-full border text-[10px] font-bold ${estado.clase}`}>{estado.texto}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </details>
  );
};
