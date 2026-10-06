import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Paperclip,
  PieChart,
  Search,
  UploadCloud,
  X,
} from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { expedienteService } from "../../services/expedienteService";
import { proyectoService } from "../../services/proyectoService";
import { empresaService } from "../../services/empresaService";
import { perfilParticipacionService } from "../../services/perfilParticipacionService";
import { participacionService } from "../../services/participacionService";
import { evaluacionService } from "../../services/evaluacionService";
import { evidenciaService } from "../../services/evidenciaService";
import { evidenciaRequerimientoService } from "../../services/evidenciaRequerimientoService";
import { personaService } from "../../services/personaService";
import { recursoService } from "../../services/recursoService";
import { asignacionService } from "../../services/asignacionService";
import { aplicaRequerimientoASujeto } from "../../utils/aplicabilidadRequerimiento";
import { formatCatalogo } from "../../utils/formatCatalogo";
import { formatFecha } from "../../utils/fechaFormatters";
import { formatRutDisplay } from "../../utils/rutFormatters";
import { calcularConteosEvaluacion } from "../../utils/cumplimientoCalculos";
import { ErrorBanner } from "../../components/shared/ErrorBanner";
import { ActionButton } from "../../components/shared/ActionButton";
import { StatusBadge, MAPA_EVALUACION } from "../../components/shared/StatusBadge";
import { EstadoCumplimientoPanel } from "../../components/shared/EstadoCumplimientoPanel";
import { ResumenCumplimientoLista } from "../../components/shared/ResumenCumplimientoLista";
import { EntityIconTile } from "../../components/shared/EntityIconTile";

const OPCIONES_RESULTADO = [
  { value: "cumple", label: "SI" },
  { value: "no_cumple", label: "NO" },
  { value: "no_aplica", label: "N/A" },
];

// Tope de altura de la fila Cumplimiento Documental/Selector/Resumen: sin esto, con
// items-stretch, una lista larga de Personas/Maquinarias (30, 50...) estira las 3 columnas a su
// propio alto — la tarjeta que manda es "Cumplimiento Documental" (contenido fijo: donut+switch,
// nunca crece con la cantidad de datos), las otras dos quedan acotadas a lo mismo y scrollean
// internamente si no alcanza (mismo valor en SelectorRecursoAsignado.jsx, que vive en otro archivo).
const ALTURA_MAX_FILA_CUMPLIMIENTO = "max-h-96";

