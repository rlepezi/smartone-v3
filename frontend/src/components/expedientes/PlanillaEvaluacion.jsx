import React, { useEffect, useMemo, useRef, useState } from "react";
import { OrigenEvaluacion } from "./OrigenEvaluacion";
import { PropuestaIAPendiente } from "./PropuestaIAPendiente";
import { revisionExpedienteService } from "../../services/revisionExpedienteService";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Paperclip,
  PieChart,
  Search,
  Bot,
  UploadCloud,
  X,
} from "lucide-react";
import { revisionRequerimientoIAService } from "../../services/revisionRequerimientoIAService";
import { usePanelDocumentos } from "./documentacion/panelDocumentosContexto";
import { useAuth } from "../../contexts/AuthContext";
import { expedienteService } from "../../services/expedienteService";
import { proyectoService } from "../../services/proyectoService";
import { empresaService } from "../../services/empresaService";
import { perfilParticipacionService } from "../../services/perfilParticipacionService";
import { participacionService } from "../../services/participacionService";
import { evaluacionService } from "../../services/evaluacionService";
import { evidenciaService } from "../../services/evidenciaService";
import { CLASE_RESALTADO, enfocarElemento } from "../../pages/acreditaciones/asistenteNavegacion";
import { evidenciaRequerimientoService } from "../../services/evidenciaRequerimientoService";
import { personaService } from "../../services/personaService";
import { recursoService } from "../../services/recursoService";
import { sujetoService, nombresPerfiles } from "../../services/participacionSujetoService";
import { usePerfilesRecurso } from "../../hooks/usePerfilesRecurso";
import { formatCatalogo } from "../../utils/formatCatalogo";
import { formatFecha, aFechaISO, hoyISO } from "../../utils/fechas";
import { formatRutDisplay } from "../../utils/rutFormatters";
import {
  porcentajeCumplimiento, resumenDeSujeto, resumenVacio, textoPorcentaje,
} from "../../utils/cumplimientoCalculos";
import { ErrorBanner } from "../../components/shared/ErrorBanner";
import { ActionButton } from "../../components/shared/ActionButton";
import { StatusBadge, MAPA_EVALUACION } from "../../components/shared/StatusBadge";
import { textoVencimiento, CLASE_VENCIMIENTO, vencimientoSugerido } from "../../utils/vencimientos";
import { EstadoCumplimientoPanel } from "../../components/shared/EstadoCumplimientoPanel";
import { ResumenCumplimientoLista } from "../../components/shared/ResumenCumplimientoLista";
import { EntityIconTile } from "../../components/shared/EntityIconTile";
import { DateInput } from "../ui/DateInput";

const OPCIONES_RESULTADO = [
  { value: "cumple", label: "SI" },
  { value: "no_cumple", label: "NO" },
  { value: "no_aplica", label: "N/A" },
];

// Tope de altura de la fila Cumplimiento Documental/Selector/Resumen: sin esto, con
// items-stretch, una lista larga de Personas/Maquinarias (30, 50...) estira las 3 columnas a su
// propio alto — la tarjeta que manda es "Cumplimiento Documental" (contenido fijo: donut+switch,
// nunca crece con la cantidad de datos), las otras dos quedan acotadas a lo mismo y scrollean
// internamente si no alcanza.
const ALTURA_MAX_FILA_CUMPLIMIENTO = "max-h-96";

