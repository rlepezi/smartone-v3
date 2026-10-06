import React, { useEffect, useRef, useState } from "react";
import { getMandanteDisplayName } from "../../utils/mandanteDisplay";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft, ClipboardList, LayoutGrid, CheckCircle2,
  History, ChevronDown, ChevronUp, ChevronRight, Download, Building2, Users, Truck, ArrowRightCircle,
  ListPlus,
} from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { expedienteService, ESTADOS_EXPEDIENTE, TRANSICIONES_VALIDAS } from "../../services/expedienteService";
import { proyectoService } from "../../services/proyectoService";
import { empresaService } from "../../services/empresaService";
import { perfilParticipacionService } from "../../services/perfilParticipacionService";
import { evaluacionService } from "../../services/evaluacionService";
import { evidenciaService } from "../../services/evidenciaService";
import { evidenciaRequerimientoService } from "../../services/evidenciaRequerimientoService";
import { asignacionService } from "../../services/asignacionService";
import { personaService } from "../../services/personaService";
import { recursoService } from "../../services/recursoService";
import { describirEvento } from "../../utils/bitacoraFormatters";
import { formatTiempoRelativo } from "../../utils/fechaFormatters";
import { ErrorBanner } from "../../components/shared/ErrorBanner";
import { ActionButton } from "../../components/shared/ActionButton";
import { RowActionsMenu } from "../../components/shared/RowActionsMenu";
import { MandanteChip } from "../../components/shared/MandanteChip";
import { EmpresaChip } from "../../components/shared/EmpresaChip";
import { EstadoExpedienteStepper } from "../../components/shared/EstadoExpedienteStepper";
import { EntityIconTile } from "../../components/shared/EntityIconTile";
import { formatCatalogo } from "../../utils/formatCatalogo";
import { aplicaRequerimientoASujeto, sujetoDeAsignacion } from "../../utils/aplicabilidadRequerimiento";
import { mandanteService } from "../../services/mandanteService";
import { formatRutDisplay } from "../../utils/rutFormatters";
import { calcularConteosEvaluacion, calcularResumenCumplimiento } from "../../utils/cumplimientoCalculos";
import { KpiAnillo } from "../../components/shared/DetalleUI";
import { PlanillaEvaluacion } from "../../components/expedientes/PlanillaEvaluacion";
import { SelectorRecursoAsignado } from "../../components/expedientes/SelectorRecursoAsignado";
import { ConfigurarRequerimientosModal } from "../../components/perfiles-participacion/ConfigurarRequerimientosModal";

const ESTADO_MAP = ESTADOS_EXPEDIENTE.reduce((acc, e) => {
  acc[e.value] = { label: e.label, className: e.color };
  return acc;
}, {});

// Criterio de "Pendientes" vs "Evaluadas" para las sub-pestañas del selector de recurso —
// aislado en su propia función, con nombre explícito, para poder ajustarlo después sin tocar el
// resto del componente. Default: Pendiente = al menos un requisito Sin Evaluar o con resultado
// "pendiente"; Evaluada = el 100% de sus requisitos aplicables ya está resuelto
// (Cumple/No Cumple/No Aplica), sin ninguno Sin Evaluar ni Pendiente.
// `totalAplicable === 0` (nadie tiene ningún Requerimiento para su función/nivel) queda Pendiente
// también, nunca Evaluada — "0 de 0" es matemáticamente 100%, pero no hay nada resuelto de
// verdad: casi siempre indica una función mal asignada, y merece revisión, no pasar desapercibido.
const calcularEstadoAsignacion = ({ conteos, sinEvaluar, totalAplicable }) => (
  (totalAplicable === 0 || sinEvaluar > 0 || conteos.pendiente > 0) ? "pendiente" : "evaluada"
);

// Construyen los ítems del selector (avancePct/estado) para Personas/Maquinarias — funciones
// puras (todo por parámetro, nada de closures) para poder llamarlas tanto en el render (con el
// estado ya en memoria) como justo después de Guardar Evaluación, con los datos recién pedidos al
// servidor, SIN esperar a que termine el siguiente render (evita la sugerencia de "seguir con el
// siguiente pendiente" trabajando con datos todavía viejos).
// Requerimientos del snapshot que aplican al sujeto de una Asignación (Persona o Maquinaria),
// según la regla única de utils/aplicabilidadRequerimiento.js.
const requerimientosDeAsignacion = (expedienteData, asignacion) => {
  const sujeto = sujetoDeAsignacion(asignacion);
  return (expedienteData.requerimientosAplicables || [])
    .filter((r) => aplicaRequerimientoASujeto(r, sujeto));
};

