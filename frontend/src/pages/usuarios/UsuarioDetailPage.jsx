import React, { useEffect, useState } from "react";
import { getMandanteDisplayName } from "../../utils/mandanteDisplay";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  Pencil, KeyRound, ShieldOff, Power, Monitor, Smartphone, Laptop,
} from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { usuarioService, ROLES_USUARIO } from "../../services/usuarioService";
import { mandanteService } from "../../services/mandanteService";
import { bitacoraService } from "../../services/bitacoraService";
import { formatFecha, formatFechaHora, formatTiempoRelativo } from "../../utils/fechaFormatters";
import { describirEvento } from "../../utils/bitacoraFormatters";
import { can, esUnoMismo } from "../../utils/permissions";
import { DetalleEntidadLayout } from "../../components/shared/DetalleEntidadLayout";
import { KpiCard, KpiValor, TarjetaPanel, CampoInfo } from "../../components/shared/DetalleUI";
import { StatusBadge, MAPA_ACTIVO_DESACTIVADO } from "../../components/shared/StatusBadge";
import { ActionButton } from "../../components/shared/ActionButton";
import { SerieDiariaChart } from "../../components/shared/SerieDiariaChart";

// Fecha desde la que existe telemetría de accesos/sesiones (Fase B de
// "Usuarios — actividad, métricas y gestión de accesos"): las sesiones NO
// se pueden reconstruir retroactivamente desde la Bitácora, a diferencia de
// expedientes/evaluaciones (que sí se recalcularon con el backfill). Fecha
// de referencia = puesta en marcha de esta funcionalidad; se deja como
// constante porque no hay un campo de configuración para esto todavía.
const FECHA_INICIO_TRACKING_ACCESOS = "2026-09-28";

// Roles que operan sobre todos los Mandantes a la vez — mismo criterio que
// UsuariosListPage.jsx.
const ROLES_TRANSVERSALES = ["superadmin", "evaluador", "admin_comercial"];

const TABS = [
  { key: "resumen", label: "Resumen" },
  { key: "actividad", label: "Actividad" },
  { key: "sesiones", label: "Sesiones" },
  { key: "acceso", label: "Accesos y seguridad" },
];

const PERIODOS = [
  { key: "7d", label: "7 días", dias: 7 },
  { key: "30d", label: "30 días", dias: 30 },
  { key: "90d", label: "90 días", dias: 90 },
  { key: "custom", label: "Personalizado", dias: null },
];

const FILTROS_ACTIVIDAD = [
  { value: "", label: "Todos los tipos" },
  { value: "expediente", label: "Expedientes" },
  { value: "evaluacion", label: "Evaluaciones" },
  { value: "participacion", label: "Participaciones" },
  { value: "asignacion", label: "Asignaciones" },
  { value: "persona", label: "Personas" },
  { value: "recurso", label: "Maquinaria" },
  { value: "empresa", label: "Empresas" },
  { value: "proyecto", label: "Proyectos" },
  { value: "usuario", label: "Usuarios" },
];

// Ruta de detalle por entidad, para enlazar desde la línea de tiempo — solo
// las entidades que efectivamente tienen una pantalla de detalle propia.
const RUTA_ENTIDAD = {
  expediente: "/expedientes",
  participacion: "/participaciones",
  persona: "/personas",
  recurso: "/recursos",
  empresa: "/empresas",
  proyecto: "/proyectos",
  usuario: "/usuarios",
};

const toISODateLocal = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const sumarDias = (fechaISO, dias) => {
  const [y, m, d] = fechaISO.split("-").map(Number);
  const fecha = new Date(y, m - 1, d);
  fecha.setDate(fecha.getDate() + dias);
  return toISODateLocal(fecha);
};

const formatDuracion = (segundos) => {
  if (segundos === null || segundos === undefined) return "-";
  const min = Math.floor(segundos / 60);
  const horas = Math.floor(min / 60);
  const minRestantes = min % 60;
  if (horas > 0) return `${horas} h ${minRestantes} min`;
  return `${min} min`;
};

