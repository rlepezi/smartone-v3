import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Building2,
  FolderKanban,
  HardHat,
  Users,
  UserCog,
  Truck,
  FileCheck2,
  IdCard,
  Tags,
  Link2,
  ClipboardCheck,
  BarChart3,
  LayoutDashboard,
  Settings,
  ChevronUp,
  LogOut,
  Sparkles,
  CheckSquare,
  DatabaseBackup,
  BrainCircuit,
  Gauge,
  ChevronsLeft,
  ChevronsRight,
  Menu,
  X,
} from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { ROLES_USUARIO } from "../../services/usuarioService";
import { useSesionTracking } from "../../hooks/useSesionTracking";

// Secciones del menú, en este orden: Inicio, Operación (el flujo de acreditación), Maestros
// (entidades), Configuración (catálogos por Mandante) y Administración (el resto). Una sección
// sin ítems visibles para el rol no se muestra. "Nueva Acreditación" es la acción principal de la
// plataforma: va marcada `destacado` para que el render le dé el estilo de acento siempre, esté o
// no seleccionada. Las rutas y los roles de cada ítem no cambian.
const NAV_GROUPS = [
  {
    label: "Inicio",
    items: [
      { label: "Dashboard", path: "/dashboard", icon: LayoutDashboard },
    ],
  },
  {
    label: "Operación",
    items: [
      { label: "Nueva Acreditación", path: "/acreditaciones/nueva", icon: Sparkles, roles: ["superadmin", "mandante_admin"], destacado: true },
      { label: "Expedientes", path: "/expedientes", icon: FileCheck2, excludeRoles: ["admin_comercial"] },
      { label: "Proyectos", path: "/proyectos", icon: FolderKanban, excludeRoles: ["admin_comercial"] },
      // Revisiones IA no va en el menú: se usa desde la pestaña del Expediente. Las rutas
      // /revisiones-ia siguen activas (enlaces "Ver sesión" y el historial).
    ],
  },
  {
    label: "Maestros",
    items: [
      { label: "Empresas", path: "/empresas", icon: HardHat },
      { label: "Personas", path: "/personas", icon: Users, excludeRoles: ["admin_comercial"] },
      { label: "Maquinarias", path: "/recursos", icon: Truck, excludeRoles: ["admin_comercial"] },
    ],
  },
  {
    label: "Configuración",
    items: [
      { label: "Mandantes", path: "/mandantes", icon: Building2, roles: ["superadmin", "admin_comercial"] },
      // Equivalente de "Mandantes" para los roles de un Mandante: va junto a él.
      { label: "Mi Mandante", path: "/mi-mandante", icon: Building2, roles: ["mandante_admin", "mandante_lector"] },
      { label: "Perfiles de Participación", path: "/perfiles-participacion", icon: IdCard, excludeRoles: ["admin_comercial"] },
      { label: "Perfiles de Recurso", path: "/perfiles-recurso", icon: Tags, excludeRoles: ["admin_comercial"] },
      { label: "Requerimientos", path: "/requerimientos", icon: ClipboardCheck, excludeRoles: ["admin_comercial"] },
      { label: "Niveles de acreditación", path: "/configuracion/acreditacion", icon: Gauge, roles: ["superadmin", "mandante_admin"] },
      { label: "Inteligencia Artificial", path: "/configuracion/ia", icon: BrainCircuit, roles: ["superadmin", "mandante_admin"] },
    ],
  },
  {
    label: "Administración",
    items: [
      { label: "Usuarios", path: "/usuarios", icon: UserCog, roles: ["superadmin", "mandante_admin", "admin_comercial"] },
      { label: "Reportes", path: "/reportes", icon: BarChart3, excludeRoles: ["admin_comercial"] },
      { label: "Participaciones", path: "/participaciones", icon: Link2, excludeRoles: ["admin_comercial"] },
      { label: "Evaluaciones", path: "/evaluaciones", icon: CheckSquare, excludeRoles: ["admin_comercial"] },
      { label: "Respaldo de Base de Datos", path: "/respaldos", icon: DatabaseBackup, roles: ["superadmin"] },
    ],
  },
];

const NAV_ITEMS_FLAT = NAV_GROUPS.flatMap((g) => g.items);

