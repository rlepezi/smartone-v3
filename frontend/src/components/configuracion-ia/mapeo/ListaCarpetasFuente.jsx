import { useState } from "react";
import { AlertTriangle, Folder, Search } from "lucide-react";
import { carpetaEmpresaService } from "../../../services/carpetaEmpresaService";
import { validarCarpetaEmpresa } from "../../../utils/carpetaEmpresa";
import { CLASE_PRIMARIO } from "../estilos";

const FILTROS = [
  { valor: "todas", label: "Todas" },
  { valor: "registradas", label: "Registradas" },
  { valor: "sin_registrar", label: "Sin registrar" },
  { valor: "incompleto", label: "Mapeo incompleto" },
];
const CLASE_BUSCAR = "w-full pl-8 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary";

// Barra "X de Y requerimientos ubicados".
const Avance = ({ avance }) => {
  if (!avance) return null;
  const { ubicados, total } = avance;
  const pct = total ? Math.round((ubicados / total) * 100) : 0;
  return (
    <div className="mt-1.5">
      <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden" aria-hidden="true">
        <div className={`h-full ${ubicados === total && total ? "bg-sage" : "bg-primary"}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-0.5 text-[10px] text-slate-500">{ubicados} de {total} requerimientos ubicados</p>
    </div>
  );
};

// Subcarpetas de primer nivel de la fuente, registradas o no como Carpetas de empresa. Las no
// registradas se registran con una empresa del Mandante que pase la validación estricta: si coincide
// una sola, se sugiere ("Registrar como …"); si ninguna o varias, se elige entre las que coinciden.
//  - subcarpetas: [{ nombre }] de la raíz (useCarpetaBase). carpetas: Carpetas de empresa de la
//    fuente (con avance). empresas: las del Mandante.
export const ListaCarpetasFuente = ({ subcarpetas, carpetas, empresas, mandanteId, seleccionada, onSeleccionar, onRegistrada }) => {
  const [filtro, setFiltro] = useState("todas");
  const [busqueda, setBusqueda] = useState("");
  const [registrando, setRegistrando] = useState(null);
  const [elegidas, setElegidas] = useState({}); // ruta → empresaId elegida en el selector
  const [errores, setErrores] = useState({}); // ruta → mensaje

  const porRuta = new Map((carpetas || []).map((c) => [c.ruta.toLowerCase(), c]));
  // Las registradas que ya no están en la fuente también se muestran (con advertencia).
  const filas = [
    ...subcarpetas.map((s) => ({ ruta: s.nombre, carpeta: porRuta.get(s.nombre.toLowerCase()) || null, enFuente: true })),
    ...(carpetas || []).filter((c) => !subcarpetas.some((s) => s.nombre.toLowerCase() === c.ruta.toLowerCase()))
      .map((c) => ({ ruta: c.ruta, carpeta: c, enFuente: false })),
  ];
  const termino = busqueda.trim().toLowerCase();
  const visibles = filas.filter((f) => (!termino || f.ruta.toLowerCase().includes(termino)) && (
    filtro === "todas" || (filtro === "registradas" && f.carpeta) || (filtro === "sin_registrar" && !f.carpeta) ||
    (filtro === "incompleto" && f.carpeta && f.carpeta.avance && f.carpeta.avance.ubicados < f.carpeta.avance.total)));

  const registrar = async (ruta, empresaId) => {
    setRegistrando(ruta);
    setErrores((e) => ({ ...e, [ruta]: null }));
    try {
      await carpetaEmpresaService.registrar({ mandanteId, ruta, empresaId });
      onSeleccionar(ruta);
      onRegistrada?.();
    } catch (err) {
      setErrores((e) => ({ ...e, [ruta]: err.message || "No se pudo registrar la carpeta." }));
    } finally {
      setRegistrando(null);
    }
  };

  return (
    <section className="rounded-2xl border border-slate-100 p-3 space-y-2">
      <h4 className="text-xs font-bold text-carbon-dark">Elija la carpeta de la empresa</h4>
      <div className="flex flex-wrap gap-1">
        {FILTROS.map((f) => (
          <button key={f.valor} type="button" aria-pressed={filtro === f.valor} onClick={() => setFiltro(f.valor)}
            className={`px-2 py-0.5 rounded-full border text-[10px] font-bold ${filtro === f.valor ? "bg-primary text-white border-primary" : "bg-white text-slate-600 border-slate-200 hover:border-primary"}`}>
            {f.label}
          </button>
        ))}
      </div>
      <div className="relative">
        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
        <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar carpeta..." aria-label="Buscar carpeta" className={CLASE_BUSCAR} />
      </div>
      {carpetas === null ? <p className="text-[11px] text-slate-400">Cargando carpetas...</p> : visibles.length === 0 ? (
        <p className="text-[11px] text-slate-400">No hay carpetas con este filtro.</p>
      ) : (
        <ul className="max-h-[32rem] overflow-y-auto space-y-1">
          {visibles.map(({ ruta, carpeta, enFuente }) => {
            const activa = seleccionada === ruta;
            const candidatas = carpeta ? [] : empresas.filter((e) => validarCarpetaEmpresa(ruta, e).valida);
            const elegida = elegidas[ruta] || "";
            return (
              <li key={ruta} className={`rounded-xl border p-2 text-xs ${activa ? "border-primary bg-primary-lighter/40" : "border-slate-100"}`}>
                <button type="button" onClick={() => onSeleccionar(ruta)} className="w-full flex items-start gap-1.5 text-left">
                  <Folder className="w-3.5 h-3.5 mt-px text-primary shrink-0" />
                  <span className="font-bold text-carbon-dark break-all">{ruta}</span>
                </button>
                {!enFuente && <p className="mt-1 flex items-center gap-1 text-[10px] text-amber-700"><AlertTriangle className="w-3 h-3" /> No encontrada en la fuente</p>}
                {carpeta ? (
                  <>
                    <p className="mt-1 text-[10px] text-slate-500">
                      {carpeta.empresaNombre || "—"} · {carpeta.proyectoNombre || "Sin proyecto"} · {carpeta.expedienteId ? "Con expediente" : "Sin expediente"}
                    </p>
                    <Avance avance={carpeta.avance} />
                  </>
                ) : candidatas.length === 1 ? (
                  <button type="button" disabled={registrando === ruta} onClick={() => registrar(ruta, candidatas[0].id)} className={`${CLASE_PRIMARIO} mt-1.5 px-2.5 py-1 text-[11px]`}>
                    {registrando === ruta ? "Registrando..." : `Registrar como ${candidatas[0].razonSocial}`}
                  </button>
                ) : candidatas.length > 1 ? (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    <select value={elegida} onChange={(e) => setElegidas((x) => ({ ...x, [ruta]: e.target.value }))} aria-label={`Empresa de ${ruta}`}
                      className="flex-1 min-w-0 px-2 py-1 rounded-lg border border-slate-200 text-[11px]">
                      <option value="">Elija la empresa…</option>
                      {candidatas.map((e) => <option key={e.id} value={e.id}>{e.razonSocial}</option>)}
                    </select>
                    <button type="button" disabled={!elegida || registrando === ruta} onClick={() => registrar(ruta, elegida)} className={`${CLASE_PRIMARIO} px-2.5 py-1 text-[11px]`}>Registrar</button>
                  </div>
                ) : (
                  <p className="mt-1 text-[10px] text-slate-400">Sin registrar: ninguna empresa del Mandante coincide con el nombre de la carpeta.</p>
                )}
                {errores[ruta] && <p role="alert" className="mt-1 text-[10px] text-red-600">{errores[ruta]}</p>}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};
