import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  FileCheck2,
  HardHat,
  ArrowUpRight,
  ClipboardList,
  ClipboardCheck,
  AlertCircle,
  XCircle,
  CheckCircle2,
  Clock,
  Gauge,
  Activity,
  Building2,
  UserCog,
  Sparkles,
  Eye,
} from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { proyectoService } from "../../services/proyectoService";
import { empresaService } from "../../services/empresaService";
import { personaService } from "../../services/personaService";
import { recursoService } from "../../services/recursoService";
import { expedienteService, ESTADOS_EXPEDIENTE } from "../../services/expedienteService";
import { evaluacionService } from "../../services/evaluacionService";
import { requerimientoService } from "../../services/requerimientoService";
import { perfilParticipacionService } from "../../services/perfilParticipacionService";
import { bitacoraService } from "../../services/bitacoraService";
import { mandanteService } from "../../services/mandanteService";
import { usuarioService } from "../../services/usuarioService";
import { describirEvento } from "../../utils/bitacoraFormatters";
import { contextoEvento } from "../../utils/bitacoraContexto";
import { VencimientosDashboard } from "../../components/dashboard/VencimientosDashboard";
import { formatTiempoRelativo } from "../../utils/fechas";
import { StatusBadge, MAPA_EVALUACION } from "../../components/shared/StatusBadge";
import { EstadoCumplimientoPanel } from "../../components/shared/EstadoCumplimientoPanel";
import { ExpedientesPorEstadoBars } from "../../components/shared/ExpedientesPorEstadoBars";
import {
  calcularConteosPorEstadoExpediente, resumenDeExpedientes, evaluadosDe,
} from "../../utils/cumplimientoCalculos";
import { createdAtMillis, calcularDeltaPeriodo } from "../../utils/deltaCalculos";

const ESTADO_INICIAL = { loading: true, error: null, value: null };
const ESTADO_MAP = ESTADOS_EXPEDIENTE.reduce((acc, e) => {
  acc[e.value] = { label: e.label, className: e.color };
  return acc;
}, {});
// Delta semanal (ventana de 7 días) — helper genérico compartido en
// utils/deltaCalculos.js, reutilizado también por ProyectosListPage con
// una ventana distinta (mensual).
const calcularDelta = (items) => calcularDeltaPeriodo(items, 7);

const ATAJOS_POR_ROL = {
  superadmin: [
    { label: "Ir a Evaluaciones", to: "/evaluaciones" },
    { label: "Ver Reportes", to: "/reportes" },
  ],
  mandante_admin: [
    { label: "Ir a Evaluaciones", to: "/evaluaciones" },
    { label: "Ver Reportes", to: "/reportes" },
  ],
  admin_comercial: [
    { label: "Ir a Mandantes", to: "/mandantes" },
    { label: "Ir a Usuarios", to: "/usuarios" },
  ],
  evaluador: [
    { label: "Ir a Evaluaciones", to: "/evaluaciones" },
    { label: "Ir a Expedientes", to: "/expedientes" },
  ],
};

const AtajosRapidos = ({ rol }) => {
  const atajos = ATAJOS_POR_ROL[rol];
  if (!atajos) return null;
  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-card space-y-4">
      <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
        <ArrowUpRight className="w-4 h-4 text-slate-400" />
        <h2 className="text-sm font-bold text-carbon-dark uppercase tracking-wider">Atajos Rápidos</h2>
      </div>
      <div className="flex flex-col gap-2">
        {atajos.map((atajo) => (
          <Link
            key={atajo.to}
            to={atajo.to}
            className="inline-flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-100 text-xs font-bold text-carbon-dark transition-colors"
          >
            {atajo.label}
            <ArrowUpRight className="w-3.5 h-3.5 text-slate-400" />
          </Link>
        ))}
      </div>
    </div>
  );
};

