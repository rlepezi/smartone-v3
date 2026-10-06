import React, { useEffect, useRef, useState } from "react";
import { getMandanteDisplayName } from "../../utils/mandanteDisplay";
import { useNavigate } from "react-router-dom";
import {
  UserCog, Pencil, CheckCircle2, XCircle, Zap, KeyRound, ShieldOff, Power,
} from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { usuarioService, ROLES_USUARIO } from "../../services/usuarioService";
import { mandanteService } from "../../services/mandanteService";
import { calcularDeltaPeriodo } from "../../utils/deltaCalculos";
import { formatTiempoRelativo, formatFechaHora } from "../../utils/fechaFormatters";
import { can, esUnoMismo } from "../../utils/permissions";
import { PageHeader } from "../../components/shared/PageHeader";
import { ErrorBanner } from "../../components/shared/ErrorBanner";
import { FilterBar } from "../../components/shared/FilterBar";
import { DataTable } from "../../components/shared/DataTable";
import { EntityIconTile } from "../../components/shared/EntityIconTile";
import { StatusBadge, MAPA_ACTIVO_DESACTIVADO } from "../../components/shared/StatusBadge";
import { RowActionsMenu } from "../../components/shared/RowActionsMenu";
import { Pagination } from "../../components/shared/Pagination";
import { MandanteChip } from "../../components/shared/MandanteChip";
import { ProgressRing } from "../../components/shared/ProgressRing";

const COLUMNS = [
  { key: "usuario", label: "Usuario" },
  { key: "rol", label: "Rol" },
  { key: "mandante", label: "Mandante" },
  { key: "estado", label: "Estado" },
  { key: "ultimoAcceso", label: "Último acceso" },
  { key: "accesos7d", label: "Accesos 7 días" },
  { key: "acciones", label: "Acciones" },
];

// Roles que operan sobre todos los Mandantes a la vez — su columna
// Mandante no es "-" (sin mandante), es "Todos" (alcance transversal).
const ROLES_TRANSVERSALES = ["superadmin", "evaluador", "admin_comercial"];

// Colores por rol para el panel "Por Rol" — no hay un mapa de estado
// establecido para roles (StatusBadge solo mapea estados), así que se
// define acá, acotado a este resumen.
const ROL_COLOR = {
  superadmin: { ring: "text-primary-dark", bg: "bg-primary-lighter" },
  evaluador: { ring: "text-amber-600", bg: "bg-amber-50" },
  admin_comercial: { ring: "text-violet-600", bg: "bg-violet-50" },
  mandante_admin: { ring: "text-sage-dark", bg: "bg-sage-lighter" },
  mandante_lector: { ring: "text-slate-400", bg: "bg-slate-100" },
};

