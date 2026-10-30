import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ScanSearch, Plus, FolderSearch, Settings } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { useMandanteContexto } from "../../hooks/useMandanteContexto";
import { revisionIAService } from "../../services/revisionIAService";
import { PageHeader } from "../../components/shared/PageHeader";
import { ErrorBanner } from "../../components/shared/ErrorBanner";
import { DateInput } from "../../components/ui/DateInput";
import { getMandanteDisplayName } from "../../utils/mandanteDisplay";
import { formatFechaHora } from "../../utils/fechas";
import { CLASE_BADGE, ESTADO_SESION, ROLES_OPERAN_REVISIONES, formatUsd } from "../../utils/revisionIA";

const FUENTES = [
  { value: "carpeta_local", label: "Carpeta local", clase: "bg-slate-100 text-slate-600 border-slate-200" },
  { value: "sharepoint", label: "SharePoint", clase: "bg-primary-lighter text-primary-dark border-primary/20" },
];
const CLASE_SELECT = "w-full min-w-0 truncate px-3 py-2 bg-slate-50/50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary";
const CLASE_ETIQUETA = "text-[10px] font-bold text-slate-400 uppercase tracking-wider leading-none";
const ROLES_CONFIGURACION = ["superadmin", "mandante_admin"];

const Filtro = ({ etiqueta, children, className = "w-full sm:w-44" }) => (
  <div className={`flex flex-col gap-1 ${className}`}>
    <span className={CLASE_ETIQUETA}>{etiqueta}</span>
    {children}
  </div>
);