// Ícono + color por tipo de evento de bitácora, para el panel "Actividad
// Reciente" — deriva de entidad/accion/detalle.resultado, mismos campos
// que ya usa describirEvento(). "evidencia" queda con el respaldo
// genérico a propósito: evidenciaService.js no registra bitácora todavía
// (no hay ningún caso real hoy que dispare ese ícono).
const iconoEvento = (evento) => {
  const { entidad, accion, detalle } = evento || {};
  if (entidad === "evaluacion" && accion === "creado") {
    if (detalle?.resultado === "cumple") return { Icon: CheckCircle2, className: "bg-sage-lighter text-sage-dark" };
    if (detalle?.resultado === "no_cumple") return { Icon: XCircle, className: "bg-red-50 text-red-600" };
    return { Icon: Clock, className: "bg-amber-50 text-amber-600" };
  }
  if (entidad === "expediente") {
    if (accion === "transicion_estado" && detalle?.estadoNuevo === "aprobado") {
      return { Icon: CheckCircle2, className: "bg-sage-lighter text-sage-dark" };
    }
    return { Icon: FileCheck2, className: "bg-primary-lighter text-primary-dark" };
  }
  if (entidad === "evidencia") {
    return { Icon: ClipboardCheck, className: "bg-primary-lighter text-primary-dark" };
  }
  if (entidad === "participacion" || entidad === "participacionPersona" || entidad === "participacionRecurso") {
    return { Icon: ClipboardCheck, className: "bg-primary-lighter text-primary-dark" };
  }
  return { Icon: Activity, className: "bg-slate-100 text-slate-500" };
};

const RESULTADO_EVALUACION_LABELS = {
  cumple: "Cumple",
  no_cumple: "No Cumple",
  no_aplica: "No Aplica",
  pendiente: "Pendiente",
};

const saludoGeneral = (nombre) =>
  nombre ? `Hola ${nombre}, este es el resumen general de la plataforma.` : "Este es el resumen general de la plataforma.";
const saludoMandante = (nombre) =>
  nombre
    ? `Hola ${nombre}, este es el resumen de tu gestión de acreditaciones.`
    : "Este es el resumen de tu gestión de acreditaciones.";