export const UsuariosListPage = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();

  const [usuarios, setUsuarios] = useState([]);
  const [mandantesCache, setMandantesCache] = useState({});
  const mandantesEnCursoRef = useRef(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filtroEstado, setFiltroEstado] = useState("");
  const [filtroRol, setFiltroRol] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [procesandoId, setProcesandoId] = useState(null);

  const [actividadHoy, setActividadHoy] = useState(undefined); // undefined = cargando, null = error

  const cargarUsuarios = async () => {
    setLoading(true);
    setError(null);
    try {
      // El filtro de Estado se aplica en el cliente (ver más abajo): el
      // backend solo acepta un valor exacto de `estado`, y acá "Desactivado"
      // debe calzar con el único valor real que existe ("inactivo").
      const data = await usuarioService.listar({});
      setUsuarios(data || []);
    } catch (err) {
      console.error("Error al cargar usuarios:", err);
      setError(err.message || "Error al obtener la lista de usuarios.");
    } finally {
      setLoading(false);
    }
  };

  const cargarActividadHoy = () => {
    setActividadHoy(undefined);
    usuarioService
      .obtenerResumenActividadHoy()
      .then((data) => setActividadHoy(data))
      .catch((err) => {
        console.error("Error al cargar la actividad de hoy:", err);
        setActividadHoy(null);
      });
  };

  useEffect(() => {
    cargarUsuarios();
    cargarActividadHoy();
  }, []);

  useEffect(() => {
    setPage(1);
  }, [filtroEstado, filtroRol, searchTerm]);

  const rolLabel = (rol) => ROLES_USUARIO.find((r) => r.value === rol)?.label || rol;

  // Sobre el total ya cargado (`usuarios`, alcance del actor) — no sobre
  // `usuariosFiltrados`, que además aplica Rol/Estado/búsqueda de la tabla
  // (filtrar por Rol acá sería circular para una tarjeta que lo desglosa).
  const resumenPorRol = ROLES_USUARIO
    .map((r) => ({ ...r, cantidad: usuarios.filter((u) => u.rol === r.value).length }))
    .filter((r) => r.cantidad > 0)
    .map((r) => ({
      ...r,
      pct: usuarios.length > 0 ? Math.round((r.cantidad / usuarios.length) * 100) : 0,
    }));

  // "Desactivado" es el único estado no-activo real — el filtro de Estado
  // de la tabla solo tiene dos opciones (a diferencia del viejo select con
  // "bloqueado", que nunca fue un valor que el backend llegara a asignar).
  const usuariosFiltrados = usuarios.filter((u) => {
    const term = searchTerm.toLowerCase();
    const matchTerm =
      u.nombre?.toLowerCase().includes(term) ||
      u.apellido?.toLowerCase().includes(term) ||
      u.email?.toLowerCase().includes(term);
    const matchRol = !filtroRol || u.rol === filtroRol;
    const matchEstado = !filtroEstado || (u.estado || "activo") === filtroEstado;
    return matchTerm && matchRol && matchEstado;
  });

  const usuariosPaginados = usuariosFiltrados.slice((page - 1) * pageSize, page * pageSize);

  // KPI sobre el total ya cargado (alcance del actor, sin el filtro de
  // Rol/Estado/búsqueda de la tabla) — mismo criterio "xxxTodos" del resto
  // de list pages.
  const totalUsuarios = usuarios.length;
  const activosCount = usuarios.filter((u) => (u.estado || "activo") === "activo").length;
  const desactivadosCount = usuarios.filter((u) => u.estado === "inactivo").length;
  const deltaTotal = calcularDeltaPeriodo(usuarios, 7);
  const pctEstado = (n) => (totalUsuarios > 0 ? Math.round((n / totalUsuarios) * 100) : 0);

  const kpiCards = [
    {
      key: "total", title: "Total Usuarios", icon: UserCog,
      color: "text-primary-dark", bg: "bg-primary-lighter", value: totalUsuarios,
      subtexto: deltaTotal !== null ? `${deltaTotal >= 0 ? "+" : ""}${deltaTotal} esta semana` : null,
      loading,
    },
    {
      key: "activos", title: "Activos", icon: CheckCircle2,
      color: "text-sage-dark", bg: "bg-sage-lighter", value: activosCount,
      subtexto: `${pctEstado(activosCount)}% del total`,
      loading,
    },
    {
      key: "desactivados", title: "Desactivados", icon: XCircle,
      color: "text-red-600", bg: "bg-red-100", value: desactivadosCount,
      subtexto: `${pctEstado(desactivadosCount)}% del total`,
      loading,
    },
    {
      key: "activosHoy", title: "Activos hoy", icon: Zap,
      color: "text-amber-600", bg: "bg-amber-100", value: actividadHoy?.activosHoy ?? 0,
      subtexto: "con acceso registrado hoy",
      loading: actividadHoy === undefined,
    },
  ];

  // Resuelve solo los mandanteId DISTINTOS visibles en la página actual
  // (no precarga todos los Mandantes — mandanteService.listar() da 403
  // para mandante_admin), con una cache que persiste entre páginas para
  // no repetir la llamada por el mismo mandanteId dos veces.
  const idsVisiblesKey = usuariosPaginados.map((u) => u.mandanteId).filter(Boolean).join(",");

  useEffect(() => {
    if (!idsVisiblesKey) return;
    const idsVisibles = [...new Set(idsVisiblesKey.split(","))];
    const idsFaltantes = idsVisibles.filter(
      (id) => !(id in mandantesCache) && !mandantesEnCursoRef.current.has(id),
    );
    if (idsFaltantes.length === 0) return;

    idsFaltantes.forEach((id) => mandantesEnCursoRef.current.add(id));
    Promise.all(
      idsFaltantes.map((id) =>
        mandanteService
          .obtenerPorId(id)
          .then((data) => [id, { nombre: getMandanteDisplayName(data) || id, logoUrl: data?.logoUrl || null }])
          .catch(() => [id, { nombre: id, logoUrl: null }]),
      ),
    ).then((pares) => {
      setMandantesCache((prev) => {
        const next = { ...prev };
        pares.forEach(([id, info]) => { next[id] = info; });
        return next;
      });
      idsFaltantes.forEach((id) => mandantesEnCursoRef.current.delete(id));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsVisiblesKey]);

  const recargar = () => {
    cargarUsuarios();
    cargarActividadHoy();
  };

  const ejecutarAccion = async (item, accion, confirmMsg, successReload = true) => {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    setProcesandoId(item.id);
    setError(null);
    try {
      await accion();
      if (successReload) await cargarUsuarios();
    } catch (err) {
      console.error("Error al ejecutar la acción sobre el usuario:", err);
      setError(err.message || "No se pudo completar la acción.");
    } finally {
      setProcesandoId(null);
    }
  };

  const accionesDe = (item) => {
    const rolActor = profile?.rol;
    const esSelf = esUnoMismo(item.id, profile?.uid);
    return [
      can(rolActor, "editar_usuario") && {
        label: "Editar", icon: Pencil, onClick: () => navigate(`/usuarios/${item.id}/editar`),
      },
      can(rolActor, "resetear_password") && {
        label: "Restablecer contraseña", icon: KeyRound,
        disabled: procesandoId === item.id,
        onClick: () => ejecutarAccion(
          item,
          () => usuarioService.resetPassword(item.id),
          `¿Enviar un correo de restablecimiento de contraseña a ${item.email}?`,
          false,
        ),
      },
      can(rolActor, "revocar_sesiones") && {
        label: "Revocar sesiones", icon: ShieldOff,
        disabled: procesandoId === item.id,
        onClick: () => ejecutarAccion(
          item,
          () => usuarioService.revocarSesiones(item.id),
          `¿Cerrar todas las sesiones activas de ${item.nombre} ${item.apellido}?`,
          false,
        ),
      },
      can(rolActor, item.estado === "inactivo" ? "reactivar_usuario" : "desactivar_usuario") && !esSelf && {
        label: item.estado === "inactivo" ? "Reactivar" : "Desactivar",
        icon: Power,
        disabled: procesandoId === item.id,
        onClick: () => ejecutarAccion(
          item,
          () => (item.estado === "inactivo"
            ? usuarioService.reactivar(item.id)
            : usuarioService.desactivar(item.id)),
          item.estado === "inactivo"
            ? `¿Reactivar a ${item.nombre} ${item.apellido}?`
            : `¿Desactivar a ${item.nombre} ${item.apellido}? No podrá iniciar sesión hasta ser reactivado.`,
        ),
      },
    ].filter(Boolean);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Usuarios"
        icon={UserCog}
        subtitle="Gestión de cuentas de acceso a la plataforma."
        loading={loading}
        onRefresh={recargar}
        action={{ to: "/usuarios/nuevo", label: "Nuevo Usuario" }}
      />

      <ErrorBanner message={error} />

      {/* Tarjetas KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {kpiCards.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.key} className="bg-white p-5 rounded-2xl border border-slate-100 shadow-card">
              <div className={`w-11 h-11 rounded-xl ${item.bg} ${item.color} flex items-center justify-center font-bold mb-4`}>
                <Icon className="w-5 h-5" />
              </div>
              {item.loading ? (
                <div className="h-8 w-14 rounded-lg bg-slate-100 animate-pulse" />
              ) : (
                <h3 className="text-2xl font-black text-carbon-dark tracking-tight">{item.value}</h3>
              )}
              <p className="text-xs font-semibold text-slate-500 mt-0.5">{item.title}</p>
              {item.subtexto && (
                <p className="text-[11px] font-bold text-slate-400 mt-1.5">{item.subtexto}</p>
              )}
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2 min-w-0 space-y-6">
      <FilterBar
        searchValue={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="Buscar por nombre, apellido o email..."
        filters={[
          {
            label: "Rol",
            value: filtroRol,
            onChange: setFiltroRol,
            options: [
              { value: "", label: "Todos los roles" },
              ...ROLES_USUARIO.map((r) => ({ value: r.value, label: r.label })),
            ],
          },
          {
            label: "Estado",
            value: filtroEstado,
            onChange: setFiltroEstado,
            options: [
              { value: "", label: "Todos los estados" },
              { value: "activo", label: "Activos" },
              { value: "inactivo", label: "Desactivados" },
            ],
          },
        ]}
      />

      <DataTable
        columns={COLUMNS}
        data={usuariosPaginados}
        loading={loading}
        loadingLabel="Cargando usuarios..."
        emptyLabel="No se encontraron usuarios registrados."
        renderRow={(item) => (
          <tr
            key={item.id}
            onClick={() => navigate(`/usuarios/${item.id}`)}
            className="hover:bg-slate-50/60 transition-colors cursor-pointer"
          >
            <td className="py-4 px-6">
              <div className="flex items-center gap-3">
                <EntityIconTile icon={UserCog} />
                <div>
                  <p className="font-bold text-carbon-dark">{item.nombre} {item.apellido}</p>
                  <p className="text-[11px] text-slate-400">{item.email}</p>
                </div>
              </div>
            </td>
            <td className="py-4 px-6 text-slate-600 font-medium">
              {rolLabel(item.rol)}
            </td>
            <td className="py-4 px-6 text-slate-600 font-medium">
              {ROLES_TRANSVERSALES.includes(item.rol) ? (
                <span className="text-[11px] font-bold text-slate-500">Todos</span>
              ) : item.mandanteId ? (
                <MandanteChip
                  nombre={mandantesCache[item.mandanteId]?.nombre || item.mandanteId}
                  logoUrl={mandantesCache[item.mandanteId]?.logoUrl}
                />
              ) : (
                <span className="text-slate-400 italic">-</span>
              )}
            </td>
            <td className="py-4 px-6">
              <StatusBadge value={item.estado || "activo"} map={MAPA_ACTIVO_DESACTIVADO} />
            </td>
            <td className="py-4 px-6 text-slate-600 font-medium" title={item.ultimoAcceso ? formatFechaHora(item.ultimoAcceso) : ""}>
              {item.ultimoAcceso ? formatTiempoRelativo(item.ultimoAcceso) : (
                <span className="text-slate-400 italic">Nunca</span>
              )}
            </td>
            <td className="py-4 px-6 text-slate-600 font-medium">
              {item.accesos7d ?? 0}
            </td>
            <td className="py-4 px-6" onClick={(e) => e.stopPropagation()}>
              <RowActionsMenu actions={accionesDe(item)} />
            </td>
          </tr>
        )}
      />

      <Pagination
        page={page}
        pageSize={pageSize}
        total={usuariosFiltrados.length}
        onPageChange={setPage}
        onPageSizeChange={(n) => { setPageSize(n); setPage(1); }}
      />
        </div>

        {/* Sidebar derecho */}
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-card space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
              <Zap className="w-4 h-4 text-slate-400" />
              <h3 className="text-sm font-bold text-carbon-dark uppercase tracking-wider">Actividad Hoy</h3>
            </div>
            {actividadHoy === undefined ? (
              <p className="text-xs text-slate-400">Cargando...</p>
            ) : actividadHoy === null ? (
              <p className="text-xs text-red-600">No se pudo cargar la actividad de hoy.</p>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-600">Conectados ahora</span>
                  <span className="font-black text-carbon-dark">{actividadHoy.conectadosAhora}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-600">Accesos hoy</span>
                  <span className="font-black text-carbon-dark">{actividadHoy.activosHoy}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-600">Duración promedio</span>
                  <span className="font-black text-carbon-dark">
                    {actividadHoy.promedioDuracionSesionSeg !== null
                      ? `${Math.round(actividadHoy.promedioDuracionSesionSeg / 60)} min`
                      : "-"}
                  </span>
                </div>
              </div>
            )}
          </div>

          {!loading && resumenPorRol.length > 0 && (
            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-card space-y-4">
              <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
                <UserCog className="w-4 h-4 text-slate-400" />
                <h3 className="text-sm font-bold text-carbon-dark uppercase tracking-wider">Por Rol</h3>
              </div>
              <div className="space-y-3">
                {resumenPorRol.map((r) => {
                  const colores = ROL_COLOR[r.value] || ROL_COLOR.mandante_lector;
                  return (
                    <div key={r.value} className="flex items-center gap-3">
                      <div className={`relative shrink-0 rounded-full ${colores.bg}`}>
                        <ProgressRing value={r.pct} size={40} strokeWidth={4} progressClassName={colores.ring} />
                        <span className="absolute inset-0 flex items-center justify-center text-[9px] font-black text-carbon-dark">
                          {r.pct}%
                        </span>
                      </div>
                      <div>
                        <p className="text-sm font-black text-carbon-dark">{r.cantidad}</p>
                        <p className="text-[11px] font-semibold text-slate-500">{r.label}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
