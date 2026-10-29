import React, { useEffect, useRef, useState } from "react";
import { getMandanteDisplayName } from "../../utils/mandanteDisplay";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft, ClipboardList, LayoutGrid, CheckCircle2,
  History, ChevronDown, ChevronUp, ChevronRight, Download, Building2, Users, Truck,
  Home, ExternalLink, Info, ClipboardCheck,
  Clock, XCircle, X, Percent, AlertTriangle, Lock, CalendarClock, Sparkles, FolderOpen,
} from "lucide-react";
import { TabDocumentacion } from "../../components/expedientes/documentacion/TabDocumentacion";
import { PanelDocumentos } from "../../components/expedientes/documentacion/PanelDocumentos";
import { ConPanelDocumentos } from "../../components/expedientes/documentacion/ConPanelDocumentos";
import { repositorioDocumentalService } from "../../services/repositorioDocumentalService";
import { RevisionIAExpediente } from "../../components/revisiones-ia/expediente/RevisionIAExpediente";
import { useAuth } from "../../contexts/AuthContext";
import { expedienteService, etiquetaMotivoCierre } from "../../services/expedienteService";
import { proyectoService } from "../../services/proyectoService";
import { empresaService } from "../../services/empresaService";
import { perfilParticipacionService } from "../../services/perfilParticipacionService";
import { evidenciaService } from "../../services/evidenciaService";
import { evidenciaRequerimientoService } from "../../services/evidenciaRequerimientoService";
import { participacionService } from "../../services/participacionService";
import { sujetoService, nombresPerfiles } from "../../services/participacionSujetoService";
import { usePerfilesRecurso } from "../../hooks/usePerfilesRecurso";
import { personaService } from "../../services/personaService";
import { recursoService } from "../../services/recursoService";
import { describirEvento } from "../../utils/bitacoraFormatters";
import { formatFecha, formatTiempoRelativo } from "../../utils/fechas";
import { ErrorBanner } from "../../components/shared/ErrorBanner";
import { ActionButton } from "../../components/shared/ActionButton";
import { RowActionsMenu } from "../../components/shared/RowActionsMenu";
import { MandanteChip } from "../../components/shared/MandanteChip";
import { EstadoExpedienteStepper } from "../../components/shared/EstadoExpedienteStepper";
import { EntityIconTile } from "../../components/shared/EntityIconTile";
import { formatCatalogo } from "../../utils/formatCatalogo";
import { mandanteService } from "../../services/mandanteService";
import { formatRutDisplay } from "../../utils/rutFormatters";
import {
  porcentajeCumplimiento, sumarResumenes, resumenDeSujeto, evaluadosDe, resumenVacio, textoPorcentaje, nivelAcreditacion,
} from "../../utils/cumplimientoCalculos";
import { BadgeAcreditacion } from "../../components/shared/BadgeAcreditacion";
import { MultiSegmentRing } from "../../components/shared/MultiSegmentRing";
import { CLASE_PISTA_DONA, segmentosCumplimiento } from "../../utils/estadosCumplimiento";
import { PlanillaEvaluacion } from "../../components/expedientes/PlanillaEvaluacion";
import { SujetosAsignados } from "../../components/expedientes/SujetosAsignados";
import { useAccionesEstadoExpediente } from "../../components/expedientes/AccionesEstadoExpediente";
import { HistorialEstadosExpediente } from "../../components/expedientes/HistorialEstadosExpediente";
import { problemasExpediente, textoProblemas, estadoVisibleExpediente } from "../../utils/alertasExpediente";
import { resumenTextoVencimientos } from "../../utils/vencimientos";
import { VencimientosExpediente } from "../../components/expedientes/VencimientosExpediente";
import { ConfigurarRequerimientosModal } from "../../components/perfiles-participacion/ConfigurarRequerimientosModal";

// Criterio de "Pendientes" vs "Evaluadas" para las sub-pestañas del selector de recurso, desde
// los contadores del sujeto en el Expediente: Evaluada = todas sus instancias activas resueltas
// (Cumple/No Cumple/No Aplica, ninguna pendiente ni sin evaluar). Sin instancias (nada que evaluar
// para su función) queda Pendiente, nunca Evaluada: casi siempre indica una función mal asignada.
const calcularEstadoSujeto = (resumen) => (
  (!resumen || !resumen.activas || resumen.pendiente > 0) ? "pendiente" : "evaluada"
);

// Ítems del selector (avancePct/estado) para Personas/Maquinarias, desde resumenSujetos de la
// cabecera del Expediente (una sola lectura, sin cruzar requisitos con sujetos). Funciones puras,
// reutilizadas justo después de Guardar Evaluación con los datos recién pedidos.
const construirPersonasItems = (expedienteData, personasAsignadas, personasOptions, perfilesPorId = {}) =>
  personasAsignadas.map((a) => {
    const p = personasOptions.find((x) => x.id === a.personaId);
    const resumen = resumenDeSujeto(expedienteData, { personaId: a.personaId });
    return {
      id: a.personaId,
      nombre: p ? `${p.nombre} ${p.apellido || ""}`.trim() : a.personaId,
      subtitulo: nombresPerfiles(a.perfilRecursoIds, perfilesPorId),
      busqueda: p?.rut ? formatRutDisplay(p.rut) : "",
      avancePct: porcentajeCumplimiento(resumen),
      estado: calcularEstadoSujeto(resumen),
      requerimientos: resumen?.activas || 0,
      resumen: resumen || resumenVacio(),
      fechaInicio: a.fechaInicio || null,
    };
  });

const construirRecursosItems = (expedienteData, recursosAsignados, recursosOptions) =>
  recursosAsignados.map((a) => {
    const r = recursosOptions.find((x) => x.id === a.recursoId);
    const resumen = resumenDeSujeto(expedienteData, { recursoId: a.recursoId });
    return {
      id: a.recursoId,
      nombre: r?.nombre || a.recursoId,
      subtitulo: r?.tipo ? formatCatalogo(r.tipo) : "",
      busqueda: r?.patente || "",
      tipoIdentificacion: r?.tipoIdentificacion || null,
      avancePct: porcentajeCumplimiento(resumen),
      estado: calcularEstadoSujeto(resumen),
      requerimientos: resumen?.activas || 0,
      resumen: resumen || resumenVacio(),
      fechaInicio: a.fechaInicio || null,
    };
  });

// Desglose numérico de un conjunto de contadores (Expediente completo, Empresa, Personas o
// Recursos) para el donut, la leyenda y los puntos de color de "Resumen por componente".
// "Pendiente" incluye los requisitos aún sin evaluar (así los cuenta el backend).
const desglose = (resumen) => {
  const r = resumen || resumenVacio();
  return {
    total: r.activas || 0,
    evaluados: evaluadosDe(r),
    cumple: r.cumple || 0,
    pendiente: r.pendiente || 0,
    noCumple: r.noCumple || 0,
    noAplica: r.noAplica || 0,
    avancePct: porcentajeCumplimiento(r),
    segmentos: segmentosCumplimiento(r),
  };
};

const pctDe = (valor, total) => (total > 0 ? Math.round((valor / total) * 100) : 0);