const construirPersonasItems = (expedienteData, evaluacionesData, personasAsignadas, personasOptions) => {
  const vigentesExpediente = evaluacionesData.filter((e) => e.estado === "vigente");
  return personasAsignadas.map((a) => {
    const p = personasOptions.find((x) => x.id === a.personaId);
    const reqs = requerimientosDeAsignacion(expedienteData, a);
    const vigentesDeElla = vigentesExpediente.filter((v) =>
      v.personaId === a.personaId && reqs.some((r) => r.requerimientoId === v.requerimientoId));
    const { conteos, avancePct } = calcularConteosEvaluacion(vigentesDeElla);
    const sinEvaluar = Math.max(0, reqs.length - vigentesDeElla.length);
    return {
      id: a.personaId,
      nombre: p ? `${p.nombre} ${p.apellido || ""}`.trim() : a.personaId,
      subtitulo: a.rol ? formatCatalogo(a.rol) : "",
      busqueda: p?.rut || "",
      avancePct,
      estado: calcularEstadoAsignacion({ conteos, sinEvaluar, totalAplicable: reqs.length }),
    };
  });
};

const construirRecursosItems = (expedienteData, evaluacionesData, recursosAsignados, recursosOptions) => {
  const vigentesExpediente = evaluacionesData.filter((e) => e.estado === "vigente");
  return recursosAsignados.map((a) => {
    const r = recursosOptions.find((x) => x.id === a.recursoId);
    const requerimientosMaquinaria = requerimientosDeAsignacion(expedienteData, a);
    const vigentesDeEl = vigentesExpediente.filter((v) =>
      v.recursoId === a.recursoId && requerimientosMaquinaria.some((req) => req.requerimientoId === v.requerimientoId));
    const { conteos, avancePct } = calcularConteosEvaluacion(vigentesDeEl);
    const sinEvaluar = Math.max(0, requerimientosMaquinaria.length - vigentesDeEl.length);
    return {
      id: a.recursoId,
      nombre: r?.nombre || a.recursoId,
      subtitulo: r?.tipo ? formatCatalogo(r.tipo) : "",
      busqueda: r?.patente || "",
      avancePct,
      estado: calcularEstadoAsignacion({ conteos, sinEvaluar, totalAplicable: requerimientosMaquinaria.length }),
    };
  });
};

// "general" es una pestaña más del switch (no un estado sin selección aparte): permite volver en
// cualquier momento a la vista comparativa de los 3 niveles, sin la restricción de "sin vuelta
// atrás" que sí aplica entre Empresa/Personas/Maquinarias — arranca seleccionada por defecto.
const NIVELES = [
  { key: "general", label: "General", Icono: LayoutGrid },
  { key: "empresa", label: "Empresa", Icono: Building2 },
  { key: "persona", label: "Personas", Icono: Users },
  { key: "recurso", label: "Maquinarias", Icono: Truck },
];

// Switch General/Empresa/Personas/Maquinarias — vive dentro de la tarjeta "Cumplimiento
// Documental" de la Planilla (se le pasa como `tabsNivel`), no como barra aparte, para que cambiar
// de nivel se sienta como cambiar de vista de una misma tarjeta y no como navegar a otra sección.
// Grid 2x2 (no una fila de 4): con 4 pestañas en una sola fila, forzarlas a caber comprimía o
// cortaba "Maquinarias" en la tarjeta angosta de 3 columnas (Personas/Maquinarias); en 2 filas de
// 2 cada botón tiene la mitad del ancho de la tarjeta para su propio texto, siempre completo, sin
// scroll ni recorte.
const SelectorNivel = ({ activo, onChange }) => (
  <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-slate-50 border border-slate-100">
    {NIVELES.map(({ key, label, Icono }) => (
      <button
        key={key}
        type="button"
        onClick={() => onChange(key)}
        className={`flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-bold transition-colors whitespace-nowrap ${
          activo === key ? "bg-white text-primary-dark shadow-sm border border-primary-light" : "text-slate-500 hover:text-carbon-dark"
        }`}
      >
        <Icono className="w-4 h-4" />
        {label}
      </button>
    ))}
  </div>
);

