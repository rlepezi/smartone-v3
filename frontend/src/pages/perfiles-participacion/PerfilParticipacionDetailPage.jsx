import React, { useEffect, useState } from "react";
import { getMandanteDisplayName } from "../../utils/mandanteDisplay";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ChevronRight, Calendar, ListChecks, Pencil, Power, Copy, History,
  FolderKanban, Link2, ClipboardList, FileCheck2, Users, Eye,
} from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { perfilParticipacionService } from "../../services/perfilParticipacionService";
import { perfilRequerimientoService } from "../../services/perfilRequerimientoService";
import { mandanteService } from "../../services/mandanteService";
import { participacionService } from "../../services/participacionService";
import { sujetoService } from "../../services/participacionSujetoService";
import { expedienteService } from "../../services/expedienteService";
import { evaluacionService } from "../../services/evaluacionService";
import { bitacoraService } from "../../services/bitacoraService";
import { TIPOS_ENTIDAD } from "../../services/requerimientoService";
import { formatFecha, formatTiempoRelativo } from "../../utils/fechaFormatters";
import { createdAtMillis } from "../../utils/deltaCalculos";
import { describirEvento } from "../../utils/bitacoraFormatters";
import { duplicarPerfilParticipacion } from "../../utils/duplicarPerfilParticipacion";
import { ErrorBanner } from "../../components/shared/ErrorBanner";
import { ActionButton } from "../../components/shared/ActionButton";
import { StatusBadge, MAPA_ACTIVO_INACTIVO, MAPA_EVALUACION } from "../../components/shared/StatusBadge";
import { RowActionsMenu } from "../../components/shared/RowActionsMenu";
import { Pagination } from "../../components/shared/Pagination";
import { EstadoCumplimientoPanel } from "../../components/shared/EstadoCumplimientoPanel";
import { FilterBar } from "../../components/shared/FilterBar";
import { DataTable } from "../../components/shared/DataTable";