// Desde este ancho el menú es fijo (expandido o colapsado); más angosto es un panel deslizable que
// se cierra con cualquier clic fuera de él. 768 px y no 1024: con el escalado de Windows (125-150 %)
// o zoom del navegador, un notebook queda bajo 1024 px y el menú se escondía al usar la página.
const MEDIA_ESCRITORIO = "(min-width: 768px)";
// Bajo este ancho el menú fijo parte colapsado si el usuario no eligió otra cosa.
const MEDIA_ANCHO = "(min-width: 1024px)";

// Preferencia "menú colapsado", por usuario y en este navegador. El acceso a localStorage puede
// fallar (modo privado, almacenamiento bloqueado): en ese caso vale el valor según el ancho.
const claveColapsado = (uid) => `smartone:menuColapsado:${uid || "anonimo"}`;
const leerColapsado = (uid) => {
  const porDefecto = typeof window !== "undefined" && !window.matchMedia(MEDIA_ANCHO).matches;
  try {
    const guardado = window.localStorage.getItem(claveColapsado(uid));
    return guardado === null ? porDefecto : guardado === "1";
  } catch {
    return porDefecto;
  }
};
const guardarColapsado = (uid, valor) => {
  try {
    window.localStorage.setItem(claveColapsado(uid), valor ? "1" : "0");
  } catch {
    // Sin almacenamiento: la preferencia dura solo esta visita.
  }
};

const useEsEscritorio = () => {
  const [esEscritorio, setEsEscritorio] = useState(
    () => typeof window !== "undefined" && window.matchMedia(MEDIA_ESCRITORIO).matches,
  );
  useEffect(() => {
    const media = window.matchMedia(MEDIA_ESCRITORIO);
    const alCambiar = (e) => setEsEscritorio(e.matches);
    media.addEventListener("change", alCambiar);
    return () => media.removeEventListener("change", alCambiar);
  }, []);
  return esEscritorio;
};

