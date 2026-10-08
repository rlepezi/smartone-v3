import React, { useEffect, useRef, useState } from "react";
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
} from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { ROLES_USUARIO } from "../../services/usuarioService";
import { useSesionTracking } from "../../hooks/useSesionTracking";

// Estructura de navegación: primero se configura el catálogo (Mandantes, Requerimientos,
// Perfiles), después se gestionan las entidades operacionales, después el proceso de
// cumplimiento (una Participación de Empresa en un Proyecto origina su Expediente, por eso va
// antes que Expedientes), y al final la administración técnica. "Nueva Acreditación" es la
// acción principal de la plataforma, no un enlace de catálogo — vive en su propio grupo sin
// título, marcado `destacado` para que el render le dé el estilo de acento siempre, esté o no
// seleccionado (a diferencia del resto, que solo se resalta cuando está activo).
const NAV_GROUPS = [
  {
    label: null,
    items: [
      { label: "Dashboard", path: "/dashboard", icon: LayoutDashboard },
    ],
  },
  {
    label: null,
    items: [
      { label: "Nueva Acreditación", path: "/acreditaciones/nueva", icon: Sparkles, roles: ["superadmin", "mandante_admin"], destacado: true },
    ],
  },
  {
    label: "Configuración",
    items: [
      { label: "Mandantes", path: "/mandantes", icon: Building2, roles: ["superadmin", "admin_comercial"] },
      { label: "Mi Mandante", path: "/mi-mandante", icon: Building2, roles: ["mandante_admin", "mandante_lector"] },
      { label: "Requerimientos", path: "/requerimientos", icon: ClipboardCheck, excludeRoles: ["admin_comercial"] },
      { label: "Perfiles de Recurso", path: "/perfiles-recurso", icon: Tags, excludeRoles: ["admin_comercial"] },
      { label: "Perfiles de Participación", path: "/perfiles-participacion", icon: IdCard, excludeRoles: ["admin_comercial"] },
    ],
  },
  {
    label: "Gestión Operacional",
    items: [
      { label: "Proyectos", path: "/proyectos", icon: FolderKanban, excludeRoles: ["admin_comercial"] },
      { label: "Empresas", path: "/empresas", icon: HardHat },
      { label: "Personas", path: "/personas", icon: Users, excludeRoles: ["admin_comercial"] },
      { label: "Maquinarias", path: "/recursos", icon: Truck, excludeRoles: ["admin_comercial"] },
    ],
  },
  {
    label: "Cumplimiento",
    items: [
      { label: "Participaciones", path: "/participaciones", icon: Link2, excludeRoles: ["admin_comercial"] },
      { label: "Expedientes", path: "/expedientes", icon: FileCheck2, excludeRoles: ["admin_comercial"] },
      { label: "Evaluaciones", path: "/evaluaciones", icon: CheckSquare, excludeRoles: ["admin_comercial"] },
      { label: "Reportes", path: "/reportes", icon: BarChart3, excludeRoles: ["admin_comercial"] },
    ],
  },
  {
    label: "Administración",
    items: [
      { label: "Usuarios", path: "/usuarios", icon: UserCog, roles: ["superadmin", "mandante_admin", "admin_comercial"] },
      { label: "Respaldo de Base de Datos", path: "/respaldos", icon: DatabaseBackup, roles: ["superadmin"] },
    ],
  },
];

const NAV_ITEMS_FLAT = NAV_GROUPS.flatMap((g) => g.items);