// "Sin Evaluar" (Requerimiento aún sin ninguna Evaluación vigente) no es un resultado de
// evaluación en sí — se muestra con este estilo propio junto a los de MAPA_EVALUACION.
const CLASE_SIN_EVALUAR = "bg-slate-100 text-slate-500 border-slate-200";
const InsigniaSinEvaluar = () => (
  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap ${CLASE_SIN_EVALUAR}`}>
    Sin Evaluar
  </span>
);

const CHIPS_FILTRO = [
  { value: "", label: "Todos" },
  { value: "cumple", label: "Cumplen" },
  { value: "pendiente", label: "Pendientes" },
  { value: "no_cumple", label: "No Cumplen" },
  { value: "sin_evaluar", label: "Sin Evaluar" },
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
// `conteosGenerales`/`sinEvaluarGeneral` y `resumenNiveles` son overrides "genéricos" del donut y
// del Resumen: si se pasan, esas dos tarjetas dejan de depender del sujeto seleccionado (el
// Detalle de Expediente los usa para mostrar el total del Expediente y el avance por nivel, sin
// que cambien al cambiar de pestaña) — sin ellos, ambas tarjetas siguen mostrando lo del sujeto.
// `personaConocida`/`recursoConocido`/`rolConocido`: cuando quien la usa YA tiene esos datos
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
export const PlanillaEvaluacion = ({
  expedienteId, personaId, recursoId, onVolver, onGuardado, embebido = false,
  mostrarDatosEvaluacion = !embebido, mostrarResumen = false, panelExtra = null,
  nivel = null, tabsNivel = null, conteosGenerales = null, sinEvaluarGeneral = 0,
  resumenNiveles = null, personaConocida = null, recursoConocido = null, rolConocido = null,
  perfilRecursoIdConocido = null,
  tituloCumplimiento = "Cumplimiento Documental", navegacionSujeto = null,
  accionRequisitos = null, recargarSenal = 0,
}) => {
  const { profile } = useAuth();
  const puedeEvaluar = ["superadmin", "evaluador"].includes(profile?.rol);
  const puedeAdjuntarEvidencia = ["superadmin", "mandante_admin"].includes(profile?.rol);

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
  const [rolPersonaEnProyecto, setRolPersonaEnProyecto] = useState(null);
  // Perfil de Recurso del sujeto (de su Asignación activa en el Proyecto): define qué
  // Requerimientos acotados a perfiles le aplican.
  const [perfilRecursoSujeto, setPerfilRecursoSujeto] = useState(null);
  const [recurso, setRecurso] = useState(null);
  const [vigentes, setVigentes] = useState([]);
  const [vinculos, setVinculos] = useState([]);
  const [evidencias, setEvidencias] = useState([]);

  const [respuestas, setRespuestas] = useState({});

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [resultadoGuardado, setResultadoGuardado] = useState(null);

  // Búsqueda y filtro por resultado de la tabla (solo afecta qué filas se muestran, no las
  // respuestas en memoria ni el guardado).
  const [busqueda, setBusqueda] = useState("");
  const [filtroResultado, setFiltroResultado] = useState("");

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
        proyectoData, empresaData, perfilData, participacionData, vigentesData,
        vinculosData, evidenciasData,
      ] = await Promise.all([
        proyectoService.obtenerPorId(expedienteData.proyectoId).catch(() => null),
        empresaService.obtenerPorId(expedienteData.empresaId).catch(() => null),
        perfilParticipacionService.obtenerPorId(expedienteData.perfilParticipacionId).catch(() => null),
        participacionService.obtenerPorId(expedienteData.participacionId).catch(() => null),
        evaluacionService.listarPorExpediente(expedienteData.id, false).catch(() => []),
        evidenciaRequerimientoService.listarPorExpediente(expedienteData.id).catch(() => []),
        evidenciaService.listar({ expedienteId: expedienteData.id }).catch(() => []),
      ]);

      setProyecto(proyectoData);
      setEmpresa(empresaData);
      setPerfil(perfilData);
      setParticipacion(participacionData);
      setVigentes(vigentesData || []);
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

  // Datos del sujeto (persona/recurso + su rol): si el padre ya los tiene (personaConocida/
  // recursoConocido/rolConocido — caso del Detalle de Expediente), se usan tal cual, sin red — el
  // cambio de sujeto queda resuelto en el mismo tick, sin ningún loading. Sin ellos (caso de
  // EvaluarExpedientePage/RequerimientosProyecto) se resuelven con un fetch propio, como siempre.
  useEffect(() => {
    let vigente = true;
    if (modo === "persona" && personaId) {
      if (personaConocida) {
        setPersona(personaConocida);
        setRolPersonaEnProyecto(rolConocido ?? null);
        setPerfilRecursoSujeto(perfilRecursoIdConocido ?? null);
        return undefined;
      }
      if (!expediente) return undefined;
      Promise.all([
        personaService.obtenerPorId(personaId).catch(() => null),
        personaService.obtenerResumen(personaId).catch(() => null),
      ]).then(([personaData, resumenPersonaData]) => {
        if (!vigente) return;
        setPersona(personaData);
        const asignacionEnEsteProyecto = (resumenPersonaData?.asignacionesActivas || [])
          .find((a) => a.proyectoId === expediente.proyectoId);
        setRolPersonaEnProyecto(asignacionEnEsteProyecto?.rol || null);
        setPerfilRecursoSujeto(asignacionEnEsteProyecto?.perfilRecursoId || null);
      });
    } else if (modo === "recurso" && recursoId) {
      if (recursoConocido) {
        setRecurso(recursoConocido);
        setPerfilRecursoSujeto(perfilRecursoIdConocido ?? null);
        return undefined;
      }
      if (!expediente) return undefined;
      Promise.all([
        recursoService.obtenerPorId(recursoId).catch(() => null),
        asignacionService.listar({ recursoId, estado: "activa" }).catch(() => []),
      ]).then(([recursoData, asignacionesData]) => {
        if (!vigente) return;
        setRecurso(recursoData);
        const asignacionEnEsteProyecto = (asignacionesData || [])
          .find((a) => a.proyectoId === expediente.proyectoId);
        setPerfilRecursoSujeto(asignacionEnEsteProyecto?.perfilRecursoId || null);
      });
    } else {
      setPersona(null);
      setRecurso(null);
      setRolPersonaEnProyecto(null);
      setPerfilRecursoSujeto(null);
    }
    return () => { vigente = false; };
  }, [modo, personaId, recursoId, personaConocida, recursoConocido, rolConocido, perfilRecursoIdConocido, expediente]);

  const soloLectura = !puedeEvaluar || expediente?.estado === "cerrado";
  const puedeAdjuntar = puedeAdjuntarEvidencia && expediente?.estado !== "cerrado";

  const items = useMemo(() => {
    if (!expediente) return [];
    // Regla única de aplicabilidad (utils/aplicabilidadRequerimiento.js).
    const sujeto = { tipoEntidad: modo, perfilRecursoId: perfilRecursoSujeto };
    return (expediente.requerimientosAplicables || []).filter(
      (r) => aplicaRequerimientoASujeto(r, sujeto),
    );
  }, [expediente, modo, perfilRecursoSujeto]);

  // Precarga de "respuestas" (el formulario en memoria) a partir de las evaluaciones vigentes ya
  // cargadas — puro cálculo en cliente, sin red, así que corre instantáneo cada vez que cambia el
  // sujeto (items/vigentes ya están en memoria desde cargarBase).
  useEffect(() => {
    const respuestasIniciales = {};
    items.forEach((r) => {
      const vigente = vigentes.find((v) =>
        v.requerimientoId === r.requerimientoId &&
        (v.personaId || null) === (modo === "persona" ? personaId : null) &&
        (v.recursoId || null) === (modo === "recurso" ? recursoId : null),
      );
      respuestasIniciales[r.requerimientoId] = {
        resultado: vigente?.resultado || null,
        observaciones: vigente?.observaciones || "",
        metodoVerificacion: vigente?.metodoVerificacion && vigente.metodoVerificacion !== "documental"
          ? vigente.metodoVerificacion : "",
        fechaVencimiento: vigente?.fechaVencimiento ? formatFechaInput(vigente.fechaVencimiento) : "",
      };
    });
    setRespuestas(respuestasIniciales);
  }, [items, vigentes, modo, personaId, recursoId]);

  const handleResultadoChange = (requerimientoId, resultado) => {
    setRespuestas((prev) => ({
      ...prev,
      [requerimientoId]: { ...prev[requerimientoId], resultado },
    }));
  };

  const handleObservacionesChange = (requerimientoId, observaciones) => {
    setRespuestas((prev) => ({
      ...prev,
      [requerimientoId]: { ...prev[requerimientoId], observaciones },
    }));
  };

  const handleMetodoChange = (requerimientoId, metodoVerificacion) => {
    setRespuestas((prev) => ({
      ...prev,
      [requerimientoId]: { ...prev[requerimientoId], metodoVerificacion },
    }));
  };

  const handleFechaVencimientoChange = (requerimientoId, fechaVencimiento) => {
    setRespuestas((prev) => ({
      ...prev,
      [requerimientoId]: { ...prev[requerimientoId], fechaVencimiento },
    }));
  };

  const evidenciaDe = (requerimientoId) => {
    // Se revisan TODOS los vínculos del Requerimiento (no solo el primero): puede haber una
    // evidencia por cada Persona/Maquinaria para el mismo Requerimiento.
    const ids = vinculos
      .filter((v) => v.requerimientoId === requerimientoId && v.estado === "activo")
      .map((v) => v.evidenciaId);
    return evidencias.find((e) => {
      if (!ids.includes(e.id)) return false;
      if (modo === "persona") return e.personaId === personaId;
      if (modo === "recurso") return e.recursoId === recursoId;
      return !e.personaId && !e.recursoId;
    }) || null;
  };

  const vigenteDe = (requerimientoId) =>
    vigentes.find((v) =>
      v.requerimientoId === requerimientoId &&
      (v.personaId || null) === (modo === "persona" ? personaId : null) &&
      (v.recursoId || null) === (modo === "recurso" ? recursoId : null),
    ) || null;

  const resultadoDe = (requerimientoId) => vigenteDe(requerimientoId)?.resultado || "sin_evaluar";

  // Una fila "modificada" es aquella cuyo resultado, observaciones o fecha
  // de vencimiento difieren de la evaluación vigente de ESTE individuo (o,
  // si nunca hubo vigente, cualquiera que ya tenga un resultado marcado).
  const esModificada = (requerimientoId) => {
    const actual = respuestas[requerimientoId];
    if (!actual || !actual.resultado) return false;
    const vigente = vigenteDe(requerimientoId);
    if (!vigente) return true;
    const observacionesActual = (actual.observaciones || "").trim();
    const observacionesVigente = (vigente.observaciones || "").trim();
    const fechaVencimientoVigente = vigente.fechaVencimiento
      ? formatFechaInput(vigente.fechaVencimiento) : "";
    // Sin documento adjunto, el método de verificación también cuenta como cambio.
    const metodoVigente = vigente.metodoVerificacion && vigente.metodoVerificacion !== "documental"
      ? vigente.metodoVerificacion : "";
    const cambioMetodo = !evidenciaDe(requerimientoId) && (actual.metodoVerificacion || "") !== metodoVigente;
    return (
      actual.resultado !== vigente.resultado ||
      observacionesActual !== observacionesVigente ||
      (actual.fechaVencimiento || "") !== fechaVencimientoVigente ||
      cambioMetodo
    );
  };

  const esResuelto = (resultado) => ["cumple", "no_cumple", "no_aplica"].includes(resultado);

  // Evaluar NO exige documentos: sin evidencia adjunta hay que indicar cómo se verificó
  // (presencial/otro) y dejar una justificación en Observaciones. Devuelve el motivo si falta algo.
  const motivoInvalido = (requerimientoId) => {
    const respuesta = respuestas[requerimientoId];
    if (!esResuelto(respuesta?.resultado) || evidenciaDe(requerimientoId)) return null;
    if (!respuesta.metodoVerificacion) {
      return "Sin documento adjunto: indica el método de verificación (Presencial u Otro).";
    }
    if (!(respuesta.observaciones || "").trim()) {
      return "Sin documento adjunto: la justificación (Observaciones) es obligatoria.";
    }
    return null;
  };

  const handleGuardar = async () => {
    const modificadosTodos = items.filter((r) => esModificada(r.requerimientoId));

    if (modificadosTodos.length === 0) {
      setResultadoGuardado({ guardadas: 0, fallidas: [], sinCambios: true });
      return;
    }

    // Las filas incompletas se reportan sin llamar a la API; el resto se guarda igual.
    const invalidas = modificadosTodos
      .map((r) => ({ r, motivo: motivoInvalido(r.requerimientoId) }))
      .filter((x) => x.motivo);
    const modificados = modificadosTodos.filter((r) => !motivoInvalido(r.requerimientoId));

    setGuardando(true);
    setResultadoGuardado(null);
    setError(null);

    const resultados = await Promise.allSettled(
      modificados.map((r) => {
        const respuesta = respuestas[r.requerimientoId];
        const payload = {
          expedienteId: expediente.id,
          requerimientoId: r.requerimientoId,
          resultado: respuesta.resultado,
          observaciones: respuesta.observaciones?.trim() || null,
        };
        if (esResuelto(respuesta.resultado) && !evidenciaDe(r.requerimientoId)) {
          payload.metodoVerificacion = respuesta.metodoVerificacion;
        }
        if (modo === "persona") payload.personaId = personaId;
        if (modo === "recurso") payload.recursoId = recursoId;
        if (r.requiereVencimiento && respuesta.fechaVencimiento) {
          payload.fechaVencimiento = respuesta.fechaVencimiento;
        }
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
    if (modificados.length > 0) await cargarBase(true);
    if (guardadas > 0) onGuardado?.();
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
        requerimientoId: requerimientoAdjuntando,
        personaId: modo === "persona" ? personaId : null,
        recursoId: modo === "recurso" ? recursoId : null,
        fechaVencimiento: fechaVencimientoAdjunto || null,
      });
      await cargarBase(true);
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
                  conteos={conteosGenerales || { cumple: 0, no_cumple: 0, pendiente: 0, no_aplica: 0 }}
                  sinEvaluar={conteosGenerales ? sinEvaluarGeneral : 0}
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

  // vigentes de ESTE sujeto puntual (persona/recurso/empresa) para SUS requisitos aplicables —
  // a diferencia de una simple coincidencia por requerimientoId, que mezclaría datos de otras
  // Personas/Maquinarias cuando un mismo Requerimiento aplica a varias.
  const vigentesDeEsteSujeto = items.map((r) => vigenteDe(r.requerimientoId)).filter(Boolean);
  const { conteos, avancePct } = calcularConteosEvaluacion(vigentesDeEsteSujeto);
  const sinEvaluarCount = Math.max(0, items.length - vigentesDeEsteSujeto.length);

  const tituloNivel = modo === "empresa" ? "Empresa" : modo === "persona" ? "Persona" : "Maquinaria";
  const nombreSujeto = modo === "persona"
    ? (persona ? `${persona.nombre} ${persona.apellido}`.trim() : "la Persona")
    : modo === "recurso" ? (recurso?.nombre || "la Maquinaria") : null;
  const tituloResumen = modo === "empresa" ? "Resumen por Empresa" : `Resumen de ${nombreSujeto}`;
  const tituloRequisitos = modo === "empresa" ? "Requisitos - Empresa" : `Requisitos - ${nombreSujeto}`;

  const itemsFiltradosTabla = items.filter((r) => {
    const term = busqueda.trim().toLowerCase();
    if (term && !r.nombre.toLowerCase().includes(term)) return false;
    if (filtroResultado && resultadoDe(r.requerimientoId) !== filtroResultado) return false;
    return true;
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

      {/* Cumplimiento Documental (donut) + selector de recurso (si corresponde) + Resumen.
          El donut es "genérico" solo si se pasa `conteosGenerales` (estado inicial sin tab del
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
                conteos={conteosGenerales || conteos}
                sinEvaluar={conteosGenerales ? sinEvaluarGeneral : sinEvaluarCount}
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
              {resumenNiveles || <ResumenCumplimientoLista conteos={conteos} sinEvaluar={sinEvaluarCount} />}
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
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Rol</p>
                <p className="text-slate-700 font-medium">{rolPersonaEnProyecto || "-"}</p>
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
                <p className="text-slate-700 font-medium">{recurso?.tipo ? formatCatalogo(recurso.tipo) : "-"}</p>
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
              {avancePct === null ? "Sin datos" : `${avancePct}%`}
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
                {conteos.cumple}/{items.length} completados <span className="text-primary">{items.length > 0 ? Math.round((conteos.cumple / items.length) * 100) : 0}%</span>
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
                    {chip.label}
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
                  <th className="py-2 px-2 w-28">Cumplimiento</th>
                  <th className="py-2 pl-2 w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {itemsFiltradosTabla.map((r) => {
                  const index = items.indexOf(r);
                  const respuesta = respuestas[r.requerimientoId] || { resultado: null, observaciones: "", fechaVencimiento: "" };
                  const evidencia = evidenciaDe(r.requerimientoId);
                  const resultado = resultadoDe(r.requerimientoId);
                  const pctFila = resultado === "cumple" ? 100 : 0;
                  return (
                    <tr key={r.requerimientoId} className="align-top">
                      <td className="py-3 pr-3 text-slate-400 font-semibold">{index + 1}</td>
                      <td className="py-3 pr-3 max-w-xs">
                        <div className="flex items-start gap-1.5">
                          <p className="font-semibold text-slate-700 whitespace-normal">{r.nombre}</p>
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
                        {r.requiereVencimiento && (
                          <div className="mt-2">
                            <label className="block text-[10px] font-semibold text-slate-400 mb-0.5">Fecha vencimiento</label>
                            <input
                              type="date"
                              value={respuesta.fechaVencimiento}
                              disabled={soloLectura}
                              onChange={(e) => handleFechaVencimientoChange(r.requerimientoId, e.target.value)}
                              className="px-2 py-1 rounded-lg border border-slate-200 text-[11px] disabled:bg-slate-50 disabled:text-slate-400"
                            />
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-2">
                        {resultado === "sin_evaluar" ? <InsigniaSinEvaluar /> : <StatusBadge value={resultado} map={MAPA_EVALUACION} />}
                      </td>
                      {OPCIONES_RESULTADO.map((opt) => (
                        <td key={opt.value} className="py-3 px-2 text-center">
                          <input
                            type="radio"
                            name={`resultado-${r.requerimientoId}`}
                            checked={respuesta.resultado === opt.value}
                            disabled={soloLectura}
                            onChange={() => handleResultadoChange(r.requerimientoId, opt.value)}
                            className="w-4 h-4 accent-primary disabled:cursor-not-allowed"
                          />
                        </td>
                      ))}
                      <td className="py-3 pl-3 min-w-[220px]">
                        <textarea
                          value={respuesta.observaciones}
                          disabled={soloLectura}
                          onChange={(e) => handleObservacionesChange(r.requerimientoId, e.target.value)}
                          placeholder={esResuelto(respuesta.resultado) && !evidencia
                            ? "Justificación obligatoria (ej. verificado en terreno el …)"
                            : "Si tienes algún comentario, escríbelo aquí"}
                          rows={2}
                          className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs resize-y disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed"
                        />
                        {/* Método de verificación: solo si la fila ya tiene un resultado y NO hay documento
                            adjunto — con documento es "documental" y no hay nada que elegir. */}
                        {esResuelto(respuesta.resultado) && (
                          evidencia ? (
                            <p className="mt-1 text-[10px] font-semibold text-slate-400">Verificación documental</p>
                          ) : (
                            <select
                              value={respuesta.metodoVerificacion || ""}
                              disabled={soloLectura}
                              onChange={(e) => handleMetodoChange(r.requerimientoId, e.target.value)}
                              className={`mt-1.5 w-full px-2 py-1 rounded-lg border text-[11px] disabled:bg-slate-50 disabled:text-slate-400 ${
                                respuesta.metodoVerificacion ? "border-slate-200" : "border-amber-300 bg-amber-50/40"
                              }`}
                            >
                              <option value="">Método de verificación…</option>
                              <option value="presencial">Presencial (en terreno)</option>
                              <option value="otro">Otro</option>
                            </select>
                          )
                        )}
                      </td>
                      <td className="py-3 px-2">
                        {resultado === "no_aplica" ? (
                          <span className="text-slate-400">N/A</span>
                        ) : (
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                              <div className="h-full bg-sage-dark rounded-full" style={{ width: `${pctFila}%` }} />
                            </div>
                            <span className="font-bold text-slate-500 w-8 text-right">{pctFila}%</span>
                          </div>
                        )}
                      </td>
                      <td className="py-3 pl-2 text-right">
                        {puedeAdjuntar && (
                          <button
                            type="button"
                            title="Adjuntar Evidencia"
                            onClick={() => abrirAdjuntar(r.requerimientoId)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-primary hover:bg-slate-50"
                          >
                            <UploadCloud className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
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
                {items.find((r) => r.requerimientoId === requerimientoAdjuntando)?.nombre}
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
                <input
                  type="date"
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

// Formatea un Timestamp/Date/string a "YYYY-MM-DD" para precargar un
// <input type="date">.
function formatFechaInput(valor) {
  if (!valor) return "";
  const date = valor._seconds ? new Date(valor._seconds * 1000) : new Date(valor);
  if (isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}