export const DashboardLayout = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { profile, logout } = useAuth();
  const [menuAbierto, setMenuAbierto] = useState(false);
  const menuRef = useRef(null);
  const esEscritorio = useEsEscritorio();
  const uid = profile?.uid;
  const [colapsadoPref, setColapsadoPref] = useState(() => leerColapsado(uid));
  const [uidLeido, setUidLeido] = useState(uid);
  // Panel deslizable en pantallas angostas.
  const [movilAbierto, setMovilAbierto] = useState(false);
  // Tooltip del menú colapsado: se dibuja fuera del contenedor con scroll para que no se recorte.
  const [tooltip, setTooltip] = useState(null);
  // Registro de sesiones (accesos y tiempo conectado, ver Fase B) — se
  // monta una sola vez acá porque DashboardLayout solo existe mientras
  // hay una sesión autenticada activa.
  useSesionTracking();

  // La preferencia es por usuario: al conocerse (o cambiar) el usuario se relee.
  if (uid !== uidLeido) {
    setUidLeido(uid);
    setColapsadoPref(leerColapsado(uid));
  }
  const colapsado = esEscritorio && colapsadoPref;

  const alternarColapsado = () => {
    const nuevo = !colapsadoPref;
    setColapsadoPref(nuevo);
    setTooltip(null);
    guardarColapsado(uid, nuevo);
  };

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuAbierto(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Al navegar se cierra el panel móvil y el tooltip.
  const [rutaPrevia, setRutaPrevia] = useState(location.pathname);
  if (location.pathname !== rutaPrevia) {
    setRutaPrevia(location.pathname);
    setMovilAbierto(false);
    setTooltip(null);
  }

  // Escape cierra el panel móvil.
  useEffect(() => {
    if (!movilAbierto) return undefined;
    const alPresionar = (e) => { if (e.key === "Escape") setMovilAbierto(false); };
    document.addEventListener("keydown", alPresionar);
    return () => document.removeEventListener("keydown", alPresionar);
  }, [movilAbierto]);

  const mostrarTooltip = (e, texto) => {
    if (!colapsado) return;
    const r = e.currentTarget.getBoundingClientRect();
    setTooltip({ texto, top: r.top + r.height / 2, left: r.right + 10 });
  };
  const ocultarTooltip = () => setTooltip(null);

  const seccionActual = NAV_ITEMS_FLAT.find((item) => location.pathname.startsWith(item.path));

  const rolLabel = ROLES_USUARIO.find((r) => r.value === profile?.rol)?.label || profile?.rol || "";
  const nombreCompleto = [profile?.nombre, profile?.apellido].filter(Boolean).join(" ") || profile?.email || "";
  const iniciales = [profile?.nombre, profile?.apellido]
    .filter(Boolean)
    .map((s) => s.charAt(0).toUpperCase())
    .join("") || "?";

  const handleLogout = async () => {
    setMenuAbierto(false);
    try {
      await logout();
      navigate("/login");
    } catch (err) {
      console.error("Error al cerrar sesión:", err);
    }
  };

  const gruposVisibles = NAV_GROUPS
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        if (item.roles && !item.roles.includes(profile?.rol)) return false;
        if (item.excludeRoles && item.excludeRoles.includes(profile?.rol)) return false;
        return true;
      }),
    }))
    .filter((group) => group.items.length > 0);

  const claseFoco = "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-light focus-visible:ring-offset-2 focus-visible:ring-offset-carbon-dark";

  return (
    <div className="flex min-h-screen bg-[#F9FAFB]">
      {/* Fondo del panel deslizable (pantallas angostas) */}
      {movilAbierto && !esEscritorio && (
        <div className="fixed inset-0 z-30 bg-black/40" onClick={() => setMovilAbierto(false)} aria-hidden="true" />
      )}

      {/* Menú lateral: fijo en escritorio (expandido o colapsado), deslizable en pantallas angostas */}
      {/* `inert` mientras está oculto en pantallas angostas: fuera del orden de tabulación */}
      <aside
        id="menu-lateral"
        aria-label="Menú principal"
        inert={!esEscritorio && !movilAbierto}
        className={`border-r border-white/5 bg-carbon-dark flex flex-col fixed inset-y-0 left-0 z-40 transition-[width,transform] duration-200 print:hidden ${
          colapsado ? "w-20 p-3" : "w-64 p-4"
        } ${esEscritorio || movilAbierto ? "translate-x-0" : "-translate-x-full"}`}
      >
        {/*
          `flex-1 min-h-0 overflow-y-auto`: cuando la cantidad de items del
          menú no entra en la altura de la ventana (pantallas bajas, zoom al
          100%, etc.), este bloque scrollea en vez de desbordar el aside y
          tapar el footer (perfil del usuario / cerrar sesión).
        */}
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden scrollbar-dark" onScroll={ocultarTooltip}>
          {/* Logo / Brand + botón colapsar (escritorio) o cerrar (móvil) */}
          <div className={`flex items-center gap-3 py-4 mb-2 ${colapsado ? "flex-col px-0" : "px-3"}`}>
            <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center text-white font-bold shadow-md shadow-primary/30 shrink-0">
              S3
            </div>
            {!colapsado && (
              <div className="flex-1 min-w-0">
                <h1 className="text-base font-bold tracking-tight text-white leading-none">SmartOne</h1>
                <span className="text-[11px] font-semibold text-primary-light uppercase tracking-wider">v3.0 Core</span>
              </div>
            )}
            {esEscritorio ? (
              <button
                type="button"
                onClick={alternarColapsado}
                aria-expanded={!colapsado}
                aria-controls="menu-lateral"
                aria-label={colapsado ? "Expandir menú" : "Colapsar menú"}
                title={colapsado ? "Expandir menú" : "Colapsar menú"}
                className={`w-8 h-8 shrink-0 flex items-center justify-center rounded-lg border border-primary/50 bg-primary/20 text-primary-light shadow-sm hover:bg-primary hover:border-primary hover:text-white transition-colors ${claseFoco}`}
              >
                {colapsado ? <ChevronsRight className="w-5 h-5" /> : <ChevronsLeft className="w-5 h-5" />}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setMovilAbierto(false)}
                aria-label="Cerrar menú"
                className={`p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors ${claseFoco}`}
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Menú de navegación */}
          <nav className="space-y-1">
            {gruposVisibles.map((group, gi) => (
              <div key={group.label} className={gi > 0 ? (colapsado ? "pt-2" : "pt-4") : ""}>
                {colapsado ? (
                  gi > 0 && <div className="mx-2 mb-2 border-t border-white/10" role="separator" />
                ) : (
                  <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wider px-3 py-2">
                    {group.label}
                  </div>
                )}
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = location.pathname.startsWith(item.path);
                  // Solo el ítem activo lleva el relleno azul. "Nueva Acreditación" (la acción
                  // principal) se distingue con un contorno de acento, sin relleno, para no
                  // parecer "seleccionada" cuando no lo está.
                  const claseEstado = isActive
                    ? "bg-primary text-white font-semibold shadow-sm"
                    : item.destacado
                      ? "text-primary-light ring-1 ring-inset ring-primary/60 hover:bg-primary/10 hover:text-white"
                      : "text-gray-300 hover:bg-white/5 hover:text-white";
                  const claseIcono = isActive ? "text-white" : item.destacado ? "text-primary-light" : "text-gray-400";

                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      aria-current={isActive ? "page" : undefined}
                      onMouseEnter={(e) => mostrarTooltip(e, item.label)}
                      onMouseLeave={ocultarTooltip}
                      onFocus={(e) => mostrarTooltip(e, item.label)}
                      onBlur={ocultarTooltip}
                      className={`flex items-center gap-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ${
                        colapsado ? "justify-center px-0" : "px-3"
                      } ${claseEstado} ${claseFoco}`}
                    >
                      <Icon className={`w-5 h-5 shrink-0 ${claseIcono}`} />
                      <span className={colapsado ? "sr-only" : "truncate"}>{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>
        </div>

        {/* Footer Sidebar */}
        <div className="relative shrink-0 pt-3" ref={menuRef}>
          {menuAbierto && (
            <div className="absolute bottom-full left-0 mb-2 w-48 bg-carbon rounded-xl border border-white/10 shadow-dropdown overflow-hidden">
              <button
                type="button"
                onClick={handleLogout}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-red-400 hover:bg-white/5 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Cerrar sesión
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={() => setMenuAbierto((v) => !v)}
            aria-expanded={menuAbierto}
            aria-label={colapsado ? `${nombreCompleto} — ${rolLabel}` : undefined}
            onMouseEnter={(e) => mostrarTooltip(e, nombreCompleto)}
            onMouseLeave={ocultarTooltip}
            className={`w-full bg-white/5 rounded-2xl border border-white/10 flex items-center gap-3 hover:bg-white/10 transition-colors ${
              colapsado ? "p-2 justify-center" : "p-3"
            } ${claseFoco}`}
          >
            <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center font-bold text-xs text-white flex-shrink-0">
              {iniciales}
            </div>
            {!colapsado && (
              <>
                <div className="overflow-hidden text-left flex-1">
                  <p className="text-xs font-semibold text-white truncate">{nombreCompleto}</p>
                  <p className="text-[11px] text-gray-400 truncate">{rolLabel}</p>
                </div>
                <ChevronUp className={`w-4 h-4 text-gray-400 transition-transform flex-shrink-0 ${menuAbierto ? "" : "rotate-180"}`} />
              </>
            )}
          </button>
        </div>
      </aside>

      {tooltip && (
        <div
          role="tooltip"
          className="fixed z-50 -translate-y-1/2 px-2.5 py-1.5 rounded-lg bg-carbon text-white text-xs font-semibold shadow-dropdown pointer-events-none whitespace-nowrap"
          style={{ top: tooltip.top, left: tooltip.left }}
        >
          {tooltip.texto}
        </div>
      )}

      {/* Contenedor Principal: ocupa el ancho que deja libre el menú */}
      <div className={`flex-1 min-w-0 flex flex-col min-h-screen transition-[padding] duration-200 print:pl-0 ${
        esEscritorio ? (colapsado ? "pl-20" : "pl-64") : "pl-0"
      }`}>
        {/* Header superior sutil */}
        <header className="h-16 border-b border-gray-100 bg-white/80 backdrop-blur-md sticky top-0 z-0 flex items-center justify-between gap-3 px-4 lg:px-8 print:hidden">
          <div className="flex items-center gap-3 min-w-0">
            {!esEscritorio && (
              <button
                type="button"
                onClick={() => setMovilAbierto(true)}
                aria-expanded={movilAbierto}
                aria-controls="menu-lateral"
                aria-label="Abrir menú"
                className="p-2 -ml-2 text-gray-500 hover:text-gray-700 rounded-xl hover:bg-gray-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <Menu className="w-5 h-5" />
              </button>
            )}
            <span className="text-xs font-medium text-gray-400 truncate">
              SmartOne v3.0 / {seccionActual ? seccionActual.label : "Acreditación & Cumplimiento"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button className="p-2 text-gray-400 hover:text-gray-600 rounded-xl hover:bg-gray-100 transition-colors">
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/*
          Contenedor compartido por TODAS las pantallas, con tope de 1600px
          (evita que el contenido se estire de forma desproporcionada en
          monitores ultra anchos). `min-w-0`: el contenido nunca empuja el
          ancho de la página (sin scroll horizontal).
        */}
        <main className="p-4 lg:p-8 max-w-[1600px] w-full min-w-0 mx-auto print:p-0 print:max-w-none">
          {children}
        </main>
      </div>
    </div>
  );
};
