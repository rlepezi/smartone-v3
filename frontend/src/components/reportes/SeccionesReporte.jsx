import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowDown, ArrowUp, ChevronDown, ChevronUp, ExternalLink, X } from "lucide-react";
import { formatFecha } from "../../utils/fechas";
import {
  COLOR_BARRA, ETIQUETA_TIPO, TIPOS_ENTIDAD, clasePct, formatPct, etiquetaGrupo, enlaceInstancia,
} from "../../utils/reportePanel";

const FILAS_VISIBLES_PROYECTOS = 8;
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

// Tarjeta blanca de una sección. `print:break-before-page` lo pone quien la usa.
export const Tarjeta = ({ titulo, subtitulo, acciones = null, children, className = "" }) => (
  <section className={`bg-white rounded-2xl border border-slate-100 shadow-card p-5 min-w-0 print:shadow-none print:border-slate-200 ${className}`}>
    <div className="flex items-start justify-between gap-3 mb-4">
      <div className="min-w-0">
        <h2 className="text-sm font-bold text-carbon-dark">{titulo}</h2>
        {subtitulo && <p className="text-[11px] text-slate-400 mt-0.5">{subtitulo}</p>}
      </div>
      {acciones && <div className="shrink-0 print:hidden">{acciones}</div>}
    </div>
    {children}
  </section>
);

// Placeholder de carga: bloques grises del alto aproximado del contenido (sin parpadeo de texto).
export const Placeholder = ({ filas = 4, alto = "h-6" }) => (
  <div className="space-y-2.5 animate-pulse" aria-hidden="true">
    {Array.from({ length: filas }, (_, i) => (
      <div key={i} className={`${alto} rounded-lg bg-slate-100`} />
    ))}
  </div>
);

const Vacio = ({ children }) => <p className="py-8 text-center text-xs text-slate-400">{children}</p>;

// Barra horizontal apilada: Cumple, No Cumple y Pendiente (gris claro), con tooltip de cantidades.
export const BarraApilada = ({ cumple = 0, noCumple = 0, pendiente = 0, className = "h-2.5" }) => {
  const total = cumple + noCumple + pendiente;
  const titulo = `Cumple: ${cumple} · No Cumple: ${noCumple} · Pendiente: ${pendiente}`;
  if (!total) return <div className={`${className} rounded-full bg-slate-100`} title={titulo} />;
  return (
    <div className={`${className} flex rounded-full overflow-hidden bg-slate-100`} title={titulo} role="img" aria-label={titulo}>
      {[["cumple", cumple], ["noCumple", noCumple], ["pendiente", pendiente]].map(([clave, valor]) => (
        valor > 0 && <div key={clave} className={COLOR_BARRA[clave]} style={{ width: `${(valor / total) * 100}%` }} />
      ))}
    </div>
  );
};

const Indicador = ({ titulo, valor, claseValor = "text-carbon-dark", children }) => (
  <>
    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{titulo}</p>
    <p className={`text-3xl font-black tracking-tight mt-2 ${claseValor}`}>{valor}</p>
    <div className="mt-2 text-[11px] text-slate-500 space-y-1.5">{children}</div>
  </>
);

const CLASE_INDICADOR = "bg-white p-5 rounded-2xl border border-slate-100 shadow-card min-w-0 print:shadow-none print:border-slate-200";