export const DashboardPage = () => {
  const { profile } = useAuth();
  const esAdminComercial = profile?.rol === "admin_comercial";

  const [resumenComercial, setResumenComercial] = useState(ESTADO_INICIAL);

  // admin_comercial no tiene permiso sobre los endpoints operacionales
  // (Proyecto, Empresa, Participación, etc.) — llamarlos fallaría con 403.
  // En su lugar arma un resumen propio con Mandante + Usuario, a los que
  // sí tiene acceso.
  useEffect(() => {
    if (!esAdminComercial) return;
    let cancelado = false;
    Promise.allSettled([mandanteService.listar(), usuarioService.listar()])
      .then(([mandantesRes, usuariosRes]) => {
        if (cancelado) return;
        if (mandantesRes.status === "rejected" || usuariosRes.status === "rejected") {
          setResumenComercial({ loading: false, error: "No se pudo cargar el resumen.", value: null });
          return;
        }
        const mandantes = mandantesRes.value || [];
        const usuarios = usuariosRes.value || [];
        setResumenComercial({
          loading: false,
          error: null,
          value: {
            totalMandantes: mandantes.length,
            mandantesActivos: mandantes.filter((m) => m.estado === "activo").length,
            mandantesInactivos: mandantes.filter((m) => m.estado !== "activo").length,
            totalUsuarios: usuarios.length,
            usuariosAdmin: usuarios.filter((u) => u.rol === "mandante_admin").length,
            usuariosLector: usuarios.filter((u) => u.rol === "mandante_lector").length,
          },
        });
      });
    return () => { cancelado = true; };
  }, [esAdminComercial]);

  const [expedientesPorEstado, setExpedientesPorEstado] = useState(ESTADO_INICIAL);
  const [expedientesTodos, setExpedientesTodos] = useState(ESTADO_INICIAL);
  const [empresas, setEmpresas] = useState(ESTADO_INICIAL);
  const [empresasTodas, setEmpresasTodas] = useState(ESTADO_INICIAL);
  const [estadoAcreditacion, setEstadoAcreditacion] = useState(ESTADO_INICIAL);
  const [evaluacionesTodas, setEvaluacionesTodas] = useState(ESTADO_INICIAL);
  const [actividadReciente, setActividadReciente] = useState(ESTADO_INICIAL);
  const [proyectosMap, setProyectosMap] = useState({});
  const [empresasMap, setEmpresasMap] = useState({});
  const [requerimientosMap, setRequerimientosMap] = useState({});
  const [perfilesMap, setPerfilesMap] = useState({});
  const [personasMap, setPersonasMap] = useState({});
  const [recursosMap, setRecursosMap] = useState({});
  const [actividadExpandida, setActividadExpandida] = useState(false);

  useEffect(() => {
    if (esAdminComercial) return;
    let cancelado = false;

    const tareas = [
      { key: "expedientes", promise: expedienteService.listar({}) },
      { key: "empresas", promise: empresaService.listar("activo") },
      { key: "evaluacionesVigentes", promise: evaluacionService.listarVigentes() },
      // limit 30: el panel solo muestra 6 por defecto, el resto alimenta
      // "Ver toda la actividad" sin pedir una página aparte al backend.
      { key: "actividadReciente", promise: bitacoraService.listar({ limit: 30 }) },
    ];

    Promise.allSettled(tareas.map((t) => t.promise)).then((resultados) => {
      if (cancelado) return;
      try {

      resultados.forEach((res, i) => {
        const key = tareas[i].key;

        if (res.status === "rejected") {
          console.error(`Error al cargar KPI '${key}':`, res.reason);
          const errorState = { loading: false, error: res.reason?.message || "No se pudo cargar.", value: null };
          if (key === "expedientes") {
            setExpedientesPorEstado(errorState);
            setExpedientesTodos(errorState);
            setEstadoAcreditacion(errorState);
          }
          if (key === "empresas") setEmpresas(errorState);
          if (key === "evaluacionesVigentes") setEvaluacionesTodas(errorState);
          if (key === "actividadReciente") setActividadReciente(errorState);
          return;
        }

        const data = res.value || [];

        if (key === "expedientes") {
          // Estado de cumplimiento y tarjetas superiores: contadores de cada Expediente.
          setEstadoAcreditacion({ loading: false, error: null, value: { resumen: resumenDeExpedientes(data) } });

          // Aislado en su propio try/catch: si algo acá lanzara una
          // excepción inesperada, antes se perdía como un unhandled
          // promise rejection silencioso — abortaba el resto de este
          // forEach (participaciones/empresas/proyectos/etc. nunca se
          // llegaban a procesar) y dejaba estos paneles pegados en
          // "Cargando" para siempre, sin ningún error visible.
          try {
            const conteosPorEstado = calcularConteosPorEstadoExpediente(data, ESTADOS_EXPEDIENTE);
            setExpedientesPorEstado({ loading: false, error: null, value: conteosPorEstado });
            setExpedientesTodos({ loading: false, error: null, value: data });
          } catch (err) {
            console.error("Error al calcular Expedientes por Estado:", err);
            const errorState = { loading: false, error: "No se pudo calcular.", value: null };
            setExpedientesPorEstado(errorState);
            setExpedientesTodos(errorState);
          }
        } else if (key === "empresas") {
          setEmpresas({ loading: false, error: null, value: data.length });
          setEmpresasTodas({ loading: false, error: null, value: data });
        } else if (key === "evaluacionesVigentes") {
          setEvaluacionesTodas({ loading: false, error: null, value: data });
        } else if (key === "actividadReciente") {
          setActividadReciente({ loading: false, error: null, value: data });
        }
      });

      } catch (err) {
        // Red de seguridad final: cualquier excepción no anticipada acá
        // (fuera del try/catch puntual de "expedientes") ya no se pierde
        // como unhandled rejection — se muestra un error visible en cada
        // panel en vez de dejarlos pegados en "Cargando" para siempre.
        console.error("Error inesperado al procesar los datos del Dashboard:", err);
        const errorState = { loading: false, error: "No se pudo cargar la información.", value: null };
        setExpedientesPorEstado(errorState);
        setExpedientesTodos(errorState);
        setEmpresas(errorState);
        setEmpresasTodas(errorState);
        setEstadoAcreditacion(errorState);
        setEvaluacionesTodas(errorState);
        setActividadReciente(errorState);
      }
    }).catch((err) => {
      // Promise.allSettled en sí nunca rechaza por especificación, pero
      // esto cubre igual cualquier caso no anticipado (ej. tareas.map
      // lanzando antes de construir el array de promesas).
      if (cancelado) return;
      console.error("Error inesperado al cargar el Dashboard:", err);
    });

    return () => { cancelado = true; };
  }, [esAdminComercial]);

  // Nombres de Requerimiento para "Vigencias Próximas" y la actividad de evaluaciones (esos datos
  // solo traen el requerimientoId): se piden los de los Mandantes de los Expedientes ya cargados,
  // nunca el catálogo completo.
  const mandantesExpedientesKey = [...new Set(
    (expedientesTodos.value || []).map((e) => e.mandanteId).filter(Boolean),
  )].sort().join(",");
  useEffect(() => {
    if (!mandantesExpedientesKey) return;
    requerimientoService.nombresDeMandantes(mandantesExpedientesKey.split(","))
      .then((mapa) => setRequerimientosMap(mapa))
      .catch((err) => console.error("Error al cargar requerimientos:", err));
  }, [mandantesExpedientesKey]);

  useEffect(() => {
    if (esAdminComercial) return;
    proyectoService.listar({})
      .then((data) => {
        const map = {};
        (data || []).forEach((p) => { map[p.id] = `${p.nombre} (${p.codigo})`; });
        setProyectosMap(map);
      })
      .catch((err) => console.error("Error al cargar proyectos:", err));

    empresaService.listar()
      .then((data) => {
        const map = {};
        (data || []).forEach((e) => { map[e.id] = e.razonSocial; });
        setEmpresasMap(map);
      })
      .catch((err) => console.error("Error al cargar empresas:", err));


    perfilParticipacionService.listar({})
      .then((data) => {
        const map = {};
        (data || []).forEach((p) => { map[p.id] = p.nombre; });
        setPerfilesMap(map);
      })
      .catch((err) => console.error("Error al cargar perfiles de participación:", err));

    // Para poder señalar a QUIÉN corresponde cada evaluación en
    // "Actividad Reciente" (Persona/Maquinaria de nivel no-Empresa) — sin
    // esto, todas las filas de "Nueva evaluación: Cumple" eran
    // indistinguibles entre sí.
    personaService.listar()
      .then((data) => {
        const map = {};
        (data || []).forEach((p) => { map[p.id] = `${p.nombre} ${p.apellido}`; });
        setPersonasMap(map);
      })
      .catch((err) => console.error("Error al cargar personas:", err));

    recursoService.listar()
      .then((data) => {
        const map = {};
        (data || []).forEach((r) => { map[r.id] = r.nombre; });
        setRecursosMap(map);
      })
      .catch((err) => console.error("Error al cargar maquinarias:", err));
  }, [esAdminComercial]);

  // Detalle enriquecido de un evento "Nueva evaluación" para "Actividad
  // Reciente": sin esto, cada fila decía solo "Nueva evaluación: Cumple",
  // indistinguible entre sí. Resuelve el Requerimiento y el objetivo
  // (Persona/Maquinaria, o la Empresa si es de nivel Empresa) cruzando
  // por los mapas ya cargados — sin ningún endpoint nuevo. Devuelve null
  // para cualquier otro tipo de evento (esos ya son suficientemente
  // claros con describirEvento()).
  // Nombres para describir la Actividad Reciente (persona, empresa, proyecto, expediente...).
  const nombresActividad = {
    personas: personasMap,
    recursos: recursosMap,
    empresas: empresasMap,
    proyectos: proyectosMap,
    expedientes: Object.fromEntries((expedientesTodos.value || [])
      .map((e) => [e.id, { empresaId: e.empresaId, proyectoId: e.proyectoId }])),
  };

  const detalleEvaluacion = (evento) => {
    if (evento?.entidad !== "evaluacion" || evento?.accion !== "creado") return null;
    const { detalle } = evento;
    const requerimientoNombre = requerimientosMap[detalle?.requerimientoId] || null;
    const expediente = (expedientesTodos.value || []).find((e) => e.id === detalle?.expedienteId);
    let objetivo = null;
    if (detalle?.personaId) {
      objetivo = personasMap[detalle.personaId] || null;
    } else if (detalle?.recursoId) {
      objetivo = recursosMap[detalle.recursoId] || null;
    } else if (expediente) {
      objetivo = empresasMap[expediente.empresaId] || null;
    }
    const proyectoNombre = expediente ? proyectosMap[expediente.proyectoId] : null;
    const resultadoLabel = RESULTADO_EVALUACION_LABELS[detalle?.resultado] || detalle?.resultado;
    return { requerimientoNombre, objetivo, proyectoNombre, resultadoLabel };
  };

  const renderValor = (card) => {
    if (card.loading) {
      return <div className="h-8 w-14 rounded-lg bg-slate-100 animate-pulse" />;
    }
    if (card.error) {
      return <h3 className="text-lg font-bold text-slate-300">—</h3>;
    }
    return <h3 className="text-2xl font-black text-carbon-dark tracking-tight">{card.value}</h3>;
  };

  // Expedientes Activos = todo Expediente con estado distinto de
  // "cerrado" — sobre expedientesTodos ya cargado, sin llamada nueva.
  const cardExpedientesActivos = {
    loading: expedientesTodos.loading,
    error: expedientesTodos.error,
    value: expedientesTodos.value ? expedientesTodos.value.filter((e) => e.estado !== "cerrado").length : null,
  };
  // Evaluaciones Realizadas / Pendientes por Evaluar / No Cumplen: salen de los mismos contadores
  // del panel "Estado de Cumplimiento" (instancias activas de todos los Expedientes en alcance).
  const resumenGeneral = estadoAcreditacion.value?.resumen || null;
  const cardEvaluacionesRealizadas = {
    loading: estadoAcreditacion.loading,
    error: estadoAcreditacion.error,
    value: resumenGeneral ? evaluadosDe(resumenGeneral) : null,
  };
  const cardPendientesPorEvaluar = {
    loading: estadoAcreditacion.loading,
    error: estadoAcreditacion.error,
    value: resumenGeneral ? resumenGeneral.pendiente : null,
  };
  const cardNoCumplen = {
    loading: estadoAcreditacion.loading,
    error: estadoAcreditacion.error,
    value: resumenGeneral ? resumenGeneral.noCumple : null,
  };

  // Empresas Activas usa violeta — tono ya existente en la app
  // (RequerimientosListPage lo usa para el nivel "persona" de
  // Requerimiento), no un color nuevo inventado para este panel.
  //
  // `to`: cada card completa es un link a la lista correspondiente.
  // EvaluacionesListPage/EmpresasListPage ya leen un filtro inicial desde
  // la URL (?resultado=/?estado=); ExpedientesListPage también, pero
  // "Expedientes Activos" es "distinto de cerrado" — una condición
  // compuesta que su filtro de un solo valor no representa, así que ese
  // link queda sin filtro precargado (a la lista completa).
  const kpiCards = [
    { key: "expedientesActivos", title: "Expedientes Activos", icon: ClipboardList, color: "text-sage-dark", bg: "bg-sage-lighter", card: cardExpedientesActivos, delta: calcularDelta(expedientesTodos.value), to: "/expedientes" },
    { key: "evaluacionesRealizadas", title: "Evaluaciones Realizadas", icon: CheckCircle2, color: "text-primary-dark", bg: "bg-primary-lighter", card: cardEvaluacionesRealizadas, delta: calcularDelta(evaluacionesTodas.value), to: "/evaluaciones" },
    { key: "pendientesPorEvaluar", title: "Pendientes por Evaluar", icon: AlertCircle, color: "text-amber-600", bg: "bg-amber-100", card: cardPendientesPorEvaluar, delta: calcularDelta(evaluacionesTodas.value?.filter((e) => e.resultado === "pendiente")), to: "/evaluaciones?resultado=pendiente", tooltip: "Requerimientos sin evaluar o evaluados como pendientes." },
    { key: "noCumplen", title: "No Cumplen", icon: XCircle, color: "text-red-600", bg: "bg-red-100", card: cardNoCumplen, delta: calcularDelta(evaluacionesTodas.value?.filter((e) => e.resultado === "no_cumple")), to: "/evaluaciones?resultado=no_cumple" },
    { key: "empresas", title: "Empresas Activas", icon: HardHat, color: "text-violet-600", bg: "bg-violet-100", card: empresas, delta: calcularDelta(empresasTodas.value), to: "/empresas" },
  ];

  if (esAdminComercial) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-carbon-dark tracking-tight">Gestión Comercial</h1>
          <p className="text-sm text-slate-500 mt-1">Resumen de Mandantes y usuarios de la plataforma.</p>
          <p className="text-xs text-slate-400 mt-0.5">{saludoGeneral(profile?.nombre)}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-card space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-primary-lighter text-primary-dark flex items-center justify-center">
                <Building2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-2xl font-black text-carbon-dark tracking-tight">
                  {resumenComercial.loading ? "…" : resumenComercial.error ? "—" : resumenComercial.value.totalMandantes}
                </h3>
                <p className="text-xs font-semibold text-slate-500">Total de Mandantes</p>
              </div>
            </div>
            {!resumenComercial.loading && !resumenComercial.error && (
              <div className="flex items-center gap-4 pt-3 border-t border-slate-100 text-xs font-semibold">
                <span className="text-sage-dark">{resumenComercial.value.mandantesActivos} activos</span>
                <span className="text-slate-400">{resumenComercial.value.mandantesInactivos} inactivos/bloqueados</span>
              </div>
            )}
            <Link to="/mandantes" className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:text-primary-dark">
              Ver Mandantes <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-card space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-sage-lighter text-sage-darker flex items-center justify-center">
                <UserCog className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-2xl font-black text-carbon-dark tracking-tight">
                  {resumenComercial.loading ? "…" : resumenComercial.error ? "—" : resumenComercial.value.totalUsuarios}
                </h3>
                <p className="text-xs font-semibold text-slate-500">Total de Usuarios (por Mandante)</p>
              </div>
            </div>
            {!resumenComercial.loading && !resumenComercial.error && (
              <div className="flex items-center gap-4 pt-3 border-t border-slate-100 text-xs font-semibold">
                <span className="text-primary-dark">{resumenComercial.value.usuariosAdmin} administradores</span>
                <span className="text-slate-400">{resumenComercial.value.usuariosLector} lectores</span>
              </div>
            )}
            <Link to="/usuarios" className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:text-primary-dark">
              Ver Usuarios <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        {resumenComercial.error && (
          <p className="text-xs font-bold text-red-400">{resumenComercial.error}</p>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <AtajosRapidos rol={profile?.rol} />
        </div>
      </div>
    );
  }

  const actividadVisible = actividadExpandida
    ? (actividadReciente.value || [])
    : (actividadReciente.value || []).slice(0, 6);

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-carbon-dark tracking-tight">Centro de Cumplimiento</h1>
          <p className="text-sm text-slate-500 mt-1">Estado general de acreditación documental.</p>
          <p className="text-xs text-slate-400 mt-0.5">
            {["mandante_admin", "mandante_lector"].includes(profile?.rol)
              ? saludoMandante(profile?.nombre)
              : saludoGeneral(profile?.nombre)}
          </p>
        </div>
        {["superadmin", "mandante_admin"].includes(profile?.rol) && (
          <Link
            to="/acreditaciones/nueva"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary hover:bg-primary-dark text-white font-bold text-xs shadow-md shadow-primary/20 transition-all"
          >
            <Sparkles className="w-4 h-4" />
            Nueva Acreditación
          </Link>
        )}
      </div>

      {/* Fila 1: KPI cards — toda la card es el link a su lista (filtrada
          cuando la página destino soporta ese filtro vía URL), sin el
          texto "KPI ↗" suelto. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-5">
        {kpiCards.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.key}
              to={item.to}
              title={item.tooltip}
              className="bg-white p-5 rounded-2xl border border-slate-100 shadow-card hover:border-primary/30 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 transition-all flex flex-col justify-between"
            >
              <div className={`w-11 h-11 rounded-xl ${item.bg} ${item.color} flex items-center justify-center font-bold mb-4`}>
                <Icon className="w-5 h-5" />
              </div>
              <div>
                {renderValor(item.card)}
                <p className="text-xs font-semibold text-slate-500 mt-0.5">{item.title}</p>
                {item.card.error && (
                  <p className="text-[11px] font-bold text-red-400 mt-2">{item.card.error}</p>
                )}
                {!item.card.loading && !item.card.error && item.delta !== null && item.delta !== undefined && (
                  <p className={`text-[11px] font-bold mt-1.5 ${item.delta >= 0 ? "text-sage-dark" : "text-red-600"}`}>
                    {item.delta >= 0 ? "+" : ""}{item.delta} esta semana
                  </p>
                )}
              </div>
            </Link>
          );
        })}
      </div>

      {/* Fila 2: Estado de cumplimiento + Expedientes por estado + Vencimientos próximos — misma altura */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 items-stretch">
        {/* Estado de Cumplimiento General */}
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-card flex flex-col h-full">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
            <div className="flex items-center gap-2">
              <Gauge className="w-4 h-4 text-slate-400" />
              <h2 className="text-sm font-bold text-carbon-dark uppercase tracking-wider">
                Estado de Cumplimiento General
              </h2>
            </div>
          </div>

          <div className="flex-1">
            {estadoAcreditacion.loading ? (
              <div className="py-10 text-center text-slate-400 text-xs">Cargando...</div>
            ) : estadoAcreditacion.error ? (
              <div className="py-10 text-center text-red-400 text-xs">{estadoAcreditacion.error}</div>
            ) : !estadoAcreditacion.value ? (
              <div className="py-10 text-center text-slate-400 text-xs">
                Aún no hay evaluaciones registradas.
              </div>
            ) : (
              <EstadoCumplimientoPanel
                resumen={estadoAcreditacion.value.resumen}
                size={130}
                strokeWidth={15}
              />
            )}
          </div>
          <Link to="/evaluaciones" className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:text-primary-dark mt-4">
            Ver detalle de evaluaciones <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {/* Expedientes por Estado */}
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-card flex flex-col h-full">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
            <div className="flex items-center gap-2">
              <FileCheck2 className="w-4 h-4 text-slate-400" />
              <h2 className="text-sm font-bold text-carbon-dark uppercase tracking-wider">Expedientes por Estado</h2>
            </div>
          </div>

          <div className="flex-1">
            {expedientesPorEstado.loading ? (
              <div className="py-8 text-center text-slate-400 text-xs">Cargando...</div>
            ) : expedientesPorEstado.error ? (
              <div className="py-8 text-center text-red-400 text-xs">{expedientesPorEstado.error}</div>
            ) : (
              <ExpedientesPorEstadoBars conteos={expedientesPorEstado.value} />
            )}
          </div>
          <Link to="/expedientes" className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:text-primary-dark mt-4">
            Ver todos los expedientes <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {/* Vencimientos Próximos: vencidos y próximos de los expedientes abiertos, clickeables. */}
        <VencimientosDashboard />
      </div>

      {/* Fila 3: Expedientes recientes (8 col) + Actividad reciente (4 col) —
          misma altura, apiladas hasta 1280px. */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-stretch">
        {/* Expedientes Recientes */}
        <div className="xl:col-span-2 bg-white p-6 rounded-2xl border border-slate-100 shadow-card space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-slate-400" />
              <h2 className="text-sm font-bold text-carbon-dark uppercase tracking-wider">Expedientes Recientes</h2>
            </div>
            <Link to="/expedientes" className="text-xs font-bold text-primary hover:text-primary-dark">
              Ver todos
            </Link>
          </div>

          {expedientesTodos.loading ? (
            <div className="py-8 text-center text-slate-400 text-xs">Cargando...</div>
          ) : expedientesTodos.error ? (
            <div className="py-8 text-center text-red-400 text-xs">{expedientesTodos.error}</div>
          ) : !expedientesTodos.value || expedientesTodos.value.length === 0 ? (
            <div className="py-8 text-center text-slate-400 text-xs">
              Aún no hay expedientes registrados.
            </div>
          ) : (
            <div className="overflow-x-auto -mx-2">
              <table className="w-full table-fixed text-left border-collapse text-[11px]">
                <thead>
                  <tr className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    <th className="py-2 px-2 font-bold w-[30%]">Empresa</th>
                    <th className="py-2 px-2 font-bold w-[25%]">Proyecto</th>
                    <th className="py-2 px-2 font-bold w-[13%]">Perfil</th>
                    <th className="py-2 px-2 font-bold w-[13%]">Estado</th>
                    <th className="py-2 px-2 font-bold w-[13%]">Última Evaluación</th>
                    <th className="py-2 px-2 font-bold text-right w-[6%]"><span className="sr-only">Acciones</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {[...expedientesTodos.value]
                    .sort((a, b) => createdAtMillis(b) - createdAtMillis(a))
                    .slice(0, 6)
                    .map((exp) => {
                      const ultimasDelExpediente = (evaluacionesTodas.value || [])
                        .filter((ev) => ev.expedienteId === exp.id)
                        .sort((a, b) => createdAtMillis(b) - createdAtMillis(a));
                      const ultima = ultimasDelExpediente[0] || null;
                      const proyectoNombre = proyectosMap[exp.proyectoId] || exp.proyectoId;
                      return (
                        <tr key={exp.id} className="hover:bg-slate-50/60 transition-colors">
                          <td
                            className="py-2.5 px-2 font-bold text-carbon-dark truncate"
                            title={empresasMap[exp.empresaId] || undefined}
                          >
                            {empresasMap[exp.empresaId] || exp.empresaId}
                          </td>
                          <td
                            className="py-2.5 px-2 text-slate-500 font-medium truncate"
                            title={proyectoNombre}
                          >
                            {proyectoNombre}
                          </td>
                          <td
                            className="py-2.5 px-2 text-slate-500 font-medium truncate"
                            title={perfilesMap[exp.perfilParticipacionId] || undefined}
                          >
                            {perfilesMap[exp.perfilParticipacionId] || "-"}
                          </td>
                          <td className="py-2.5 px-2">
                            <StatusBadge value={exp.estado} map={ESTADO_MAP} />
                          </td>
                          <td className="py-2.5 px-2">
                            {ultima ? (
                              <StatusBadge value={ultima.resultado} map={MAPA_EVALUACION} />
                            ) : (
                              <span className="text-slate-300">-</span>
                            )}
                          </td>
                          <td className="py-2.5 px-2 text-right">
                            <Link
                              to={`/expedientes/${exp.id}`}
                              className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-primary transition-colors"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Actividad Reciente */}
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-card space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-slate-400" />
              <h2 className="text-sm font-bold text-carbon-dark uppercase tracking-wider">Actividad Reciente</h2>
            </div>
          </div>

          {actividadReciente.loading ? (
            <div className="py-8 text-center text-slate-400 text-xs">Cargando...</div>
          ) : actividadReciente.error ? (
            <div className="py-8 text-center text-red-400 text-xs">{actividadReciente.error}</div>
          ) : !actividadReciente.value || actividadReciente.value.length === 0 ? (
            <div className="py-8 text-center text-slate-400 text-xs">
              Sin actividad reciente registrada.
            </div>
          ) : (
            <>
              <div className={`divide-y divide-slate-100 ${actividadExpandida ? "max-h-[28rem] overflow-y-auto" : ""}`}>
                {actividadVisible.map((evento) => {
                  const { Icon, className } = iconoEvento(evento);
                  const detalle = detalleEvaluacion(evento);
                  // A quién se refiere (nombre + ficha a la que lleva) y el detalle del cambio.
                  const contexto = contextoEvento(evento, nombresActividad);
                  const nombre = detalle ? null : contexto.sujeto?.nombre;
                  const ruta = contexto.sujeto?.ruta;
                  const contenido = (
                    <>
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${className}`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-carbon-dark truncate">
                          {nombre && <span className="font-bold">{nombre} · </span>}
                          {detalle?.requerimientoNombre || describirEvento(evento)}
                        </p>
                        {detalle ? (
                          <p className="text-[11px] text-slate-400 truncate">
                            {detalle.resultadoLabel}
                            {detalle.objetivo ? ` · ${detalle.objetivo}` : ""}
                            {detalle.proyectoNombre ? ` — ${detalle.proyectoNombre}` : ""}
                          </p>
                        ) : contexto.detalle ? (
                          <p className="text-[11px] text-slate-500 truncate">{contexto.detalle}</p>
                        ) : null}
                        <p className="text-[11px] text-slate-400 truncate">
                          {formatTiempoRelativo(evento.createdAt)}
                          {evento.actorNombre ? ` · por ${evento.actorNombre}` : ""}
                        </p>
                      </div>
                    </>
                  );
                  return ruta ? (
                    <Link
                      key={evento.id}
                      to={ruta}
                      title={nombre ? `Ver el historial de ${nombre}` : "Ver el detalle"}
                      className="py-3 px-2 -mx-2 flex items-center gap-3 rounded-xl hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary transition-colors"
                    >
                      {contenido}
                    </Link>
                  ) : (
                    <div key={evento.id} className="py-3 flex items-center gap-3">{contenido}</div>
                  );
                })}
              </div>
              {(actividadReciente.value.length > 6 || actividadExpandida) && (
                <button
                  type="button"
                  onClick={() => setActividadExpandida((v) => !v)}
                  className="text-xs font-bold text-primary hover:text-primary-dark"
                >
                  {actividadExpandida ? "Ver menos" : "Ver toda la actividad"}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