// "Sin Evaluar" (Requerimiento aún sin ninguna Evaluación vigente) no es un resultado de
// evaluación en sí — se muestra con este estilo propio junto a los de MAPA_EVALUACION.
const CLASE_SIN_EVALUAR = "bg-slate-100 text-slate-500 border-slate-200";
const InsigniaSinEvaluar = () => (
  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap ${CLASE_SIN_EVALUAR}`}>
    Sin Evaluar
  </span>
);

// Filtros de la tabla de requisitos (cada chip muestra su cantidad):
//  - Todos: todos los requisitos del sujeto.
//  - Cumplen: evaluados "Cumple" (aunque su documento esté vencido).
//  - Pendientes: sin evaluar o evaluados como pendientes — mismo criterio que el resumen.
//  - No Cumplen: evaluados "No Cumple".
//  - Vencidos: "Cumple" con fecha de vencimiento ya pasada (solo si el requisito pide fecha).
//  - Con problemas: todo lo que requiere acción — Pendientes, No Cumplen y Vencidos.
// "No Aplica" no tiene chip propio: se ve en Todos.
const CHIPS_FILTRO = [
  { value: "", label: "Todos" },
  { value: "cumple", label: "Cumplen" },
  { value: "pendiente", label: "Pendientes" },
  { value: "no_cumple", label: "No Cumplen" },
  { value: "vencidos", label: "Vencidos" },
  { value: "con_problemas", label: "Con problemas" },
];

// Planilla de evaluación de UN sujeto (Empresa, Persona o Maquinaria) dentro de un
// Expediente. La usan la página EvaluarExpedientePage (con onVolver), el detalle de Proyecto
// (embebido=true) y el detalle de Expediente (embebido=true, mostrarResumen=true — con las
// tarjetas de "Cumplimiento Documental"/"Resumen", el switch Empresa/Personas/Maquinarias
// dentro de la primera como `tabsNivel`, y el selector de recurso asignado como `panelExtra`).
// Sin personaId ni recursoId evalúa el nivel Empresa, salvo que `nivel` diga explícitamente
// "persona"/"recurso" sin id todavía (pestaña activa pero nadie seleccionado/asignado aún), o
// "ninguno" (estado inicial del Detalle de Expediente, sin ningún tab elegido todavía: no hay
// sujeto ni tabla de Requisitos, solo el donut genérico y el Resumen con los 3 niveles a la vez).
// Los requisitos son las INSTANCIAS de Requerimiento del sujeto (expedienteRequerimientos): se cargan
// solo las del sujeto elegido (empresa al abrir; cada persona o maquinaria al seleccionarla), nunca
// todas las del Expediente; los contadores de cada sujeto vienen en la cabecera del Expediente.
// `resumenGeneral` y `resumenNiveles` son overrides "genéricos" del donut y
// del Resumen: si se pasan, esas dos tarjetas dejan de depender del sujeto seleccionado (el
// Detalle de Expediente los usa para mostrar el total del Expediente y el avance por nivel, sin
// que cambien al cambiar de pestaña) — sin ellos, ambas tarjetas siguen mostrando lo del sujeto.
// `personaConocida`/`recursoConocido`/`sujetoConocido` (el sujeto agrupado, con sus
// perfilRecursoIds): cuando quien la usa YA tiene esos datos
// cargados (el Detalle de Expediente los trae para armar el selector), se los pasa acá para que
// cambiar de sujeto sea puro cambio de estado en cliente — sin ellos, se resuelven con un fetch
// propio (comportamiento de siempre, el que usan EvaluarExpedientePage/RequerimientosProyecto).
// `tituloCumplimiento`: override del título de la tarjeta del donut (el Detalle de Expediente le
// pasa "Cumplimiento Documental General" solo en su pestaña "General", para distinguirlo del
// cumplimiento de un nivel puntual).
// `navegacionSujeto`: { posicion, total, hayAnterior, haySiguiente, onAnterior, onSiguiente } —
// botones ←/→ junto al título de Requisitos para moverse entre sujetos evaluados del mismo nivel
// SIN volver a subir al panel de selección (el Detalle de Expediente arma esto sobre su propia
// lista de personas/maquinarias; sin esta prop no se muestra nada, mismo comportamiento de siempre).
// `accionRequisitos`: nodo opcional (ej. un link "Agregar Requerimiento") junto al título de
// Requisitos — sin esta prop no se muestra nada, mismo comportamiento de siempre.
// `recargarSenal`: la Planilla carga su propio `expediente` (independiente del que maneja el
// padre, ver cargarBase) — cuando algo AJENO a esta Planilla lo cambia (ej. el modal "Configurar
// Requerimientos" del Detalle de Expediente), el padre incrementa este número para forzar un
// refresco silencioso acá también. Sin esta prop, el comportamiento es el de siempre (solo carga
// al montar o al guardar/adjuntar desde la propia Planilla).
// `vencimientosPorInstancia`: { instanciaId: { clasificacion, dias } } del endpoint de
// vencimientos del Expediente; cada requisito afectado muestra su badge junto al estado y el
// filtro "Vencidos" lo usa. `soloInstanciaId`: la tabla muestra solo esa instancia ("Renovar").
// `itemInicial`: instancia a la que ir al abrir (enlace directo ?item=, p. ej. desde Reportes): se
// hace scroll, se resalta unos segundos y recibe el foco.
// `filtroInicial`: filtro de resultado con el que parte la tabla (ej. "con_problemas" desde la
// alerta de un Expediente en ejecución).
export const PlanillaEvaluacion = ({
  expedienteId, personaId, recursoId, onVolver, onGuardado, embebido = false,
  mostrarDatosEvaluacion = !embebido, mostrarResumen = false, panelExtra = null,
  nivel = null, tabsNivel = null, resumenGeneral = null,
  resumenNiveles = null, personaConocida = null, recursoConocido = null, sujetoConocido = null,
  tituloCumplimiento = "Cumplimiento Documental", navegacionSujeto = null,
  accionRequisitos = null, recargarSenal = 0, filtroInicial = "",
  vencimientosPorInstancia = null, soloInstanciaId = null, itemInicial = null,
}) => {
  const { profile } = useAuth();
  const puedeEvaluar = ["superadmin", "evaluador"].includes(profile?.rol);
  const puedeAdjuntarEvidencia = ["superadmin", "mandante_admin"].includes(profile?.rol);
  const puedeReintentarGeneracion = ["superadmin", "mandante_admin"].includes(profile?.rol);
  // "Revisar con IA" por requerimiento (reglas IA): superadmin y evaluador.
  const puedeRevisarIA = ["superadmin", "evaluador"].includes(profile?.rol);
  const [estadoIA, setEstadoIA] = useState({ habilitados: new Set(), propuestas: new Map() });
  // Ícono IA de cada requisito → panel lateral en "modo requerimiento" (solo dentro del panel de
  // documentos: ConPanelDocumentos). Pauta = reglas activas y estado IA de cada requerimiento.
  const { requerimientoActivo, abrirRequerimiento, actualizarRequerimiento } = usePanelDocumentos();
  const [pautas, setPautas] = useState(null);
  const [versionPautas, setVersionPautas] = useState(0); // recarga tras editar reglas desde el panel
  const accionesIA = useRef({});

  // Modo: normalmente se infiere de qué parámetro de ruta vino (personaId/recursoId), como en
  // EvaluarExpedientePage/RequerimientosProyecto. El Detalle de Expediente en cambio puede tener
  // la pestaña "Personas"/"Maquinarias" activa SIN nada todavía seleccionado (nadie asignado
  // aún) — ahí pasa `nivel` explícito para no caer por error en el modo "empresa".
  const modo = nivel || (personaId ? "persona" : recursoId ? "recurso" : "empresa");

  const [expediente, setExpediente] = useState(null);
  const [proyecto, setProyecto] = useState(null);
  const [empresa, setEmpresa] = useState(null);
  const [perfil, setPerfil] = useState(null);
  const [participacion, setParticipacion] = useState(null);
  const [persona, setPersona] = useState(null);
  // Perfiles de Recurso del sujeto en la Participación del Expediente (sus documentos activos):
  // definen qué Requerimientos acotados a perfiles le aplican (unión, sin duplicados).
  const [perfilesSujeto, setPerfilesSujeto] = useState([]);
  const perfilesPorId = usePerfilesRecurso();
  const [recurso, setRecurso] = useState(null);
  // Instancias de Requerimiento y evaluaciones del sujeto actual, etiquetadas con la clave del
  // sujeto al que pertenecen (así nunca se muestran las de otro mientras carga el nuevo).
  const [datosSujeto, setDatosSujeto] = useState({ clave: null, instancias: [], evaluaciones: [] });
  const [reintentando, setReintentando] = useState(false);
  const [vinculos, setVinculos] = useState([]);
  const [evidencias, setEvidencias] = useState([]);

  const [respuestas, setRespuestas] = useState({});

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!itemInicial || loading) return undefined;
    return enfocarElemento(`planilla-item-${itemInicial}`);
  }, [itemInicial, loading]);
  const [error, setError] = useState(null);
  const [guardando, setGuardando] = useState(false);
  // Tras un intento de guardar, los campos obligatorios que falten muestran su error en el campo.
  const [intentoGuardar, setIntentoGuardar] = useState(false);
  const [resultadoGuardado, setResultadoGuardado] = useState(null);

  // Búsqueda y filtro por resultado de la tabla (solo afecta qué filas se muestran, no las
  // respuestas en memoria ni el guardado).
  const [busqueda, setBusqueda] = useState("");
  const [filtroResultado, setFiltroResultado] = useState(filtroInicial);

  // Adjuntar Evidencia: a diferencia del listado general de Expedientes (que mezcla varios
  // responsables), acá la planilla ya está acotada a UN sujeto — no hace falta elegir a quién
  // corresponde el archivo, solo el archivo y su fecha de vencimiento.
  const [requerimientoAdjuntando, setRequerimientoAdjuntando] = useState(null);
  const [archivoAdjunto, setArchivoAdjunto] = useState(null);
  const [fechaVencimientoAdjunto, setFechaVencimientoAdjunto] = useState("");
  const [subiendoEvidencia, setSubiendoEvidencia] = useState(false);
  const [errorAdjunto, setErrorAdjunto] = useState(null);

  // Datos de nivel Expediente: NO dependen de qué sujeto está seleccionado (empresa/proyecto/
  // perfil/participación/evaluaciones vigentes/evidencias son los mismos sea cual sea la pestaña
  // activa) — se cargan una sola vez por `expedienteId`, nunca al cambiar de pestaña o de
  // Persona/Maquinaria seleccionada. Ese es justamente el fetch que antes se repetía en cada
  // cambio de sujeto y causaba el parpadeo de "recarga completa" al cambiar de tab.
  // `silencioso`: al refrescar después de Guardar/Adjuntar Evidencia no hace falta tapar la
  // planilla que el usuario ya está viendo con el loader de carga inicial.
  const cargarBase = async (silencioso = false) => {
    if (!silencioso) setLoading(true);
    setError(null);
    try {
      const expedienteData = await expedienteService.obtenerPorId(expedienteId);
      setExpediente(expedienteData);

      const [
        proyectoData, empresaData, perfilData, participacionData,
        vinculosData, evidenciasData,
      ] = await Promise.all([
        proyectoService.obtenerPorId(expedienteData.proyectoId).catch(() => null),
        empresaService.obtenerPorId(expedienteData.empresaId).catch(() => null),
        perfilParticipacionService.obtenerPorId(expedienteData.perfilParticipacionId).catch(() => null),
        participacionService.obtenerPorId(expedienteData.participacionId).catch(() => null),
        evidenciaRequerimientoService.listarPorExpediente(expedienteData.id).catch(() => []),
        evidenciaService.listar({ expedienteId: expedienteData.id }).catch(() => []),
      ]);

      setProyecto(proyectoData);
      setEmpresa(empresaData);
      setPerfil(perfilData);
      setParticipacion(participacionData);
      setVinculos(vinculosData || []);
      setEvidencias(evidenciasData || []);
    } catch (err) {
      console.error("Error al cargar la planilla de evaluación:", err);
      setError(err.message || "No se pudo cargar la planilla de evaluación.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // silencioso solo en los refrescos forzados desde afuera (recargarSenal > 0), nunca en la
    // carga inicial al montar (recargarSenal arranca en 0) — misma distinción que ya usa
    // cargarBase en el resto de la Planilla.
    cargarBase(recargarSenal > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expedienteId, recargarSenal]);

  // Datos del sujeto (persona/recurso + sus perfiles): si el padre ya los tiene (personaConocida/
  // recursoConocido/sujetoConocido — caso del Detalle de Expediente), se usan tal cual, sin red — el
  // cambio de sujeto queda resuelto en el mismo tick, sin ningún loading. Sin ellos (caso de
  // EvaluarExpedientePage/RequerimientosProyecto) se resuelven con un fetch propio, como siempre.
  useEffect(() => {
    let vigente = true;
    const sujetoId = modo === "persona" ? personaId : modo === "recurso" ? recursoId : null;
    if (!sujetoId) {
      setPersona(null);
      setRecurso(null);
      setPerfilesSujeto([]);
      return undefined;
    }
    const conocido = modo === "persona" ? personaConocida : recursoConocido;
    if (conocido) {
      if (modo === "persona") setPersona(conocido); else setRecurso(conocido);
      setPerfilesSujeto(sujetoConocido?.perfilRecursoIds || []);
      return undefined;
    }
    if (!expediente) return undefined;
    const campo = modo === "persona" ? "personaId" : "recursoId";
    Promise.all([
      (modo === "persona" ? personaService : recursoService).obtenerPorId(sujetoId).catch(() => null),
      sujetoService.listar({
        [campo]: sujetoId, participacionId: expediente.participacionId, estado: "activa",
      }).catch(() => []),
    ]).then(([dato, sujetos]) => {
      if (!vigente) return;
      if (modo === "persona") setPersona(dato); else setRecurso(dato);
      setPerfilesSujeto(sujetos[0]?.perfilRecursoIds || []);
    });
    return () => { vigente = false; };
  }, [modo, personaId, recursoId, personaConocida, recursoConocido, sujetoConocido, expediente]);

  // Sujeto actual como filtro de las consultas, y su clave (también la de resumenSujetos).
  const filtroSujeto = modo === "empresa" ? { empresa: true }
    : modo === "persona" && personaId ? { personaId }
      : modo === "recurso" && recursoId ? { recursoId } : null;
  const claveActual = filtroSujeto ? (personaId && modo === "persona" ? `persona_${personaId}`
    : recursoId && modo === "recurso" ? `recurso_${recursoId}` : "empresa") : null;

  // Instancias + evaluaciones (vigentes) SOLO del sujeto actual.
  // Propuestas de Revisiones IA sin resolver: se muestran junto al estado (no son evaluaciones).
  const cargarSujeto = (filtro, clave) => Promise.all([
    expedienteService.listarRequerimientos(expedienteId, filtro),
    evaluacionService.listarPorExpediente(expedienteId, false, filtro),
    revisionExpedienteService.propuestas(expedienteId).catch(() => []),
  ]).then(([instancias, evaluaciones, propuestas]) => {
    setDatosSujeto({
      clave, instancias: instancias || [], evaluaciones: evaluaciones || [],
      propuestas: new Map((propuestas || []).map((p) => [p.expedienteRequerimientoId, p])),
    });
  }).catch((err) => {
    console.error("Error al cargar los requisitos del sujeto:", err);
    setError(err.message || "No se pudieron cargar los requisitos.");
  });

  // Requerimientos con IA habilitada y propuestas pendientes de "Revisar con IA".
  const cargarEstadoIA = () => revisionRequerimientoIAService.estado(expedienteId)
    .then((e) => setEstadoIA({
      habilitados: new Set(e?.requerimientosHabilitados || []),
      propuestas: new Map((e?.propuestas || []).map((p) => [p.expedienteRequerimientoId, p])),
    }))
    .catch(() => {});
  useEffect(() => {
    if (!puedeRevisarIA) return;
    cargarEstadoIA();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expedienteId, recargarSenal, puedeRevisarIA]);
  const conPropuesta = (instanciaId, revision) => setEstadoIA((e) => {
    const propuestas = new Map(e.propuestas);
    if (revision) propuestas.set(instanciaId, revision); else propuestas.delete(instanciaId);
    return { ...e, propuestas };
  });
  // "Aplicar propuesta": llena SI/NO, la observación y la fecha de vencimiento; NO guarda.
  const aplicarPropuesta = (instancia, revision) => {
    const p = revision.propuestaEvaluacion || {};
    setRespuestas((prev) => ({
      ...prev,
      [instancia.id]: {
        ...prev[instancia.id],
        resultado: p.resultado ?? prev[instancia.id]?.resultado ?? null,
        observaciones: p.observaciones || prev[instancia.id]?.observaciones || "",
        fechaVencimiento: (instancia.requiereVencimiento && p.fechaVencimiento) || prev[instancia.id]?.fechaVencimiento || "",
        revisionIAId: revision.id,
      },
    }));
  };

  useEffect(() => {
    if (!expediente || !filtroSujeto) return;
    cargarSujeto(filtroSujeto, claveActual);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expedienteId, claveActual, expediente?.id, recargarSenal]);

  const enGeneracion = expediente?.estadoGeneracion === "en_proceso";
  const soloLectura = !puedeEvaluar || expediente?.estado === "cerrado" || enGeneracion;
  const puedeAdjuntar = puedeAdjuntarEvidencia && expediente?.estado !== "cerrado" && !enGeneracion;

  const items = useMemo(
    () => (datosSujeto.clave === claveActual ? datosSujeto.instancias : []),
    [datosSujeto, claveActual],
  );
  const vigentes = datosSujeto.clave === claveActual ? datosSujeto.evaluaciones : [];

  // ── Modo requerimiento del panel (ícono IA) ──
  useEffect(() => {
    if (!abrirRequerimiento) return undefined;
    let vigente = true;
    revisionRequerimientoIAService.pautas(expedienteId)
      .then((d) => { if (vigente) setPautas(d?.pautas || {}); })
      .catch(() => { if (vigente) setPautas({}); });
    return () => { vigente = false; };
  }, [expedienteId, recargarSenal, abrirRequerimiento, versionPautas]);
  // Otro sujeto (o salir): el panel vuelve al modo documentos (el checklist se reinicia).
  useEffect(() => {
    abrirRequerimiento?.(null);
    return () => abrirRequerimiento?.(null);
  }, [claveActual, abrirRequerimiento]);
  const activoId = requerimientoActivo?.instancia.id || null;
  const instanciaActiva = activoId ? items.find((i) => i.id === activoId) || null : null;
  const propuestaActiva = activoId ? estadoIA.propuestas.get(activoId) || null : null;
  const aplicadaActiva = Boolean(propuestaActiva) && respuestas[activoId]?.revisionIAId === propuestaActiva?.id;
  const pautaActiva = instanciaActiva ? pautas?.[instanciaActiva.requerimientoId] || null : null;
  const datosPanelIA = (r) => {
    const propuesta = estadoIA.propuestas.get(r.id) || null;
    return {
      instancia: { id: r.id, requerimientoId: r.requerimientoId, nombre: r.nombre, nombreCorto: r.nombreCorto },
      pauta: pautas?.[r.requerimientoId] || null,
      propuesta,
      aplicada: Boolean(propuesta) && respuestas[r.id]?.revisionIAId === propuesta.id,
      puedeRevisar: puedeRevisarIA && !soloLectura,
      acciones: accionesIA,
    };
  };
  // Mantiene al día el panel abierto (nueva propuesta, aplicada, pauta cargada).
  useEffect(() => {
    if (instanciaActiva && actualizarRequerimiento) actualizarRequerimiento(datosPanelIA(instanciaActiva));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propuestaActiva, aplicadaActiva, pautaActiva, soloLectura]);

  // Precarga de "respuestas" (el formulario en memoria, por instancia) a partir de la evaluación
  // vigente de cada instancia — puro cálculo en cliente, sin red.
  useEffect(() => {
    const respuestasIniciales = {};
    items.forEach((r) => {
      const vigente = r.evaluacionVigenteId
        ? datosSujeto.evaluaciones.find((v) => v.id === r.evaluacionVigenteId) : null;
      respuestasIniciales[r.id] = {
        resultado: vigente?.resultado || null,
        observaciones: vigente?.observaciones || "",
        fechaVencimiento: vigente?.fechaVencimiento ? aFechaISO(vigente.fechaVencimiento) : "",
      };
    });
    setRespuestas(respuestasIniciales);
  }, [items, datosSujeto]);

  const handleResultadoChange = (requerimientoId, resultado) => {
    // SOAP y Permiso de circulación: al marcar "Cumple" sin fecha, se propone el 31/03 del año
    // siguiente (editable).
    const sugerida = resultado === "cumple"
      ? vencimientoSugerido(items.find((i) => i.id === requerimientoId)) : null;
    setRespuestas((prev) => {
      const actual = prev[requerimientoId] || {};
      return {
        ...prev,
        [requerimientoId]: {
          ...actual,
          resultado,
          ...(sugerida && !actual.fechaVencimiento ? { fechaVencimiento: sugerida } : {}),
        },
      };
    });
  };

  const handleObservacionesChange = (requerimientoId, observaciones) => {
    setRespuestas((prev) => ({
      ...prev,
      [requerimientoId]: { ...prev[requerimientoId], observaciones },
    }));
  };

  const handleFechaVencimientoChange = (requerimientoId, fechaVencimiento) => {
    setRespuestas((prev) => ({
      ...prev,
      [requerimientoId]: { ...prev[requerimientoId], fechaVencimiento },
    }));
  };

  // Acciones del panel sobre el requisito activo ("Aplicar propuesta" solo llena el formulario).
  useEffect(() => {
    accionesIA.current = {
      revisada: (rev) => conPropuesta(activoId, rev),
      aplicar: (rev) => { if (instanciaActiva) aplicarPropuesta(instanciaActiva, rev); },
      descartada: () => {
        conPropuesta(activoId, null);
        setRespuestas((prev) => ({ ...prev, [activoId]: { ...prev[activoId], revisionIAId: undefined } }));
      },
      recargarPautas: () => setVersionPautas((v) => v + 1),
      // Checklist manual: decisión del evaluador (deja de ser la propuesta IA aplicada).
      aplicarChecklist: ({ resultado, observaciones }) => {
        if (!activoId) return;
        handleResultadoChange(activoId, resultado);
        setRespuestas((prev) => ({ ...prev, [activoId]: { ...prev[activoId], observaciones, revisionIAId: undefined } }));
      },
    };
  });

  // Evidencia enlazada a ESTA instancia (el enlace ya identifica al sujeto: nunca aparece la de
  // otra Persona en la misma exigencia).
  const evidenciaDe = (instanciaId) => {
    const ids = vinculos
      .filter((v) => v.expedienteRequerimientoId === instanciaId && v.estado === "activo")
      .map((v) => v.evidenciaId);
    return evidencias.find((e) => ids.includes(e.id) && e.estado !== "inactivo") || null;
  };

  const instanciaDe = (instanciaId) => items.find((r) => r.id === instanciaId) || null;
  // "Cumple" con su fecha de vencimiento ya pasada (misma regla que resumen.vencidos).
  const estaVencida = (instanciaId) => {
    if (vencimientosPorInstancia) return vencimientosPorInstancia[instanciaId]?.clasificacion === "vencido";
    const vigente = vigenteDe(instanciaId);
    return resultadoDe(instanciaId) === "cumple" && Boolean(instanciaDe(instanciaId)?.requiereVencimiento) &&
      Boolean(vigente?.fechaVencimiento) &&
      aFechaISO(vigente.fechaVencimiento) < hoyISO();
  };

  const vigenteDe = (instanciaId) => {
    const instancia = instanciaDe(instanciaId);
    return instancia?.evaluacionVigenteId
      ? vigentes.find((v) => v.id === instancia.evaluacionVigenteId) || null : null;
  };

  const resultadoDe = (instanciaId) => {
    const instancia = instanciaDe(instanciaId);
    return instancia?.evaluacionVigenteId ? instancia.resultado : "sin_evaluar";
  };

  const esResuelto = (resultado) => ["cumple", "no_cumple", "no_aplica"].includes(resultado);

  // Una fila "modificada" es aquella cuyo resultado, observaciones o fecha
  // de vencimiento difieren de la evaluación vigente de ESTE individuo (o,
  // si nunca hubo vigente, cualquiera que ya tenga un resultado marcado).
  // Desmarcar un requisito ya evaluado también es un cambio: vuelve a
  // "pendiente" al guardar.
  const esModificada = (requerimientoId) => {
    const actual = respuestas[requerimientoId];
    if (!actual) return false;
    const vigente = vigenteDe(requerimientoId);
    if (!actual.resultado) return Boolean(vigente && esResuelto(vigente.resultado));
    if (!vigente) return true;
    const observacionesActual = (actual.observaciones || "").trim();
    const observacionesVigente = (vigente.observaciones || "").trim();
    const fechaVencimientoVigente = vigente.fechaVencimiento
      ? aFechaISO(vigente.fechaVencimiento) : "";
    return (
      actual.resultado !== vigente.resultado ||
      observacionesActual !== observacionesVigente ||
      (instanciaDe(requerimientoId)?.requiereVencimiento &&
        (actual.fechaVencimiento || "") !== fechaVencimientoVigente)
    );
  };


  // La evidencia es opcional. Solo un "Cumple" sin documento exige una justificación; un "Cumple"
  // de un requisito con vencimiento exige la fecha. Devuelve el motivo si falta algo.
  const motivoInvalido = (instanciaId) => {
    const respuesta = respuestas[instanciaId];
    if (respuesta?.resultado !== "cumple") return null;
    if (instanciaDe(instanciaId)?.requiereVencimiento && !respuesta.fechaVencimiento) {
      return "Indica la fecha de vencimiento (obligatoria para Cumple).";
    }
    if (evidenciaDe(instanciaId)) return null;
    if (!(respuesta.observaciones || "").trim()) {
      return "Sin documento: la justificación (Observaciones) es obligatoria.";
    }
    return null;
  };
  const pideJustificacion = (instanciaId) =>
    respuestas[instanciaId]?.resultado === "cumple" && !evidenciaDe(instanciaId);

  const handleGuardar = async () => {
    setIntentoGuardar(true);
    const modificadosTodos = items.filter((r) => esModificada(r.id));

    if (modificadosTodos.length === 0) {
      setResultadoGuardado({ guardadas: 0, fallidas: [], sinCambios: true });
      return;
    }

    // Las filas incompletas se reportan sin llamar a la API; el resto se guarda igual.
    const invalidas = modificadosTodos
      .map((r) => ({ r, motivo: motivoInvalido(r.id) }))
      .filter((x) => x.motivo);
    const modificados = modificadosTodos.filter((r) => !motivoInvalido(r.id));
    // Los errores en el campo solo se mantienen mientras quede alguna fila incompleta.
    setIntentoGuardar(invalidas.length > 0);

    setGuardando(true);
    setResultadoGuardado(null);
    setError(null);

    const resultados = await Promise.allSettled(
      modificados.map((r) => {
        const respuesta = respuestas[r.id];
        const payload = {
          expedienteRequerimientoId: r.id,
          // Sin resultado marcado (se desmarcó): vuelve a pendiente.
          resultado: respuesta.resultado || "pendiente",
          observaciones: respuesta.observaciones?.trim() || null,
        };
        if (r.requiereVencimiento && respuesta.fechaVencimiento) {
          payload.fechaVencimiento = respuesta.fechaVencimiento;
        }
        // Propuesta IA aplicada: al guardar, la revisión queda confirmada.
        if (respuesta.revisionIAId) payload.revisionIAId = respuesta.revisionIAId;
        return evaluacionService.crear(payload);
      }),
    );

    const fallidas = invalidas.map((x) => ({ nombre: x.r.nombre, motivo: x.motivo }));
    let guardadas = 0;
    resultados.forEach((res, i) => {
      if (res.status === "fulfilled") {
        guardadas++;
      } else {
        fallidas.push({
          nombre: modificados[i].nombre,
          motivo: res.reason?.message || "Error inesperado.",
        });
      }
    });

    setResultadoGuardado({ guardadas, fallidas, sinCambios: false });
    setGuardando(false);
    if (modificados.length > 0) {
      await Promise.all([cargarBase(true), cargarSujeto(filtroSujeto, claveActual), puedeRevisarIA ? cargarEstadoIA() : null]);
    }
    if (guardadas > 0) onGuardado?.();
  };

  const reintentarGeneracion = async () => {
    setReintentando(true);
    setError(null);
    try {
      await expedienteService.reintentarGeneracion(expedienteId);
      await cargarBase(true);
      onGuardado?.();
    } catch (err) {
      setError(err.message || "No se pudo completar la generación.");
    } finally {
      setReintentando(false);
    }
  };

  const abrirAdjuntar = (requerimientoId) => {
    setRequerimientoAdjuntando(requerimientoId);
    setArchivoAdjunto(null);
    setFechaVencimientoAdjunto("");
    setErrorAdjunto(null);
  };

  const confirmarAdjuntarEvidencia = async () => {
    if (!archivoAdjunto) {
      setErrorAdjunto("Debe seleccionar un archivo.");
      return;
    }
    setSubiendoEvidencia(true);
    setErrorAdjunto(null);
    try {
      await evidenciaService.subirYVincular({
        expedienteId: expediente.id,
        archivo: archivoAdjunto,
        expedienteRequerimientoId: requerimientoAdjuntando,
        personaId: modo === "persona" ? personaId : null,
        recursoId: modo === "recurso" ? recursoId : null,
        fechaVencimiento: fechaVencimientoAdjunto || null,
      });
      await Promise.all([cargarBase(true), cargarSujeto(filtroSujeto, claveActual)]);
      setRequerimientoAdjuntando(null);
    } catch (err) {
      console.error("Error al adjuntar evidencia:", err);
      setErrorAdjunto(err.message || "No se pudo adjuntar la evidencia.");
    } finally {
      setSubiendoEvidencia(false);
    }
  };

  if (loading) {
    return (
      <div className={embebido ? "py-10 text-center text-slate-400 text-xs" : "max-w-5xl mx-auto py-16 text-center text-slate-400 text-xs"}>
        Cargando planilla de evaluación...
      </div>
    );
  }

  if (!expediente) {
    return (
      <div className={embebido ? "" : "max-w-5xl mx-auto space-y-4"}>
        <ErrorBanner message={error || "Expediente no encontrado."} />
      </div>
    );
  }

  const avisoGeneracion = enGeneracion ? (
    <div className="flex items-center justify-between gap-3 flex-wrap p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 text-xs">
      <span>
        Este Expediente aún está generando sus Requerimientos: no se puede evaluar ni adjuntar
        documentos hasta que termine.
      </span>
      {puedeReintentarGeneracion && (
        <ActionButton variant="primary" busy={reintentando} busyLabel="Generando..." onClick={reintentarGeneracion}>
          Reintentar generación
        </ActionButton>
      )}
    </div>
  ) : null;

  // Sin sujeto concreto sobre el cual calcular nada: el estado inicial ("ninguno", sin tab
  // elegido) o una pestaña Personas/Maquinarias activa pero sin nadie asignado todavía. Se
  // muestra el switch de nivel (para poder elegir un tab) y el panel adicional (que trae su
  // propio mensaje de "no hay nadie asignado" cuando corresponde — panelExtra).
  const sinSeleccion = modo === "ninguno" || (modo === "persona" && !personaId) || (modo === "recurso" && !recursoId);
  if (sinSeleccion) {
    // El donut y el Resumen "por nivel" son genéricos (no dependen del sujeto seleccionado), así
    // que igual se muestran acá — solo Datos de la Evaluación y la tabla de Requisitos necesitan
    // un sujeto concreto y por eso no aplican en este estado.
    const columnas = [panelExtra, resumenNiveles].filter(Boolean).length;
    return (
      <div className={embebido ? "space-y-4" : "max-w-5xl mx-auto space-y-6"}>
        <ErrorBanner message={error} />
        {avisoGeneracion}
        {mostrarResumen && (
          // items-stretch (no items-start): las columnas de esta fila siempre quedan a la misma
          // altura — la más alta entre ellas — sin medir nada en JS; cada tarjeta centra su
          // contenido dentro de ese alto (ver flex-1 + justify-center más abajo).
          <div className={`grid grid-cols-1 gap-6 items-stretch ${columnas === 2 ? "lg:grid-cols-3" : columnas === 1 ? "lg:grid-cols-2" : ""}`}>
            <div className={`bg-white p-6 rounded-2xl border border-gray-100 shadow-card flex flex-col h-full ${ALTURA_MAX_FILA_CUMPLIMIENTO}`}>
              <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider pb-3 border-b border-gray-100">
                {tituloCumplimiento}
              </h3>
              <div className="flex-1 min-h-0 flex items-center justify-center py-2">
                <EstadoCumplimientoPanel
                  resumen={resumenGeneral || resumenVacio()}
                  size={130}
                  strokeWidth={13}
                />
              </div>
              {tabsNivel && <div className="pt-3 border-t border-slate-100">{tabsNivel}</div>}
            </div>
            {panelExtra}
            {resumenNiveles && (
              <div className={`bg-white p-6 rounded-2xl border border-gray-100 shadow-card flex flex-col h-full ${ALTURA_MAX_FILA_CUMPLIMIENTO}`}>
                <div className="flex items-center gap-2.5 pb-3 border-b border-gray-100">
                  <EntityIconTile icon={PieChart} />
                  <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Resumen</h3>
                </div>
                <div className="flex-1 min-h-0 pt-4 overflow-y-auto">{resumenNiveles}</div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // Contadores de ESTE sujeto (cabecera del Expediente, mantenidos por el backend).
  const resumenSujeto = resumenDeSujeto(expediente, {
    personaId: modo === "persona" ? personaId : null,
    recursoId: modo === "recurso" ? recursoId : null,
  }) || resumenVacio();
  const avancePct = porcentajeCumplimiento(resumenSujeto);
  const cumplidos = items.filter((r) => r.evaluacionVigenteId && r.resultado === "cumple").length;

  const tituloNivel = modo === "empresa" ? "Empresa" : modo === "persona" ? "Persona" : "Maquinaria";
  const nombreSujeto = modo === "persona"
    ? (persona ? `${persona.nombre} ${persona.apellido}`.trim() : "la Persona")
    : modo === "recurso" ? (recurso?.nombre || "la Maquinaria") : null;
  const tituloResumen = modo === "empresa" ? "Resumen por Empresa" : `Resumen de ${nombreSujeto}`;
  const tituloRequisitos = modo === "empresa" ? "Requisitos - Empresa" : `Requisitos - ${nombreSujeto}`;

  // ¿El requisito entra en el filtro? (ver CHIPS_FILTRO)
  const cumpleFiltro = (r, filtro) => {
    const resultado = resultadoDe(r.id);
    const pendiente = resultado === "pendiente" || resultado === "sin_evaluar";
    if (!filtro) return true;
    if (filtro === "pendiente") return pendiente;
    if (filtro === "vencidos") return estaVencida(r.id);
    if (filtro === "con_problemas") return pendiente || resultado === "no_cumple" || estaVencida(r.id);
    return resultado === filtro;
  };
  const cantidadPorFiltro = Object.fromEntries(
    CHIPS_FILTRO.map((chip) => [chip.value, items.filter((r) => cumpleFiltro(r, chip.value)).length]),
  );
  const itemsFiltradosTabla = items.filter((r) => {
    if (soloInstanciaId) return r.id === soloInstanciaId;
    const term = busqueda.trim().toLowerCase();
    if (term && !`${r.nombre} ${r.nombreCorto || ""}`.toLowerCase().includes(term)) return false;
    return cumpleFiltro(r, filtroResultado);
  });

  return (
    <div className={embebido ? "space-y-4" : "max-w-5xl mx-auto space-y-6"}>
      {/* Header de página (solo en la página completa) */}
      {!embebido && (
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onVolver}
            className="p-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 transition-colors shadow-sm"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h2 className="text-xl font-bold text-gray-900 tracking-tight">
              Evaluación {tituloNivel}
              {nombreSujeto ? ` — ${nombreSujeto}` : ""}
            </h2>
            <p className="text-xs text-gray-500">
              {empresa?.razonSocial || expediente.empresaId} · {proyecto ? `${proyecto.nombre} (${proyecto.codigo})` : expediente.proyectoId}
            </p>
          </div>
        </div>
        {soloLectura && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-500 border border-slate-200">
            Solo lectura {expediente.estado === "cerrado" ? "— Expediente cerrado" : ""}
          </span>
        )}
      </div>
      )}

      {embebido && soloLectura && (
        <p className="text-[11px] text-slate-400 italic">
          Solo lectura{expediente.estado === "cerrado" ? " — Expediente cerrado" : ""}.
        </p>
      )}

      <ErrorBanner message={error} />
      {avisoGeneracion}

      {/* Cumplimiento Documental (donut) + selector de recurso (si corresponde) + Resumen.
          El donut es "genérico" solo si se pasa `resumenGeneral` (estado inicial sin tab del
          Detalle de Expediente, total del Expediente completo); con un tab/sujeto elegido usa sus
          propios conteos, calculados más abajo. items-stretch: las columnas de la fila siempre
          quedan a la misma altura (la más alta), sin medir nada en JS — cada tarjeta centra su
          contenido dentro de ese alto en vez de quedar arriba con espacio vacío debajo.
          ALTURA_MAX_FILA_CUMPLIMIENTO evita que esto crezca sin límite con muchos Personas/
          Maquinarias: el tope lo define el contenido de Cumplimiento Documental (fijo), lo demás
          scrollea internamente en vez de estirar la fila entera. */}
      {mostrarResumen && (
        <div className={`grid grid-cols-1 gap-6 items-stretch ${panelExtra ? "lg:grid-cols-3" : "lg:grid-cols-2"}`}>
          <div className={`bg-white p-6 rounded-2xl border border-gray-100 shadow-card flex flex-col h-full ${ALTURA_MAX_FILA_CUMPLIMIENTO}`}>
            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider pb-3 border-b border-gray-100">
              {tituloCumplimiento}
            </h3>
            <div className="flex-1 min-h-0 flex items-center justify-center py-2">
              <EstadoCumplimientoPanel
                resumen={resumenGeneral || resumenSujeto}
                size={130}
                strokeWidth={13}
              />
            </div>
            {tabsNivel && <div className="pt-3 border-t border-slate-100">{tabsNivel}</div>}
          </div>
          {panelExtra}
          <div className={`bg-white p-6 rounded-2xl border border-gray-100 shadow-card flex flex-col h-full ${ALTURA_MAX_FILA_CUMPLIMIENTO}`}>
            {resumenNiveles ? (
              <div className="flex items-center gap-2.5 pb-3 border-b border-gray-100">
                <EntityIconTile icon={PieChart} />
                <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Resumen</h3>
              </div>
            ) : (
              <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider pb-3 border-b border-gray-100">
                {tituloResumen}
              </h3>
            )}
            <div className="flex-1 min-h-0 pt-4 overflow-y-auto">
              {resumenNiveles || <ResumenCumplimientoLista resumen={resumenSujeto} />}
            </div>
          </div>
        </div>
      )}

      {/* Card: Datos de contexto */}
      {mostrarDatosEvaluacion && (
      <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-card space-y-4">
        <div className="flex items-center gap-2 pb-3 border-b border-gray-100">
          <ClipboardList className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Datos de la Evaluación</h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
          {modo === "empresa" && (
            <>
              <div>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">RUT Empresa</p>
                <p className="text-slate-700 font-medium">{empresa?.rut ? formatRutDisplay(empresa.rut) : "-"}</p>
              </div>
              <div>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Nombre Empresa</p>
                <p className="text-slate-700 font-medium">{empresa?.razonSocial || "-"}</p>
              </div>
            </>
          )}
          {modo === "persona" && (
            <>
              <div>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">RUT Persona</p>
                <p className="text-slate-700 font-medium">{persona?.rut ? formatRutDisplay(persona.rut) : "-"}</p>
              </div>
              <div>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Perfil</p>
                <p className="text-slate-700 font-medium">{perfilesSujeto.length ? nombresPerfiles(perfilesSujeto, perfilesPorId) : "-"}</p>
              </div>
              <div>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Empresa</p>
                <p className="text-slate-700 font-medium">{empresa?.razonSocial || "-"}</p>
              </div>
            </>
          )}
          {modo === "recurso" && (
            <>
              <div>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Marca / Modelo</p>
                <p className="text-slate-700 font-medium">{recurso?.nombre || "-"}</p>
              </div>
              <div>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Clasificación</p>
                <p className="text-slate-700 font-medium">
                  {perfilesSujeto.length ? nombresPerfiles(perfilesSujeto, perfilesPorId) : recurso?.tipo ? formatCatalogo(recurso.tipo) : "-"}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Empresa</p>
                <p className="text-slate-700 font-medium">{empresa?.razonSocial || "-"}</p>
              </div>
            </>
          )}
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Proyecto</p>
            <p className="text-slate-700 font-medium">{proyecto ? `${proyecto.nombre} (${proyecto.codigo})` : "-"}</p>
          </div>
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Tipo Empresa (Perfil)</p>
            <p className="text-slate-700 font-medium">{perfil?.nombre || "-"}</p>
          </div>
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
              Fecha {modo === "empresa" ? "Inicio Participación" : "Inicio Asignación"}
            </p>
            <p className="text-slate-700 font-medium">{formatFecha(participacion?.fechaInicio)}</p>
          </div>
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
              Fecha {modo === "empresa" ? "Fin Participación" : "Fin Asignación"}
            </p>
            <p className="text-slate-700 font-medium">{formatFecha(participacion?.fechaTermino)}</p>
          </div>
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Requerimientos</p>
            <p className="text-slate-700 font-medium">{items.length}</p>
          </div>
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Avance Evaluación</p>
            <p className={`font-bold ${avancePct === null ? "text-slate-400" : "text-carbon-dark"}`}>
              {textoPorcentaje(avancePct)}
            </p>
          </div>
        </div>
      </div>
      )}

      {resultadoGuardado && (
        <div
          className={`p-4 rounded-2xl border text-xs space-y-1 ${
            resultadoGuardado.fallidas.length > 0
              ? "bg-amber-50 border-amber-200 text-amber-800"
              : "bg-sage-lighter border-sage-light text-sage-darker"
          }`}
        >
          {resultadoGuardado.sinCambios ? (
            <p className="font-semibold">No hay cambios para guardar.</p>
          ) : (
            <>
              <p className="font-semibold">
                {resultadoGuardado.guardadas} evaluación{resultadoGuardado.guardadas === 1 ? "" : "es"} guardada
                {resultadoGuardado.guardadas === 1 ? "" : "s"} correctamente.
              </p>
              {resultadoGuardado.fallidas.length > 0 && (
                <div>
                  <p className="font-semibold">{resultadoGuardado.fallidas.length} fallaron:</p>
                  <ul className="list-disc list-inside">
                    {resultadoGuardado.fallidas.map((f, i) => (
                      <li key={i}>{f.nombre}: {f.motivo}</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Tabla de la planilla */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-card overflow-hidden">
        <div className="p-6 pb-0 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">{tituloRequisitos}</h3>
            <div className="flex items-center gap-3">
              {navegacionSujeto && (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    title="Evaluado anterior"
                    disabled={!navegacionSujeto.hayAnterior}
                    onClick={navegacionSujeto.onAnterior}
                    className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-[11px] font-bold text-slate-400 whitespace-nowrap">
                    {navegacionSujeto.posicion} de {navegacionSujeto.total} evaluados
                  </span>
                  <button
                    type="button"
                    title="Siguiente evaluado"
                    disabled={!navegacionSujeto.haySiguiente}
                    onClick={navegacionSujeto.onSiguiente}
                    className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
              {accionRequisitos}
              <span className="text-xs font-bold text-slate-500">
                {cumplidos}/{items.length} completados <span className="text-primary">{textoPorcentaje(avancePct)}</span>
              </span>
            </div>
          </div>
          {items.length > 0 && (
            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative flex-1 min-w-[12rem]">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text" value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscar requisito..."
                  className="w-full pl-8 pr-3 py-2 bg-gray-50/50 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {CHIPS_FILTRO.map((chip) => (
                  <button
                    key={chip.value || "todos"}
                    type="button"
                    onClick={() => setFiltroResultado(chip.value)}
                    className={`px-2.5 py-1.5 rounded-full text-[11px] font-bold border transition-colors ${
                      filtroResultado === chip.value ? "bg-primary text-white border-primary" : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    {chip.label} ({cantidadPorFiltro[chip.value] ?? 0})
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {items.length === 0 ? (
          <div className="p-6">
            <p className="text-xs text-slate-400">
              No hay Requerimientos aplicables para este nivel
              {modo === "persona" ? " y este rol" : ""}.
            </p>
          </div>
        ) : itemsFiltradosTabla.length === 0 ? (
          <div className="p-6">
            <p className="text-xs text-slate-400">Ningún requisito coincide con este filtro.</p>
          </div>
        ) : (
          <div className="overflow-x-auto p-6 pt-4">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  <th className="py-2 pr-3 w-10">N°</th>
                  <th className="py-2 pr-3">Requerimiento</th>
                  <th className="py-2 px-2">Estado</th>
                  <th className="py-2 px-2 text-center w-14">SI</th>
                  <th className="py-2 px-2 text-center w-14">NO</th>
                  <th className="py-2 px-2 text-center w-14">N/A</th>
                  <th className="py-2 pl-3">Observaciones</th>
                  <th className="py-2 pl-2 w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {itemsFiltradosTabla.map((r) => {
                  const index = items.indexOf(r);
                  const respuesta = respuestas[r.id] || { resultado: null, observaciones: "", fechaVencimiento: "" };
                  const evidencia = evidenciaDe(r.id);
                  const resultado = resultadoDe(r.id);
                  // "Cumple" sin documento: la justificación es obligatoria.
                  const conJustificacion = pideJustificacion(r.id);
                  const faltaJustificacion = conJustificacion && intentoGuardar && !(respuesta.observaciones || "").trim();
                  // Ícono IA: en color con la IA habilitada; gris con reglas; gris claro sin reglas.
                  const pauta = pautas?.[r.requerimientoId] || null;
                  const iconoIA = pauta?.estadoIA === "habilitado"
                    ? { clase: "text-primary hover:bg-primary-lighter", texto: "Validación IA disponible" }
                    : pauta?.reglas?.length
                      ? { clase: "text-slate-500 hover:bg-slate-100", texto: "Ver reglas de validación (IA no habilitada)" }
                      : { clase: "text-slate-300 opacity-70 hover:bg-slate-50", texto: "Este requerimiento no tiene reglas de validación definidas" };
                  const filaActiva = activoId === r.id;
                  return (
                    <React.Fragment key={r.id}>
                    <tr data-asistente-ref={`planilla-item-${r.id}`} className={`align-top ${CLASE_RESALTADO} ${filaActiva ? "bg-primary-lighter/40" : ""}`}>
                      <td className="py-3 pr-3 text-slate-400 font-semibold">{index + 1}</td>
                      <td className="py-3 pr-3 max-w-xs">
                        <div className="flex items-start gap-1.5">
                          <p className="font-semibold text-slate-700 whitespace-normal" title={r.nombre}>{r.nombreCorto || r.nombre}</p>
                          {evidencia && (
                            <a
                              href={evidencia.archivoUrl || undefined}
                              target="_blank"
                              rel="noopener noreferrer"
                              title={`Evidencia adjunta: ${evidencia.archivoNombre}`}
                              className="text-primary hover:text-primary-dark flex-shrink-0 mt-0.5"
                            >
                              <Paperclip className="w-3.5 h-3.5" />
                            </a>
                          )}
                        </div>
                        {respuesta.revisionIAId && <p className="mt-1 text-[10px] font-bold text-sage-darker">Propuesta IA aplicada</p>}
                        {!r.requiereVencimiento && respuesta.fechaVencimiento && (
                          // El Requerimiento dejó de pedir vencimiento: la fecha registrada se conserva,
                          // pero ya no es obligatoria y las nuevas evaluaciones no la piden.
                          <div className="mt-2 space-y-0.5">
                            <p className="text-[10px] font-semibold text-slate-400">
                              Fecha vencimiento registrada: <span className="text-slate-600">{formatFecha(respuesta.fechaVencimiento)}</span>
                            </p>
                            <p className="text-[10px] font-semibold text-amber-700">Este requerimiento ya no solicita fecha de vencimiento.</p>
                          </div>
                        )}
                        {r.requiereVencimiento && (
                          <div className="mt-2">
                            <label className="block text-[10px] font-semibold text-slate-400 mb-0.5">
                              Fecha vencimiento{respuesta.resultado === "cumple" ? " *" : ""}
                            </label>
                            <DateInput
                              value={respuesta.fechaVencimiento}
                              disabled={soloLectura}
                              onChange={(e) => handleFechaVencimientoChange(r.id, e.target.value)}
                              className={`px-2 py-1 rounded-lg border text-[11px] disabled:bg-slate-50 disabled:text-slate-400 ${
                                respuesta.resultado === "cumple" && !respuesta.fechaVencimiento ? "border-amber-300 bg-amber-50/40" : "border-slate-200"
                              }`}
                            />
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-2">
                        <span className="inline-flex items-center gap-1">
                          {resultado === "sin_evaluar" ? <InsigniaSinEvaluar /> : <StatusBadge value={resultado} map={MAPA_EVALUACION} />}
                          <OrigenEvaluacion evaluacion={vigenteDe(r.id)} />
                        </span>
                        <PropuestaIAPendiente propuesta={datosSujeto.propuestas?.get(r.id)} expedienteId={expedienteId} />
                        {vencimientosPorInstancia?.[r.id] && (
                          <span className={`mt-1 inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap ${CLASE_VENCIMIENTO[vencimientosPorInstancia[r.id].clasificacion] || ""}`}>
                            {textoVencimiento(vencimientosPorInstancia[r.id].dias)}
                          </span>
                        )}
                      </td>
                      {OPCIONES_RESULTADO.map((opt) => (
                        <td key={opt.value} className="py-3 px-2 text-center">
                          <input
                            type="radio"
                            name={`resultado-${r.id}`}
                            checked={respuesta.resultado === opt.value}
                            disabled={soloLectura}
                            onChange={() => handleResultadoChange(r.id, opt.value)}
                            // Volver a presionar la opción marcada la desmarca (onChange no se
                            // dispara en un radio ya marcado).
                            onClick={() => { if (respuesta.resultado === opt.value) handleResultadoChange(r.id, null); }}
                            className="w-4 h-4 accent-primary disabled:cursor-not-allowed"
                          />
                        </td>
                      ))}
                      <td className="py-3 pl-3 min-w-[220px]">
                        <textarea
                          value={respuesta.observaciones}
                          disabled={soloLectura}
                          onChange={(e) => handleObservacionesChange(r.id, e.target.value)}
                          placeholder={conJustificacion
                            ? "Justificación obligatoria * (ej. verificado en terreno el …)"
                            : "Si tienes algún comentario, escríbelo aquí"}
                          rows={2}
                          aria-invalid={faltaJustificacion}
                          aria-label={conJustificacion ? "Justificación obligatoria" : "Observaciones"}
                          title={conJustificacion ? "Justificación obligatoria: Cumple sin documento adjunto" : undefined}
                          // Sin rótulo extra (no cambia el alto de la fila): obligatoria y vacía, en ámbar;
                          // al intentar guardar sin ella, en rojo.
                          className={`w-full px-2.5 py-1.5 rounded-lg border text-xs resize-y disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed ${
                            faltaJustificacion ? "border-red-400 bg-red-50/30"
                              : conJustificacion && !(respuesta.observaciones || "").trim() ? "border-amber-300 bg-amber-50/50 placeholder:text-amber-700/70"
                                : "border-slate-200"
                          }`}
                        />
                        {faltaJustificacion && (
                          <p className="mt-0.5 text-[10px] font-semibold text-red-500">La justificación es obligatoria.</p>
                        )}
                        {/* Con documento la verificación es documental. Solo un "Cumple" SIN documento pide
                            cómo se verificó y una justificación; los demás resultados no la exigen. */}
                        {esResuelto(respuesta.resultado) && evidencia && (
                          <p className="mt-1 text-[10px] font-semibold text-slate-400">Verificación documental</p>
                        )}
                      </td>
                      <td className="py-3 pl-2 text-right whitespace-nowrap">
                        {abrirRequerimiento && (
                          <button
                            type="button"
                            title={iconoIA.texto}
                            aria-label={`Revisión IA de ${r.nombreCorto || r.nombre}: ${iconoIA.texto}`}
                            aria-pressed={filaActiva}
                            onClick={() => abrirRequerimiento(filaActiva ? null : datosPanelIA(r))}
                            className={`relative p-1.5 rounded-lg ${iconoIA.clase} ${filaActiva ? "ring-2 ring-primary/30" : ""}`}
                          >
                            <Bot className="w-4 h-4" />
                            {estadoIA.propuestas.has(r.id) && (
                              <span className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-amber-500 ring-2 ring-white" aria-hidden="true" />
                            )}
                          </button>
                        )}
                        {puedeAdjuntar && (
                          <button
                            type="button"
                            title="Adjuntar Evidencia"
                            onClick={() => abrirAdjuntar(r.id)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-primary hover:bg-slate-50"
                          >
                            <UploadCloud className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {!soloLectura && items.length > 0 && (
        <div className="flex items-center justify-end gap-2">
          <ActionButton variant="primary" busy={guardando} busyLabel="Guardando..." onClick={handleGuardar}>
            Guardar Evaluación
          </ActionButton>
        </div>
      )}

      {requerimientoAdjuntando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={subiendoEvidencia ? undefined : () => setRequerimientoAdjuntando(null)}>
          <div className="bg-white rounded-2xl shadow-dropdown w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h3 className="text-sm font-bold text-carbon-dark uppercase tracking-wider">Adjuntar Evidencia</h3>
              <button type="button" onClick={() => setRequerimientoAdjuntando(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-[11px] text-slate-500">
                {items.find((r) => r.id === requerimientoAdjuntando)?.nombre}
                {nombreSujeto ? ` · ${nombreSujeto}` : ""}
              </p>
              <ErrorBanner message={errorAdjunto} />
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">Archivo</label>
                <input
                  type="file"
                  accept="application/pdf,image/*"
                  onChange={(e) => setArchivoAdjunto(e.target.files?.[0] || null)}
                  className="block w-full text-xs text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-primary-lighter file:text-primary file:text-xs file:font-semibold"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">Fecha de Vencimiento (opcional)</label>
                <DateInput
                  value={fechaVencimientoAdjunto}
                  onChange={(e) => setFechaVencimientoAdjunto(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-1">
                <ActionButton disabled={subiendoEvidencia} onClick={() => setRequerimientoAdjuntando(null)}>Cancelar</ActionButton>
                <ActionButton variant="primary" busy={subiendoEvidencia} busyLabel="Subiendo..." onClick={confirmarAdjuntarEvidencia}>
                  Confirmar
                </ActionButton>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
