import { useEffect, useMemo, useState } from "react";
import { FolderTree, Search, Sparkles } from "lucide-react";
import { useMandanteContexto } from "../../../hooks/useMandanteContexto";
import { CampoMandante } from "../../shared/CampoMandante";
import { ErrorBanner } from "../../shared/ErrorBanner";
import { requerimientoService } from "../../../services/requerimientoService";
import { carpetaEmpresaService } from "../../../services/carpetaEmpresaService";
import { patronService } from "../../../services/patronService";
import { ReglasIARequerimiento } from "../../requerimientos/reglas-ia/ReglasIARequerimiento";
import { CoberturaMapeo } from "../../requerimientos/reglas-ia/UbicacionMapeo";
import { ESTADOS_IA_REQ, fechaDMA } from "../../../utils/reglasIA";
import { CLASE_INPUT } from "../estilos";

const CLASE_BADGE = "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap";
const GRUPOS = [
  { entidad: "empresa", label: "Empresa" },
  { entidad: "persona", label: "Persona" },
  { entidad: "recurso", label: "Maquinaria" },
];
const nombreReq = (r) => r.nombreCorto || r.nombre;
const porNombre = (a, b) => nombreReq(a).localeCompare(nombreReq(b), "es", { numeric: true, sensitivity: "base" });
const veces = (n) => `${n} ${n === 1 ? "vez" : "veces"}`;
// Patrones aprendidos del requerimiento (al confirmar el mapeo): se desactivan o reactivan.
const PatronesRequerimiento = ({ mandanteId, requerimientoId }) => {
  const [estado, setEstado] = useState({ clave: null, lista: null, error: null });
  const [ocupado, setOcupado] = useState(null);
  const clave = `${mandanteId}|${requerimientoId}`;

  useEffect(() => {
    let vigente = true;
    patronService.listar({ mandanteId, requerimientoId })
      .then((l) => { if (vigente) setEstado({ clave, lista: l || [], error: null }); })
      .catch((err) => { if (vigente) setEstado({ clave, lista: [], error: err.message || "No se pudieron cargar los patrones." }); });
    return () => { vigente = false; };
  }, [mandanteId, requerimientoId, clave]);

  const lista = estado.clave === clave ? estado.lista : null;
  const cambiar = async (p) => {
    setOcupado(p.id);
    try {
      const nuevo = await patronService.cambiarEstado(p.id, p.estado === "activo" ? "inactivo" : "activo");
      setEstado((e) => ({ ...e, lista: e.lista.map((x) => (x.id === p.id ? { ...x, ...nuevo } : x)), error: null }));
    } catch (err) {
      setEstado((e) => ({ ...e, error: err.message || "No se pudo cambiar el estado." }));
    } finally {
      setOcupado(null);
    }
  };

  if (!lista) return <p className="text-[11px] text-slate-400">Cargando patrones...</p>;
  const ordenada = [...lista].sort((a, b) => (a.estado === b.estado ? (b.vecesConfirmado || 0) - (a.vecesConfirmado || 0) : a.estado === "activo" ? -1 : 1));
  return (
    <div className="space-y-2">
      <ErrorBanner message={estado.error} />
      {ordenada.length === 0 ? (
        <p className="text-[11px] text-slate-400">Sin patrones todavía: se aprenden al confirmar ubicaciones en Mapeo documental.</p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100">
          {ordenada.map((p) => (
            <li key={p.id} className={`flex flex-wrap items-center gap-2 px-3 py-2 text-xs ${p.estado === "activo" ? "" : "bg-slate-50/70"}`}>
              <span className={`min-w-0 flex-1 truncate font-semibold ${p.estado === "activo" ? "text-carbon-dark" : "text-slate-400 line-through"}`} title={p.patron}>
                «{p.patron}»
              </span>
              <span className="text-[11px] text-slate-500">{p.objetivo === "archivo" ? "Archivo" : "Carpeta"} · {veces(p.vecesConfirmado || 0)} · {fechaDMA(p.ultimaConfirmacionAt)}</span>
              <button type="button" disabled={ocupado === p.id} onClick={() => cambiar(p)}
                className="px-2 py-1 rounded-lg text-[11px] font-bold text-slate-600 hover:bg-slate-100 disabled:opacity-50">
                {p.estado === "activo" ? "Desactivar" : "Activar"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

const Seccion = ({ titulo, Icono, children }) => (
  <section className="bg-white p-4 rounded-2xl border border-slate-100 shadow-card space-y-3">
    <h3 className="flex items-center gap-2 text-sm font-bold text-carbon-dark"><Icono className="w-4 h-4 text-primary" /> {titulo}</h3>
    {children}
  </section>
);

// Reglas de revisión › Por requerimiento (solo superadmin): todo lo de cada requerimiento en un
// lugar. A la izquierda, los requerimientos activos del Mandante por entidad, numerados, con su
// estado de reglas y en cuántas carpetas está ubicado; a la derecha, su ubicación en el mapeo
// documental, sus patrones aprendidos y sus reglas (estado IA, campos, modelo y pruebas).
export const ReglasPorRequerimiento = () => {
  const contexto = useMandanteContexto();
  const { mandanteId, modo } = contexto;
  const [datos, setDatos] = useState({ mandanteId: null, requerimientos: null, cobertura: null, error: null });
  const [elegido, setElegido] = useState(null);
  const [texto, setTexto] = useState("");

  useEffect(() => {
    if (!mandanteId) return undefined;
    let vigente = true;
    Promise.all([
      requerimientoService.listar({ mandanteId, estado: "activo" }),
      // false: no se pudo leer (se informa; no se muestra como "sin carpetas").
      carpetaEmpresaService.cobertura(mandanteId).catch(() => false),
    ])
      .then(([reqs, cob]) => { if (vigente) setDatos({ mandanteId, requerimientos: reqs || [], cobertura: cob, error: null }); })
      .catch((err) => { if (vigente) setDatos({ mandanteId, requerimientos: [], cobertura: null, error: err.message || "No se pudieron cargar los requerimientos." }); });
    return () => { vigente = false; };
  }, [mandanteId]);

  const vigentes = datos.mandanteId === mandanteId ? datos : { requerimientos: null, cobertura: null, error: null };
  const grupos = useMemo(() => GRUPOS.map((g) => ({
    ...g, lista: (vigentes.requerimientos || []).filter((r) => r.tipoEntidad === g.entidad).sort(porNombre)
      .map((r, i) => ({ ...r, numero: i + 1 })),
  })), [vigentes.requerimientos]);
  const t = texto.trim().toLowerCase();
  const seleccionado = (vigentes.requerimientos || []).find((r) => r.id === elegido) || null;
  const ubicadoEn = (id) => (vigentes.cobertura ? vigentes.cobertura.porRequerimiento[id]?.length || 0 : null);
  // Al cambiar las reglas en el panel, se refleja el estado IA en la lista.
  const alCambiar = (config) => setDatos((d) => ({
    ...d, requerimientos: (d.requerimientos || []).map((r) => (r.id === config.requerimiento.id ? { ...r, estadoIA: config.requerimiento.estadoIA } : r)),
  }));

  return (
    <div className="space-y-4">
      {modo && modo !== "fijo" && <div className="max-w-md"><CampoMandante contexto={contexto} conFoco={false} /></div>}
      <ErrorBanner message={vigentes.error} />
      {!mandanteId ? null : (
        <div className="grid grid-cols-1 lg:grid-cols-[19rem_minmax(0,1fr)] gap-4 items-start">
          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden lg:sticky lg:top-4">
            <div className="px-3 py-2.5 bg-slate-50 border-b border-slate-200">
              <label className="relative block">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                <input type="search" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Buscar requerimiento" aria-label="Buscar requerimiento" className={`${CLASE_INPUT} pl-8`} />
              </label>
            </div>
            {!vigentes.requerimientos ? <p className="p-3 text-[11px] text-slate-400">Cargando requerimientos...</p> : (
              <div className="max-h-[40rem] overflow-y-auto">
                {grupos.map((g) => {
                  const lista = g.lista.filter((r) => !t || `${r.nombreCorto || ""} ${r.nombre}`.toLowerCase().includes(t));
                  if (!lista.length) return null;
                  return (
                    <div key={g.entidad}>
                      <p className="px-3 pt-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">{g.label} ({g.lista.length})</p>
                      <ul>
                        {lista.map((r) => {
                          const activo = r.id === elegido;
                          const conReglas = (r.estadoIA || "sin_reglas") !== "sin_reglas";
                          const n = ubicadoEn(r.id);
                          return (
                            <li key={r.id}>
                              <button type="button" onClick={() => setElegido(r.id)} aria-current={activo ? "true" : undefined}
                                className={`w-full flex items-start gap-2 px-3 py-2 text-left text-xs transition-colors ${activo ? "bg-primary-lighter/70" : "hover:bg-slate-50"}`}>
                                <span className={`mt-px w-6 h-6 shrink-0 rounded-full flex items-center justify-center text-[10px] font-bold tabular-nums ${conReglas ? "bg-primary-lighter text-primary" : "bg-slate-100 text-slate-500"}`}>{r.numero}</span>
                                <span className="min-w-0 flex-1 space-y-1">
                                  <span className={`block leading-snug ${activo ? "font-bold text-primary" : "font-semibold text-carbon-dark"}`}>{nombreReq(r)}</span>
                                  <span className="flex flex-wrap gap-1">
                                    <span className={`${CLASE_BADGE} ${conReglas ? "bg-white text-primary border-primary/30" : "bg-white text-slate-500 border-slate-200"}`}>
                                      {conReglas ? `Con reglas · ${ESTADOS_IA_REQ[r.estadoIA]?.label || ""}` : "Sin reglas"}
                                    </span>
                                    {g.entidad === "empresa" && n !== null && (
                                      <span className={`${CLASE_BADGE} ${n ? "bg-sage-lighter text-sage-darker border-sage-light" : "bg-white text-slate-400 border-slate-200"}`}>
                                        Ubicado en {n} {n === 1 ? "carpeta" : "carpetas"}
                                      </span>
                                    )}
                                  </span>
                                </span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  );
                })}
                {grupos.every((g) => !g.lista.length) && <p className="p-3 text-[11px] text-slate-400">El Mandante no tiene requerimientos activos.</p>}
              </div>
            )}
          </section>

          {!seleccionado ? (
            <p className="py-16 text-center text-xs text-slate-400 rounded-2xl border border-dashed border-slate-200">Elija un requerimiento para ver y editar su configuración.</p>
          ) : (
            <div key={seleccionado.id} className="space-y-4 min-w-0">
              <div className="px-1">
                <h2 className="text-base font-bold text-carbon-dark">{nombreReq(seleccionado)}</h2>
                {seleccionado.nombreCorto && <p className="text-xs text-slate-500">{seleccionado.nombre}</p>}
              </div>
              {seleccionado.tipoEntidad === "empresa" && (
                <Seccion titulo="Ubicación en el mapeo documental" Icono={FolderTree}>
                  <CoberturaMapeo cobertura={vigentes.cobertura} requerimientoId={seleccionado.id} />
                </Seccion>
              )}
              <Seccion titulo="Patrones aprendidos" Icono={Sparkles}>
                <PatronesRequerimiento mandanteId={mandanteId} requerimientoId={seleccionado.id} />
              </Seccion>
              <section className="bg-white p-4 rounded-2xl border border-slate-100 shadow-card space-y-3">
                <h3 className="text-sm font-bold text-carbon-dark">Reglas de revisión</h3>
                <ReglasIARequerimiento requerimientoId={seleccionado.id} onCambio={alCambiar} />
              </section>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