// Tabla de Requerimientos del Perfil, compartida entre el preview de
// "Resumen" (primeras 5) y la pestaña "Requerimientos" completa
// (paginada). "Estado"/"Última Actualización" son un agregado: un mismo
// Requerimiento puede tener resultados distintos en cada Expediente que
// usa este Perfil, así que se muestra el peor caso (ver
// estadoAgregadoDeRequerimiento más abajo) — no un dato único real por
// Requerimiento, sino calculado acá mismo.
const TablaRequerimientos = ({ items, estadoDe, ultimaDe, cargandoEvaluaciones }) => (
  <div className="overflow-x-auto -mx-2">
    <table className="w-full text-left border-collapse text-xs">
      <thead>
        <tr className="text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
          <th className="py-2.5 px-2">Orden</th>
          <th className="py-2.5 px-2">Requerimiento</th>
          <th className="py-2.5 px-2">Estado</th>
          <th className="py-2.5 px-2">Última Actualización</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {items.map((r) => {
          const estado = estadoDe(r.id);
          const ultima = ultimaDe(r.id);
          return (
            <tr key={r.id} className="hover:bg-slate-50/60 transition-colors">
              <td className="py-2.5 px-2 text-slate-400 font-semibold">{r.orden ?? "-"}</td>
              <td className="py-2.5 px-2">
                <p className="font-bold text-carbon-dark">{r.nombre}</p>
                {r.descripcion && <p className="text-[11px] text-slate-400">{r.descripcion}</p>}
              </td>
              <td className="py-2.5 px-2">
                {cargandoEvaluaciones ? (
                  <span className="text-[11px] text-slate-400">…</span>
                ) : estado ? (
                  <StatusBadge value={estado} map={MAPA_EVALUACION} />
                ) : (
                  <span className="text-[11px] text-slate-400 italic">Sin Evaluar</span>
                )}
              </td>
              <td className="py-2.5 px-2 text-slate-500 font-medium">
                {cargandoEvaluaciones ? "…" : ultima ? formatFecha(ultima) : "-"}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
);

// Pestañas por nivel de aplicación (Empresa/Persona/Maquinaria — catálogo
// real de TIPOS_ENTIDAD), compartidas entre el preview de "Resumen"
// y la pestaña "Requerimientos" completa — mismo patrón ya usado en
// RequerimientosListPage.jsx.
const NivelTabs = ({ conteoPorNivel, nivelActivo, onChange }) => (
  <div className="flex gap-1 border-b border-slate-100">
    {TIPOS_ENTIDAD.map((nivel) => {
      const isActive = nivelActivo === nivel.value;
      return (
        <button
          key={nivel.value}
          type="button"
          onClick={() => onChange(nivel.value)}
          className={`px-3 py-2 text-xs font-bold border-b-2 -mb-px transition-colors ${
            isActive ? "border-primary text-primary" : "border-transparent text-slate-400 hover:text-slate-600"
          }`}
        >
          {nivel.label}
          <span className="ml-1 text-[10px] font-semibold text-slate-400">
            ({conteoPorNivel[nivel.value] || 0})
          </span>
        </button>
      );
    })}
  </div>
);

export const PerfilParticipacionDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const puedeEscribir = ["superadmin", "mandante_admin"].includes(profile?.rol);

  const [perfil, setPerfil] = useState(null);
  const [mandanteNombre, setMandanteNombre] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [vinculos, setVinculos] = useState([]);
  const [cargandoVinculos, setCargandoVinculos] = useState(true);

  const [participacionesDelPerfil, setParticipacionesDelPerfil] = useState([]);
  const [sujetosDelPerfil, setSujetosDelPerfil] = useState([]);
  const [expedientesDelPerfil, setExpedientesDelPerfil] = useState([]);
  const [cargandoUso, setCargandoUso] = useState(true);

  const [evaluacionesTodas, setEvaluacionesTodas] = useState([]);
  const [cargandoEvaluaciones, setCargandoEvaluaciones] = useState(true);

  const [activeTab, setActiveTab] = useState("resumen");
  const [reqNivelTab, setReqNivelTab] = useState(TIPOS_ENTIDAD[0]?.value);
  const [reqPage, setReqPage] = useState(1);
  const [reqPageSize, setReqPageSize] = useState(10);

  const handleReqNivelTab = (nivel) => {
    setReqNivelTab(nivel);
    setReqPage(1);
  };

  const [historial, setHistorial] = useState(null);
  const [cargandoHistorial, setCargandoHistorial] = useState(false);

  const [duplicando, setDuplicando] = useState(false);
  const [toggleandoEstado, setToggleandoEstado] = useState(false);

  // "Resumen del Perfil" (backend, obtenerResumen) — números reales del
  // perfil ACTUAL: requerimientosVinculados/participacionesActivas/
  // expedientesGenerados. Distinto del bloque "Requerimientos totales /
  // Participaciones / Expedientes" del sidebar (arriba), que cuenta TODAS
  // las participaciones (no solo activas) porque ese dato alimenta
  // "Usado en" (Proyectos distintos) más abajo.
  const [resumenPerfil, setResumenPerfil] = useState(null);
  const [cargandoResumenPerfil, setCargandoResumenPerfil] = useState(true);

  // "Otros Perfiles del Mandante"
  const [otrosPerfiles, setOtrosPerfiles] = useState([]);
  const [cargandoOtros, setCargandoOtros] = useState(true);
  const [resumenesOtros, setResumenesOtros] = useState({});
  const [cargandoResumenesOtros, setCargandoResumenesOtros] = useState(true);
  const [otrosBusqueda, setOtrosBusqueda] = useState("");
  const [otrosFiltroEstado, setOtrosFiltroEstado] = useState("");
  const OTROS_LIMITE_VISIBLE = 5;

  const cargarPerfil = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await perfilParticipacionService.obtenerPorId(id);
      setPerfil(data);
      mandanteService
        .obtenerPorId(data.mandanteId)
        .then((m) => setMandanteNombre(getMandanteDisplayName(m) || data.mandanteId))
        .catch(() => setMandanteNombre(data.mandanteId));
    } catch (err) {
      console.error("Error al cargar el perfil de participación:", err);
      setError(err.message || "No se pudo cargar el perfil de participación.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarPerfil();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    setCargandoVinculos(true);
    perfilRequerimientoService
      .obtenerMatriz(id)
      .then((data) => {
        const activos = (data || [])
          .filter((r) => r.vinculado)
          .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
        setVinculos(activos);
      })
      .catch((err) => console.error("Error al cargar los requerimientos del perfil:", err))
      .finally(() => setCargandoVinculos(false));
  }, [id]);

  // "Usado en": Participaciones que referencian este Perfil (cualquier
  // estado, uso histórico), Proyectos distintos entre ellas, y
  // Personas/Maquinarias ACTIVAS (agrupadas por sujeto) de esas
  // Participaciones — no referencian el Perfil directamente, se cruza
  // en cliente por participacionId.
  useEffect(() => {
    let cancelado = false;
    const cargarUso = async () => {
      setCargandoUso(true);
      try {
        const [participaciones, expedientes] = await Promise.all([
          participacionService.listar({}),
          expedienteService.listar({}),
        ]);
        if (cancelado) return;
        const propias = (participaciones || []).filter((p) => p.perfilParticipacionId === id);
        setParticipacionesDelPerfil(propias);
        setExpedientesDelPerfil((expedientes || []).filter((e) => e.perfilParticipacionId === id));

        const ids = new Set(propias.map((p) => p.id));
        const sujetos = await sujetoService.listar({ estado: "activa" });
        if (cancelado) return;
        setSujetosDelPerfil((sujetos || []).filter((a) => ids.has(a.participacionId)));
      } catch (err) {
        console.error("Error al cargar el uso del perfil:", err);
      } finally {
        if (!cancelado) setCargandoUso(false);
      }
    };
    cargarUso();
    return () => { cancelado = true; };
  }, [id]);

  useEffect(() => {
    evaluacionService.listarVigentes()
      .then((data) => setEvaluacionesTodas(data || []))
      .catch((err) => console.error("Error al cargar evaluaciones:", err))
      .finally(() => setCargandoEvaluaciones(false));
  }, []);

  useEffect(() => {
    setCargandoResumenPerfil(true);
    perfilParticipacionService
      .obtenerResumen(id)
      .then((data) => setResumenPerfil(data))
      .catch((err) => console.error("Error al cargar el resumen del perfil:", err))
      .finally(() => setCargandoResumenPerfil(false));
  }, [id]);

  useEffect(() => {
    let cancelado = false;
    setCargandoOtros(true);
    setCargandoResumenesOtros(true);
    perfilParticipacionService
      .listarOtrosDelMandante(id)
      .then(async (data) => {
        if (cancelado) return;
        const otros = data || [];
        setOtrosPerfiles(otros);
        setCargandoOtros(false);
        // Resumen por fila, en paralelo — normalmente son pocos perfiles
        // por Mandante.
        const pares = await Promise.all(
          otros.map((p) =>
            perfilParticipacionService
              .obtenerResumen(p.id)
              .then((r) => [p.id, r])
              .catch(() => [p.id, null]),
          ),
        );
        if (cancelado) return;
        setResumenesOtros(Object.fromEntries(pares));
      })
      .catch((err) => {
        console.error("Error al cargar los otros perfiles del mandante:", err);
        setOtrosPerfiles([]);
        setCargandoOtros(false);
      })
      .finally(() => {
        if (!cancelado) setCargandoResumenesOtros(false);
      });
    return () => { cancelado = true; };
  }, [id]);

  const handleTabClick = (tab) => {
    setActiveTab(tab);
    if (tab === "historial" && historial === null) {
      setCargandoHistorial(true);
      bitacoraService
        .listar({ entidad: "perfil_participacion", entidadId: id })
        .then((data) => setHistorial(data || []))
        .catch((err) => {
          console.error("Error al cargar el historial:", err);
          setHistorial([]);
        })
        .finally(() => setCargandoHistorial(false));
    }
  };

  const handleDuplicar = async () => {
    if (!perfil) return;
    if (!window.confirm(
      `¿Duplicar este Perfil? Se creará "${perfil.nombre} (copia)" con los mismos ${vinculos.length} Requerimientos vinculados.`,
    )) return;
    setDuplicando(true);
    setError(null);
    try {
      const nuevo = await duplicarPerfilParticipacion(perfil);
      navigate(`/perfiles-participacion/${nuevo.id}`);
    } catch (err) {
      setError(err.message || "No se pudo duplicar el perfil.");
    } finally {
      setDuplicando(false);
    }
  };

  const handleToggleEstado = async () => {
    if (!perfil) return;
    setToggleandoEstado(true);
    try {
      if (perfil.estado === "activo") {
        await perfilParticipacionService.desactivar(perfil.id);
      } else {
        await perfilParticipacionService.actualizar(perfil.id, { estado: "activo" });
      }
      await cargarPerfil();
    } catch (err) {
      console.error("Error al cambiar el estado del perfil:", err);
      setError(err.message || "No se pudo cambiar el estado del perfil.");
    } finally {
      setToggleandoEstado(false);
    }
  };

  if (loading) {
    return (
      <div className="py-16 text-center text-slate-400 text-xs">
        Cargando perfil de participación...
      </div>
    );
  }

  if (!perfil) {
    return (
      <div className="space-y-4">
        <ErrorBanner message={error || "Perfil de participación no encontrado."} />
      </div>
    );
  }

  // Estado agregado por Requerimiento — peor caso entre todas las
  // Evaluaciones vigentes de los Expedientes que usan este Perfil (ver
  // nota en TablaRequerimientos).
  const expedienteIdsDelPerfil = new Set(expedientesDelPerfil.map((e) => e.id));
  const evaluacionesEnAlcance = evaluacionesTodas.filter((ev) => expedienteIdsDelPerfil.has(ev.expedienteId));

  const estadoAgregadoDeRequerimiento = (requerimientoId) => {
    const propias = evaluacionesEnAlcance.filter((ev) => ev.requerimientoId === requerimientoId);
    if (propias.length === 0) return null;
    if (propias.some((ev) => ev.resultado === "no_cumple")) return "no_cumple";
    if (propias.some((ev) => ev.resultado === "pendiente")) return "pendiente";
    if (propias.some((ev) => ev.resultado === "cumple")) return "cumple";
    return null;
  };

  const ultimaActualizacionDeRequerimiento = (requerimientoId) => {
    const propias = evaluacionesEnAlcance.filter((ev) => ev.requerimientoId === requerimientoId);
    if (propias.length === 0) return null;
    return propias.reduce((masReciente, ev) =>
      createdAtMillis(ev) > createdAtMillis(masReciente) ? ev : masReciente,
    ).createdAt;
  };

  const conteosRequerimientos = { cumple: 0, no_cumple: 0, pendiente: 0, no_aplica: 0 };
  let sinEvaluarCount = 0;
  vinculos.forEach((v) => {
    const estado = estadoAgregadoDeRequerimiento(v.id);
    if (!estado) { sinEvaluarCount++; return; }
    conteosRequerimientos[estado]++;
  });

  const proyectosDistintosDelPerfil = new Set(participacionesDelPerfil.map((p) => p.proyectoId));

  // Conteo por nivel sobre TODOS los vínculos (no solo los del nivel
  // activo) — alimenta el número entre paréntesis de cada pestaña.
  const conteoPorNivel = TIPOS_ENTIDAD.reduce((acc, n) => {
    acc[n.value] = vinculos.filter((v) => v.tipoEntidad === n.value).length;
    return acc;
  }, {});
  const vinculosDelNivel = vinculos.filter((v) => v.tipoEntidad === reqNivelTab);

  const requerimientosPreview = vinculosDelNivel.slice(0, 5);
  const requerimientosPaginados = vinculosDelNivel.slice((reqPage - 1) * reqPageSize, reqPage * reqPageSize);

  const otrosFiltrados = otrosPerfiles.filter((p) => {
    const term = otrosBusqueda.toLowerCase();
    const matchTerm = !term || p.nombre?.toLowerCase().includes(term);
    const matchEstado = !otrosFiltroEstado || p.estado === otrosFiltroEstado;
    return matchTerm && matchEstado;
  });
  const otrosVisibles = otrosFiltrados.slice(0, OTROS_LIMITE_VISIBLE);
  const hayMasOtros = otrosFiltrados.length > OTROS_LIMITE_VISIBLE;

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
        <Link to="/perfiles-participacion" className="hover:text-primary transition-colors">
          Perfiles de Participación
        </Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="text-carbon-dark">{perfil.nombre}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-2xl font-bold text-carbon-dark tracking-tight">
              Perfil de Participación: {perfil.nombre}
            </h2>
            <StatusBadge value={perfil.estado} map={MAPA_ACTIVO_INACTIVO} />
          </div>
          <p className="text-xs text-slate-500 mt-1.5 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5" /> Creado el {formatFecha(perfil.createdAt)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to={`/perfiles-participacion/${id}/requerimientos`}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary hover:bg-primary-dark text-white font-bold text-xs shadow-md shadow-primary/20 transition-all"
          >
            <ListChecks className="w-4 h-4" />
            Configurar Requerimientos
          </Link>
          {puedeEscribir && (
            <ActionButton as={Link} to={`/perfiles-participacion/${id}/editar`} icon={Pencil}>
              Editar
            </ActionButton>
          )}
          {puedeEscribir && (
            <RowActionsMenu
              actions={[
                { label: "Duplicar perfil", icon: Copy, disabled: duplicando || cargandoVinculos, onClick: handleDuplicar },
                {
                  label: perfil.estado === "activo" ? "Desactivar perfil" : "Activar perfil",
                  icon: Power,
                  disabled: toggleandoEstado,
                  onClick: handleToggleEstado,
                },
                { label: "Ver historial de cambios", icon: History, onClick: () => handleTabClick("historial") },
              ]}
            />
          )}
        </div>
      </div>

      <ErrorBanner message={error} />

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-100">
        {[
          { key: "resumen", label: "Resumen" },
          { key: "requerimientos", label: `Requerimientos (${vinculos.length})` },
          { key: "historial", label: "Historial de Cambios" },
        ].map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => handleTabClick(tab.key)}
            className={`px-4 py-2.5 text-sm font-bold border-b-2 -mb-px transition-colors ${
              activeTab === tab.key ? "border-primary text-primary" : "border-transparent text-slate-400 hover:text-slate-600"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "resumen" && (
        <>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          <div className="lg:col-span-2 min-w-0 space-y-6">
            {/* Información General */}
            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-card space-y-4">
              <h3 className="text-sm font-bold text-carbon-dark uppercase tracking-wider pb-3 border-b border-slate-100">
                Información General
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div>
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Nombre del Perfil</p>
                  <p className="text-slate-700 font-medium">{perfil.nombre}</p>
                </div>
                <div>
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Mandante</p>
                  <p className="text-slate-700 font-medium">{mandanteNombre || perfil.mandanteId}</p>
                </div>
                <div className="md:col-span-2">
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Descripción</p>
                  <p className="text-slate-700 font-medium">
                    {perfil.descripcion || <span className="text-slate-400 italic">Sin descripción.</span>}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Creado el</p>
                  <p className="text-slate-700 font-medium">{formatFecha(perfil.createdAt)}</p>
                </div>
                <div>
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Última actualización</p>
                  <p className="text-slate-700 font-medium">{formatFecha(perfil.updatedAt)}</p>
                </div>
                <div>
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Estado</p>
                  <StatusBadge value={perfil.estado} map={MAPA_ACTIVO_INACTIVO} />
                </div>
              </div>
            </div>

            {/* Requerimientos del Perfil (preview) */}
            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-card space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <h3 className="text-sm font-bold text-carbon-dark uppercase tracking-wider">
                  Requerimientos del Perfil ({vinculos.length})
                </h3>
                {vinculos.length > 0 && (
                  <button
                    type="button"
                    onClick={() => handleTabClick("requerimientos")}
                    className="text-xs font-bold text-primary hover:text-primary-dark"
                  >
                    Ver todos
                  </button>
                )}
              </div>
              <NivelTabs conteoPorNivel={conteoPorNivel} nivelActivo={reqNivelTab} onChange={handleReqNivelTab} />
              {cargandoVinculos ? (
                <div className="py-8 text-center text-slate-400 text-xs">Cargando...</div>
              ) : vinculos.length === 0 ? (
                <div className="py-8 text-center text-slate-400 text-xs">
                  Este Perfil todavía no tiene Requerimientos vinculados.
                </div>
              ) : requerimientosPreview.length === 0 ? (
                <div className="py-8 text-center text-slate-400 text-xs">
                  Sin Requerimientos de este nivel en este Perfil.
                </div>
              ) : (
                <TablaRequerimientos
                  items={requerimientosPreview}
                  estadoDe={estadoAgregadoDeRequerimiento}
                  ultimaDe={ultimaActualizacionDeRequerimiento}
                  cargandoEvaluaciones={cargandoEvaluaciones}
                />
              )}
            </div>
          </div>

          <div className="space-y-6">
            {/* Resumen del Perfil */}
            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-card space-y-4">
              <h3 className="text-sm font-bold text-carbon-dark uppercase tracking-wider pb-3 border-b border-slate-100">
                Resumen del Perfil
              </h3>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-xl font-black text-carbon-dark">{vinculos.length}</p>
                  <p className="text-[10px] font-semibold text-slate-400 mt-0.5">Requerimientos totales</p>
                </div>
                <div>
                  <p className="text-xl font-black text-carbon-dark">{cargandoUso ? "…" : participacionesDelPerfil.length}</p>
                  <p className="text-[10px] font-semibold text-slate-400 mt-0.5">Participaciones</p>
                </div>
                <div>
                  <p className="text-xl font-black text-carbon-dark">{cargandoUso ? "…" : expedientesDelPerfil.length}</p>
                  <p className="text-[10px] font-semibold text-slate-400 mt-0.5">Expedientes</p>
                </div>
              </div>
              {cargandoEvaluaciones || cargandoVinculos ? (
                <div className="py-8 text-center text-slate-400 text-xs">Cargando...</div>
              ) : vinculos.length === 0 ? (
                <div className="py-4 text-center text-slate-400 text-xs">Sin Requerimientos vinculados todavía.</div>
              ) : (
                <EstadoCumplimientoPanel conteos={conteosRequerimientos} sinEvaluar={sinEvaluarCount} size={130} strokeWidth={14} />
              )}
              <ActionButton as={Link} to="/expedientes" icon={FileCheck2} className="w-full justify-center">
                Ver Expedientes Asociados ({cargandoUso ? "…" : expedientesDelPerfil.length})
              </ActionButton>
            </div>

            {/* Usado en */}
            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-card space-y-4">
              <h3 className="text-sm font-bold text-carbon-dark uppercase tracking-wider pb-3 border-b border-slate-100">
                Usado en
              </h3>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <FolderKanban className="w-4 h-4 text-primary mx-auto mb-1" />
                  <p className="text-lg font-black text-carbon-dark">{cargandoUso ? "…" : proyectosDistintosDelPerfil.size}</p>
                  <p className="text-[10px] font-semibold text-slate-400">Proyectos</p>
                </div>
                <div>
                  <Link2 className="w-4 h-4 text-primary mx-auto mb-1" />
                  <p className="text-lg font-black text-carbon-dark">{cargandoUso ? "…" : participacionesDelPerfil.length}</p>
                  <p className="text-[10px] font-semibold text-slate-400">Participaciones</p>
                </div>
                <div>
                  <ClipboardList className="w-4 h-4 text-primary mx-auto mb-1" />
                  <p className="text-lg font-black text-carbon-dark">{cargandoUso ? "…" : sujetosDelPerfil.length}</p>
                  <p className="text-[10px] font-semibold text-slate-400">Personas y Maquinarias</p>
                </div>
              </div>
            </div>

            {/* Acciones rápidas */}
            {puedeEscribir && (
              <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-card space-y-3">
                <h3 className="text-sm font-bold text-carbon-dark uppercase tracking-wider pb-3 border-b border-slate-100">
                  Acciones Rápidas
                </h3>
                <div className="flex flex-col gap-2">
                  <ActionButton
                    icon={Copy}
                    busy={duplicando}
                    busyLabel="Duplicando..."
                    disabled={cargandoVinculos}
                    onClick={handleDuplicar}
                    className="w-full justify-start"
                  >
                    Duplicar perfil
                  </ActionButton>
                  <ActionButton
                    icon={Power}
                    busy={toggleandoEstado}
                    busyLabel="Guardando..."
                    onClick={handleToggleEstado}
                    className="w-full justify-start"
                  >
                    {perfil.estado === "activo" ? "Desactivar perfil" : "Activar perfil"}
                  </ActionButton>
                  <ActionButton icon={History} onClick={() => handleTabClick("historial")} className="w-full justify-start">
                    Ver historial de cambios
                  </ActionButton>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Otros Perfiles del Mandante */}
        <div className="grid grid-cols-1 lg:grid-cols-[16rem_1fr] gap-6 items-start">
          {/* Resumen del Perfil (backend) — números reales, no cliente */}
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-card space-y-4">
            <h3 className="text-sm font-bold text-carbon-dark uppercase tracking-wider pb-3 border-b border-slate-100">
              Resumen del Perfil
            </h3>
            <div className="space-y-3 text-center">
              <div>
                <p className="text-2xl font-black text-carbon-dark">
                  {cargandoResumenPerfil ? "…" : resumenPerfil?.requerimientosVinculados ?? 0}
                </p>
                <p className="text-[10px] font-semibold text-slate-400 mt-0.5">Requerimientos vinculados</p>
              </div>
              <div>
                <p className="text-2xl font-black text-carbon-dark">
                  {cargandoResumenPerfil ? "…" : resumenPerfil?.participacionesActivas ?? 0}
                </p>
                <p className="text-[10px] font-semibold text-slate-400 mt-0.5">Participaciones activas</p>
              </div>
              <div>
                <p className="text-2xl font-black text-carbon-dark">
                  {cargandoResumenPerfil ? "…" : resumenPerfil?.expedientesGenerados ?? 0}
                </p>
                <p className="text-[10px] font-semibold text-slate-400 mt-0.5">Expedientes generados</p>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-card space-y-4 min-w-0">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
              <Users className="w-4 h-4 text-slate-400" />
              <h3 className="text-sm font-bold text-carbon-dark uppercase tracking-wider">
                Otros Perfiles del Mandante ({otrosFiltrados.length})
              </h3>
            </div>

            <FilterBar
              searchValue={otrosBusqueda}
              onSearchChange={setOtrosBusqueda}
              searchPlaceholder="Buscar por nombre..."
              filters={[
                {
                  label: "Estado",
                  value: otrosFiltroEstado,
                  onChange: setOtrosFiltroEstado,
                  options: [
                    { value: "", label: "Todos los estados" },
                    { value: "activo", label: "Activos" },
                    { value: "inactivo", label: "Inactivos" },
                  ],
                },
              ]}
            />

            {cargandoOtros ? (
              <div className="py-8 text-center text-slate-400 text-xs">Cargando...</div>
            ) : otrosFiltrados.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-xs">
                No hay otros Perfiles de Participación en este Mandante.
              </div>
            ) : (
              <DataTable
                columns={[
                  { key: "nombre", label: "Nombre" },
                  { key: "descripcion", label: "Descripción" },
                  { key: "estado", label: "Estado" },
                  { key: "req", label: "Req. vinculados" },
                  { key: "participaciones", label: "Participaciones" },
                  { key: "expedientes", label: "Expedientes" },
                  { key: "acciones", label: "Acciones" },
                ]}
                data={otrosVisibles}
                loading={false}
                emptyLabel="No hay otros Perfiles de Participación en este Mandante."
                renderRow={(item) => {
                  const r = resumenesOtros[item.id];
                  return (
                    <tr key={item.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3.5 px-6">
                        <p className="font-bold text-carbon-dark">{item.nombre}</p>
                      </td>
                      <td className="py-3.5 px-6 text-slate-600 font-medium">
                        {item.descripcion || <span className="text-slate-400 italic">-</span>}
                      </td>
                      <td className="py-3.5 px-6">
                        <StatusBadge value={item.estado} map={MAPA_ACTIVO_INACTIVO} />
                      </td>
                      <td className="py-3.5 px-6 text-slate-600 font-medium">
                        {cargandoResumenesOtros ? "…" : r?.requerimientosVinculados ?? "-"}
                      </td>
                      <td className="py-3.5 px-6 text-slate-600 font-medium">
                        {cargandoResumenesOtros ? "…" : r?.participacionesActivas ?? "-"}
                      </td>
                      <td className="py-3.5 px-6 text-slate-600 font-medium">
                        {cargandoResumenesOtros ? "…" : r?.expedientesGenerados ?? "-"}
                      </td>
                      <td className="py-3.5 px-6">
                        <ActionButton as={Link} to={`/perfiles-participacion/${item.id}`} icon={Eye}>
                          Ver detalle
                        </ActionButton>
                      </td>
                    </tr>
                  );
                }}
              />
            )}

            {hayMasOtros && (
              <Link
                to={`/perfiles-participacion?mandante=${perfil.mandanteId}`}
                className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:text-primary-dark transition-colors"
              >
                Ver todos los perfiles del mandante ({otrosFiltrados.length})
              </Link>
            )}
          </div>
        </div>
        </>
      )}

      {activeTab === "requerimientos" && (
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-card space-y-4">
          <NivelTabs conteoPorNivel={conteoPorNivel} nivelActivo={reqNivelTab} onChange={handleReqNivelTab} />
          {cargandoVinculos ? (
            <div className="py-10 text-center text-slate-400 text-xs">Cargando...</div>
          ) : vinculos.length === 0 ? (
            <div className="py-10 text-center text-slate-400 text-xs">
              Este Perfil todavía no tiene Requerimientos vinculados.
            </div>
          ) : vinculosDelNivel.length === 0 ? (
            <div className="py-10 text-center text-slate-400 text-xs">
              Sin Requerimientos de este nivel en este Perfil.
            </div>
          ) : (
            <>
              <TablaRequerimientos
                items={requerimientosPaginados}
                estadoDe={estadoAgregadoDeRequerimiento}
                ultimaDe={ultimaActualizacionDeRequerimiento}
                cargandoEvaluaciones={cargandoEvaluaciones}
              />
              <Pagination
                page={reqPage}
                pageSize={reqPageSize}
                total={vinculosDelNivel.length}
                onPageChange={setReqPage}
                onPageSizeChange={(n) => { setReqPageSize(n); setReqPage(1); }}
              />
            </>
          )}
        </div>
      )}

      {activeTab === "historial" && (
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-card space-y-4">
          {cargandoHistorial ? (
            <div className="py-10 text-center text-slate-400 text-xs">Cargando...</div>
          ) : !historial || historial.length === 0 ? (
            <div className="py-10 text-center text-slate-400 text-xs">Sin eventos registrados.</div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {historial.map((evento) => (
                <li key={evento.id} className="py-3 flex items-center justify-between gap-3 text-xs">
                  <div>
                    <p className="font-semibold text-slate-700">{describirEvento(evento)}</p>
                    <p className="text-[11px] text-slate-400">{evento.actorNombre}</p>
                  </div>
                  <span className="text-[11px] text-slate-400 flex-shrink-0">
                    {formatTiempoRelativo(evento.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};