// Historial de sesiones de Revisiones IA, con filtros en la URL y paginación por cursor ("Cargar
// más"). Los roles de Mandante ven solo las de su Mandante (lo acota el backend).
export const RevisionesIAListPage = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const esSuperadmin = profile?.rol === "superadmin";
  const puedeOperar = ROLES_OPERAN_REVISIONES.includes(profile?.rol);
  const [params, setParams] = useSearchParams();
  const contexto = useMandanteContexto({ mandanteId: params.get("mandante"), activo: esSuperadmin });
  const filtros = {
    mandanteId: esSuperadmin ? (params.get("mandante") || (contexto.modo === "unico" ? contexto.mandanteId : "")) : "",
    fuente: params.get("fuente") || "",
    estado: params.get("estado") || "",
    origen: params.get("origen") || "",
    desde: params.get("desde") || "",
    hasta: params.get("hasta") || "",
  };
  const clave = JSON.stringify(filtros);

  const [pagina, setPagina] = useState({ clave: null, items: [], cursor: null, error: null });
  const [recargas, setRecargas] = useState(0);
  const [cargandoMas, setCargandoMas] = useState(false);

  useEffect(() => {
    let vigente = true;
    const actual = JSON.parse(clave);
    revisionIAService.listar(actual)
      .then((r) => { if (vigente) setPagina({ clave: `${clave}|${recargas}`, items: r.items || [], cursor: r.cursor, error: null }); })
      .catch((err) => { if (vigente) setPagina({ clave: `${clave}|${recargas}`, items: [], cursor: null, error: err.message || "No se pudieron cargar las revisiones." }); });
    return () => { vigente = false; };
  }, [clave, recargas]);

  const cargando = pagina.clave !== `${clave}|${recargas}`;

  const cargarMas = async () => {
    setCargandoMas(true);
    try {
      const r = await revisionIAService.listar({ ...filtros, cursor: pagina.cursor });
      setPagina((p) => ({ ...p, items: [...p.items, ...(r.items || [])], cursor: r.cursor }));
    } catch (err) {
      setPagina((p) => ({ ...p, error: err.message || "No se pudieron cargar más revisiones." }));
    } finally {
      setCargandoMas(false);
    }
  };

  const actualizar = (cambios) => {
    const siguiente = new URLSearchParams(params);
    Object.entries(cambios).forEach(([k, v]) => (v ? siguiente.set(k, v) : siguiente.delete(k)));
    setParams(siguiente, { replace: true });
  };

  const hayFiltros = Boolean(filtros.fuente || filtros.estado || filtros.origen || filtros.desde || filtros.hasta || params.get("mandante"));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Revisiones IA"
        subtitle="Historial de revisiones de documentos con inteligencia artificial"
        icon={ScanSearch}
        loading={cargando}
        onRefresh={() => setRecargas((n) => n + 1)}
        action={puedeOperar ? { label: "Nueva revisión", to: "/revisiones-ia/nueva" } : null}
      />

      {ROLES_CONFIGURACION.includes(profile?.rol) && (
        <div className="flex justify-end -mt-2">
          <Link to="/configuracion/ia" className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:text-primary-dark">
            <Settings className="w-4 h-4" /> Configuración IA
          </Link>
        </div>
      )}

      <div className="bg-white px-4 py-3 rounded-2xl border border-slate-100 shadow-card flex flex-col sm:flex-row sm:flex-wrap sm:items-end gap-x-3 gap-y-3">
        {esSuperadmin && contexto.modo === "seleccionable" && (
          <Filtro etiqueta="Mandante" className="w-full sm:w-52">
            <select aria-label="Mandante" value={params.get("mandante") || ""} onChange={(e) => actualizar({ mandante: e.target.value })} className={CLASE_SELECT}>
              <option value="">Todos</option>
              {contexto.mandantes.map((m) => <option key={m.id} value={m.id}>{getMandanteDisplayName(m)}</option>)}
            </select>
          </Filtro>
        )}
        <Filtro etiqueta="Fuente">
          <select aria-label="Fuente" value={filtros.fuente} onChange={(e) => actualizar({ fuente: e.target.value })} className={CLASE_SELECT}>
            <option value="">Todas</option>
            {FUENTES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
        </Filtro>
        <Filtro etiqueta="Estado">
          <select aria-label="Estado" value={filtros.estado} onChange={(e) => actualizar({ estado: e.target.value })} className={CLASE_SELECT}>
            <option value="">Todos</option>
            {Object.entries(ESTADO_SESION).map(([v, m]) => <option key={v} value={v}>{m.label}</option>)}
          </select>
        </Filtro>
        <Filtro etiqueta="Origen">
          <select aria-label="Origen" value={filtros.origen} onChange={(e) => actualizar({ origen: e.target.value })} className={CLASE_SELECT}>
            <option value="">Todos</option>
            <option value="modulo">Revisiones IA</option>
            <option value="expediente">Expediente</option>
          </select>
        </Filtro>
        <Filtro etiqueta="Desde" className="w-full sm:w-40">
          <DateInput aria-label="Desde" value={filtros.desde} max={filtros.hasta || undefined} onChange={(e) => actualizar({ desde: e.target.value })} className="w-full px-3 py-2 bg-slate-50/50 border border-slate-200 rounded-xl text-xs" />
        </Filtro>
        <Filtro etiqueta="Hasta" className="w-full sm:w-40">
          <DateInput aria-label="Hasta" value={filtros.hasta} min={filtros.desde || undefined} onChange={(e) => actualizar({ hasta: e.target.value })} className="w-full px-3 py-2 bg-slate-50/50 border border-slate-200 rounded-xl text-xs" />
        </Filtro>
        {hayFiltros && (
          <button type="button" onClick={() => setParams({}, { replace: true })} className="text-xs font-bold text-primary hover:text-primary-dark sm:mb-2">Limpiar filtros</button>
        )}
      </div>

      <ErrorBanner message={pagina.error} />

      <div className="bg-white rounded-2xl border border-slate-100 shadow-card overflow-hidden">
        {cargando ? (
          <div className="p-6 space-y-3 animate-pulse" aria-hidden="true">
            {[0, 1, 2].map((i) => <div key={i} className="h-8 rounded-lg bg-slate-100" />)}
          </div>
        ) : pagina.items.length === 0 ? (
          <div className="py-14 px-6 text-center space-y-3">
            <FolderSearch className="w-8 h-8 text-slate-300 mx-auto" />
            {hayFiltros ? (
              <>
                <p className="text-sm font-bold text-carbon-dark">Ninguna revisión coincide con los filtros</p>
                <button type="button" onClick={() => setParams({}, { replace: true })} className="text-xs font-bold text-primary hover:text-primary-dark">Limpiar filtros</button>
              </>
            ) : (
              <>
                <p className="text-sm font-bold text-carbon-dark">Aún no hay revisiones</p>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  Elija una carpeta con una subcarpeta por persona (nombrada con su RUT) y la IA clasificará cada archivo,
                  extraerá sus datos y propondrá una evaluación.
                </p>
                {puedeOperar && (
                  <Link to="/revisiones-ia/nueva" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary hover:bg-primary-dark text-white text-xs font-bold">
                    <Plus className="w-4 h-4" /> Nueva revisión
                  </Link>
                )}
              </>
            )}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[72rem] text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    <th className="px-4 py-2.5">Nombre</th>
                    <th className="px-3 py-2.5">Fecha</th>
                    <th className="px-3 py-2.5">Fuente</th>
                    <th className="px-3 py-2.5">Expediente</th>
                    <th className="px-3 py-2.5 text-right">Carpetas</th>
                    <th className="px-3 py-2.5 text-right">Documentos</th>
                    <th className="px-3 py-2.5 text-right">Cumple / No / Rev.</th>
                    <th className="px-3 py-2.5 text-right">Costo real</th>
                    <th className="px-3 py-2.5">Estado</th>
                    <th className="px-3 py-2.5">Creado por</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pagina.items.map((s) => {
                    const t = s.totales || {};
                    const estado = ESTADO_SESION[s.estado] || ESTADO_SESION.en_proceso;
                    const fuente = FUENTES.find((f) => f.value === s.fuente) || FUENTES[0];
                    return (
                      <tr key={s.id} onClick={() => navigate(`/revisiones-ia/${s.id}`)} className="cursor-pointer hover:bg-slate-50/60">
                        <td className="px-4 py-3">
                          <Link to={`/revisiones-ia/${s.id}`} onClick={(e) => e.stopPropagation()} className="font-bold text-primary hover:text-primary-dark hover:underline">{s.nombre}</Link>
                          {esSuperadmin && <p className="text-[11px] text-slate-400">{s.mandanteNombre}</p>}
                        </td>
                        <td className="px-3 py-3 text-slate-600 whitespace-nowrap">{formatFechaHora(s.createdAt)}</td>
                        <td className="px-3 py-3"><span className={`${CLASE_BADGE} ${fuente.clase}`}>{fuente.label}</span></td>
                        <td className="px-3 py-3 text-slate-600">
                          {s.origen === "expediente" && s.expedienteId
                            ? <Link to={`/expedientes/${s.expedienteId}?tab=revisiones_ia`} onClick={(e) => e.stopPropagation()} className="font-semibold text-primary hover:underline">{s.expedienteNombre || "Ver expediente"}</Link>
                            : "—"}
                        </td>
                        <td className="px-3 py-3 text-right text-slate-600">{t.carpetas || 0}</td>
                        <td className="px-3 py-3 text-right text-slate-600">{t.archivos || 0}</td>
                        <td className="px-3 py-3 text-right whitespace-nowrap">
                          <span className="font-bold text-sage-dark">{t.cumple || 0}</span> / <span className="font-bold text-red-600">{t.noCumple || 0}</span> / <span className="font-bold text-amber-600">{t.revisionHumana || 0}</span>
                        </td>
                        <td className="px-3 py-3 text-right text-slate-600">{formatUsd(s.costoRealUsd, 4)}</td>
                        <td className="px-3 py-3"><span className={`${CLASE_BADGE} ${estado.clase}`}>{estado.label}</span></td>
                        <td className="px-3 py-3 text-slate-600">{s.creadoPorNombre || "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {pagina.cursor && (
              <div className="p-3 text-center border-t border-slate-100">
                <button type="button" onClick={cargarMas} disabled={cargandoMas} className="text-xs font-bold text-primary hover:text-primary-dark disabled:opacity-50">
                  {cargandoMas ? "Cargando..." : "Cargar más"}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