export const DashboardLayout = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { profile, logout } = useAuth();
  const [menuAbierto, setMenuAbierto] = useState(false);
  const menuRef = useRef(null);
  // Registro de sesiones (accesos y tiempo conectado, ver Fase B) — se
  // monta una sola vez acá porque DashboardLayout solo existe mientras
  // hay una sesión autenticada activa.
  useSesionTracking();

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuAbierto(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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

  return (
    <div className="flex min-h-screen bg-[#F9FAFB]">
      {/* Sidebar fijo */}
      <aside className="w-64 border-r border-white/5 bg-carbon-dark flex flex-col p-4 fixed h-full z-10">
        {/*
          `flex-1 min-h-0 overflow-y-auto`: cuando la cantidad de items del
          menú no entra en la altura de la ventana (pantallas bajas, zoom al
          100%, etc.), este bloque scrollea en vez de desbordar el aside y
          tapar el footer (perfil del usuario / cerrar sesión) — sin esto,
          los últimos items de "Administración" y el footer quedaban fuera
          de vista y sin forma de alcanzarlos.
        */}
        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-dark">
          {/* Logo / Brand */}
          <div className="flex items-center gap-3 px-3 py-4 mb-4">
            <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center text-white font-bold shadow-md shadow-primary/30">
              S3
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight text-white leading-none">SmartOne</h1>
              <span className="text-[11px] font-semibold text-primary-light uppercase tracking-wider">v3.0 Core</span>
            </div>
          </div>

          {/* Menú de navegación */}
          <nav className="space-y-1">
            {NAV_GROUPS.map((group, gi) => {
              const visibleItems = group.items.filter((item) => {
                if (item.roles && !item.roles.includes(profile?.rol)) return false;
                if (item.excludeRoles && item.excludeRoles.includes(profile?.rol)) return false;
                return true;
              });
              if (visibleItems.length === 0) return null;

              return (
                <div key={`grupo-${gi}`} className={gi > 0 ? "pt-4" : ""}>
                  {group.label && (
                    <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wider px-3 py-2">
                      {group.label}
                    </div>
                  )}
                  {visibleItems.map((item) => {
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
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ${claseEstado}`}
                      >
                        <Icon className={`w-5 h-5 ${claseIcono}`} />
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              );
            })}
          </nav>
        </div>

        {/* Footer Sidebar */}
        <div className="relative shrink-0 pt-3" ref={menuRef}>
          {menuAbierto && (
            <div className="absolute bottom-full left-0 right-0 mb-2 bg-carbon rounded-xl border border-white/10 shadow-dropdown overflow-hidden">
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
            className="w-full p-3 bg-white/5 rounded-2xl border border-white/10 flex items-center gap-3 hover:bg-white/10 transition-colors"
          >
            <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center font-bold text-xs text-white flex-shrink-0">
              {iniciales}
            </div>
            <div className="overflow-hidden text-left flex-1">
              <p className="text-xs font-semibold text-white truncate">{nombreCompleto}</p>
              <p className="text-[11px] text-gray-400 truncate">{rolLabel}</p>
            </div>
            <ChevronUp className={`w-4 h-4 text-gray-400 transition-transform flex-shrink-0 ${menuAbierto ? "" : "rotate-180"}`} />
          </button>
        </div>
      </aside>

      {/* Contenedor Principal */}
      <div className="flex-1 pl-64 flex flex-col min-h-screen">
        {/* Header superior sutil */}
        <header className="h-16 border-b border-gray-100 bg-white/80 backdrop-blur-md sticky top-0 z-0 flex items-center justify-between px-8">
          <span className="text-xs font-medium text-gray-400">
            SmartOne v3.0 / {seccionActual ? seccionActual.label : "Acreditación & Cumplimiento"}
          </span>
          <div className="flex items-center gap-2">
            <button className="p-2 text-gray-400 hover:text-gray-600 rounded-xl hover:bg-gray-100 transition-colors">
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/*
          Contenedor compartido por TODAS las pantallas. `max-w-7xl`
          (1280px) dejaba margen sin usar en cualquier viewport ancho
          (>1600px, considerando los 256px del aside fijo + este padding)
          — se relaja a 1600px, un tope generoso pero no ilimitado (evita
          que el contenido se estire de forma desproporcionada en
          monitores ultra anchos).
        */}
        <main className="p-8 max-w-[1600px] w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
};
