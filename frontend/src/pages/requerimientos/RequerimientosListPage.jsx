import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Building2, Users, Truck, Plus, Search, CalendarClock, Loader2, ChevronsUpDown, Check, Sparkles,
} from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { requerimientoService, TIPOS_ENTIDAD, etiquetaTipoEntidad } from "../../services/requerimientoService";
import { perfilParticipacionService } from "../../services/perfilParticipacionService";
import { perfilRecursoService } from "../../services/perfilRecursoService";
import { getMandanteDisplayName } from "../../utils/mandanteDisplay";
import { ErrorBanner } from "../../components/shared/ErrorBanner";
import { StatusBadge, MAPA_ACTIVO_INACTIVO } from "../../components/shared/StatusBadge";
import { OpcionesRadio } from "../../components/shared/OpcionesRadio";
import { Pagination } from "../../components/shared/Pagination";
import { RequerimientoModal } from "../../components/requerimientos/RequerimientoModal";
import { useMandanteContexto } from "../../hooks/useMandanteContexto";

const ROLES_ESCRITURA = ["superadmin", "mandante_admin"];
const ICONO_TIPO = { empresa: Building2, persona: Users, recurso: Truck };
const OPCIONES_ESTADO = [
  { value: "", label: "Todos" },
  { value: "activo", label: "Activos" },
  { value: "inactivo", label: "Inactivos" },
];
const FILAS_POR_PAGINA = 25;
const BUSCADOR_MANDANTES_DESDE = 8;
const CLAVE_ULTIMO_MANDANTE = "smartone:requerimientos:ultimoMandante";

const CLASE_SECCION = "text-[11px] font-bold text-slate-400 uppercase tracking-widest";
const CLASE_FOCO = "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2";

const aLista = (texto) => (texto ? texto.split(",").filter(Boolean) : []);

// Último Mandante usado en esta pantalla (por navegador). El acceso a localStorage puede fallar
// (modo privado, almacenamiento bloqueado): en ese caso simplemente no se recuerda.
const leerUltimoMandante = () => {
  try {
    return window.localStorage.getItem(CLAVE_ULTIMO_MANDANTE);
  } catch {
    return null;
  }
};
const guardarUltimoMandante = (id) => {
  try {
    window.localStorage.setItem(CLAVE_ULTIMO_MANDANTE, id);
  } catch {
    // Sin almacenamiento: la próxima vez parte en el primero alfabético.
  }
};