// Mini-tarjeta de un nivel dentro del panel "Resumen" — mismo lenguaje visual que las 4 tarjetas
// de estado de "Respaldo de Base de Datos" (icono en cuadrado de color + borde/sombra propios) y
// el mismo ícono que su pestaña en el switch de arriba (`EntityIconTile` es el componente
// compartido que ya usan las listas para ese cuadrado, no uno nuevo). `metricas` es la lista de
// líneas a mostrar (Empresa trae 4, Personas/Maquinarias traen 5 por la línea extra de cantidad
// asignada) para no hardcodear el layout tres veces.
// `variante="expandida"`: cuando se muestra sola (una pestaña puntual seleccionada) crece para
// llenar el alto de la fila (mismo alto que "Cumplimiento Documental" al lado, vía CSS
// grid+flex — sin medir nada en JS) en vez de quedar chica con espacio vacío debajo.
// `variante="compacta"` (los 3 bloques a la vez, sin tab elegido): solo ícono + nombre + % — con
// `cantidad` (Personas/Maquinarias asignadas, si aplica) y `statsInline` (Evaluados/Sin
// Evaluar/No Cumple) al lado del anillo, no como lista debajo — el detalle completo
// (Requerimientos a evaluar/No Aplica) se reserva para cuando el usuario ya eligió ese nivel
// puntual (variante "expandida").
const TarjetaResumenNivel = ({ Icono, nombre, pct, metricas, statsInline, cantidad, variante = "compacta" }) => {
  const expandida = variante === "expandida";
  return (
    <div className={`bg-white rounded-2xl border border-slate-100 shadow-card flex flex-col ${expandida ? "p-6 h-full" : "p-4"}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <EntityIconTile icon={Icono} />
          <span className={`font-bold text-carbon-dark truncate ${expandida ? "text-sm" : "text-xs"}`}>{nombre}</span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {!expandida && (cantidad || statsInline) && (
            <div className="flex items-center gap-2.5">
              {cantidad && (
                <span title={cantidad.label} className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-bold whitespace-nowrap">
                  {cantidad.valor} {cantidad.label}
                </span>
              )}
              {statsInline && statsInline.map((s) => (
                <span key={s.label} title={s.label} className="flex items-center gap-1">
                  <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                  <span className="text-[11px] font-bold text-carbon-dark">{s.valor}</span>
                </span>
              ))}
            </div>
          )}
          <KpiAnillo pct={pct} size={expandida ? 64 : 40} strokeWidth={expandida ? 7 : 5} textoClass={expandida ? "text-sm" : "text-[9px]"} />
        </div>
      </div>
      {expandida && (
        <div className="mt-3 pt-3 border-t border-slate-100 space-y-1.5 text-[11px] flex-1 min-h-0 flex flex-col justify-center">
          {metricas.map((m) => (
            <div key={m.label} className="flex items-center justify-between">
              <span className="text-slate-500">{m.label}</span>
              <span className={`font-bold ${m.clase || "text-carbon-dark"}`}>{m.valor}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export const ExpedienteDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const puedeTransicionar = ["superadmin", "mandante_admin", "evaluador"].includes(profile?.rol);
  // Quién puede editar el catálogo del Perfil de Participación (mismo alcance que
  // ConfigurarRequerimientosPage.jsx: ahí evaluador/mandante_lector quedan en solo lectura).
  const puedeConfigurarRequerimientos = ["superadmin", "mandante_admin"].includes(profile?.rol);

  const [expediente, setExpediente] = useState(null);
  const [mandante, setMandante] = useState(null);
  const historialRef = useRef(null);
  const [proyecto, setProyecto] = useState(null);
  const [empresa, setEmpresa] = useState(null);
  const [perfil, setPerfil] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [transicionando, setTransicionando] = useState(false);
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

  const [evaluaciones, setEvaluaciones] = useState([]);
  // Evidencia documental del Expediente y sus vínculos a Requerimientos: solo para el indicador de
  // "documentación adjunta", que es INDEPENDIENTE del estado (evaluar no exige documentos).
  const [evidenciasDoc, setEvidenciasDoc] = useState({ evidencias: [], vinculos: [] });
  const [personasOptions, setPersonasOptions] = useState([]);
  const [recursosOptions, setRecursosOptions] = useState([]);
  const [asignacionesProyecto, setAsignacionesProyecto] = useState([]);

  // Vista General/Empresa/Personas/Maquinarias: controla qué sujeto evalúa la Planilla debajo.
  // `recursoSeleccionadoId` se resetea al cambiar de pestaña para que siempre recaiga en el
  // primero de la nueva lista. Arranca en "general" (vista comparativa de los 3 niveles a la
  // vez) — a diferencia de Empresa/Personas/Maquinarias, "General" es una pestaña más a la que
  // siempre se puede volver, no un estado inicial sin retorno.
  const [nivelActivo, setNivelActivo] = useState("general");
  const [recursoSeleccionadoId, setRecursoSeleccionadoId] = useState(null);

  // Sugerencia "seguir con el siguiente pendiente" tras Guardar Evaluación (ver
  // verificarSugerenciaSiguiente): { nivel, id, nombre } del próximo pendiente del mismo nivel, o
  // null si no aplica (sujeto aún no completo, o ya no queda nadie más pendiente).
  const [sugerenciaSiguiente, setSugerenciaSiguiente] = useState(null);

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

      const [proyectoData, empresaData, perfilData, asignacionesData, evaluacionesData, evidenciasData, vinculosData] = await Promise.all([
        proyectoService.obtenerPorId(data.proyectoId).catch(() => null),
        empresaService.obtenerPorId(data.empresaId).catch(() => null),
        perfilParticipacionService.obtenerPorId(data.perfilParticipacionId).catch(() => null),
        asignacionService.listar({ proyectoId: data.proyectoId, estado: "activa" }).catch(() => []),
        evaluacionService.listarPorExpediente(data.id, false).catch(() => []),
        evidenciaService.listar({ expedienteId: data.id }).catch(() => []),
        evidenciaRequerimientoService.listarPorExpediente(data.id).catch(() => []),
      ]);
      setEvidenciasDoc({ evidencias: evidenciasData || [], vinculos: vinculosData || [] });
      setProyecto(proyectoData);
      setEmpresa(empresaData);
      setPerfil(perfilData);
      mandanteService.obtenerPorId(data.mandanteId).then(setMandante).catch(() => setMandante(null));
      setAsignacionesProyecto(asignacionesData || []);
      setEvaluaciones(evaluacionesData || []);
      return { expedienteData: data, asignacionesData: asignacionesData || [], evaluacionesData: evaluacionesData || [] };
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

  const handleTransicionar = async (nuevoEstado) => {
    if (nuevoEstado === "cerrado" && !window.confirm("¿Cerrar este Expediente? Es una transición terminal, no podrá revertirse ni editarse después.")) {
      return;
    }
    setTransicionando(true);
    setError(null);
    try {
      await expedienteService.transicionar(id, { estado: nuevoEstado });
      await cargarDatos();
    } catch (err) {
      console.error("Error al transicionar expediente:", err);
      setError(err.message || "No se pudo transicionar el expediente.");
    } finally {
      setTransicionando(false);
    }
  };

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

  const estadoInfo = (estado) => ESTADOS_EXPEDIENTE.find((e) => e.value === estado) || ESTADOS_EXPEDIENTE[0];

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

  const transicionesDisponibles = TRANSICIONES_VALIDAS[expediente.estado] || [];

  // Asignaciones activas del Proyecto, acotadas a la Empresa de ESTE
  // Expediente (asignacionesProyecto trae todas las del Proyecto, de
  // cualquier Empresa participante).
  const asignacionesEmpresa = asignacionesProyecto.filter((a) => a.empresaId === expediente.empresaId);
  const personasAsignadas = asignacionesEmpresa.filter((a) => a.personaId);
  const recursosAsignados = asignacionesEmpresa.filter((a) => a.recursoId);

  const vigentesExpediente = evaluaciones.filter((e) => e.estado === "vigente");

  // Indicador de documentación adjunta — PARALELO al estado (evaluar no exige documentos): de todos
  // los pares Requerimiento × sujeto aplicables, cuántos tienen evidencia activa adjunta.
  const idsEvidenciaPorReq = {};
  evidenciasDoc.vinculos.filter((v) => v.estado === "activo").forEach((v) => {
    (idsEvidenciaPorReq[v.requerimientoId] ||= new Set()).add(v.evidenciaId);
  });
  const tieneDocumento = (reqId, { personaId = null, recursoId = null } = {}) => {
    const ids = idsEvidenciaPorReq[reqId];
    if (!ids) return false;
    return evidenciasDoc.evidencias.some((e) => {
      if (!ids.has(e.id)) return false;
      if (personaId) return e.personaId === personaId;
      if (recursoId) return e.recursoId === recursoId;
      return !e.personaId && !e.recursoId;
    });
  };
  const paresDocumentacion = (expediente.requerimientosAplicables || []).flatMap((r) => {
    if (r.tipoEntidad === "empresa") return [tieneDocumento(r.requerimientoId)];
    return [...personasAsignadas, ...recursosAsignados]
      .filter((a) => aplicaRequerimientoASujeto(r, sujetoDeAsignacion(a)))
      .map((a) => tieneDocumento(r.requerimientoId, a.personaId
        ? { personaId: a.personaId } : { recursoId: a.recursoId }));
  });
  const totalConDocumento = paresDocumentacion.filter(Boolean).length;
  const totalPares = paresDocumentacion.length;
  const pctDocumentacion = totalPares > 0 ? Math.round((totalConDocumento / totalPares) * 100) : 0;

  // Ítems del selector, con su avance individual — mismo cálculo (calcularConteosEvaluacion) que
  // usa la Planilla para el sujeto seleccionado, aplicado acá a CADA Persona/Maquinaria asignada
  // para la vista compacta de la lista. Un solo fetch de evaluaciones (arriba) alimenta ambas
  // vistas, nunca dos consultas por fila. Mismas funciones puras que reutiliza
  // verificarSugerenciaSiguiente tras Guardar Evaluación.
  const personasItems = construirPersonasItems(expediente, evaluaciones, personasAsignadas, personasOptions);
  const recursosItems = construirRecursosItems(expediente, evaluaciones, recursosAsignados, recursosOptions);

  const itemsActivos = nivelActivo === "persona" ? personasItems : nivelActivo === "recurso" ? recursosItems : [];
  // Selección derivada, no sincronizada por efecto: si lo elegido ya no está en la lista
  // vigente (o nunca se eligió nada) cae automáticamente al primero — así nunca queda
  // desincronizada del contenido real.
  const seleccionadoId = itemsActivos.some((i) => i.id === recursoSeleccionadoId)
    ? recursoSeleccionadoId : (itemsActivos[0]?.id ?? null);

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
    onAnterior: () => setRecursoSeleccionadoId(evaluadosDelNivel[indiceEvaluado - 1].id),
    onSiguiente: () => setRecursoSeleccionadoId(evaluadosDelNivel[indiceEvaluado + 1].id),
  };

  // Ya cargados acá (personasOptions/recursosOptions/personasAsignadas) — se pasan tal cual a la
  // Planilla para que NO tenga que volver a pedirlos al servidor al cambiar de pestaña o de
  // seleccionado: el cambio de sujeto queda como puro cambio de estado en cliente, sin ningún
  // fetch ni loader de pantalla completa.
  const personaConocida = nivelActivo === "persona" ? personasOptions.find((p) => p.id === seleccionadoId) || null : null;
  const recursoConocido = nivelActivo === "recurso" ? recursosOptions.find((r) => r.id === seleccionadoId) || null : null;
  const asignacionSeleccionada = nivelActivo === "persona"
    ? personasAsignadas.find((a) => a.personaId === seleccionadoId)
    : nivelActivo === "recurso" ? recursosAsignados.find((a) => a.recursoId === seleccionadoId) : null;
  const rolConocido = nivelActivo === "persona" ? asignacionSeleccionada?.rol || null : null;
  const perfilRecursoIdConocido = asignacionSeleccionada?.perfilRecursoId || null;

  // Resumen: detalle numérico completo por nivel (Empresa/Personas/Maquinarias), agregando TODAS
  // las Personas o Maquinarias entre sí — un total del Expediente completo, independiente de cuál
  // esté seleccionada en el panel de al lado (SelectorRecursoAsignado). Reutiliza
  // calcularResumenCumplimiento (misma fórmula de avancePct que el donut de "Cumplimiento
  // Documental"), sin duplicar el cálculo de conteos.
  const reqsEmpresa = (expediente.requerimientosAplicables || [])
    .filter((r) => aplicaRequerimientoASujeto(r, { tipoEntidad: "empresa" }));
  const vigentesEmpresaNivel = vigentesExpediente.filter((v) => !v.personaId && !v.recursoId && reqsEmpresa.some((r) => r.requerimientoId === v.requerimientoId));
  const resumenEmpresa = calcularResumenCumplimiento(reqsEmpresa.length, vigentesEmpresaNivel);

  const totalPersonasNivel = personasAsignadas.reduce((sum, a) => sum + requerimientosDeAsignacion(expediente, a).length, 0);
  const vigentesPersonasNivel = personasAsignadas.flatMap((a) => {
    const reqs = requerimientosDeAsignacion(expediente, a);
    return vigentesExpediente.filter((v) => v.personaId === a.personaId && reqs.some((r) => r.requerimientoId === v.requerimientoId));
  });
  const resumenPersonas = calcularResumenCumplimiento(totalPersonasNivel, vigentesPersonasNivel);

  const totalMaquinariasNivel = recursosAsignados.reduce((sum, a) => sum + requerimientosDeAsignacion(expediente, a).length, 0);
  const vigentesMaquinariasNivel = recursosAsignados.flatMap((a) => {
    const reqs = requerimientosDeAsignacion(expediente, a);
    return vigentesExpediente.filter((v) => v.recursoId === a.recursoId && reqs.some((r) => r.requerimientoId === v.requerimientoId));
  });
  const resumenMaquinarias = calcularResumenCumplimiento(totalMaquinariasNivel, vigentesMaquinariasNivel);

  // Cumplimiento Documental en el estado inicial (sin tab elegido): la SUMA exacta de los 3
  // niveles de arriba, misma fuente de datos que el Resumen de al lado — nunca el catálogo de
  // requerimientosAplicables sin expandir (calcularSinEvaluar), que subestima "Sin Evaluar" cuando
  // un mismo Requerimiento de nivel Persona/Maquinaria aplica a varias personas/máquinas, y
  // mostraría un % inconsistente con la suma de las 3 tarjetas de Resumen en la misma pantalla.
  const conteosGenerales = calcularConteosEvaluacion([
    ...vigentesEmpresaNivel, ...vigentesPersonasNivel, ...vigentesMaquinariasNivel,
  ]).conteos;
  const sinEvaluarGeneral = resumenEmpresa.sinEvaluar + resumenPersonas.sinEvaluar + resumenMaquinarias.sinEvaluar;

  const metricasNivel = (resumen, extra) => [
    ...(extra ? [extra] : []),
    { label: "Requerimientos a evaluar", valor: resumen.total },
    { label: "Evaluados", valor: resumen.evaluados },
    { label: "No Cumple", valor: resumen.noCumple, clase: resumen.noCumple > 0 ? "text-red-600" : undefined },
    { label: "No Aplica", valor: resumen.noAplica },
  ];

  // Versión resumida de las mismas cifras, para mostrar al lado del anillo en la variante
  // compacta (mismos colores que ya usa EstadoCumplimientoPanel/ResumenCumplimientoLista para
  // Cumple/Sin Evaluar/No Cumple, así el punto de color se lee igual en toda la pantalla).
  const statsInlineDe = (resumen) => [
    { label: "Evaluados", valor: resumen.evaluados, dot: "bg-sage-dark" },
    { label: "Sin Evaluar", valor: resumen.sinEvaluar, dot: "bg-slate-300" },
    { label: "No Cumple", valor: resumen.noCumple, dot: "bg-red-500" },
  ];

  // Sin tab elegido: los 3 bloques a la vez (vista comparativa), tamaño compacto. Con un tab
  // elegido: solo el bloque de ese nivel, en tamaño "expandida" (crece para llenar la fila junto
  // al donut, ver TarjetaResumenNivel) — nunca los 3 al mismo tiempo que uno solo seleccionado.
  const tarjetaEmpresa = (
    <TarjetaResumenNivel
      Icono={Building2}
      nombre="Empresa"
      pct={resumenEmpresa.avancePct}
      metricas={metricasNivel(resumenEmpresa)}
      statsInline={statsInlineDe(resumenEmpresa)}
      variante={nivelActivo === "general" ? "compacta" : "expandida"}
    />
  );
  const tarjetaPersonas = (
    <TarjetaResumenNivel
      Icono={Users}
      nombre="Personas"
      pct={resumenPersonas.avancePct}
      metricas={metricasNivel(resumenPersonas, { label: "Personas asignadas", valor: personasAsignadas.length })}
      statsInline={statsInlineDe(resumenPersonas)}
      cantidad={{ label: "personas", valor: personasAsignadas.length }}
      variante={nivelActivo === "general" ? "compacta" : "expandida"}
    />
  );
  const tarjetaMaquinarias = (
    <TarjetaResumenNivel
      Icono={Truck}
      nombre="Maquinarias"
      pct={resumenMaquinarias.avancePct}
      metricas={metricasNivel(resumenMaquinarias, { label: "Maquinarias asignadas", valor: recursosAsignados.length })}
      statsInline={statsInlineDe(resumenMaquinarias)}
      cantidad={{ label: "maquinarias", valor: recursosAsignados.length }}
      variante={nivelActivo === "general" ? "compacta" : "expandida"}
    />
  );

  const resumenNiveles =
    nivelActivo === "empresa" ? tarjetaEmpresa :
    nivelActivo === "persona" ? tarjetaPersonas :
    nivelActivo === "recurso" ? tarjetaMaquinarias :
    <div className="h-full flex flex-col gap-3">{tarjetaEmpresa}{tarjetaPersonas}{tarjetaMaquinarias}</div>;

  const cambiarNivel = (key) => {
    setNivelActivo(key);
    setRecursoSeleccionadoId(null);
  };

  // Tras Guardar Evaluación en el nivel Persona/Maquinaria: si el sujeto que se acaba de evaluar
  // quedó "evaluada" (100% resuelto), muestra un modal — con TODOS los pendientes que aún quedan
  // en ese mismo nivel para elegir con cuál seguir (el usuario elige, nunca salta solo), o con el
  // aviso de que ya no queda ninguno si era el último. En Empresa no aplica (una sola entidad).
  const verificarSugerenciaSiguiente = async (nivel, idAnterior) => {
    const datos = await cargarDatos(true);
    if (!datos) return;
    const { expedienteData, asignacionesData, evaluacionesData } = datos;
    const asignacionesEmpresaFrescas = asignacionesData.filter((a) => a.empresaId === expedienteData.empresaId);
    const items = nivel === "persona"
      ? construirPersonasItems(expedienteData, evaluacionesData, asignacionesEmpresaFrescas.filter((a) => a.personaId), personasOptions)
      : construirRecursosItems(expedienteData, evaluacionesData, asignacionesEmpresaFrescas.filter((a) => a.recursoId), recursosOptions);
    const actual = items.find((i) => i.id === idAnterior);
    if (!actual || actual.estado !== "evaluada") return;
    const pendientes = items.filter((i) => i.id !== idAnterior && i.estado !== "evaluada");
    setSugerenciaSiguiente({ nivel, opciones: pendientes, total: items.length });
  };

  const irASiguientePendiente = (id) => {
    setRecursoSeleccionadoId(id);
    setSugerenciaSiguiente(null);
  };

  // Al cerrar el aviso de "ya se evaluó todo": sube al inicio de la pantalla — con todo evaluado
  // lo siguiente suele ser revisar el estado general/transicionar el Expediente, arriba del todo,
  // no seguir mirando el detalle de la última persona/maquinaria evaluada.
  const cerrarAvisoTodoEvaluado = () => {
    setSugerenciaSiguiente(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Transicionar de estado ya no tiene su propia card: se ofrece acá, en el mismo menú ⋮ del
  // encabezado donde ya viven "Ir a Planilla de Evaluación"/"Ver historial" — sigue disponible
  // también como acción de fila en el listado de Expedientes.
  const accionesMenu = [
    { label: "Ir a Planilla de Evaluación", icon: ClipboardList, onClick: () => navigate(`/expedientes/${id}/evaluar`) },
    { label: "Ver historial", icon: History, onClick: irAHistorial },
    ...(puedeTransicionar ? transicionesDisponibles.map((estadoDestino) => ({
      label: `Transicionar a: ${estadoInfo(estadoDestino).label}`,
      icon: ArrowRightCircle,
      disabled: transicionando,
      onClick: () => handleTransicionar(estadoDestino),
    })) : []),
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-slate-400">
        <Link to="/expedientes" className="font-semibold hover:text-primary">Expedientes</Link>
        <ChevronRight className="w-3 h-3" />
        <span className="font-semibold text-slate-600">{empresa?.razonSocial || expediente.empresaId}</span>
      </nav>

      {/* Encabezado */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate("/expedientes")}
            className="p-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 transition-colors shadow-sm"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h2 className="text-xl font-bold text-gray-900 tracking-tight">
              {empresa?.razonSocial || expediente.empresaId}
            </h2>
            <p className="text-xs text-gray-500">
              {proyecto ? `${proyecto.nombre} (${proyecto.codigo})` : expediente.proyectoId}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ActionButton icon={ArrowLeft} onClick={() => navigate("/expedientes")}>Ver en lista</ActionButton>
          {/* No existe generación de paquete/PDF del expediente: queda pendiente en vez de improvisar un formato. */}
          <ActionButton icon={Download} disabled title="Próximamente">Descargar expediente</ActionButton>
          <RowActionsMenu actions={accionesMenu} />
        </div>
      </div>

      <ErrorBanner message={error} />

      {/* Banner de estado + stepper completo + contexto */}
      <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-card space-y-5">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Estado</span>
          <span className={`inline-flex items-center px-3.5 py-1.5 rounded-full text-sm font-black border ${ESTADO_MAP[expediente.estado]?.className || ""}`}>
            {ESTADO_MAP[expediente.estado]?.label || expediente.estado}
          </span>
        </div>
        <EstadoExpedienteStepper estado={expediente.estado} variante="completa" />
        {/* Documentación adjunta: indicador aparte, no un paso — se puede aprobar sin adjuntar documentos
            (verificación presencial), pero queda a la vista cuánto respaldo documental hay. */}
        {totalPares > 0 && (
          <div className="flex items-center gap-3 flex-wrap p-3 rounded-xl bg-slate-50 border border-slate-100">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap">Documentación adjunta</span>
            <div className="flex-1 min-w-[8rem] h-1.5 bg-slate-200 rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full" style={{ width: `${pctDocumentacion}%` }} />
            </div>
            <span className="text-xs font-bold text-carbon-dark whitespace-nowrap">
              {pctDocumentacion}%
              <span className="ml-1.5 font-medium text-slate-400">
                ({totalConDocumento} de {totalPares} requerimientos con documento)
              </span>
            </span>
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-4 border-t border-slate-100">
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 min-w-0">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Mandante</p>
            {mandante ? <MandanteChip nombre={getMandanteDisplayName(mandante)} logoUrl={mandante.logoUrl || null} /> : <span className="text-xs text-slate-400">-</span>}
          </div>
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 min-w-0">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Proyecto</p>
            <p className="text-xs font-bold text-carbon-dark truncate">{proyecto?.nombre || expediente.proyectoId}</p>
            {proyecto?.codigo && <p className="text-[11px] text-slate-500 font-mono">{proyecto.codigo}</p>}
          </div>
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 min-w-0">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Tipo de participación</p>
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold bg-primary-lighter text-primary-dark border border-primary-light">
              {perfil?.nombre || "-"}
            </span>
          </div>
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 min-w-0">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Empresa</p>
            <EmpresaChip nombre={empresa?.razonSocial || expediente.empresaId} logoUrl={empresa?.logoUrl || null} conIniciales />
            {empresa?.rut && <p className="text-[11px] text-slate-500 font-mono mt-0.5">{formatRutDisplay(empresa.rut)}</p>}
          </div>
        </div>
      </div>

      <div className="space-y-6">
        {/* Vista General/Empresa/Personas/Maquinarias — el switch vive dentro de la tarjeta
            "Cumplimiento Documental" de la Planilla (tabsNivel) y controla el resto: donut,
            resumen, datos de la evaluación y tabla de requisitos. */}
        <div>
          <PlanillaEvaluacion
            expedienteId={id}
            nivel={nivelActivo === "general" ? "ninguno" : nivelActivo}
            personaId={nivelActivo === "persona" ? seleccionadoId : null}
            recursoId={nivelActivo === "recurso" ? seleccionadoId : null}
            personaConocida={personaConocida}
            recursoConocido={recursoConocido}
            rolConocido={rolConocido}
            perfilRecursoIdConocido={perfilRecursoIdConocido}
            embebido
            mostrarResumen
            mostrarDatosEvaluacion
            tabsNivel={<SelectorNivel activo={nivelActivo} onChange={cambiarNivel} />}
            tituloCumplimiento={nivelActivo === "general" ? "Cumplimiento Documental General" : "Cumplimiento Documental"}
            navegacionSujeto={navegacionSujeto}
            recargarSenal={recargarPlanillaSenal}
            accionRequisitos={nivelActivo !== "general" && puedeConfigurarRequerimientos ? (
              <button
                type="button"
                onClick={() => setConfigurarRequerimientosAbierto(true)}
                title="Agrega o quita Requerimientos del Perfil de Participación de este Expediente — el cambio se aplica al catálogo del Perfil y también a este Expediente."
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-200 text-[11px] font-bold text-slate-500 hover:bg-slate-50 hover:text-primary whitespace-nowrap"
              >
                <ListPlus className="w-3.5 h-3.5" />
                Agregar Requerimiento
              </button>
            ) : null}
            conteosGenerales={nivelActivo === "general" ? conteosGenerales : null}
            sinEvaluarGeneral={nivelActivo === "general" ? sinEvaluarGeneral : 0}
            resumenNiveles={resumenNiveles}
            panelExtra={(nivelActivo === "persona" || nivelActivo === "recurso") ? (
              <SelectorRecursoAsignado
                key={nivelActivo}
                tipo={nivelActivo}
                items={itemsActivos}
                seleccionadoId={seleccionadoId}
                onSeleccionar={setRecursoSeleccionadoId}
                empresaId={expediente.empresaId}
                mandanteId={expediente.mandanteId}
                proyectoDestinoId={expediente.proyectoId}
                proyectoDestinoNombre={proyecto?.nombre}
                onIngresado={() => { cargarOpciones(); cargarDatos(true); }}
              />
            ) : null}
            onGuardado={() => (
              (nivelActivo === "persona" || nivelActivo === "recurso") && seleccionadoId
                ? verificarSugerenciaSiguiente(nivelActivo, seleccionadoId)
                : cargarDatos(true)
            )}
          />
        </div>

        {/* Card: Historial (auditoría/trazabilidad) */}
        <div ref={historialRef} className="bg-white p-6 rounded-2xl border border-gray-100 shadow-card space-y-4">
          <button
            type="button"
            onClick={toggleBitacora}
            className="w-full flex items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Historial</h3>
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
      </div>

      {sugerenciaSiguiente && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
          onClick={sugerenciaSiguiente.opciones.length === 0 ? cerrarAvisoTodoEvaluado : () => setSugerenciaSiguiente(null)}
        >
          <div className="bg-white rounded-2xl shadow-dropdown w-full max-w-sm p-6 space-y-4 max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-sage-lighter text-sage-darker flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-bold text-carbon-dark">
                {sugerenciaSiguiente.opciones.length > 0 ? "Evaluación completa" : "¡Todo evaluado!"}
              </h3>
            </div>

            {sugerenciaSiguiente.opciones.length > 0 ? (
              <>
                <p className="text-xs text-slate-500">
                  Todavía {sugerenciaSiguiente.opciones.length === 1 ? "queda 1 pendiente" : `quedan ${sugerenciaSiguiente.opciones.length} pendientes`} en {sugerenciaSiguiente.nivel === "persona" ? "Personas" : "Maquinarias"}.
                  Elige con cuál continuar:
                </p>
                <ul className="space-y-1.5 overflow-y-auto flex-1 min-h-0 -mx-1 px-1">
                  {sugerenciaSiguiente.opciones.map((op) => (
                    <li key={op.id}>
                      <button
                        type="button"
                        onClick={() => irASiguientePendiente(op.id)}
                        className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border border-slate-100 hover:border-primary hover:bg-primary-lighter text-left transition-colors"
                      >
                        <span className="min-w-0">
                          <span className="block text-xs font-bold text-carbon-dark truncate">{op.nombre}</span>
                          {op.subtitulo && <span className="block text-[11px] text-slate-400 truncate">{op.subtitulo}</span>}
                        </span>
                        <span className="shrink-0 text-primary text-xs font-bold">Continuar →</span>
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="flex items-center justify-end">
                  <ActionButton onClick={() => setSugerenciaSiguiente(null)}>Quedarme aquí</ActionButton>
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