// Extracción muy básica de plataforma/navegador desde el User-Agent — solo
// para mostrar algo legible en la tabla de Sesiones, no pretende ser un
// parser exhaustivo.
const describirDispositivo = (userAgent) => {
  if (!userAgent) return "-";
  if (/Android/i.test(userAgent)) return "Android";
  if (/iPhone|iPad/i.test(userAgent)) return "iOS";
  if (/Windows/i.test(userAgent)) return "Windows";
  if (/Macintosh/i.test(userAgent)) return "Mac";
  if (/Linux/i.test(userAgent)) return "Linux";
  return "Desconocido";
};

const IconoPlataforma = ({ plataforma }) => {
  if (plataforma === "android") return <Smartphone className="w-3.5 h-3.5" />;
  if (plataforma === "web") return <Laptop className="w-3.5 h-3.5" />;
  return <Monitor className="w-3.5 h-3.5" />;
};

const CIERRE_LABELS = {
  logout: "Cierre manual",
  timeout: "Expiró por inactividad",
  revocada: "Revocada por un administrador",
};

export const UsuarioDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const rolActor = profile?.rol;
  const esSelf = esUnoMismo(id, profile?.uid);
  const puedeVerActividad = can(rolActor, "ver_actividad");

  const [usuario, setUsuario] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState("resumen");
  const [procesando, setProcesando] = useState(false);
  const [mandanteNombre, setMandanteNombre] = useState(null);

  const cargarUsuario = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await usuarioService.obtenerPorId(id);
      setUsuario(data);
    } catch (err) {
      console.error("Error al cargar el usuario:", err);
      setError(err.message || "No se pudo cargar el usuario.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarUsuario();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // El registro de Usuario solo trae `mandanteId` — el nombre se resuelve
  // acá, igual que en UsuariosListPage.jsx (mandanteService.listar() da
  // 403 para mandante_admin, así que no se puede precargar todo).
  useEffect(() => {
    if (!usuario?.mandanteId || ROLES_TRANSVERSALES.includes(usuario.rol)) {
      setMandanteNombre(null);
      return;
    }
    mandanteService
      .obtenerPorId(usuario.mandanteId)
      .then((data) => setMandanteNombre(getMandanteDisplayName(data) || usuario.mandanteId))
      .catch(() => setMandanteNombre(usuario.mandanteId));
  }, [usuario?.mandanteId, usuario?.rol]);

  // --- Período (Tab Resumen) ---
  const [periodo, setPeriodo] = useState("7d");
  const [customDesde, setCustomDesde] = useState(toISODateLocal(sumarDiasDate(-6)));
  const [customHasta, setCustomHasta] = useState(toISODateLocal(new Date()));

  function sumarDiasDate(dias) {
    const fecha = new Date();
    fecha.setDate(fecha.getDate() + dias);
    return fecha;
  }

  const hastaISO = toISODateLocal(new Date());
  const periodoDef = PERIODOS.find((p) => p.key === periodo);
  const desde = periodo === "custom" ? customDesde : sumarDias(hastaISO, -(periodoDef.dias - 1));
  const hasta = periodo === "custom" ? customHasta : hastaISO;

  const [metricas, setMetricas] = useState(undefined);

  useEffect(() => {
    if (tab !== "resumen" || !puedeVerActividad) return;
    setMetricas(undefined);
    usuarioService
      .obtenerMetricas(id, { desde, hasta })
      .then((data) => setMetricas(data))
      .catch((err) => {
        console.error("Error al cargar métricas del usuario:", err);
        setMetricas(null);
      });
  }, [tab, id, desde, hasta, puedeVerActividad]);

  // --- Actividad ---
  const [filtroTipo, setFiltroTipo] = useState("");
  const [actividadItems, setActividadItems] = useState([]);
  const [cargandoActividad, setCargandoActividad] = useState(false);
  const [errorActividad, setErrorActividad] = useState(null);
  const [actividadAgotada, setActividadAgotada] = useState(false);

  const cargarActividad = (cursor) => {
    setCargandoActividad(true);
    setErrorActividad(null);
    usuarioService
      .obtenerActividad(id, { cursor, tipo: filtroTipo || undefined })
      .then((data) => {
        const items = data || [];
        setActividadItems((prev) => (cursor ? [...prev, ...items] : items));
        setActividadAgotada(items.length < 20);
      })
      .catch((err) => {
        console.error("Error al cargar la actividad del usuario:", err);
        setErrorActividad(err.message || "No se pudo cargar la actividad.");
      })
      .finally(() => setCargandoActividad(false));
  };

  useEffect(() => {
    if (tab !== "actividad" || !puedeVerActividad) return;
    setActividadItems([]);
    setActividadAgotada(false);
    cargarActividad(undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, id, filtroTipo, puedeVerActividad]);

  // --- Sesiones ---
  const [sesionesItems, setSesionesItems] = useState([]);
  const [cargandoSesiones, setCargandoSesiones] = useState(false);
  const [errorSesiones, setErrorSesiones] = useState(null);
  const [sesionesAgotadas, setSesionesAgotadas] = useState(false);

  const cargarSesiones = (cursor) => {
    setCargandoSesiones(true);
    setErrorSesiones(null);
    usuarioService
      .obtenerSesiones(id, { cursor })
      .then((data) => {
        const items = data || [];
        setSesionesItems((prev) => (cursor ? [...prev, ...items] : items));
        setSesionesAgotadas(items.length < 20);
      })
      .catch((err) => {
        console.error("Error al cargar las sesiones del usuario:", err);
        setErrorSesiones(err.message || "No se pudieron cargar las sesiones.");
      })
      .finally(() => setCargandoSesiones(false));
  };

  useEffect(() => {
    if (tab !== "sesiones" || !puedeVerActividad) return;
    setSesionesItems([]);
    setSesionesAgotadas(false);
    cargarSesiones(undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, id, puedeVerActividad]);

  // --- Accesos y seguridad ---
  const esMandanteAdmin = rolActor === "mandante_admin";
  const rolesDisponiblesEdicion = esMandanteAdmin
    ? ROLES_USUARIO.filter((r) => ["mandante_admin", "mandante_lector"].includes(r.value))
    : ROLES_USUARIO;
  const [mandantesActivos, setMandantesActivos] = useState([]);
  const [modoEdicionAcceso, setModoEdicionAcceso] = useState(false);
  const [formRol, setFormRol] = useState("");
  const [formMandanteId, setFormMandanteId] = useState("");
  const [guardandoAcceso, setGuardandoAcceso] = useState(false);
  const [errorAcceso, setErrorAcceso] = useState(null);
  const [historialAcceso, setHistorialAcceso] = useState(undefined);

  useEffect(() => {
    if (tab !== "acceso") return;
    if (!esMandanteAdmin) {
      mandanteService.listar("activo").then((data) => setMandantesActivos(data || [])).catch(() => {});
    }
    setHistorialAcceso(undefined);
    bitacoraService
      .listar({ entidad: "usuario", entidadId: id, limit: 50 })
      .then((data) => setHistorialAcceso(data || []))
      .catch(() => setHistorialAcceso(null));
  }, [tab, id, esMandanteAdmin]);

  const iniciarEdicionAcceso = () => {
    setFormRol(usuario.rol || "");
    setFormMandanteId(usuario.mandanteId || "");
    setErrorAcceso(null);
    setModoEdicionAcceso(true);
  };

  const requiereMandanteEdicion = ROLES_USUARIO.find((r) => r.value === formRol)?.requiereMandante || false;

  const guardarAcceso = async (e) => {
    e.preventDefault();
    if (!window.confirm(
        "Cambiar el rol o el mandante cierra inmediatamente todas las sesiones activas de este usuario. ¿Continuar?",
    )) return;
    setGuardandoAcceso(true);
    setErrorAcceso(null);
    try {
      await usuarioService.actualizar(id, {
        rol: formRol,
        mandanteId: requiereMandanteEdicion
          ? (esMandanteAdmin ? profile?.mandanteId : formMandanteId)
          : null,
      });
      setModoEdicionAcceso(false);
      await cargarUsuario();
    } catch (err) {
      setErrorAcceso(err.message || "No se pudo actualizar el rol/mandante.");
    } finally {
      setGuardandoAcceso(false);
    }
  };

  const ejecutarAccionSeguridad = async (accion, confirmMsg) => {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    setProcesando(true);
    setError(null);
    try {
      await accion();
      await cargarUsuario();
    } catch (err) {
      console.error("Error al ejecutar la acción de seguridad:", err);
      setError(err.message || "No se pudo completar la acción.");
    } finally {
      setProcesando(false);
    }
  };

  if (loading) {
    return <div className="max-w-7xl mx-auto py-16 text-center text-slate-400 text-xs">Cargando usuario...</div>;
  }
  if (!usuario) {
    return (
      <div className="max-w-7xl mx-auto space-y-4">
        <p className="text-sm text-red-600">{error || "Usuario no encontrado."}</p>
        <ActionButton onClick={() => navigate("/usuarios")}>Volver a Usuarios</ActionButton>
      </div>
    );
  }

  const rolLabel = ROLES_USUARIO.find((r) => r.value === usuario.rol)?.label || usuario.rol;
  const ocultarEvaluaciones = usuario.rol === "mandante_lector";

  const acciones = (
    <>
      {can(rolActor, "editar_usuario") && (
        <ActionButton icon={Pencil} onClick={() => navigate(`/usuarios/${id}/editar`)}>Editar</ActionButton>
      )}
    </>
  );

  return (
    <DetalleEntidadLayout
      onVolver={() => navigate("/usuarios")}
      titulo={`${usuario.nombre} ${usuario.apellido}`}
      subtitulo={usuario.email}
      badge={<StatusBadge value={usuario.estado || "activo"} map={MAPA_ACTIVO_DESACTIVADO} />}
      acciones={acciones}
      error={error}
      kpis={[
        <KpiCard key="rol" titulo="Rol">
          <KpiValor valor={rolLabel} />
        </KpiCard>,
        <KpiCard key="mandante" titulo="Mandante">
          <KpiValor valor={
            ROLES_TRANSVERSALES.includes(usuario.rol)
              ? "Todos"
              : mandanteNombre || (usuario.mandanteId ? "…" : "-")
          } />
        </KpiCard>,
        <KpiCard key="ultimoAcceso" titulo="Último acceso" subtexto={usuario.ultimoAcceso ? formatFechaHora(usuario.ultimoAcceso) : null}>
          <h3 className="text-sm font-black text-carbon-dark tracking-tight">
            {usuario.ultimoAcceso ? formatTiempoRelativo(usuario.ultimoAcceso) : "Nunca"}
          </h3>
        </KpiCard>,
      ]}
      tabs={TABS}
      tab={tab}
      onTab={setTab}
      sidebar={
        <TarjetaPanel titulo="Datos de la cuenta">
          <div className="space-y-3">
            <CampoInfo etiqueta="Email">{usuario.email}</CampoInfo>
            <CampoInfo etiqueta="Creado el">{usuario.createdAt ? formatFecha(usuario.createdAt) : "-"}</CampoInfo>
          </div>
        </TarjetaPanel>
      }
    >
      {tab === "resumen" && (
        !puedeVerActividad ? (
          <p className="text-xs text-slate-400 py-8 text-center bg-white rounded-2xl border border-slate-100">
            No tiene permisos para ver las métricas de este usuario.
          </p>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center gap-2 flex-wrap">
              {PERIODOS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setPeriodo(p.key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                    periodo === p.key
                      ? "bg-primary text-white"
                      : "bg-white border border-slate-200 text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  {p.label}
                </button>
              ))}
              {periodo === "custom" && (
                <div className="flex items-center gap-2 ml-1">
                  <input
                    type="date"
                    value={customDesde}
                    onChange={(e) => setCustomDesde(e.target.value)}
                    className="px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs"
                  />
                  <span className="text-xs text-slate-400">a</span>
                  <input
                    type="date"
                    value={customHasta}
                    onChange={(e) => setCustomHasta(e.target.value)}
                    className="px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs"
                  />
                </div>
              )}
            </div>

            <p className="text-[11px] font-semibold text-slate-400">
              Datos de acceso desde {formatFecha(FECHA_INICIO_TRACKING_ACCESOS)} — las sesiones anteriores a esa fecha no quedaron registradas.
            </p>

            {metricas === undefined ? (
              <p className="text-xs text-slate-400 py-8 text-center">Cargando métricas...</p>
            ) : metricas === null ? (
              <p className="text-xs text-red-600 py-8 text-center">No se pudieron cargar las métricas.</p>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                  <KpiCard titulo="Accesos" subtexto={`${(metricas.totales.accesos / Math.max(1, diasEnRango(desde, hasta))).toFixed(1)} / día`}>
                    <KpiValor valor={metricas.totales.accesos} />
                  </KpiCard>
                  <KpiCard titulo="Tiempo conectado" subtexto={`Promedio: ${formatDuracion(metricas.promedioDuracionSesionSeg)} / sesión`}>
                    <KpiValor valor={formatDuracion(metricas.totales.segundosConectado)} />
                  </KpiCard>
                  <KpiCard titulo="Expedientes creados">
                    <KpiValor valor={metricas.totales.expedientesCreados} />
                  </KpiCard>
                  {!ocultarEvaluaciones && (
                    <KpiCard titulo="Evaluaciones realizadas">
                      <KpiValor valor={metricas.totales.evaluacionesRealizadas} />
                    </KpiCard>
                  )}
                  {!ocultarEvaluaciones && (
                    <KpiCard titulo="Empresas evaluadas">
                      <KpiValor valor={metricas.totales.empresasEvaluadas} />
                    </KpiCard>
                  )}
                  {!ocultarEvaluaciones && (
                    <KpiCard titulo="Personas evaluadas">
                      <KpiValor valor={metricas.totales.personasEvaluadas} />
                    </KpiCard>
                  )}
                  {!ocultarEvaluaciones && (
                    <KpiCard titulo="Máquinas evaluadas">
                      <KpiValor valor={metricas.totales.maquinasEvaluadas} />
                    </KpiCard>
                  )}
                </div>

                <TarjetaPanel titulo="Accesos y tiempo conectado por día">
                  <SerieDiariaChart serieDiaria={metricas.serieDiaria} />
                </TarjetaPanel>
              </>
            )}
          </div>
        )
      )}

      {tab === "actividad" && (
        !puedeVerActividad ? (
          <p className="text-xs text-slate-400 py-8 text-center bg-white rounded-2xl border border-slate-100">
            No tiene permisos para ver la actividad de este usuario.
          </p>
        ) : (
          <div className="space-y-4">
            <select
              value={filtroTipo}
              onChange={(e) => setFiltroTipo(e.target.value)}
              className="px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-600"
            >
              {FILTROS_ACTIVIDAD.map((f) => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>

            {errorActividad && <p className="text-xs text-red-600">{errorActividad}</p>}

            {actividadItems.length === 0 && !cargandoActividad ? (
              <p className="text-xs text-slate-400 py-8 text-center bg-white rounded-2xl border border-slate-100">
                Sin actividad registrada en este filtro.
              </p>
            ) : (
              <div className="bg-white rounded-2xl border border-slate-100 shadow-card divide-y divide-slate-100">
                {agruparPorDia(actividadItems).map((grupo) => (
                  <div key={grupo.fecha} className="p-4">
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                      {formatFecha(grupo.fecha)}
                    </p>
                    <ul className="space-y-2.5">
                      {grupo.eventos.map((ev) => {
                        const ruta = RUTA_ENTIDAD[ev.entidad];
                        return (
                          <li key={ev.id} className="text-xs flex items-center justify-between gap-2">
                            <div>
                              <p className="font-semibold text-slate-700">{describirEvento(ev)}</p>
                              <p className="text-[11px] text-slate-400">{formatFechaHora(ev.createdAt)}</p>
                            </div>
                            {ruta && ev.entidadId && (
                              <Link to={`${ruta}/${ev.entidadId}`} className="text-[11px] font-bold text-primary hover:underline whitespace-nowrap">
                                Ver
                              </Link>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            )}

            {!actividadAgotada && (
              <div className="text-center">
                <ActionButton
                  disabled={cargandoActividad}
                  onClick={() => cargarActividad(actividadItems[actividadItems.length - 1]?.id)}
                >
                  {cargandoActividad ? "Cargando..." : "Cargar más"}
                </ActionButton>
              </div>
            )}
          </div>
        )
      )}

      {tab === "sesiones" && (
        !puedeVerActividad ? (
          <p className="text-xs text-slate-400 py-8 text-center bg-white rounded-2xl border border-slate-100">
            No tiene permisos para ver las sesiones de este usuario.
          </p>
        ) : (
          <div className="space-y-4">
            {errorSesiones && <p className="text-xs text-red-600">{errorSesiones}</p>}
            {sesionesItems.length === 0 && !cargandoSesiones ? (
              <p className="text-xs text-slate-400 py-8 text-center bg-white rounded-2xl border border-slate-100">
                Sin sesiones registradas.
              </p>
            ) : (
              <div className="bg-white rounded-2xl border border-slate-100 shadow-card overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                      <th className="py-3 px-4">Inicio</th>
                      <th className="py-3 px-4">Fin</th>
                      <th className="py-3 px-4">Duración</th>
                      <th className="py-3 px-4">Plataforma</th>
                      <th className="py-3 px-4">Dispositivo</th>
                      <th className="py-3 px-4">Cierre</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {sesionesItems.map((s) => (
                      <tr key={s.id}>
                        <td className="py-3 px-4 font-medium text-slate-700">{formatFechaHora(s.inicio)}</td>
                        <td className="py-3 px-4 font-medium text-slate-700">
                          {s.fin ? formatFechaHora(s.fin) : <span className="text-sage-dark font-bold">En curso</span>}
                        </td>
                        <td className="py-3 px-4 text-slate-600">{formatDuracion(s.duracionSeg)}</td>
                        <td className="py-3 px-4 text-slate-600">
                          <span className="inline-flex items-center gap-1.5">
                            <IconoPlataforma plataforma={s.plataforma} />
                            {s.plataforma === "web" ? "Web" : s.plataforma === "android" ? "App móvil" : s.plataforma}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-600">{describirDispositivo(s.userAgent)}</td>
                        <td className="py-3 px-4 text-slate-600">
                          {s.cierre ? (CIERRE_LABELS[s.cierre] || s.cierre) : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {!sesionesAgotadas && (
              <div className="text-center">
                <ActionButton
                  disabled={cargandoSesiones}
                  onClick={() => cargarSesiones(sesionesItems[sesionesItems.length - 1]?.id)}
                >
                  {cargandoSesiones ? "Cargando..." : "Cargar más"}
                </ActionButton>
              </div>
            )}
          </div>
        )
      )}

      {tab === "acceso" && (
        <div className="space-y-6">
          <TarjetaPanel
            titulo="Rol y mandante"
            accion={
              !modoEdicionAcceso && can(rolActor, "editar_usuario") && !esSelf && (
                <ActionButton icon={Pencil} onClick={iniciarEdicionAcceso}>Editar</ActionButton>
              )
            }
          >
            {modoEdicionAcceso ? (
              <form onSubmit={guardarAcceso} className="space-y-4">
                {errorAcceso && <p className="text-xs text-red-600">{errorAcceso}</p>}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">Rol</label>
                    <select
                      value={formRol}
                      onChange={(e) => setFormRol(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-sm"
                    >
                      {rolesDisponiblesEdicion.map((r) => (
                        <option key={r.value} value={r.value}>{r.label}</option>
                      ))}
                    </select>
                  </div>
                  {requiereMandanteEdicion && (
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">Mandante</label>
                      {esMandanteAdmin ? (
                        <input
                          type="text"
                          disabled
                          value={mandanteNombre || profile?.mandanteId || ""}
                          className="w-full px-3.5 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-sm text-slate-500"
                        />
                      ) : (
                        <select
                          value={formMandanteId}
                          onChange={(e) => setFormMandanteId(e.target.value)}
                          className="w-full px-3.5 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-sm"
                        >
                          <option value="">Seleccione un Mandante...</option>
                          {mandantesActivos.map((m) => (
                            <option key={m.id} value={m.id}>{getMandanteDisplayName(m)}</option>
                          ))}
                        </select>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="submit"
                    disabled={guardandoAcceso}
                    className="px-4 py-2 text-xs font-semibold text-white bg-primary hover:bg-primary-dark rounded-xl shadow-md shadow-primary/25 transition-all disabled:opacity-50"
                  >
                    {guardandoAcceso ? "Guardando..." : "Guardar cambios"}
                  </button>
                  <ActionButton disabled={guardandoAcceso} onClick={() => setModoEdicionAcceso(false)}>Cancelar</ActionButton>
                </div>
              </form>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <CampoInfo etiqueta="Rol">{rolLabel}</CampoInfo>
                <CampoInfo etiqueta="Mandante">
                  {ROLES_TRANSVERSALES.includes(usuario.rol)
                    ? "Todos"
                    : mandanteNombre || usuario.mandanteId || "-"}
                </CampoInfo>
              </div>
            )}
            {esSelf && (
              <p className="text-[11px] text-slate-400 italic">No puede cambiar su propio rol.</p>
            )}
          </TarjetaPanel>

          <TarjetaPanel titulo="Acciones de seguridad">
            <div className="flex flex-wrap gap-3">
              {can(rolActor, "resetear_password") && (
                <ActionButton
                  icon={KeyRound}
                  disabled={procesando}
                  onClick={() => ejecutarAccionSeguridad(
                      () => usuarioService.resetPassword(id),
                      `¿Enviar un correo de restablecimiento de contraseña a ${usuario.email}?`,
                  )}
                >
                  Restablecer contraseña
                </ActionButton>
              )}
              {can(rolActor, "revocar_sesiones") && (
                <ActionButton
                  icon={ShieldOff}
                  disabled={procesando}
                  onClick={() => ejecutarAccionSeguridad(
                      () => usuarioService.revocarSesiones(id),
                      `¿Cerrar todas las sesiones activas de ${usuario.nombre} ${usuario.apellido}?`,
                  )}
                >
                  Revocar sesiones
                </ActionButton>
              )}
              {!esSelf && can(rolActor, usuario.estado === "inactivo" ? "reactivar_usuario" : "desactivar_usuario") && (
                <ActionButton
                  icon={Power}
                  disabled={procesando}
                  onClick={() => ejecutarAccionSeguridad(
                      () => (usuario.estado === "inactivo"
                        ? usuarioService.reactivar(id)
                        : usuarioService.desactivar(id)),
                      usuario.estado === "inactivo"
                        ? `¿Reactivar a ${usuario.nombre} ${usuario.apellido}?`
                        : `¿Desactivar a ${usuario.nombre} ${usuario.apellido}? No podrá iniciar sesión hasta ser reactivado.`,
                  )}
                >
                  {usuario.estado === "inactivo" ? "Reactivar" : "Desactivar"}
                </ActionButton>
              )}
            </div>
          </TarjetaPanel>

          <TarjetaPanel titulo="Historial de accesos y seguridad">
            {historialAcceso === undefined ? (
              <p className="text-xs text-slate-400">Cargando...</p>
            ) : historialAcceso === null ? (
              <p className="text-xs text-red-600">No se pudo cargar el historial.</p>
            ) : historialAcceso.length === 0 ? (
              <p className="text-xs text-slate-400 italic">Sin cambios registrados.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {historialAcceso.map((ev) => (
                  <li key={ev.id} className="py-2.5 text-xs">
                    <p className="font-semibold text-slate-700">{describirEvento(ev)}</p>
                    <p className="text-[11px] text-slate-400">
                      {formatTiempoRelativo(ev.createdAt)} — por {ev.actorNombre || "Sistema"}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </TarjetaPanel>
        </div>
      )}
    </DetalleEntidadLayout>
  );
};

const diasEnRango = (desde, hasta) => {
  const [dy, dm, dd] = desde.split("-").map(Number);
  const [hy, hm, hd] = hasta.split("-").map(Number);
  const diffMs = new Date(hy, hm - 1, hd) - new Date(dy, dm - 1, dd);
  return Math.max(1, Math.round(diffMs / 86400000) + 1);
};

const agruparPorDia = (items) => {
  const mapa = new Map();
  items.forEach((ev) => {
    const fecha = ev.createdAt?._seconds
      ? new Date(ev.createdAt._seconds * 1000)
      : new Date(ev.createdAt);
    const clave = toISODateLocal(fecha);
    if (!mapa.has(clave)) mapa.set(clave, []);
    mapa.get(clave).push(ev);
  });
  return [...mapa.entries()].map(([fecha, eventos]) => ({ fecha, eventos }));
};