// Pestañas del detalle. "General" es una pestaña más a la que siempre se puede volver;
// Empresa/Personas/Recursos filtran qué sujeto evalúa la Planilla. La activa se destaca con texto
// primario en negrita, subrayado de 3px y fondo suave; vive en la URL (?tab=) para conservarla al
// recargar.
const NIVELES = [
  { key: "general", label: "General", Icono: LayoutGrid },
  { key: "empresa", label: "Empresa", Icono: Building2 },
  { key: "persona", label: "Personas", Icono: Users },
  { key: "recurso", label: "Recursos", Icono: Truck },
  { key: "vencimientos", label: "Vencimientos", Icono: CalendarClock },
  { key: "revisiones_ia", label: "Revisiones IA", Icono: Sparkles },
  { key: "documentacion", label: "Documentación", Icono: FolderOpen },
];

// `badges`: { key: { cantidad, vencidos, texto } } — rojo si hay vencidos, ámbar si solo hay
// próximos. `ocultas`: pestañas que no se muestran (Vencimientos en un Expediente cerrado).
const TabsNivel = ({ activo, onChange, badges = {}, ocultas = [] }) => (
  <div role="tablist" className="flex items-end gap-1 px-4 pt-2 border-b border-slate-200 overflow-x-auto">
    {NIVELES.filter(({ key }) => !ocultas.includes(key)).map(({ key, label, Icono }) => (
      <button
        key={key}
        type="button"
        role="tab"
        aria-selected={activo === key}
        onClick={() => onChange(key)}
        className={`inline-flex items-center gap-2 px-5 py-3 -mb-px text-sm whitespace-nowrap rounded-t-xl border-b-[3px] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary ${
          activo === key
            ? "border-primary text-primary font-bold bg-primary-lighter"
            : "border-transparent text-slate-500 font-semibold bg-transparent hover:bg-slate-50"
        }`}
      >
        <Icono className="w-4 h-4" />
        {label}
        {badges[key]?.cantidad > 0 && (
          <span
            className={`min-w-5 h-5 px-1.5 rounded-full text-[10px] font-black flex items-center justify-center ${
              badges[key].vencidos ? "bg-red-500 text-white" : "bg-amber-400 text-white"
            }`}
            title={badges[key].texto}
          >
            {badges[key].cantidad}
          </span>
        )}
      </button>
    ))}
  </div>
);

// Etiqueta pequeña de cada dato de contexto del encabezado.
const CLASE_ETIQUETA_CONTEXTO = "text-[10px] font-bold text-slate-400 uppercase tracking-wider";

// Puntos de color con conteos: Cumple / Pendiente / No Cumple / No Aplica.
const PuntosEstado = ({ d }) => (
  <div className="flex items-center gap-3 text-[11px] font-bold text-carbon-dark">
    {d.segmentos.map((p) => ({ v: p.value, dot: p.dot, t: p.label })).map((p) => (
      <span key={p.t} title={p.t} className="flex items-center gap-1">
        <span className={`w-2 h-2 rounded-full ${p.dot}`} />
        {p.v}
      </span>
    ))}
  </div>
);

// Tarjetas de resumen de la pestaña Empresa, Personas o Recursos: % de cumplimiento (con su nivel
// de acreditación) y contadores.
const KpisComponente = ({ d, umbrales }) => {
  const nivel = nivelAcreditacion(d.avancePct, umbrales);
  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
      <div className={`flex items-center gap-3 p-4 rounded-2xl border ${nivel.caja}`}>
        <Percent className={`w-5 h-5 ${nivel.icono}`} />
        <div>
          <p className={`text-lg font-black leading-none ${nivel.texto}`}>{textoPorcentaje(d.avancePct)}</p>
          <p className={`text-[11px] mt-1 font-bold ${nivel.texto}`}>{nivel.etiqueta || "Cumplimiento"}</p>
        </div>
      </div>
      {[
        { n: d.total, l: "Requisitos totales", box: "bg-primary-lighter/60 border-primary-light", Icono: ClipboardCheck, ic: "text-primary" },
        { n: d.cumple, l: "Cumplen", box: "bg-sage-lighter border-slate-100", Icono: CheckCircle2, ic: "text-sage-darker" },
        { n: d.pendiente, l: "Pendientes", box: "bg-amber-50 border-amber-100", Icono: Clock, ic: "text-amber-500" },
        { n: d.noCumple, l: "No cumplen", box: "bg-red-50 border-red-100", Icono: XCircle, ic: "text-red-500" },
      ].map((k) => (
        <div key={k.l} className={`flex items-center gap-3 p-4 rounded-2xl border ${k.box}`}>
          <k.Icono className={`w-5 h-5 ${k.ic}`} />
          <div>
            <p className="text-lg font-black text-carbon-dark leading-none">{k.n}</p>
            <p className="text-[11px] text-slate-500 mt-1">{k.l}</p>
          </div>
        </div>
      ))}
    </div>
  );
};