// 1. Indicadores: una fila de 5 tarjetas.
export const Indicadores = ({ datos, cargando }) => {
  if (cargando || !datos) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className={`${CLASE_INDICADOR} h-36`}><Placeholder filas={3} alto="h-5" /></div>
        ))}
      </div>
    );
  }
  const { expedientesActivos: a, cumplimiento: b, primeraRevision: c, itemsEvaluados: d, vencimientos: e } = datos;
  const pestanaVencimientos = e.vencidos > 0 || e.proximos === 0 ? "vencidos" : "proximos";
  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
      <div className={CLASE_INDICADOR}>
        <Indicador titulo="Expedientes activos" valor={a.total}>
          <p>en {plural(a.proyectos, "proyecto", "proyectos")} · {plural(a.empresas, "empresa", "empresas")}</p>
        </Indicador>
      </div>
      <div className={CLASE_INDICADOR}>
        <Indicador titulo="Cumplimiento actual" valor={formatPct(b.pct)} claseValor={clasePct(b.pct)}>
          <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
            <div className={COLOR_BARRA.cumple} style={{ width: `${b.pct || 0}%`, height: "100%" }} />
          </div>
          <p>ítems que cumplen hoy, sobre los aplicables ({b.cumple}/{b.aplicables})</p>
        </Indicador>
      </div>
      <div className={CLASE_INDICADOR}>
        <Indicador titulo="Aprobación a la primera revisión" valor={formatPct(c.pct)} claseValor={clasePct(c.pct)}>
          <p>calidad de lo que entregan los contratistas</p>
          <p className="text-slate-400">{c.aprobadas} de {plural(c.instancias, "ítem", "ítems")} en su primera revisión</p>
        </Indicador>
      </div>
      <div className={CLASE_INDICADOR}>
        <Indicador titulo="Ítems evaluados en el período" valor={d.total}>
          <p>
            <span className="font-bold text-sage-dark">{d.cumple} cumpliendo</span>
            {" · "}
            <span className="font-bold text-red-600">{d.noCumple} no cumplen</span>
          </p>
          <p className="text-slate-400">según su última evaluación del período</p>
        </Indicador>
      </div>
      <Link
        to={`/expedientes?vencimientos=${pestanaVencimientos}`}
        className={`${CLASE_INDICADOR} block hover:border-primary/30 hover:shadow-md transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary`}
        title="Ver los Expedientes con vencimientos"
      >
        <Indicador titulo="Vencimientos" valor={e.vencidos} claseValor={e.vencidos > 0 ? "text-red-600" : "text-carbon-dark"}>
          <p>{e.vencidos === 1 ? "documento vencido" : "documentos vencidos"}</p>
          <p className="font-bold text-amber-600">{e.proximos} próximos a vencer ({e.umbralDias} días)</p>
        </Indicador>
      </Link>
    </div>
  );
};

const COLUMNAS_PROYECTO = [
  { key: "codigo", label: "Proyecto", valor: (f) => (f.codigo || f.nombre || "").toLowerCase(), texto: true },
  { key: "empresas", label: "Empresas", valor: (f) => f.empresas },
  { key: "items", label: "Ítems", valor: (f) => f.items },
  { key: "resultado", label: "Resultado", valor: (f) => f.cumple },
  { key: "pct", label: "% Cumple", valor: (f) => (f.pct === null ? -1 : f.pct) },
];