// Tarjeta del Mandante en contexto. Con varios Mandantes es un selector (lista desplegable, con
// buscador si son muchos); con uno solo o con Mandante fijo, la misma tarjeta sin interacción.
const TarjetaMandante = ({ mandante, opciones, onElegir }) => {
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const contenedorRef = useRef(null);
  const esSelector = opciones.length > 1;

  useEffect(() => {
    if (!abierto) return undefined;
    const alClic = (e) => {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target)) setAbierto(false);
    };
    const alTecla = (e) => { if (e.key === "Escape") setAbierto(false); };
    document.addEventListener("mousedown", alClic);
    document.addEventListener("keydown", alTecla);
    return () => {
      document.removeEventListener("mousedown", alClic);
      document.removeEventListener("keydown", alTecla);
    };
  }, [abierto]);

  const contenido = (
    <>
      {mandante?.logoUrl ? (
        <img src={mandante.logoUrl} alt="" className="w-12 h-12 rounded-xl object-contain bg-white border border-slate-100 shrink-0" />
      ) : (
        <span className="w-12 h-12 rounded-xl bg-primary text-white flex items-center justify-center shrink-0">
          <Building2 className="w-6 h-6" />
        </span>
      )}
      <span className="flex-1 min-w-0 text-left">
        <span className="block text-base font-bold text-carbon-dark truncate">{mandante?.nombre || "…"}</span>
        <span className="block text-xs text-slate-500">Mandante seleccionado</span>
      </span>
      {esSelector && <ChevronsUpDown className="w-5 h-5 text-slate-400 shrink-0" />}
    </>
  );
  const claseTarjeta = "w-full flex items-center gap-4 p-4 rounded-2xl bg-white border border-primary/20 shadow-card";

  if (!esSelector) return <div className={claseTarjeta}>{contenido}</div>;

  const termino = busqueda.trim().toLowerCase();
  const visibles = opciones.filter((m) => !termino || m.nombre.toLowerCase().includes(termino));

  return (
    <div ref={contenedorRef} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={abierto}
        onClick={() => setAbierto((v) => !v)}
        className={`${claseTarjeta} hover:border-primary/50 transition-colors ${CLASE_FOCO}`}
      >
        {contenido}
      </button>
      {abierto && (
        <div className="absolute z-20 left-0 right-0 mt-2 bg-white rounded-2xl border border-slate-200 shadow-dropdown overflow-hidden">
          {opciones.length > BUSCADOR_MANDANTES_DESDE && (
            <div className="p-2 border-b border-slate-100">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text" autoFocus value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscar mandante..." aria-label="Buscar mandante"
                  className="w-full pl-8 pr-3 py-2 bg-slate-50/50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
              </div>
            </div>
          )}
          <ul role="listbox" aria-label="Mandantes" className="max-h-72 overflow-y-auto py-1">
            {visibles.length === 0 ? (
              <li className="px-4 py-3 text-xs text-slate-400">Sin resultados.</li>
            ) : visibles.map((m) => {
              const actual = m.id === mandante?.id;
              return (
                <li key={m.id} role="option" aria-selected={actual}>
                  <button
                    type="button"
                    onClick={() => { setAbierto(false); setBusqueda(""); if (!actual) onElegir(m.id); }}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-slate-50 focus:outline-none focus-visible:bg-slate-100 ${actual ? "font-bold text-primary-dark" : "text-carbon-dark"}`}
                  >
                    <span className="flex-1 truncate">{m.nombre}</span>
                    {actual && <Check className="w-4 h-4 text-primary shrink-0" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
};

// Catálogo de Requerimientos con contexto fijo: Mandante → tipo de entidad → perfiles. El Mandante
// no es un filtro (no hay "Todos"): cada Requerimiento pertenece a uno, y la pantalla nunca parte
// vacía — entra con un Mandante ya resuelto (URL, Mandante fijo del rol, el único disponible, el
// último usado o el primero alfabético). Crear y editar se hacen en un modal sin salir del
// catálogo. El contexto vive en la URL y se conserva al recargar y al abrir o cerrar el modal:
//   ?mandante=<id>&tipo=<empresa|persona|recurso>&pp=<ids>&pr=<ids>
// `?nuevo=1` y `?editar=<id>` (los dejan las rutas antiguas del formulario) abren el modal.
export const RequerimientosListPage = () => {
  const { profile } = useAuth();
  const [params, setParams] = useSearchParams();
  // Mandantes en el alcance del usuario (helper compartido con los formularios de alta).
  const contextoMandante = useMandanteContexto({ mandanteId: params.get("mandante") });
  const mandanteFijo = contextoMandante.modo === "fijo" ? contextoMandante.mandanteId : null;
  const puedeEscribir = ROLES_ESCRITURA.includes(profile?.rol);
  const esSuperadmin = profile?.rol === "superadmin";

  // Mandantes entre los que se puede elegir (null = cargando). Con Mandante fijo, solo el propio.
  const cargandoMandantes = contextoMandante.cargando;
  const mandantesEnAlcance = contextoMandante.mandantes;
  const mandantes = useMemo(() => (cargandoMandantes ? null : mandantesEnAlcance.map((m) => ({
    id: m.id, nombre: getMandanteDisplayName(m) || m.id, logoUrl: m.logoUrl || null,
  }))), [cargandoMandantes, mandantesEnAlcance]);
  const [requerimientos, setRequerimientos] = useState([]);
  const [perfilesParticipacion, setPerfilesParticipacion] = useState([]);
  const [perfilesRecurso, setPerfilesRecurso] = useState([]);
  const [cargadoDe, setCargadoDe] = useState(null); // mandanteId cuyos datos están en pantalla
  const [error, setError] = useState(null);
  const [busqueda, setBusqueda] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");
  const [pagina, setPagina] = useState(1);
  const [modal, setModal] = useState(null); // { requerimiento: null | Object }

  const mandanteUrl = params.get("mandante") || "";
  // El de la URL solo vale si está en el alcance del usuario; si no, el primero disponible.
  const mandanteId = mandanteFijo ||
    ((mandantes || []).some((m) => m.id === mandanteUrl) ? mandanteUrl : (mandantes?.[0]?.id || ""));
  const mandanteActual = (mandantes || []).find((m) => m.id === mandanteId) || null;
  const tipo = TIPOS_ENTIDAD.some((t) => t.value === params.get("tipo")) ? params.get("tipo") : "empresa";
  const chipsPP = aLista(params.get("pp"));
  const chipsPR = aLista(params.get("pr"));

  // Cambia parte del contexto en la URL conservando el resto.
  const cambiarContexto = (cambios) => {
    const siguiente = new URLSearchParams(params);
    Object.entries(cambios).forEach(([clave, valor]) => {
      if (valor === null || valor === undefined || valor === "" || (Array.isArray(valor) && valor.length === 0)) {
        siguiente.delete(clave);
      } else {
        siguiente.set(clave, Array.isArray(valor) ? valor.join(",") : valor);
      }
    });
    setParams(siguiente, { replace: true });
    setPagina(1);
  };

  // Mandante inicial: (1) el de la URL si es válido, (2) el fijo del rol, (3) el único disponible,
  // (4) el último usado, (5) el primero alfabético. Se escribe en la URL.
  useEffect(() => {
    if (!mandantes || mandantes.length === 0) return;
    const actual = new URLSearchParams(window.location.search);
    if (mandantes.some((m) => m.id === actual.get("mandante"))) return;
    const ultimo = leerUltimoMandante();
    const elegido = mandantes.length === 1 ? mandantes[0]
      : mandantes.find((m) => m.id === ultimo) || mandantes[0];
    actual.set("mandante", elegido.id);
    setParams(actual, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mandantes]);

  const elegirMandante = (id) => {
    guardarUltimoMandante(id);
    cambiarContexto({ mandante: id, pp: null, pr: null });
  };

  const cargarRequerimientos = (id = mandanteId) => requerimientoService.listar({ mandanteId: id })
    .then((data) => { setRequerimientos(data || []); setError(null); })
    .catch((err) => setError(err.message || "No se pudieron cargar los requerimientos."));
  const cargarPerfilesRecurso = (id = mandanteId) => perfilRecursoService.listar({ mandanteId: id })
    .then((data) => setPerfilesRecurso(data || []))
    .catch(() => setPerfilesRecurso([]));

  // Datos del Mandante en contexto. Solo se recuerda como "último usado" el que quedó en la URL.
  useEffect(() => {
    if (!mandanteId) return undefined;
    let vigente = true;
    if (mandanteId === mandanteUrl) guardarUltimoMandante(mandanteId);
    Promise.all([
      cargarRequerimientos(mandanteId),
      perfilParticipacionService.listar({ mandanteId })
        .then((data) => { if (vigente) setPerfilesParticipacion(data || []); })
        .catch(() => { if (vigente) setPerfilesParticipacion([]); }),
      cargarPerfilesRecurso(mandanteId),
    ]).finally(() => { if (vigente) setCargadoDe(mandanteId); });
    return () => { vigente = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mandanteId]);

  // Rutas antiguas del formulario: ?nuevo=1 abre el modal de alta; ?editar=<id> el de edición,
  // poniendo antes el Mandante y la pestaña del Requerimiento.
  const idEditar = params.get("editar");
  const pideNuevo = params.get("nuevo") === "1";
  useEffect(() => {
    if (!idEditar) return;
    requerimientoService.obtenerPorId(idEditar)
      .then((r) => {
        const siguiente = new URLSearchParams(window.location.search);
        siguiente.delete("editar");
        if (!mandanteFijo && r.mandanteId) siguiente.set("mandante", r.mandanteId);
        siguiente.set("tipo", r.tipoEntidad);
        setParams(siguiente, { replace: true });
        setModal({ requerimiento: r });
      })
      .catch((err) => {
        const siguiente = new URLSearchParams(window.location.search);
        siguiente.delete("editar");
        setParams(siguiente, { replace: true });
        setError(err.message || "No se pudo abrir el requerimiento.");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idEditar]);

  const listo = Boolean(mandanteId) && cargadoDe === mandanteId;
  // Modal abierto: por acción del usuario, o por ?nuevo=1 una vez cargado el Mandante.
  const modalAbierto = modal || (pideNuevo && listo ? { requerimiento: null } : null);
  const cerrarModal = () => {
    setModal(null);
    if (pideNuevo) cambiarContexto({ nuevo: null });
  };

  const ppActivos = perfilesParticipacion.filter((p) => p.estado === "activo");
  const prActivos = perfilesRecurso.filter((p) => p.tipo === tipo && p.estado === "activo");
  const nombrePP = Object.fromEntries(perfilesParticipacion.map((p) => [p.id, p.nombre]));
  const nombrePR = Object.fromEntries(perfilesRecurso.map((p) => [p.id, p.nombre]));

  const delTipo = requerimientos.filter((r) => r.tipoEntidad === tipo);
  const termino = busqueda.trim().toLowerCase();
  const filas = delTipo.filter((r) => {
    const pps = r.aplicabilidad?.perfilParticipacionIds || [];
    const prs = r.aplicabilidad?.perfilRecursoIds ?? null;
    if (chipsPP.length && !chipsPP.some((id) => pps.includes(id))) return false;
    // "Todos" aplica a cualquier Perfil de Recurso.
    if (tipo !== "empresa" && chipsPR.length && prs !== null && !chipsPR.some((id) => prs.includes(id))) return false;
    if (filtroEstado && r.estado !== filtroEstado) return false;
    if (termino && !`${r.nombre} ${r.nombreCorto || ""} ${r.descripcion || ""}`.toLowerCase().includes(termino)) return false;
    return true;
  }).sort((a, b) => (a.nombreCorto || a.nombre).localeCompare(b.nombreCorto || b.nombre, "es"));

  const totalPaginas = Math.max(1, Math.ceil(filas.length / FILAS_POR_PAGINA));
  const paginaActual = Math.min(pagina, totalPaginas);
  const filasPagina = filas.slice((paginaActual - 1) * FILAS_POR_PAGINA, paginaActual * FILAS_POR_PAGINA);

  const hayFiltros = Boolean(termino || filtroEstado || chipsPP.length || chipsPR.length);
  const limpiarFiltros = () => {
    setBusqueda("");
    setFiltroEstado("");
    cambiarContexto({ pp: null, pr: null });
  };

  const alternarChip = (clave, actuales, id) => cambiarContexto({
    [clave]: actuales.includes(id) ? actuales.filter((x) => x !== id) : [...actuales, id],
  });

  const abrirNuevo = () => setModal({ requerimiento: null });
  const abrirEdicion = (r) => setModal({ requerimiento: r });

  // Perfiles elegibles en el modal: los activos y, al editar, también los ya vinculados.
  const opcionesModal = (activos, todos, vinculados) => {
    const ids = new Set(activos.map((p) => p.id));
    return [...activos, ...todos.filter((p) => (vinculados || []).includes(p.id) && !ids.has(p.id))];
  };

  const claseChip = (activo) => `px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-colors ${CLASE_FOCO} ${
    activo ? "bg-primary border-primary text-white" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
  }`;
  const entidad = etiquetaTipoEntidad(tipo);
  const activosDelTipo = delTipo.filter((r) => r.estado === "activo").length;
  const tipoModal = modalAbierto?.requerimiento?.tipoEntidad || tipo;

  const botonNuevo = puedeEscribir && (
    <button
      type="button"
      onClick={abrirNuevo}
      className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary hover:bg-primary-dark text-white font-bold text-xs shadow-md shadow-primary/20 transition-all ${CLASE_FOCO}`}
    >
      <Plus className="w-4 h-4" /> Nuevo requerimiento
    </button>
  );

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-card p-5 sm:p-8 space-y-7">
      {/* a. Encabezado */}
      <div>
        <h1 className="text-2xl font-bold text-carbon-dark tracking-tight">Requerimientos</h1>
        <p className="text-sm text-slate-500 mt-1">Configuración documental del Mandante</p>
      </div>

      <ErrorBanner message={error || contextoMandante.error} />

      {mandantes === null ? (
        <div className="py-16 flex items-center justify-center gap-2 text-slate-400 text-xs">
          <Loader2 className="w-4 h-4 animate-spin" /> Cargando...
        </div>
      ) : mandantes.length === 0 ? (
        <div className="py-16 text-center space-y-2">
          <Building2 className="w-8 h-8 text-slate-300 mx-auto" />
          <p className="text-sm font-bold text-carbon-dark">No hay Mandantes activos</p>
          {esSuperadmin && (
            <Link to="/mandantes/nuevo" className="inline-block text-xs font-bold text-primary hover:text-primary-dark hover:underline">
              Crear un Mandante
            </Link>
          )}
        </div>
      ) : (
        <>
          {/* b. Mandante: contexto obligatorio, no un filtro */}
          <section className="p-4 sm:p-5 rounded-2xl bg-primary-lighter/50 border border-primary/10 space-y-3">
            <p className={CLASE_SECCION}>Mandante</p>
            <TarjetaMandante mandante={mandanteActual} opciones={mandantes} onElegir={elegirMandante} />
            {mandantes.length > 1 && (
              <p className="text-xs text-slate-500">Selecciona el Mandante para consultar y configurar sus requerimientos</p>
            )}
          </section>

          {!listo ? (
            <div className="py-16 flex items-center justify-center gap-2 text-slate-400 text-xs">
              <Loader2 className="w-4 h-4 animate-spin" /> Cargando catálogo...
            </div>
          ) : (
            <>
              {/* c. Tipo de entidad */}
              <section className="space-y-3">
                <p className={CLASE_SECCION}>Tipo de entidad</p>
                <div role="tablist" className="grid grid-cols-3 gap-2 sm:gap-4">
                  {TIPOS_ENTIDAD.map((t) => {
                    const Icono = ICONO_TIPO[t.value];
                    const activa = tipo === t.value;
                    const cantidad = requerimientos.filter((r) => r.tipoEntidad === t.value).length;
                    return (
                      <button
                        key={t.value}
                        type="button"
                        role="tab"
                        aria-selected={activa}
                        onClick={() => cambiarContexto({ tipo: t.value, pr: null })}
                        className={`relative flex flex-col items-center gap-2 px-2 py-4 sm:py-5 rounded-2xl border-2 transition-colors ${CLASE_FOCO} ${
                          activa ? "border-primary bg-primary-lighter" : "border-slate-200 bg-white hover:border-slate-300"
                        }`}
                      >
                        <span
                          aria-label={`${cantidad} requerimientos`}
                          className={`absolute top-2 right-2 px-2 py-0.5 rounded-full text-[10px] font-bold ${activa ? "bg-primary text-white" : "bg-slate-100 text-slate-500"}`}
                        >
                          {cantidad}
                        </span>
                        <Icono className={`w-6 h-6 sm:w-7 sm:h-7 ${activa ? "text-primary-dark" : "text-slate-400"}`} />
                        <span className={`text-xs sm:text-sm ${activa ? "font-bold text-primary-dark" : "font-medium text-slate-600"}`}>
                          {t.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* d. Perfiles: chips que filtran el listado (sin selección, se muestran todos) */}
              <section className="space-y-4">
                <div className="space-y-3">
                  <p className={CLASE_SECCION}>Perfiles de Participación</p>
                  {ppActivos.length === 0 ? (
                    <p className="text-xs text-slate-500">
                      Este Mandante no tiene Perfiles de Participación.{" "}
                      {puedeEscribir && (
                        <Link to="/perfiles-participacion/nuevo" className="font-bold text-primary hover:text-primary-dark hover:underline">
                          Crear Perfil de Participación
                        </Link>
                      )}
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {ppActivos.map((p) => (
                        <button
                          key={p.id} type="button" aria-pressed={chipsPP.includes(p.id)}
                          onClick={() => alternarChip("pp", chipsPP, p.id)}
                          className={claseChip(chipsPP.includes(p.id))}
                        >
                          {p.nombre}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {tipo !== "empresa" && (
                  <div className="space-y-3">
                    <p className={CLASE_SECCION}>Perfiles de {tipo === "persona" ? "persona" : "maquinaria"}</p>
                    {prActivos.length === 0 ? (
                      <p className="text-xs text-slate-500">Este Mandante no tiene Perfiles de Recurso de este tipo.</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {prActivos.map((p) => (
                          <button
                            key={p.id} type="button" aria-pressed={chipsPR.includes(p.id)}
                            onClick={() => alternarChip("pr", chipsPR, p.id)}
                            className={claseChip(chipsPR.includes(p.id))}
                          >
                            {p.nombre}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </section>

              {/* e. Separador */}
              <hr className="border-slate-100" />

              {/* f. Encabezado del listado */}
              <div className="flex items-end justify-between gap-3 flex-wrap">
                <div>
                  <h2 className="text-lg font-bold text-carbon-dark">Requerimientos de {entidad}</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {delTipo.length} {delTipo.length === 1 ? "requerimiento" : "requerimientos"} · {activosDelTipo} {activosDelTipo === 1 ? "activo" : "activos"}
                  </p>
                </div>
                {botonNuevo}
              </div>

              {/* g. Listado */}
              <div className="rounded-2xl border border-slate-200 overflow-hidden">
                <div className="flex items-center gap-4 flex-wrap px-4 py-3 border-b border-slate-200 bg-slate-50/50">
                  <div className="relative flex-1 min-w-48">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text" value={busqueda}
                      onChange={(e) => { setBusqueda(e.target.value); setPagina(1); }}
                      placeholder="Buscar por nombre o descripción…" aria-label="Buscar por nombre o descripción"
                      className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    />
                  </div>
                  <OpcionesRadio
                    compacto name="catalogo-estado" value={filtroEstado} ariaLabel="Estado"
                    onChange={(e) => { setFiltroEstado(e.target.value); setPagina(1); }} opciones={OPCIONES_ESTADO}
                  />
                </div>

                {delTipo.length === 0 ? (
                  <div className="py-14 text-center space-y-3">
                    <p className="text-sm text-slate-500">Aún no hay requerimientos de {entidad} para este Mandante</p>
                    {botonNuevo}
                  </div>
                ) : filas.length === 0 ? (
                  <div className="py-14 text-center space-y-3">
                    <p className="text-sm text-slate-500">No hay requerimientos con estos filtros</p>
                    {hayFiltros && (
                      <button
                        type="button" onClick={limpiarFiltros}
                        className={`px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 ${CLASE_FOCO}`}
                      >
                        Limpiar filtros
                      </button>
                    )}
                  </div>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {filasPagina.map((r) => {
                      const titulo = r.nombreCorto || r.nombre;
                      const pps = (r.aplicabilidad?.perfilParticipacionIds || []).map((id) => nombrePP[id] || "—");
                      const prs = r.aplicabilidad?.perfilRecursoIds ?? null;
                      const aplica = `${pps.length ? pps.join(" · ") : "Sin perfiles"}${
                        tipo === "empresa" ? "" : ` — ${prs === null ? "Todos" : prs.map((id) => nombrePR[id] || "—").join(", ")}`}`;
                      const contenido = (
                        <>
                          <span className="flex-1 min-w-0 text-left">
                            <span className="block text-sm font-bold text-carbon-dark truncate">{titulo}</span>
                            {r.nombre !== titulo && <span className="block text-xs text-slate-500 truncate">{r.nombre}</span>}
                            <span className="block text-xs text-slate-400 truncate">{aplica}</span>
                          </span>
                          {r.tipoDocumentalId && r.modoValidacion && r.modoValidacion !== "manual" && (
                            <span
                              title={r.modoValidacion === "automatico" ? "Se evalúa automáticamente con IA" : "La IA propone la evaluación y un evaluador la confirma"}
                              className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary-lighter text-primary-dark text-[10px] font-bold"
                            >
                              <Sparkles className="w-3 h-3" aria-hidden="true" />
                              {r.modoValidacion === "automatico" ? "IA automática" : "IA asistida"}
                            </span>
                          )}
                          {r.requiereVencimiento && (
                            <span title="Tiene vencimiento" className="shrink-0 text-amber-600">
                              <CalendarClock className="w-4 h-4" aria-label="Tiene vencimiento" />
                            </span>
                          )}
                          <span className="shrink-0"><StatusBadge value={r.estado} map={MAPA_ACTIVO_INACTIVO} /></span>
                        </>
                      );
                      return (
                        <li key={r.id}>
                          {puedeEscribir ? (
                            <button
                              type="button" onClick={() => abrirEdicion(r)} title={r.nombre}
                              className="w-full flex items-center gap-4 px-4 py-3.5 hover:bg-slate-50 transition-colors focus:outline-none focus-visible:bg-primary-lighter/60"
                            >
                              {contenido}
                            </button>
                          ) : (
                            <div title={r.nombre} className="flex items-center gap-4 px-4 py-3.5">{contenido}</div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}

                {filas.length > FILAS_POR_PAGINA && (
                  <div className="px-4 py-3 border-t border-slate-200">
                    <Pagination
                      page={paginaActual}
                      pageSize={FILAS_POR_PAGINA}
                      total={filas.length}
                      onPageChange={setPagina}
                      onPageSizeChange={() => {}}
                      pageSizeOptions={[FILAS_POR_PAGINA]}
                    />
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}

      {modalAbierto && mandanteActual && puedeEscribir && (
        <RequerimientoModal
          key={modalAbierto.requerimiento?.id || "nuevo"}
          mandante={mandanteActual}
          tipoEntidad={tipoModal}
          requerimiento={modalAbierto.requerimiento}
          perfilesParticipacion={opcionesModal(
            ppActivos, perfilesParticipacion, modalAbierto.requerimiento?.aplicabilidad?.perfilParticipacionIds,
          )}
          perfilesRecurso={opcionesModal(
            perfilesRecurso.filter((p) => p.estado === "activo" && p.tipo === tipoModal),
            perfilesRecurso.filter((p) => p.tipo === tipoModal),
            modalAbierto.requerimiento?.aplicabilidad?.perfilRecursoIds,
          )}
          preseleccion={{ perfilParticipacionIds: chipsPP, perfilRecursoIds: chipsPR }}
          onGuardado={() => cargarRequerimientos()}
          onPerfilRecursoCreado={() => cargarPerfilesRecurso()}
          onCerrar={cerrarModal}
        />
      )}
    </div>
  );
};