export const ExpedienteDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { profile } = useAuth();
  // Quién puede editar el catálogo del Perfil de Participación (mismo alcance que
  // ConfigurarRequerimientosPage.jsx: ahí evaluador/mandante_lector quedan en solo lectura).
  const puedeConfigurarRequerimientos = ["superadmin", "mandante_admin"].includes(profile?.rol);

  const [expediente, setExpediente] = useState(null);
  const [mandante, setMandante] = useState(null);
  const historialRef = useRef(null);
  const [proyecto, setProyecto] = useState(null);
  const [empresa, setEmpresa] = useState(null);
  const [perfil, setPerfil] = useState(null);
  const [participacion, setParticipacion] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // Historial de estados (expedienteEstados): null mientras carga.
  const [historialEstados, setHistorialEstados] = useState(null);
  // Vencimientos del Expediente (GET /expedientes/:id/vencimientos): fuente única de la pestaña
  // Vencimientos, los badges y los avisos por sujeto y por requisito. null mientras carga.
  const [vencimientos, setVencimientos] = useState(null);
  // "Renovar" desde la pestaña Vencimientos: { tipoEntidad, sujetoId, instanciaId, nombre, requerimiento }.
  const [renovar, setRenovar] = useState(null);
  // Filtro con el que parte la tabla de requisitos (lo fija la alerta de "En Ejecución").
  const [filtroRequisitos, setFiltroRequisitos] = useState("");
  const [configurarRequerimientosAbierto, setConfigurarRequerimientosAbierto] = useState(false);
  // PlanillaEvaluacion carga su propio `expediente` (independiente del de más arriba) — este
  // contador fuerza su refresco cuando el modal "Configurar Requerimientos" cambia algo, para que
  // la tabla de Requisitos no quede con datos viejos mientras el resto de la pantalla ya se actualizó.
  const [recargarPlanillaSenal, setRecargarPlanillaSenal] = useState(0);

  // "bitacoraAbierta": distinto de "historialAbierto" (que ya existe más
  // abajo para el historial de evaluaciones por requerimiento) — este es
  // el toggle de la sección de auditoría/trazabilidad del Expediente.
  const [bitacoraAbierta, setBitacoraAbierta] = useState(false);
  const [bitacoraEventos, setBitacoraEventos] = useState(null);
  const [bitacoraCargando, setBitacoraCargando] = useState(false);
  const [bitacoraError, setBitacoraError] = useState(null);

  // Evidencia documental del Expediente y sus vínculos a Requerimientos: solo para el indicador de
  // "documentación adjunta", que es INDEPENDIENTE del estado (evaluar no exige documentos).
  const [evidenciasDoc, setEvidenciasDoc] = useState({ evidencias: [], vinculos: [] });
  const [personasOptions, setPersonasOptions] = useState([]);
  const [recursosOptions, setRecursosOptions] = useState([]);
  const [sujetosParticipacion, setSujetosParticipacion] = useState([]);
  const perfilesPorId = usePerfilesRecurso();

  // Vista General/Empresa/Personas/Maquinarias: controla qué sujeto evalúa la Planilla debajo.
  // `recursoSeleccionadoId` se resetea al cambiar de pestaña para que siempre recaiga en el
  // primero de la nueva lista. Arranca en "general" (vista comparativa de los 3 niveles a la
  // vez) — a diferencia de Empresa/Personas/Maquinarias, "General" es una pestaña más a la que
  // siempre se puede volver, no un estado inicial sin retorno.
  // La pestaña activa vive en la URL (?tab=empresa|persona|recurso; sin parámetro, General).
  const nivelActivo = NIVELES.some((n) => n.key === params.get("tab")) ? params.get("tab") : "general";
  // `?sujeto=<id>` (desde la ficha de una Persona o Maquinaria) la deja elegida y abre sus requisitos.
  const [recursoSeleccionadoId, setRecursoSeleccionadoId] = useState(() => params.get("sujeto") || null);
  // Panel "Detalle" de Personas/Recursos cerrado con la X: sin fila elegida ni planilla debajo.
  const [detalleCerrado, setDetalleCerrado] = useState(false);
  // Modal con los requisitos (planilla) de la Persona o Maquinaria elegida en el listado.
  const [requisitosAbiertos, setRequisitosAbiertos] = useState(() => Boolean(params.get("sujeto")));

  // Aviso tras Guardar Evaluación cuando el sujeto quedó completo (ver verificarSugerenciaSiguiente):
  // { nivel, siguiente, restantes, total }. `siguiente` es el próximo pendiente del mismo nivel, o
  // null si ya no queda ninguno ("todo evaluado"). null = sin aviso.
  const [sugerenciaSiguiente, setSugerenciaSiguiente] = useState(null);

  // Repositorio documental (carpeta local o SharePoint): pestaña Documentación y panel de documentos.
  const [repositorioDoc, setRepositorioDoc] = useState(null);
  const [repositorioDocError, setRepositorioDocError] = useState(null);
  const [repositorioDocIntento, setRepositorioDocIntento] = useState(0);
  useEffect(() => {
    let vigente = true;
    repositorioDocumentalService.obtener(id)
      .then((d) => { if (vigente) { setRepositorioDoc(d); setRepositorioDocError(null); } })
      .catch((err) => { if (vigente) setRepositorioDocError(err.message || "No se pudo cargar la documentación del expediente."); });
    return () => { vigente = false; };
  }, [id, repositorioDocIntento]);

  // `silencioso`: al guardar una evaluación o adjuntar evidencia (onGuardado de la Planilla) hay
  // que refrescar evaluaciones/expediente, pero SIN tapar toda la pantalla con el loader de carga
  // inicial — el usuario ya está viendo la tabla, no hace falta un parpadeo de pantalla completa
  // por guardar una fila. La carga inicial (montaje) y la transición de estado sí lo usan.
  // Devuelve los datos recién pedidos al servidor (además de guardarlos en el estado): lo
  // necesita verificarSugerenciaSiguiente para decidir "¿el sujeto quedó evaluado? ¿hay otro
  // pendiente?" con datos realmente frescos, sin esperar a que termine el siguiente render (el
  // estado de React no queda actualizado todavía en el mismo tick en que se llama esta función).
  const cargarDatos = async (silencioso = false) => {
    if (!silencioso) setLoading(true);
    setError(null);
    try {
      const data = await expedienteService.obtenerPorId(id);
      setExpediente(data);
      expedienteService.historialEstados(id)
        .then((h) => setHistorialEstados(h || []))
        .catch(() => setHistorialEstados([]));
      expedienteService.vencimientos(id)
        .then((v) => setVencimientos(v || { items: [], totales: {} }))
        .catch(() => setVencimientos({ items: [], totales: {} }));

      const [
        proyectoData, empresaData, perfilData, sujetosData, evidenciasData, vinculosData, participacionData,
      ] = await Promise.all([
        proyectoService.obtenerPorId(data.proyectoId).catch(() => null),
        empresaService.obtenerPorId(data.empresaId).catch(() => null),
        perfilParticipacionService.obtenerPorId(data.perfilParticipacionId).catch(() => null),
        sujetoService.listar({ participacionId: data.participacionId, estado: "activa" }).catch(() => []),
        evidenciaService.listar({ expedienteId: data.id }).catch(() => []),
        evidenciaRequerimientoService.listarPorExpediente(data.id).catch(() => []),
        participacionService.obtenerPorId(data.participacionId).catch(() => null),
      ]);
      setParticipacion(participacionData);
      setEvidenciasDoc({ evidencias: evidenciasData || [], vinculos: vinculosData || [] });
      setProyecto(proyectoData);
      setEmpresa(empresaData);
      setPerfil(perfilData);
      mandanteService.obtenerPorId(data.mandanteId).then(setMandante).catch(() => setMandante(null));
      setSujetosParticipacion(sujetosData || []);
      return { expedienteData: data, sujetosData: sujetosData || [] };
    } catch (err) {
      console.error("Error al cargar el expediente:", err);
      setError(err.message || "No se pudo cargar el expediente.");
      return null;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarDatos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Catálogo de Personas/Maquinarias activas (para resolver nombre/RUT/patente en
  // construirPersonasItems/construirRecursosItems) — se pide una vez al montar, pero también hay
  // que refrescarlo tras "Ingresar Persona/Maquinaria" con una recién creada desde ese modal: si
  // no, su nombre no está todavía en este catálogo y la fila cae al ID crudo como fallback.
  const cargarOpciones = () => {
    personaService.listar("activo").then(setPersonasOptions).catch(() => setPersonasOptions([]));
    recursoService.listar("activo").then(setRecursosOptions).catch(() => setRecursosOptions([]));
  };

  useEffect(() => {
    cargarOpciones();
  }, []);

  // Acciones de estado (Registrar inicio en faena, Cerrar, Quitar inicio en faena, Reabrir) y sus modales.
  const accionesEstado = useAccionesEstadoExpediente({
    expediente,
    rol: profile?.rol,
    alcanceCierre: {
      empresa: empresa?.razonSocial || null,
      proyecto: proyecto?.nombre || null,
      personas: sujetosParticipacion.filter((a) => a.personaId).length,
      maquinarias: sujetosParticipacion.filter((a) => a.recursoId).length,
    },
    onCambiado: () => {
      setRecargarPlanillaSenal((n) => n + 1);
      return cargarDatos(true);
    },
  });

  const toggleBitacora = () => {
    const abriendo = !bitacoraAbierta;
    setBitacoraAbierta(abriendo);
    if (abriendo && bitacoraEventos === null) {
      setBitacoraCargando(true);
      setBitacoraError(null);
      expedienteService
        .obtenerEventos(expediente.id, { limit: 500 })
        .then((data) => setBitacoraEventos(data || []))
        .catch((err) => {
          console.error("Error al cargar el historial de auditoría:", err);
          setBitacoraError(err.message || "No se pudo cargar el historial.");
        })
        .finally(() => setBitacoraCargando(false));
    }
  };


  const irAHistorial = () => {
    if (!bitacoraAbierta) toggleBitacora();
    historialRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto py-16 text-center text-slate-400 text-xs">
        Cargando expediente...
      </div>
    );
  }

  if (!expediente) {
    return (
      <div className="max-w-4xl mx-auto space-y-4">
        <ErrorBanner message={error || "Expediente no encontrado."} />
      </div>
    );
  }

  const cerrado = expediente.estado === "cerrado";
  const vencidosExpediente = vencimientos ? vencimientos.totales?.vencidos || 0 : undefined;
  const problemas = problemasExpediente(expediente, vencidosExpediente);
  const estadoVisible = estadoVisibleExpediente(expediente, vencidosExpediente);

  // Vencimientos agrupados (todo sale de la respuesta del endpoint, sin cálculos propios).
  const itemsVencimiento = vencimientos?.items || [];
  const contarVencimientos = (lista) => ({
    vencidos: lista.filter((it) => it.clasificacion === "vencido").length,
    proximos: lista.filter((it) => it.clasificacion !== "vencido").length,
  });
  const badgeDe = (lista) => {
    const c = contarVencimientos(lista);
    return { cantidad: c.vencidos || c.proximos, vencidos: c.vencidos > 0, texto: resumenTextoVencimientos(c) };
  };
  const totalesVencimiento = contarVencimientos(itemsVencimiento);
  const badgesTabs = {
    vencimientos: badgeDe(itemsVencimiento),
    empresa: badgeDe(itemsVencimiento.filter((it) => it.tipoEntidad === "empresa")),
    persona: badgeDe(itemsVencimiento.filter((it) => it.tipoEntidad === "persona")),
    recurso: badgeDe(itemsVencimiento.filter((it) => it.tipoEntidad === "recurso")),
  };
  const vencimientosPorInstancia = Object.fromEntries(
    itemsVencimiento.map((it) => [it.instanciaId, { clasificacion: it.clasificacion, dias: it.dias }]),
  );
  const alertasPorSujeto = {};
  itemsVencimiento.forEach((it) => {
    if (it.tipoEntidad === "empresa" || !it.sujeto?.id) return;
    const c = contarVencimientos(itemsVencimiento.filter((x) => x.sujeto?.id === it.sujeto.id));
    alertasPorSujeto[it.sujeto.id] = { vencidos: c.vencidos, texto: resumenTextoVencimientos(c) };
  });
  const puedeEvaluarExpediente = ["superadmin", "evaluador"].includes(profile?.rol);
  // "Ver requerimiento": la instancia en su pestaña (personas y maquinarias con sus requisitos abiertos).
  const verRequerimientoVencido = (it) => {
    const siguiente = new URLSearchParams();
    siguiente.set("tab", it.tipoEntidad);
    if (it.tipoEntidad !== "empresa") siguiente.set("sujeto", it.sujeto.id);
    navigate(`/expedientes/${id}?${siguiente.toString()}`);
  };

  // Fecha en que se alcanzó cada etapa del stepper (0 Creado, 1 En ejecución, 2 Completado,
  // 3 Cerrado), desde el historial: la última vez que se llegó a ese estado.
  const ETAPA_DE_ESTADO = { creado: 0, en_ejecucion: 1, completado: 2, completado_pendientes: 2, cerrado: 3 };
  const fechasEtapas = [expediente.createdAt];
  (historialEstados || []).forEach((h) => {
    const etapa = ETAPA_DE_ESTADO[h.estadoNuevo];
    if (etapa !== undefined) fechasEtapas[etapa] = h.createdAt;
  });

  // Aviso de "Completado con pendientes": lleva a la tabla de requisitos de la Empresa filtrada.
  const verRequisitosConProblemas = () => {
    setFiltroRequisitos("con_problemas");
    cambiarNivel("empresa");
  };

  // Personas y Maquinarias activas de la Participación de ESTE Expediente (agrupadas: una
  // entrada por sujeto, con el conjunto de sus Perfiles de Recurso).
  const personasAsignadas = sujetosParticipacion.filter((a) => a.personaId);
  const recursosAsignados = sujetosParticipacion.filter((a) => a.recursoId);

  // Indicador de documentación adjunta — PARALELO al estado (evaluar no exige documentos): de las
  // instancias activas del Expediente, cuántas tienen al menos una evidencia activa enlazada.
  const evidenciasActivas = new Set(
    evidenciasDoc.evidencias.filter((e) => e.estado !== "inactivo").map((e) => e.id),
  );
  const instanciasConDocumento = new Set(
    evidenciasDoc.vinculos
      .filter((v) => v.estado === "activo" && evidenciasActivas.has(v.evidenciaId))
      .map((v) => v.expedienteRequerimientoId),
  );
  const totalPares = expediente.resumen?.activas || 0;
  const totalConDocumento = Math.min(instanciasConDocumento.size, totalPares);
  const pctDocumentacion = totalPares > 0 ? Math.round((totalConDocumento / totalPares) * 100) : 0;

  // Ítems del selector, con su avance individual: contadores por sujeto de la cabecera.
  const personasItems = construirPersonasItems(expediente, personasAsignadas, personasOptions, perfilesPorId);
  const recursosItems = construirRecursosItems(expediente, recursosAsignados, recursosOptions);

  const itemsActivos = nivelActivo === "persona" ? personasItems : nivelActivo === "recurso" ? recursosItems : [];
  // Selección derivada, no sincronizada por efecto: si lo elegido ya no está en la lista
  // vigente (o nunca se eligió nada) cae automáticamente al primero — así nunca queda
  // desincronizada del contenido real.
  const seleccionadoId = detalleCerrado ? null
    : itemsActivos.some((i) => i.id === recursoSeleccionadoId)
      ? recursoSeleccionadoId : (itemsActivos[0]?.id ?? null);
  // Elegir una fila la deja seleccionada (panel de detalle) y abre sus requisitos en el modal.
  const seleccionarSujeto = (sujetoId) => {
    setRecursoSeleccionadoId(sujetoId);
    setDetalleCerrado(sujetoId === null);
    setRequisitosAbiertos(sujetoId !== null);
  };

  // Clic en una fila del listado: solo muestra su detalle. Los requisitos se abren con el botón
  // "Evaluar requisitos" del panel de detalle.
  const verDetalleSujeto = (sujetoId) => {
    setRecursoSeleccionadoId(sujetoId);
    setDetalleCerrado(sujetoId === null);
    setRequisitosAbiertos(false);
  };

  // Navegación ←/→ entre evaluados del mismo nivel, sin subir al panel de selección: solo tiene
  // sentido cuando el sujeto activo YA está evaluado (revisar sus requisitos ya resueltos, no
  // saltar entre pendientes a medio evaluar). null si el sujeto activo no está evaluado o no hay
  // nadie más evaluado con quien navegar.
  const evaluadosDelNivel = itemsActivos.filter((i) => i.estado === "evaluada");
  const indiceEvaluado = evaluadosDelNivel.findIndex((i) => i.id === seleccionadoId);
  const navegacionSujeto = indiceEvaluado === -1 ? null : {
    posicion: indiceEvaluado + 1,
    total: evaluadosDelNivel.length,
    hayAnterior: indiceEvaluado > 0,
    haySiguiente: indiceEvaluado < evaluadosDelNivel.length - 1,
    onAnterior: () => seleccionarSujeto(evaluadosDelNivel[indiceEvaluado - 1].id),
    onSiguiente: () => seleccionarSujeto(evaluadosDelNivel[indiceEvaluado + 1].id),
  };

  // Ya cargados acá (personasOptions/recursosOptions/personasAsignadas) — se pasan tal cual a la
  // Planilla para que NO tenga que volver a pedirlos al servidor al cambiar de pestaña o de
  // seleccionado: el cambio de sujeto queda como puro cambio de estado en cliente, sin ningún
  // fetch ni loader de pantalla completa.
  const personaConocida = nivelActivo === "persona" ? personasOptions.find((p) => p.id === seleccionadoId) || null : null;
  const recursoConocido = nivelActivo === "recurso" ? recursosOptions.find((r) => r.id === seleccionadoId) || null : null;

  // Panel de documentos junto a la evaluación (Empresa, y Personas/Recursos dentro del modal).
  // Panel de documentos junto a la evaluación (Empresa, y Personas/Recursos dentro del modal): solo
  // previsualiza. Configurar carpetas (asignar la de un sujeto, asociar la de un requerimiento)
  // pueden superadmin, evaluador y mandante_admin.
  const puedeConfigurarDocumentos = Boolean(repositorioDoc?.puedeEditar);
  const carpetaDeSujeto = (tipo, sujetoId) => sujetosParticipacion
    .find((a) => (tipo === "persona" ? a.personaId : a.recursoId) === sujetoId && a.carpetaRelativa)?.carpetaRelativa || null;
  const panelDocumentos = (tipo, sujeto) => (
    <PanelDocumentos
      key={`${tipo}|${sujeto?.id || ""}`}
      expedienteId={id}
      usuarioId={profile?.uid}
      repositorio={repositorioDoc?.repositorioDocumental || null}
      tipo={tipo}
      sujeto={sujeto}
      carpetaSujeto={sujeto ? carpetaDeSujeto(tipo, sujeto.id) : null}
      puedeEditar={puedeConfigurarDocumentos}
      onRepositorio={setRepositorioDoc}
      empresa={empresa}
      onIrADocumentacion={() => { setRequisitosAbiertos(false); cambiarNivel("documentacion"); }}
      onCarpetaAsignada={() => cargarDatos(true)}
    />
  );
  const sujetoConocido = nivelActivo === "persona"
    ? personasAsignadas.find((a) => a.personaId === seleccionadoId) || null
    : nivelActivo === "recurso" ? recursosAsignados.find((a) => a.recursoId === seleccionadoId) || null : null;

  // Resumen por componente (Empresa/Personas/Recursos): suma de los contadores de sus sujetos, un
  // total del Expediente completo, independiente del sujeto seleccionado.
  const resumenEmpresaBase = resumenDeSujeto(expediente, {}) || resumenVacio();
  const resumenPersonasBase = sumarResumenes(personasAsignadas.map((a) => resumenDeSujeto(expediente, { personaId: a.personaId })));
  const resumenRecursosBase = sumarResumenes(recursosAsignados.map((a) => resumenDeSujeto(expediente, { recursoId: a.recursoId })));
  const dEmpresa = desglose(resumenEmpresaBase);
  const dPersonas = desglose(resumenPersonasBase);
  const dRecursos = desglose(resumenRecursosBase);

  // Cumplimiento Documental de la pestaña General: los contadores del Expediente completo.
  const dGeneral = desglose(expediente.resumen || resumenVacio());

  const componentes = [
    { key: "empresa", nombre: "Empresa", Icono: Building2, d: dEmpresa },
    { key: "persona", nombre: "Personas", Icono: Users, d: dPersonas },
    { key: "recurso", nombre: "Recursos", Icono: Truck, d: dRecursos },
  ];

  const cambiarNivel = (key) => {
    const siguiente = new URLSearchParams(params);
    if (key === "general") siguiente.delete("tab");
    else siguiente.set("tab", key);
    setParams(siguiente, { replace: true });
    setRecursoSeleccionadoId(null);
    setDetalleCerrado(false);
    setRequisitosAbiertos(false);
  };

  // "Evaluar manualmente" desde la matriz de Revisiones IA: abre la pestaña del sujeto y, en
  // Personas/Recursos, sus requisitos.
  const evaluarManualDesdeRevision = (fila) => {
    cambiarNivel(fila.tipoEntidad);
    if (fila.tipoEntidad !== "empresa") {
      setRecursoSeleccionadoId(fila.sujetoId);
      setRequisitosAbiertos(true);
    }
  };

  // Tras Guardar Evaluación en el nivel Persona/Maquinaria: si el sujeto que se acaba de evaluar
  // quedó "evaluada" (100% resuelto) y aún quedan pendientes en ese nivel, pregunta si se quiere
  // evaluar al siguiente (mostrando su nombre): seguir evaluando o cerrar el modal de requisitos.
  // Si era el último, el modal de requisitos se cierra solo y se avisa que está todo evaluado.
  // En Empresa no aplica (una sola entidad).
  const verificarSugerenciaSiguiente = async (nivel, idAnterior) => {
    const datos = await cargarDatos(true);
    if (!datos) return;
    const { expedienteData, sujetosData } = datos;
    const items = nivel === "persona"
      ? construirPersonasItems(expedienteData, sujetosData.filter((a) => a.personaId), personasOptions, perfilesPorId)
      : construirRecursosItems(expedienteData, sujetosData.filter((a) => a.recursoId), recursosOptions);
    const indice = items.findIndex((i) => i.id === idAnterior);
    if (indice === -1 || items[indice].estado !== "evaluada") return;
    // El siguiente pendiente en el orden del listado, partiendo del recién evaluado.
    const enOrden = [...items.slice(indice + 1), ...items.slice(0, indice)];
    const pendientes = enOrden.filter((i) => i.estado !== "evaluada");
    if (pendientes.length === 0) setRequisitosAbiertos(false);
    setSugerenciaSiguiente({ nivel, siguiente: pendientes[0] || null, restantes: pendientes.length, total: items.length });
  };

  const irASiguientePendiente = (id) => {
    seleccionarSujeto(id);
    setSugerenciaSiguiente(null);
  };

  // "Cerrar" en la pregunta del siguiente: cierra también el modal de requisitos.
  const cerrarRequisitosTrasEvaluar = () => {
    setSugerenciaSiguiente(null);
    setRequisitosAbiertos(false);
  };

  // Al cerrar el aviso de "ya se evaluó todo": sube al inicio de la pantalla — con todo evaluado
  // lo siguiente suele ser revisar el estado general/transicionar el Expediente, arriba del todo.
  const cerrarAvisoTodoEvaluado = () => {
    setSugerenciaSiguiente(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Planilla de requisitos (Empresa / Persona / Recurso). El resumen y los "datos de la evaluación"
  // ya no se dibujan dentro de la Planilla: viven en la cabecera y en las pestañas de esta pantalla.
  const planilla = ["empresa", "persona", "recurso"].includes(nivelActivo) ? (
    <PlanillaEvaluacion
      expedienteId={id}
      nivel={nivelActivo}
      personaId={nivelActivo === "persona" ? seleccionadoId : null}
      recursoId={nivelActivo === "recurso" ? seleccionadoId : null}
      personaConocida={personaConocida}
      recursoConocido={recursoConocido}
      sujetoConocido={sujetoConocido}
      embebido
      mostrarResumen={false}
      mostrarDatosEvaluacion={false}
      navegacionSujeto={navegacionSujeto}
      recargarSenal={recargarPlanillaSenal}
      vencimientosPorInstancia={vencimientosPorInstancia}
      itemInicial={nivelActivo === "vencimientos" ? null : params.get("item")}
      key={`${nivelActivo}|${filtroRequisitos}`}
      filtroInicial={filtroRequisitos}
      onGuardado={() => (
        (nivelActivo === "persona" || nivelActivo === "recurso") && seleccionadoId
          ? verificarSugerenciaSiguiente(nivelActivo, seleccionadoId)
          : cargarDatos(true)
      )}
    />
  ) : null;

  // Menú ⋮: navegación y las acciones de estado secundarias (cerrar en la fase de evaluación;
  // correcciones de superadmin). La acción principal del estado va como botón.
  const accionesMenu = [
    { label: "Ir a Planilla de Evaluación", icon: ClipboardList, onClick: () => navigate(`/expedientes/${id}/evaluar`) },
    { label: "Ver historial", icon: History, onClick: irAHistorial },
    ...accionesEstado.accionesMenu,
  ];

  const nombreEmpresa = empresa?.razonSocial || expediente.empresaId;
  const fechaInicioParticipacion = participacion?.fechaInicio || null;
  const proyectoTexto = proyecto ? `${proyecto.nombre} (${proyecto.codigo})` : expediente.proyectoId;

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-slate-400">
        <Link to="/" className="hover:text-primary" aria-label="Inicio"><Home className="w-3.5 h-3.5" /></Link>
        <ChevronRight className="w-3 h-3" />
        <Link to="/expedientes" className="font-semibold hover:text-primary">Expedientes</Link>
        <ChevronRight className="w-3 h-3" />
        <span className="font-semibold text-slate-600">{nombreEmpresa}</span>
      </nav>

      {/* Encabezado */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={() => navigate("/expedientes")}
            className="p-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 transition-colors shadow-sm"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-xl font-bold text-gray-900 tracking-tight">{nombreEmpresa}</h2>
              <Link
                to={`/empresas/${expediente.empresaId}`}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-[11px] font-bold text-primary hover:bg-slate-50 whitespace-nowrap"
              >
                Ver detalle de empresa
                <ExternalLink className="w-3.5 h-3.5" />
              </Link>
            </div>
            <p className="text-xs text-gray-500">
              {proyecto ? `${proyecto.nombre} (${proyecto.codigo})` : expediente.proyectoId}
            </p>
            {/* Contexto que no está en el título: RUT, Mandante, tipo de participación y fecha de inicio. */}
            <dl className="flex items-center gap-x-5 gap-y-1.5 flex-wrap mt-2 text-xs">
              {empresa?.rut && (
                <div className="flex items-center gap-1.5">
                  <dt className={CLASE_ETIQUETA_CONTEXTO}>RUT</dt>
                  <dd className="font-mono text-slate-600">{formatRutDisplay(empresa.rut)}</dd>
                </div>
              )}
              <div className="flex items-center gap-1.5">
                <dt className={CLASE_ETIQUETA_CONTEXTO}>Mandante</dt>
                <dd>
                  {mandante
                    ? <MandanteChip nombre={getMandanteDisplayName(mandante)} logoUrl={mandante.logoUrl || null} />
                    : <span className="text-slate-400">-</span>}
                </dd>
              </div>
              <div className="flex items-center gap-1.5">
                <dt className={CLASE_ETIQUETA_CONTEXTO}>Tipo de participación</dt>
                <dd className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-primary-lighter text-primary-dark border border-primary-light">
                  {perfil?.nombre || "-"}
                </dd>
              </div>
              <div className="flex items-center gap-1.5">
                <dt className={CLASE_ETIQUETA_CONTEXTO}>Inicio participación</dt>
                <dd className="font-bold text-carbon-dark">{formatFecha(fechaInicioParticipacion)}</dd>
              </div>
            </dl>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {cerrado && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
              <Lock className="w-3.5 h-3.5" />
              Cerrado el {formatFecha(expediente.fechaCierre)}
              {expediente.motivoCierre ? ` · ${etiquetaMotivoCierre(expediente.motivoCierre)}` : ""}
            </span>
          )}
          {accionesEstado.botonPrincipal}
          <ActionButton icon={ArrowLeft} onClick={() => navigate("/expedientes")}>Ver en lista</ActionButton>
          {/* No existe generación de paquete/PDF del expediente: queda pendiente en vez de improvisar un formato. */}
          <ActionButton icon={Download} disabled title="Próximamente">Descargar expediente</ActionButton>
          <RowActionsMenu actions={accionesMenu} />
        </div>
      </div>

      <ErrorBanner message={error} />

      {problemas && (
        <div role="alert" className="flex items-center gap-3 flex-wrap px-4 py-3 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-800">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span className="flex-1 min-w-[12rem] font-semibold">Completado con pendientes: {textoProblemas(problemas)}.</span>
          <button
            type="button"
            onClick={verRequisitosConProblemas}
            className="font-bold text-amber-900 underline underline-offset-2 hover:text-amber-950 whitespace-nowrap"
          >
            Ver requisitos con problemas
          </button>
        </div>
      )}
      {cerrado && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-600">
          <Lock className="w-4 h-4 shrink-0" />
          <span>
            Expediente cerrado: solo lectura. No se puede evaluar, subir documentos ni asignar personas o maquinarias.
            {expediente.detalleCierre ? ` Detalle: ${expediente.detalleCierre}` : ""}
          </span>
        </div>
      )}

      {/* Desde Nueva Acreditación: el expediente se creó, pero no se pudo guardar su carpeta. */}
      {params.get("aviso") === "repositorio" && (
        <div role="alert" className="flex flex-wrap items-center gap-2 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span className="mr-auto">El expediente se creó, pero no se pudo guardar la carpeta. Configúrala en la pestaña Documentación.</span>
          <button type="button" onClick={() => cambiarNivel("documentacion")} className="font-bold underline">Ir a Documentación</button>
          <button type="button" aria-label="Cerrar aviso" onClick={() => { const p = new URLSearchParams(params); p.delete("aviso"); setParams(p, { replace: true }); }} className="p-1 rounded hover:bg-amber-100"><X className="w-3.5 h-3.5" /></button>
        </div>
      )}

      {/* Estado del Expediente */}
      <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-card">
        <EstadoExpedienteStepper estado={estadoVisible} variante="completa" fechas={fechasEtapas} />
        {expediente.fechaInicioEjecucion && (
          <p className="mt-4 text-center text-[11px] text-slate-500">
            En faena desde el <strong className="text-slate-700">{formatFecha(expediente.fechaInicioEjecucion)}</strong>
          </p>
        )}
      </div>

      {/* Pestañas */}
      <div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-card min-w-0">
          <TabsNivel
            activo={nivelActivo}
            onChange={(key) => { setFiltroRequisitos(""); cambiarNivel(key); }}
            badges={badgesTabs}
            ocultas={cerrado ? ["vencimientos"] : []}
          />

          <div className="p-6 space-y-6">
            {/* ── General ── */}
            {nivelActivo === "general" && (
              <>
                <div>
                  <h3 className="text-base font-bold text-carbon-dark">Resumen General del Expediente</h3>
                  <p className="text-xs text-slate-500">Vista consolidada del cumplimiento documental de todos los componentes.</p>
                </div>

                {!cerrado && (totalesVencimiento.vencidos > 0 || totalesVencimiento.proximos > 0) && (
                  <div className={`flex items-center gap-3 flex-wrap px-4 py-3 rounded-xl border text-xs ${
                    totalesVencimiento.vencidos ? "bg-red-50 border-red-200 text-red-800" : "bg-amber-50 border-amber-200 text-amber-800"
                  }`}>
                    <CalendarClock className="w-4 h-4 shrink-0" />
                    <span className="flex-1 font-semibold">
                      {[
                        totalesVencimiento.vencidos ? `${totalesVencimiento.vencidos} vencido${totalesVencimiento.vencidos === 1 ? "" : "s"}` : null,
                        totalesVencimiento.proximos ? `${totalesVencimiento.proximos} próximo${totalesVencimiento.proximos === 1 ? "" : "s"} a vencer` : null,
                      ].filter(Boolean).join(" · ")}
                    </span>
                    <button type="button" onClick={() => cambiarNivel("vencimientos")} className="font-bold underline underline-offset-2 whitespace-nowrap">
                      Ver vencimientos
                    </button>
                  </div>
                )}

                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="rounded-2xl border border-slate-100 p-5 space-y-4">
                    <h4 className="text-sm font-bold text-carbon-dark">Cumplimiento Documental General</h4>
                    <div className="flex items-center gap-6 flex-wrap">
                      {/* Dona segmentada por estado, con los mismos colores de la leyenda. El % del
                          centro es el cumplimiento, en el color de texto principal. */}
                      <div className="relative shrink-0" style={{ width: 140, height: 140 }}>
                        <MultiSegmentRing
                          segments={dGeneral.segmentos.map((s) => ({ key: s.key, value: s.value, className: s.ring }))}
                          size={140}
                          strokeWidth={12}
                          trackClassName={CLASE_PISTA_DONA}
                        />
                        <span className="absolute inset-0 flex items-center justify-center text-2xl font-black text-carbon-dark">
                          {dGeneral.avancePct === null ? "—" : `${dGeneral.avancePct}%`}
                        </span>
                      </div>
                      <ul className="flex-1 min-w-[10rem] space-y-2.5 text-xs">
                        {dGeneral.segmentos.map((s) => ({ t: s.label, v: s.value, dot: s.dot })).map((f) => (
                          <li key={f.t} className="flex items-center justify-between gap-3">
                            <span className="flex items-center gap-2 text-slate-600">
                              <span className={`w-2.5 h-2.5 rounded-full ${f.dot}`} />
                              {f.t}
                            </span>
                            <span className="font-bold text-carbon-dark">
                              {f.v}
                              <span className="ml-1.5 font-medium text-slate-400">({pctDe(f.v, dGeneral.total)}%)</span>
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    {dGeneral.evaluados === 0 && (
                      <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-primary-lighter border border-primary-light text-xs text-primary-dark">
                        <Info className="w-4 h-4 shrink-0" />
                        Aún no hay requisitos evaluados.
                      </div>
                    )}
                    {/* Documentación adjunta: indicador aparte del estado — se puede aprobar sin adjuntar
                        documentos (verificación presencial), pero queda a la vista cuánto respaldo hay. */}
                    {totalPares > 0 && (
                      <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 space-y-1.5">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Documentación adjunta</p>
                        <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                          <div className="h-full bg-primary rounded-full" style={{ width: `${pctDocumentacion}%` }} />
                        </div>
                        <p className="text-xs font-bold text-carbon-dark">
                          {pctDocumentacion}%
                          <span className="ml-1.5 font-medium text-slate-400">
                            ({totalConDocumento} de {totalPares} requerimientos con documento)
                          </span>
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="rounded-2xl border border-slate-100 p-5 space-y-3">
                    <h4 className="text-sm font-bold text-carbon-dark">Resumen por componente</h4>
                    {componentes.map(({ key, nombre, Icono, d }) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => cambiarNivel(key)}
                        className="w-full flex items-center gap-3 p-3 rounded-xl border border-slate-100 hover:border-primary-light hover:bg-slate-50 text-left transition-colors"
                      >
                        <EntityIconTile icon={Icono} />
                        <span className="text-xs font-bold text-carbon-dark">{nombre}</span>
                        <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-bold whitespace-nowrap">
                          {d.total} requisitos
                        </span>
                        <span className="ml-auto"><PuntosEstado d={d} /></span>
                        <BadgeAcreditacion pct={d.avancePct} umbrales={mandante?.umbralesAcreditacion} />
                        <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                      </button>
                    ))}
                  </div>
                </div>

                <HistorialEstadosExpediente historial={historialEstados} />
              </>
            )}

            {/* ── Empresa ── */}
            {nivelActivo === "empresa" && (
              <>
                <KpisComponente d={dEmpresa} umbrales={mandante?.umbralesAcreditacion} />

                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-bold text-carbon-dark">Requisitos de la empresa</h4>
                    <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-bold">{dEmpresa.total}</span>
                  </div>
                  <p className="text-[11px] text-slate-400">Listado de requerimientos asociados a la empresa para este proyecto.</p>
                  <ConPanelDocumentos panel={panelDocumentos("empresa", null)}>{planilla}</ConPanelDocumentos>
                </div>

                <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-primary-lighter border border-primary-light text-xs text-primary-dark">
                  <Info className="w-4 h-4 shrink-0" />
                  <span>Este expediente corresponde a la participación de <strong>{nombreEmpresa}</strong> en 1 proyecto.</span>
                </div>
              </>
            )}

            {/* ── Documentación ── */}
            {nivelActivo === "documentacion" && !repositorioDoc && !repositorioDocError && (
              <p className="py-8 text-center text-xs text-slate-400">Cargando la documentación del expediente...</p>
            )}
            {nivelActivo === "documentacion" && !repositorioDoc && repositorioDocError && (
              <div className="py-8 text-center space-y-2">
                <p className="text-xs text-red-600">{repositorioDocError}</p>
                <button type="button" onClick={() => { setRepositorioDocError(null); setRepositorioDocIntento((n) => n + 1); }}
                  className="text-xs font-bold text-primary hover:underline">Reintentar</button>
              </div>
            )}
            {nivelActivo === "documentacion" && repositorioDoc && (
              <TabDocumentacion
                expedienteId={id}
                usuarioId={profile?.uid}
                datos={repositorioDoc}
                onActualizado={setRepositorioDoc}
                empresa={empresa}
              />
            )}

            {/* ── Revisiones IA ── */}
            {nivelActivo === "revisiones_ia" && (
              <RevisionIAExpediente
                expediente={expediente}
                usuarioId={profile?.uid}
                rol={profile?.rol}
                onEvaluarManual={evaluarManualDesdeRevision}
              />
            )}

            {/* ── Vencimientos ── (un enlace directo a un Expediente ya cerrado no muestra la lista) */}
            {nivelActivo === "vencimientos" && cerrado && (
              <p className="py-8 text-center text-xs text-slate-400">El expediente está cerrado: no tiene vencimientos que gestionar.</p>
            )}
            {nivelActivo === "vencimientos" && !cerrado && (
              <VencimientosExpediente
                datos={vencimientos}
                puedeRenovar={puedeEvaluarExpediente}
                onRenovar={(it) => setRenovar({
                  tipoEntidad: it.tipoEntidad, sujetoId: it.sujeto?.id, instanciaId: it.instanciaId,
                  nombre: it.sujeto?.nombre, requerimiento: it.requerimiento?.nombreCorto,
                })}
                onVer={verRequerimientoVencido}
                itemInicial={params.get("item")}
              />
            )}

            {/* ── Personas / Recursos ── */}
            {(nivelActivo === "persona" || nivelActivo === "recurso") && (
              <>
                <KpisComponente d={nivelActivo === "persona" ? dPersonas : dRecursos} umbrales={mandante?.umbralesAcreditacion} />
                <SujetosAsignados
                  key={nivelActivo}
                  tipo={nivelActivo}
                  items={itemsActivos}
                  seleccionadoId={seleccionadoId}
                  onSeleccionar={verDetalleSujeto}
                  empresaId={expediente.empresaId}
                  empresaNombre={nombreEmpresa}
                  mandanteId={expediente.mandanteId}
                  umbralesAcreditacion={mandante?.umbralesAcreditacion}
                  proyectoDestinoId={expediente.proyectoId}
                  proyectoDestinoNombre={proyecto?.nombre}
                  proyectoTexto={proyectoTexto}
                  perfilParticipacionNombre={perfil?.nombre}
                  perfilParticipacionId={expediente.perfilParticipacionId}
                  onIngresado={() => { cargarOpciones(); cargarDatos(true); }}
                  puedeConfigurar={puedeConfigurarRequerimientos && !cerrado}
                  puedeIngresar={!cerrado}
                  alertasVencimiento={alertasPorSujeto}
                  onConfigurar={() => setConfigurarRequerimientosAbierto(true)}
                  onIrARequisitos={() => setRequisitosAbiertos(true)}
                />
                {/* Requisitos de la fila elegida, en un modal sobre el listado. Solo se cierra con la X
                    o con Cerrar: un clic fuera no descarta una evaluación a medio completar. */}
                {requisitosAbiertos && seleccionadoId && (
                  <div className="fixed inset-0 z-50 flex items-start justify-center p-4 sm:p-6 bg-black/40 overflow-y-auto">
                    <div
                      role="dialog"
                      aria-modal="true"
                      aria-label={`Requisitos de ${itemsActivos.find((i) => i.id === seleccionadoId)?.nombre || ""}`}
                      className="bg-slate-50 rounded-2xl shadow-dropdown w-full max-w-[96rem] my-auto"
                    >
                      <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-200 bg-white rounded-t-2xl">
                        <div className="min-w-0">
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                            {nivelActivo === "persona" ? "Requisitos de la persona" : "Requisitos de la maquinaria"}
                          </p>
                          <div className="flex items-center gap-2 min-w-0">
                            <h3 className="text-base font-bold text-carbon-dark truncate">
                              {itemsActivos.find((i) => i.id === seleccionadoId)?.nombre}
                            </h3>
                            {/* Tipo de trabajador (Perfiles de persona) o tipo de maquinaria. */}
                            {itemsActivos.find((i) => i.id === seleccionadoId)?.subtitulo && (
                              <span className="px-2.5 py-0.5 rounded-full bg-primary-lighter border border-primary-light text-primary-dark text-[11px] font-bold whitespace-nowrap">
                                {itemsActivos.find((i) => i.id === seleccionadoId).subtitulo}
                              </span>
                            )}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setRequisitosAbiertos(false)}
                          aria-label="Cerrar"
                          className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="p-5">
                        <ConPanelDocumentos panel={panelDocumentos(nivelActivo, nivelActivo === "persona" ? personaConocida : recursoConocido)}>
                          {planilla}
                        </ConPanelDocumentos>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Historial del expediente (auditoría/trazabilidad) */}
      <div ref={historialRef} className="bg-white p-6 rounded-2xl border border-gray-100 shadow-card space-y-4">
        <button
          type="button"
          onClick={toggleBitacora}
          className="w-full flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Historial del expediente</h3>
          </div>
          {bitacoraAbierta ? (
            <ChevronUp className="w-4 h-4 text-slate-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-400" />
          )}
        </button>

        {bitacoraAbierta && (
          <div className="pt-2">
            {bitacoraCargando ? (
              <p className="text-xs text-slate-400 text-center py-4">Cargando historial...</p>
            ) : bitacoraError ? (
              <ErrorBanner message={bitacoraError} />
            ) : !bitacoraEventos || bitacoraEventos.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-4">Sin eventos registrados.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {bitacoraEventos.map((evento) => (
                  <li key={evento.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
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

      {accionesEstado.modales}

      {renovar && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 sm:p-6 bg-black/40 overflow-y-auto">
          <div role="dialog" aria-modal="true" aria-label="Renovar documento" className="bg-slate-50 rounded-2xl shadow-dropdown w-full max-w-6xl my-auto">
            <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-200 bg-white rounded-t-2xl">
              <div className="min-w-0">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Renovar documento</p>
                <h3 className="text-base font-bold text-carbon-dark truncate">
                  {renovar.requerimiento}{renovar.nombre ? ` — ${renovar.nombre}` : ""}
                </h3>
                <p className="text-[11px] text-slate-500">Adjunta el documento nuevo, marca SI con la nueva fecha de vencimiento y guarda.</p>
              </div>
              <button type="button" onClick={() => setRenovar(null)} aria-label="Cerrar" className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5">
              <PlanillaEvaluacion
                expedienteId={id}
                nivel={renovar.tipoEntidad}
                personaId={renovar.tipoEntidad === "persona" ? renovar.sujetoId : null}
                recursoId={renovar.tipoEntidad === "recurso" ? renovar.sujetoId : null}
                embebido
                mostrarResumen={false}
                mostrarDatosEvaluacion={false}
                soloInstanciaId={renovar.instanciaId}
                vencimientosPorInstancia={vencimientosPorInstancia}
                onGuardado={() => { setRenovar(null); cargarDatos(true); }}
              />
            </div>
          </div>
        </div>
      )}

      {sugerenciaSiguiente && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40"
          onClick={sugerenciaSiguiente.siguiente ? undefined : cerrarAvisoTodoEvaluado}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            className="bg-white rounded-2xl shadow-dropdown w-full max-w-sm p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-sage-lighter text-sage-darker flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-bold text-carbon-dark">
                {sugerenciaSiguiente.siguiente ? "Evaluación completa" : "¡Todo evaluado!"}
              </h3>
            </div>

            {sugerenciaSiguiente.siguiente ? (
              <>
                <p className="text-xs text-slate-500">
                  {sugerenciaSiguiente.restantes === 1
                    ? `Queda 1 ${sugerenciaSiguiente.nivel === "persona" ? "persona" : "maquinaria"} pendiente.`
                    : `Quedan ${sugerenciaSiguiente.restantes} ${sugerenciaSiguiente.nivel === "persona" ? "personas" : "maquinarias"} pendientes.`}
                  {" "}¿Quieres evaluar a la siguiente?
                </p>
                <div className="px-3 py-2.5 rounded-xl border border-slate-100 bg-slate-50">
                  <p className="text-xs font-bold text-carbon-dark break-words">{sugerenciaSiguiente.siguiente.nombre}</p>
                  {sugerenciaSiguiente.siguiente.subtitulo && (
                    <p className="text-[11px] text-slate-400 break-words">{sugerenciaSiguiente.siguiente.subtitulo}</p>
                  )}
                </div>
                <div className="flex items-center justify-end gap-2">
                  <ActionButton onClick={cerrarRequisitosTrasEvaluar}>Cerrar</ActionButton>
                  <ActionButton variant="primary" onClick={() => irASiguientePendiente(sugerenciaSiguiente.siguiente.id)}>
                    Seguir evaluando
                  </ActionButton>
                </div>
              </>
            ) : (
              <>
                <p className="text-xs text-slate-500">
                  Ya se evaluaron las {sugerenciaSiguiente.total} {sugerenciaSiguiente.nivel === "persona" ? "personas" : "maquinarias"} asignadas a este expediente.
                </p>
                <div className="flex items-center justify-end">
                  <ActionButton variant="primary" onClick={cerrarAvisoTodoEvaluado}>Entendido</ActionButton>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {configurarRequerimientosAbierto && (
        <ConfigurarRequerimientosModal
          perfilParticipacionId={expediente.perfilParticipacionId}
          expedienteIdContexto={id}
          nivelInicial={nivelActivo === "general" ? null : nivelActivo}
          onExpedienteActualizado={() => { cargarDatos(true); setRecargarPlanillaSenal((n) => n + 1); }}
          onCerrar={() => setConfigurarRequerimientosAbierto(false)}
        />
      )}
    </div>
  );
};