// 2. Por proyecto: tabla ordenable, 8 filas y "Ver los N proyectos".
export const PorProyecto = ({ filas, cargando }) => {
  const [orden, setOrden] = useState({ key: "items", dir: "desc" });
  const [expandido, setExpandido] = useState(false);

  const ordenadas = useMemo(() => {
    const columna = COLUMNAS_PROYECTO.find((c) => c.key === orden.key);
    const factor = orden.dir === "asc" ? 1 : -1;
    return [...(filas || [])].sort((a, b) => {
      const va = columna.valor(a);
      const vb = columna.valor(b);
      if (columna.texto) return va.localeCompare(vb, "es") * factor;
      return (va - vb) * factor;
    });
  }, [filas, orden]);

  const ordenarPor = (key) => setOrden((o) => (o.key === key
    ? { key, dir: o.dir === "asc" ? "desc" : "asc" }
    : { key, dir: key === "codigo" ? "asc" : "desc" }));

  let contenido;
  if (cargando || !filas) contenido = <Placeholder filas={8} />;
  else if (filas.length === 0) contenido = <Vacio>No hay expedientes activos con estos filtros.</Vacio>;
  else {
    const visibles = expandido ? ordenadas : ordenadas.slice(0, FILAS_VISIBLES_PROYECTOS);
    contenido = (
      <>
        <div className="overflow-x-auto -mx-1 px-1">
          <table className="w-full min-w-[34rem] text-left text-xs">
            <thead>
              <tr className="border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                {COLUMNAS_PROYECTO.map((c) => {
                  const activa = orden.key === c.key;
                  const Flecha = orden.dir === "asc" ? ArrowUp : ArrowDown;
                  return (
                    <th
                      key={c.key}
                      className={`py-2 px-2 ${c.key === "resultado" ? "w-[30%]" : ""} ${c.texto ? "" : "text-right"}`}
                      aria-sort={activa ? (orden.dir === "asc" ? "ascending" : "descending") : "none"}
                    >
                      <button
                        type="button"
                        onClick={() => ordenarPor(c.key)}
                        className={`inline-flex items-center gap-1 uppercase tracking-wider hover:text-carbon-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded ${activa ? "text-carbon-dark" : ""}`}
                      >
                        {c.label}
                        {activa && <Flecha className="w-3 h-3 print:hidden" />}
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {visibles.map((f) => (
                <tr key={f.proyectoId}>
                  <td className="py-2.5 px-2 max-w-[14rem]">
                    <Link to={`/proyectos/${f.proyectoId}`} className="font-bold text-primary hover:text-primary-dark hover:underline">
                      {f.codigo || f.nombre}
                    </Link>
                    {f.codigo && <p className="text-[11px] text-slate-400 truncate" title={f.nombre}>{f.nombre}</p>}
                  </td>
                  <td className="py-2.5 px-2 text-right text-slate-600">{f.empresas}</td>
                  <td className="py-2.5 px-2 text-right text-slate-600">{f.items}</td>
                  <td className="py-2.5 px-2"><BarraApilada cumple={f.cumple} noCumple={f.noCumple} pendiente={f.pendiente} /></td>
                  <td className={`py-2.5 px-2 text-right font-black ${clasePct(f.pct)}`}>{formatPct(f.pct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {ordenadas.length > FILAS_VISIBLES_PROYECTOS && (
          <button
            type="button"
            onClick={() => setExpandido((v) => !v)}
            className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-primary hover:text-primary-dark print:hidden"
          >
            {expandido ? <><ChevronUp className="w-3.5 h-3.5" /> Ver menos</> : <><ChevronDown className="w-3.5 h-3.5" /> Ver los {ordenadas.length} proyectos</>}
          </button>
        )}
      </>
    );
  }
  return (
    <Tarjeta titulo="Por proyecto" subtitulo="Foto de hoy: expedientes no cerrados" className="lg:col-span-2">
      {contenido}
    </Tarjeta>
  );
};

// 3. Por tipo de entidad: Empresa, Personas y Maquinaria.
export const PorTipoEntidad = ({ datos, cargando }) => (
  <Tarjeta titulo="Por tipo de entidad" subtitulo="Foto de hoy">
    {cargando || !datos ? <Placeholder filas={3} alto="h-14" /> : TIPOS_ENTIDAD.every((t) => !datos[t].items) ? (
      <Vacio>No hay ítems en los expedientes activos.</Vacio>
    ) : (
      <div className="space-y-5">
        {TIPOS_ENTIDAD.map((tipo) => {
          const f = datos[tipo];
          return (
            <div key={tipo}>
              <div className="flex items-baseline justify-between gap-2 mb-1.5">
                <p className="text-xs font-bold text-carbon-dark">{ETIQUETA_TIPO[tipo]}</p>
                <p className="text-[11px] text-slate-400">{plural(f.items, "ítem", "ítems")}</p>
              </div>
              <BarraApilada cumple={f.cumple} noCumple={f.noCumple} pendiente={f.pendiente} />
              <div className="flex items-center justify-between gap-2 mt-1.5 text-[11px]">
                <span className={`font-bold ${clasePct(f.pct)}`}>{formatPct(f.pct)} cumple ({f.cumple})</span>
                <span className="text-red-600 font-semibold">{f.noCumple} no {f.noCumple === 1 ? "cumple" : "cumplen"}</span>
              </div>
            </div>
          );
        })}
      </div>
    )}
  </Tarjeta>
);

const OPCIONES_TIPO = [{ value: "todas", label: "Todas" }, ...TIPOS_ENTIDAD.map((t) => ({ value: t, label: ETIQUETA_TIPO[t] }))];
const ALTO_GRAFICO = 160;

const Chips = ({ opciones, valor, onChange, etiqueta }) => (
  <div className="flex items-center gap-1 flex-wrap" role="group" aria-label={etiqueta}>
    {opciones.map((o) => (
      <button
        key={o.value}
        type="button"
        aria-pressed={valor === o.value}
        onClick={() => onChange(o.value)}
        className={`px-2.5 py-1 rounded-full text-[11px] font-bold border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
          valor === o.value ? "bg-primary text-white border-primary" : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"
        }`}
      >
        {o.label}
      </button>
    ))}
  </div>
);

// 4. Evolución: barras agrupadas Cumple / No Cumple por semana o mes, con una sola escala.
export const Evolucion = ({ datos, cargando }) => {
  const [tipo, setTipo] = useState("todas");
  const grupos = datos?.grupos || [];
  const maximo = Math.max(1, ...grupos.map((g) => Math.max(g[tipo].cumple, g[tipo].noCumple)));
  const sinDatos = grupos.every((g) => !g[tipo].cumple && !g[tipo].noCumple);
  const pasoEtiqueta = Math.max(1, Math.ceil(grupos.length / 12));

  return (
    <Tarjeta
      titulo="Evolución de evaluaciones"
      subtitulo={datos ? `Por ${datos.agrupacion === "mes" ? "mes" : "semana"}, incluidas las reevaluaciones` : null}
      acciones={<Chips opciones={OPCIONES_TIPO} valor={tipo} onChange={setTipo} etiqueta="Tipo de entidad" />}
    >
      {cargando || !datos ? <Placeholder filas={1} alto="h-44" /> : sinDatos ? (
        <Vacio>No hay evaluaciones en el período.</Vacio>
      ) : (
        <>
          <div className="overflow-x-auto">
            <div className="flex items-end gap-1 min-w-full" style={{ height: ALTO_GRAFICO, minWidth: grupos.length * 18 }}>
              {grupos.map((g) => {
                const v = g[tipo];
                const titulo = `${etiquetaGrupo(g.inicio, datos.agrupacion)} · Cumple: ${v.cumple} · No Cumple: ${v.noCumple}`;
                return (
                  <div key={g.inicio} className="flex-1 h-full flex items-end justify-center gap-px min-w-0" title={titulo}>
                    <div className={`${COLOR_BARRA.cumple} w-1/2 max-w-3 rounded-t-sm`} style={{ height: `${(v.cumple / maximo) * 100}%` }} />
                    <div className={`${COLOR_BARRA.noCumple} w-1/2 max-w-3 rounded-t-sm`} style={{ height: `${(v.noCumple / maximo) * 100}%` }} />
                  </div>
                );
              })}
            </div>
            <div className="flex gap-1 mt-1.5 border-t border-slate-100 pt-1" style={{ minWidth: grupos.length * 18 }}>
              {grupos.map((g, i) => (
                <span key={g.inicio} className="flex-1 min-w-0 text-center text-[9px] text-slate-400 whitespace-nowrap overflow-visible">
                  {i % pasoEtiqueta === 0 ? etiquetaGrupo(g.inicio, datos.agrupacion) : ""}
                </span>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-4 mt-3 text-[11px] text-slate-500">
            <span className="inline-flex items-center gap-1.5"><span className={`w-2.5 h-2.5 rounded-sm ${COLOR_BARRA.cumple}`} /> Cumple</span>
            <span className="inline-flex items-center gap-1.5"><span className={`w-2.5 h-2.5 rounded-sm ${COLOR_BARRA.noCumple}`} /> No Cumple</span>
            <span className="ml-auto">Máximo: {maximo}</span>
          </div>
        </>
      )}
    </Tarjeta>
  );
};

// 5. Ítems con más rechazos: top 10 por tasa, selector de Perfil y panel lateral con el detalle.
export const Rechazos = ({ datos, perfiles, cargando, perfilId, onPerfil, onAbrir }) => {
  const filas = datos ? datos.rankings[perfilId] || [] : [];
  const selector = (
    <select
      aria-label="Perfil de Participación"
      value={perfilId}
      onChange={(e) => onPerfil(e.target.value)}
      className="max-w-44 truncate px-2.5 py-1 bg-slate-50/50 border border-slate-200 rounded-lg text-[11px] font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
    >
      <option value="todos">Todos los perfiles</option>
      {(perfiles || []).map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
    </select>
  );
  return (
    <Tarjeta
      titulo="Ítems con más rechazos"
      subtitulo={datos ? `Tasa de rechazo en el período · mínimo ${datos.minimoEvaluaciones} evaluaciones` : null}
      acciones={selector}
    >
      {cargando || !datos ? <Placeholder filas={6} /> : filas.length === 0 ? (
        <Vacio>Aún no hay suficientes evaluaciones para este ranking.</Vacio>
      ) : (
        <ul className="space-y-1">
          {filas.map((f) => (
            <li key={f.requerimientoId}>
              <button
                type="button"
                onClick={() => onAbrir(f)}
                className="w-full text-left px-2 py-2 rounded-lg hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                title={f.nombre || undefined}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-xs font-bold text-carbon-dark truncate">
                    {f.nombreCorto || f.nombre || "—"}
                    <span className="ml-2 text-[10px] font-semibold text-slate-400 uppercase">{ETIQUETA_TIPO[f.tipoEntidad] || ""}</span>
                  </p>
                  <p className="text-[11px] text-slate-500 whitespace-nowrap">
                    <span className="font-black text-red-600">{f.tasa}%</span> · {f.rechazados}/{f.evaluados}
                  </p>
                </div>
                <div className="h-1.5 mt-1.5 rounded-full bg-slate-100 overflow-hidden">
                  <div className={`${COLOR_BARRA.noCumple} h-full`} style={{ width: `${f.tasa}%` }} />
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Tarjeta>
  );
};

// Panel lateral con los rechazos de un Requerimiento en el período.
export const PanelRechazos = ({ fila, rechazos, onCerrar }) => {
  useEffect(() => {
    const alPresionar = (e) => { if (e.key === "Escape") onCerrar(); };
    document.addEventListener("keydown", alPresionar);
    return () => document.removeEventListener("keydown", alPresionar);
  }, [onCerrar]);

  return (
    <div className="fixed inset-0 z-50 print:hidden" role="dialog" aria-modal="true" aria-labelledby="panel-rechazos-titulo">
      <div className="absolute inset-0 bg-carbon-dark/30" onClick={onCerrar} aria-hidden="true" />
      <aside className="absolute inset-y-0 right-0 w-full sm:w-[30rem] bg-white shadow-2xl flex flex-col">
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-100">
          <div className="min-w-0">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Rechazos en el período</p>
            <h2 id="panel-rechazos-titulo" className="text-sm font-bold text-carbon-dark mt-0.5">{fila.nombre || fila.nombreCorto}</h2>
            <p className="text-[11px] text-slate-500 mt-0.5">{fila.rechazados} de {fila.evaluados} evaluaciones rechazadas ({fila.tasa}%)</p>
          </div>
          <button type="button" onClick={onCerrar} autoFocus className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-carbon-dark" aria-label="Cerrar">
            <X className="w-4 h-4" />
          </button>
        </div>
        <ul className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {rechazos.map((r) => (
            <li key={r.evaluacionId} className="px-5 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 text-xs">
                  <p className="font-bold text-carbon-dark truncate">{r.sujetoNombre || r.empresaNombre || "—"}</p>
                  {r.sujetoNombre && <p className="text-slate-500 truncate">{r.empresaNombre}</p>}
                  <p className="text-[11px] text-slate-400 truncate">
                    {[r.proyectoCodigo, r.proyectoNombre].filter(Boolean).join(" · ")} · {formatFecha(r.fecha)}
                  </p>
                </div>
                <Link
                  to={enlaceInstancia(r)}
                  className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-[11px] font-bold text-carbon-dark hover:bg-slate-50"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> Ver
                </Link>
              </div>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
};
