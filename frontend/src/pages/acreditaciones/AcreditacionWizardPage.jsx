import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Check, RotateCcw, Sparkles } from "lucide-react";
import { useMandanteContexto } from "../../hooks/useMandanteContexto";
import { participacionService } from "../../services/participacionService";
import { expedienteService } from "../../services/expedienteService";
import { acreditacionService } from "../../services/acreditacionService";
import { perfilParticipacionService } from "../../services/perfilParticipacionService";
import { mandanteService } from "../../services/mandanteService";
import { estadoTarjetaProyecto, MENSAJE_NO_APLICA } from "./wizard/estadoTarjetaProyecto";
import { PasoMandante } from "./wizard/PasoMandante";
import { PasoEmpresa } from "./wizard/PasoEmpresa";
import { PasoProyecto } from "./wizard/PasoProyecto";
import { PasoPerfil } from "./wizard/PasoPerfil";
import { PasoAsignaciones } from "./wizard/PasoAsignaciones";
import { PasoRequerimientos } from "./wizard/PasoRequerimientos";
import { PasoResumen } from "./wizard/PasoResumen";
import {
  CLASE_RESALTADO, REF_PASO, REF_FECHA_INICIO, refRecurso, enfocarElemento,
} from "./asistenteNavegacion";
import { ResumenAcreditacionPanel } from "../../components/shared/ResumenAcreditacionPanel";
import { ConfirmacionModal } from "../../components/shared/ConfirmacionModal";
import { hoyISO } from "../../utils/fechas";
import { useAuth } from "../../contexts/AuthContext";
import { useCarpetaWizard } from "../../hooks/useCarpetaWizard";
import { DocumentacionWizard } from "./wizard/DocumentacionWizard";
import { repositorioDocumentalService } from "../../services/repositorioDocumentalService";
import { traspasarCarpetaWizard, limpiarCarpetasWizard } from "../../services/fuentes/carpetaLocal";
import { MAPEO_VACIO } from "../../utils/repositorioDocumental";

// Identificador de esta sesión del asistente: clave temporal de la carpeta local elegida antes de
// que exista el expediente.
const nuevaSesionWizard = () => (typeof crypto !== "undefined" && crypto.randomUUID ?
  crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

// `id` es el identificador interno y fijo de cada paso (lo usan `step`, los "Editar" del resumen y
// el estado guardado). El número que ve el usuario es la posición dentro de los pasos VISIBLES: para
// roles con Mandante fijo, o cuando hay un solo Mandante activo, el paso Mandante se omite y
// Empresa pasa a ser el 1.
const PASOS = [
  { id: 1, label: "Mandante" },
  { id: 2, label: "Empresa" },
  { id: 3, label: "Proyecto" },
  { id: 4, label: "Perfil" },
  { id: 5, label: "Personas y Maquinarias" },
  { id: 6, label: "Requerimientos" },
  { id: 7, label: "Confirmación" },
];
const PASO_CONFIRMACION = 7;


// El wizard se pierde por completo si el usuario navega a otra pantalla
// (p.ej. a Personas a crear una desde el flujo completo) y vuelve — el
// componente se desmonta y todo su estado en memoria se descarta. Se
// persiste en sessionStorage (vive solo en esta pestaña, se limpia sola
// al cerrarla) para poder reconstruirlo al volver a montar. Se guarda
// bajo una sola clave global: solo tiene sentido un flujo de "Nueva
// Acreditación" a la vez por pestaña.
//
// Versionado del borrador: cada cambio de forma del estado guardado sube BORRADOR_VERSION (y la
// clave). Un borrador de otra versión se descarta en vez de reinterpretarse.
//  - v2: paso Mandante (los ids de paso cambiaron y el Mandante es obligatorio).
//  - v3: relaciones de Empresa (bloque 3): la Empresa del paso 2 sale de las asociadas al
//    Mandante y Personas/Maquinarias ya no traen empresaId propio.
const BORRADOR_VERSION = 3;
const STORAGE_KEY = `smartone.nuevaAcreditacionWizard.v${BORRADOR_VERSION}`;
const STORAGE_KEYS_ANTERIORES = [
  "smartone.nuevaAcreditacionWizard",
  "smartone.nuevaAcreditacionWizard.v2",
];

const leerEstadoGuardado = () => {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    const guardado = raw ? JSON.parse(raw) : null;
    return guardado?.version === BORRADOR_VERSION ? guardado : null;
  } catch {
    return null;
  }
};

// Borrador utilizable para este actor, o null (se arranca de cero). Descarta borradores sin
// Mandante más allá del Paso 1, o de otro Mandante para un rol con Mandante fijo (otra sesión en la
// misma pestaña).
const leerBorradorValido = (mandanteFijo) => {
  const guardado = leerEstadoGuardado();
  if (!guardado) return null;
  const step = Number(guardado.step) || 0;
  if (step < 1 || step > PASO_CONFIRMACION) return null;
  if (mandanteFijo) {
    if (guardado.mandanteIdWizard && guardado.mandanteIdWizard !== mandanteFijo) return null;
    return { ...guardado, mandanteIdWizard: mandanteFijo, step: Math.max(step, 2) };
  }
  if (!guardado.mandanteIdWizard && step > 1) return null;
  return guardado;
};

const limpiarEstadoGuardado = () => {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // sessionStorage no disponible (modo privado, etc.) — nada que limpiar.
  }
};

// Numera solo los pasos visibles (1..N); la comparación de avance usa el id interno.
const StepIndicator = ({ step, pasos }) => (
  <div className="flex items-center">
    {pasos.map((p, i) => (
      <React.Fragment key={p.id}>
        <div className="flex flex-col items-center gap-1.5">
          <div
            className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors ${
              p.id < step
                ? "bg-primary border-primary text-white"
                : p.id === step
                  ? "bg-white border-primary text-primary"
                  : "bg-white border-slate-200 text-slate-400"
            }`}
          >
            {p.id < step ? <Check className="w-4 h-4" /> : i + 1}
          </div>
          <span className={`text-[11px] font-semibold whitespace-nowrap ${p.id <= step ? "text-carbon-dark" : "text-slate-400"}`}>
            {p.label}
          </span>
        </div>
        {i < pasos.length - 1 && (
          <div className={`flex-1 h-0.5 mx-2 mb-5 transition-colors ${p.id < step ? "bg-primary" : "bg-slate-200"}`} />
        )}
      </React.Fragment>
    ))}
  </div>
);

// `mandanteFijo`: Mandante que no se elige (el propio del rol o el único activo): el paso Mandante
// se omite y este es el del flujo. `mandantes`: los elegibles en el paso Mandante.
const AsistenteAcreditacion = ({ mandanteFijo, mandantes, errorMandantes }) => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const pasosVisibles = mandanteFijo ? PASOS.filter((p) => p.id !== 1) : PASOS;
  const primerPaso = pasosVisibles[0].id;
  // Número que ve el usuario para un paso (posición entre los visibles).
  const numeroPaso = (id) => pasosVisibles.findIndex((p) => p.id === id) + 1;

  // Cada lazy initializer de useState solo se ejecuta una vez, en el
  // montaje inicial — llamar leerBorradorValido() (una lectura barata de
  // sessionStorage + JSON.parse) por separado en cada uno evita tener que
  // cachear el resultado en un ref (leerlo durante el render está
  // prohibido por las reglas de hooks de este proyecto).
  const [step, setStep] = useState(() => leerBorradorValido(mandanteFijo)?.step || primerPaso);

  // Única fuente del Mandante del flujo: lo elegido en el Paso 1, o el fijo del actor.
  const [mandanteIdWizard, setMandanteIdWizard] = useState(
    () => mandanteFijo || leerBorradorValido(mandanteFijo)?.mandanteIdWizard || "",
  );
  const [empresaSel, setEmpresaSel] = useState(() => leerBorradorValido(mandanteFijo)?.empresaSel || null);
  const [proyectoSel, setProyectoSel] = useState(() => leerBorradorValido(mandanteFijo)?.proyectoSel || null);
  // Mandante del flujo (nombre + logo, para el panel lateral) — no se persiste en sessionStorage:
  // se re-deriva de mandanteIdWizard al montar, igual de barato que guardarlo.
  const [mandanteSel, setMandanteSel] = useState(null);
  const [perfilSel, setPerfilSel] = useState(() => leerBorradorValido(mandanteFijo)?.perfilSel || null);
  // Perfil impuesto por el Proyecto (único Perfil disponible del Mandante, o el de la
  // Participación pendiente que se va a completar): en el paso Perfil no se puede cambiar.
  const [perfilFijo, setPerfilFijo] = useState(() => leerBorradorValido(mandanteFijo)?.perfilFijo || false);
  // Nombre del Perfil sugerido en el paso Proyecto (solo preselección: en el paso Perfil se puede elegir otro).
  const [perfilSugerido, setPerfilSugerido] = useState(() => leerBorradorValido(mandanteFijo)?.perfilSugerido || null);
  // Requisitos del Perfil elegido (misma fuente que las tarjetas del paso Perfil) y avance estimado
  // por reutilización a nivel Empresa (mismo previewNueva, solo lectura, sin Personas/Maquinarias).
  const [requisitosPerfil, setRequisitosPerfil] = useState(null);
  const [previewEmpresa, setPreviewEmpresa] = useState(null);
  // Documentación reutilizable con la selección de Personas/Maquinarias.
  const [previewSeleccion, setPreviewSeleccion] = useState(null);
  const [seleccion, setSeleccion] = useState(() => leerBorradorValido(mandanteFijo)?.seleccion || []); // [{tipo, id, nombre, perfilRecursoIds}]
  const [fechaInicio, setFechaInicio] = useState(() => leerBorradorValido(mandanteFijo)?.fechaInicio || hoyISO());
  const [previewRequerimientos, setPreviewRequerimientos] = useState(() => leerBorradorValido(mandanteFijo)?.previewRequerimientos || null);
  // Documentación del futuro expediente (opcional, paso Empresa): { tipo, etiqueta, url } | null. El
  // handle local vive en IndexedDB con una clave temporal de esta sesión del asistente.
  const [sesionWizard, setSesionWizard] = useState(() => leerBorradorValido(mandanteFijo)?.sesionWizard || nuevaSesionWizard());
  const [repositorioWizard, setRepositorioWizard] = useState(() => leerBorradorValido(mandanteFijo)?.repositorioWizard || null);
  const [avisoDocumentacion, setAvisoDocumentacion] = useState(null);
  const carpetaWizard = useCarpetaWizard(profile?.uid, sesionWizard);

  const [ejecutando, setEjecutando] = useState(false);
  const [progreso, setProgreso] = useState(() => leerBorradorValido(mandanteFijo)?.progreso || null); // {participacionId, sujetosListo, expedienteId}
  const [errorEjecucion, setErrorEjecucion] = useState(null); // {paso, mensaje}
  // Asignaciones vigentes que se finalizarán al mover Personas/Maquinarias (pendiente de confirmar).
  const [confirmacionMovimiento, setConfirmacionMovimiento] = useState(null); // {afectados}
  // Paso 5: se intentó continuar con seleccionados sin Perfil de Recurso (marca las filas).
  const [erroresPaso5, setErroresPaso5] = useState(false);

  // Persiste el avance en cada cambio — así una navegación a otra
  // pantalla (p.ej. crear una Persona desde su propio formulario
  // completo) y la vuelta al wizard lo encuentra tal como se dejó,
  // incluyendo cualquier Persona/Maquinaria nueva (los pasos vuelven a
  // pedir sus listas al montar). No se persisten `ejecutando`/
  // `errorEjecucion`: son estado transitorio de la última acción, no
  // tiene sentido resucitarlo al volver.
  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
        version: BORRADOR_VERSION,
        step, empresaSel, mandanteIdWizard, proyectoSel, perfilSel, perfilFijo, perfilSugerido,
        seleccion, fechaInicio, previewRequerimientos, progreso, sesionWizard, repositorioWizard,
      }));
    } catch {
      // sessionStorage lleno o bloqueado (modo privado) — no es crítico,
      // el wizard sigue funcionando en memoria para esta misma sesión.
    }
  }, [step, empresaSel, mandanteIdWizard, proyectoSel, perfilSel, perfilFijo, perfilSugerido, seleccion, fechaInicio, previewRequerimientos, progreso, sesionWizard, repositorioWizard]);

  // Limpieza defensiva de carpetas temporales: las de este usuario de otras sesiones del asistente
  // (abandonadas) y las de más de 24 h.
  useEffect(() => {
    if (!profile?.uid) return;
    limpiarCarpetasWizard(profile.uid, sesionWizard).catch(() => null);
  }, [profile?.uid, sesionWizard]);

  // Borradores de versiones anteriores del wizard: se descartan, ver BORRADOR_VERSION.
  useEffect(() => {
    try {
      STORAGE_KEYS_ANTERIORES.forEach((clave) => sessionStorage.removeItem(clave));
    } catch {
      // sessionStorage no disponible — nada que limpiar.
    }
  }, []);

  // Sidebar: Mandante del flujo (nombre + logo), desde que se elige en el Paso 1 (o el fijo del
  // actor desde el inicio).
  useEffect(() => {
    if (!mandanteIdWizard) {
      setMandanteSel(null);
      return undefined;
    }
    let vigente = true;
    mandanteService.obtenerPorId(mandanteIdWizard)
      .then((m) => { if (vigente) setMandanteSel(m); })
      .catch(() => { if (vigente) setMandanteSel(null); });
    return () => { vigente = false; };
  }, [mandanteIdWizard]);

  // Sidebar (pasos 3 y 4): requisitos del Perfil y avance estimado por reutilización de nivel
  // Empresa. Se recalcula al cambiar de Perfil.
  useEffect(() => {
    if (!perfilSel?.id) {
      setRequisitosPerfil(null);
      setPreviewEmpresa(null);
      return undefined;
    }
    let vigente = true;
    setRequisitosPerfil(null);
    setPreviewEmpresa(null);
    perfilParticipacionService.listarRequerimientos(perfilSel.id)
      .then((lista) => { if (vigente) setRequisitosPerfil(lista); })
      .catch(() => { if (vigente) setRequisitosPerfil([]); });
    if (empresaSel?.id) {
      acreditacionService
        .previewNueva({ empresaId: empresaSel.id, perfilParticipacionId: perfilSel.id, fechaInicio, seleccion: [] })
        .then((data) => { if (vigente) setPreviewEmpresa(data?.empresa || null); })
        .catch(() => { if (vigente) setPreviewEmpresa({ total: 0, reutilizables: 0 }); });
    }
    return () => { vigente = false; };
  }, [perfilSel?.id, empresaSel?.id, fechaInicio]);

  useEffect(() => {
    if (step !== 5 || !perfilSel?.id || !empresaSel?.id) {
      setPreviewSeleccion(null);
      return undefined;
    }
    let vigente = true;
    setPreviewSeleccion(null);
    acreditacionService
      .previewNueva({
        empresaId: empresaSel.id,
        perfilParticipacionId: perfilSel.id,
        fechaInicio,
        seleccion: seleccion.map((s) => ({ tipo: s.tipo, id: s.id, perfilRecursoIds: s.perfilRecursoIds || [] })),
      })
      .then((data) => { if (vigente) setPreviewSeleccion(data?.total || null); })
      .catch(() => { if (vigente) setPreviewSeleccion({ total: 0, reutilizables: 0 }); });
    return () => { vigente = false; };
  }, [step, perfilSel?.id, empresaSel?.id, fechaInicio, seleccion]);

  // Resumen informativo de traslados (paso Personas y Maquinarias): no bloquea; el traslado real
  // ocurre al confirmar.
  const trasladosCount = seleccion.filter(
    (s) => s.participacionActiva && s.participacionActiva.proyectoId !== proyectoSel?.id,
  ).length;

  // Mandante del flujo: el elegido en el Paso 1 o el fijo del actor (mandanteIdWizard ya lo trae).
  const mandanteEfectivo = mandanteIdWizard;

  // Un Proyecto "No aplica" (la Empresa ya participa activamente) nunca deja avanzar, aunque
  // haya quedado seleccionado (p. ej. desde el estado guardado de una sesión anterior).
  const proyectoNoAplica = Boolean(proyectoSel) && estadoTarjetaProyecto(proyectoSel) === "no_aplica";

  // Errores reales que impiden crear (no cuenta un simple pendiente de documentación). Cada uno
  // apunta a su paso y al elemento a corregir (`ref`, ver asistenteNavegacion.js): el resumen
  // los lista todos con su botón "Corregir". Cada Persona/Maquinaria seleccionada necesita su
  // Perfil de Recurso (por ID).
  const sinPerfil = seleccion.filter((s) => !(s.perfilRecursoIds || []).length);
  const problemas = [
    !mandanteEfectivo && !mandanteFijo && {
      paso: 1, ref: REF_PASO[1], etiqueta: "Ir a Mandante",
      mensaje: `Falta seleccionar el Mandante (Paso ${numeroPaso(1)}).`,
    },
    !empresaSel && {
      paso: 2, ref: REF_PASO[2], etiqueta: "Ir a Empresa",
      mensaje: `Falta seleccionar la Empresa (Paso ${numeroPaso(2)}).`,
    },
    !proyectoSel && {
      paso: 3, ref: REF_PASO[3], etiqueta: "Ir a Proyecto",
      mensaje: `Falta seleccionar el Proyecto (Paso ${numeroPaso(3)}).`,
    },
    proyectoNoAplica && { paso: 3, ref: REF_PASO[3], etiqueta: "Ir a Proyecto", mensaje: MENSAJE_NO_APLICA },
    !perfilSel && {
      paso: 4, ref: REF_PASO[4], etiqueta: "Ir a Perfil",
      mensaje: `Falta elegir el Perfil de Participación (Paso ${numeroPaso(4)}).`,
    },
    !fechaInicio && {
      paso: PASO_CONFIRMACION, ref: REF_FECHA_INICIO, etiqueta: "Ir a la fecha",
      mensaje: "Falta la fecha de inicio.",
    },
    ...sinPerfil.map((s) => ({
      paso: 5, ref: refRecurso(s.tipo, s.id), etiqueta: `Ir a ${s.nombre}`,
      mensaje: `Falta el Perfil de Recurso de ${s.nombre} (Paso ${numeroPaso(5)}).`,
    })),
  ].filter(Boolean);

  // Único punto de navegación a un problema: vuelve al paso (sin perder datos) y, cuando el
  // elemento ya está en pantalla, hace scroll, lo resalta y le da foco.
  const irAProblema = (paso, ref) => {
    if (paso === 5) setErroresPaso5(true);
    setStep(paso);
    enfocarElemento(ref);
  };

  // Paso Requerimientos: requisitos pendientes (sin documentación reutilizable) del preview ya calculado.
  const pendientesRequerimientos = previewRequerimientos?.total ? previewRequerimientos.total.total - previewRequerimientos.total.reutilizables : 0;

  const puedeContinuar =
    step === 1 ? Boolean(mandanteEfectivo) :
    step === 2 ? Boolean(empresaSel) :
    step === 3 ? Boolean(proyectoSel) && !proyectoNoAplica :
    step === 4 ? Boolean(perfilSel) :
    step === 5 ? true :
    step === 6 ? true : false;

  const handleAtras = () => {
    if (progreso?.participacionId) return; // ya se creó algo, no retrocede
    if (step === primerPaso) {
      navigate("/dashboard");
      return;
    }
    setStep((s) => s - 1);
  };

  const handleContinuar = () => {
    if (step === 3 && proyectoNoAplica) return;
    if (!puedeContinuar) return;
    // Paso 5: no avanza con seleccionados sin perfil (sin seleccionados sí se puede continuar).
    if (step === 5 && sinPerfil.length > 0) {
      irAProblema(5, refRecurso(sinPerfil[0].tipo, sinPerfil[0].id));
      return;
    }
    setErroresPaso5(false);
    setStep((s) => s + 1);
  };

  // Disponible en cualquier Paso: descarta todo lo ingresado en el wizard (memoria +
  // sessionStorage) y vuelve al primer paso, limpiando también el Mandante (salvo que sea el fijo
  // del actor). No borra nada del backend — si ya se alcanzó a crear una Participación
  // (progreso.participacionId), esta queda tal cual en Firestore, solo se pierde el seguimiento del
  // wizard sobre ella (se sigue viendo desde el listado de Participaciones).
  const handleReiniciar = () => {
    const advertenciaProgreso = progreso?.participacionId
      ? " Ya se creó una Participación con este flujo: reiniciar no la eliminará, pero dejarás de verla desde aquí (podrás encontrarla en el listado de Participaciones)."
      : "";
    if (!window.confirm(`¿Reiniciar la Nueva Acreditación? Se perderá todo lo ingresado en este flujo y volverás al Paso 1.${advertenciaProgreso}`)) {
      return;
    }
    limpiarEstadoGuardado();
    setStep(primerPaso);
    setEmpresaSel(null);
    setMandanteIdWizard(mandanteFijo || "");
    setProyectoSel(null);
    setPerfilSel(null);
    setPerfilFijo(false);
    setPerfilSugerido(null);
    setSeleccion([]);
    setFechaInicio(hoyISO());
    setPreviewRequerimientos(null);
    setProgreso(null);
    setErrorEjecucion(null);
    carpetaWizard.olvidar();
    setRepositorioWizard(null);
    setAvisoDocumentacion(null);
    setSesionWizard(nuevaSesionWizard());
  };

  // Paso 1. Cambiar de Mandante con avance posterior pide confirmación y limpia Empresa, Proyecto,
  // Perfil, Personas y Maquinarias y Requerimientos (todos dependen del Mandante: la Empresa debe
  // estar asociada a él, empresaMandantes).
  const handleSeleccionarMandante = (mandante) => {
    if (!mandante || mandante.id === mandanteIdWizard) return;
    const hayAvance = Boolean(empresaSel || proyectoSel || perfilSel || seleccion.length > 0 || previewRequerimientos);
    if (mandanteIdWizard && hayAvance && !window.confirm(
      "¿Cambiar de Mandante? Se limpiarán la Empresa, el Proyecto, el Perfil, las Personas y " +
      "Maquinarias y los Requerimientos ya elegidos.",
    )) {
      return;
    }
    setMandanteIdWizard(mandante.id);
    setEmpresaSel(null);
    setProyectoSel(null);
    setPerfilSel(null);
    setPerfilFijo(false);
    setPerfilSugerido(null);
    setSeleccion([]);
    setPreviewRequerimientos(null);
  };

  const handleSeleccionarProyecto = async (proyecto) => {
    if (estadoTarjetaProyecto(proyecto) === "no_aplica") return;
    setProyectoSel(proyecto);
    // Cambiar de Proyecto invalida el Perfil ya elegido.
    setPerfilSel(null);
    setPerfilFijo(false);
    setPerfilSugerido(null);
    try {
      const pendiente = estadoTarjetaProyecto(proyecto) === "pendiente" ? proyecto.participacionEmpresa : null;
      if (pendiente) {
        // Se completa la Participación existente: su Perfil ya está definido.
        const perfil = await perfilParticipacionService.obtenerPorId(pendiente.perfilParticipacionId);
        setPerfilSel(perfil);
        setPerfilFijo(true);
        return;
      }
      const disponibles = await perfilParticipacionService.listar({ mandanteId: mandanteEfectivo, estado: "activo" });
      if ((disponibles || []).length === 1) {
        // Solo preselecciona: no bloquea (el usuario puede elegir otro en el paso Perfil).
        setPerfilSel(disponibles[0]);
        setPerfilSugerido(disponibles[0].nombre);
      }
    } catch (err) {
      // Sin la preselección el paso Perfil se comporta como siempre (selección libre).
      console.error("No se pudo preseleccionar el Perfil:", err);
    }
  };

  const handleSeleccionarEmpresa = (empresa) => {
    // Volver a elegir la misma Empresa no debe borrar el avance ya hecho.
    if (empresaSel?.id === empresa?.id) {
      setEmpresaSel(empresa);
      return;
    }
    setEmpresaSel(empresa);
    // La carpeta vinculada era de la Empresa anterior: se limpia, con aviso.
    if (repositorioWizard) {
      carpetaWizard.olvidar();
      setRepositorioWizard(null);
      setAvisoDocumentacion("Se quitó la documentación vinculada porque cambiaste de empresa.");
    }
    setPerfilFijo(false);
    setPerfilSugerido(null);
    // Cambiar de Empresa invalida el Proyecto/Perfil ya elegidos — el
    // Proyecto podría ya no ser válido para la nueva Empresa (si ya tiene
    // una Participación activa ahí, PasoProyecto lo excluye de la lista).
    setProyectoSel(null);
    setPerfilSel(null);
    // El Mandante NO se toca: se eligió en el Paso 1 y es independiente de la Empresa.
  };

  // `confirmado`: el usuario ya aceptó la lista de asignaciones que se finalizarán al mover
  // Personas/Maquinarias desde otros Proyectos (409 CONFIRMACION_REQUERIDA, ver más abajo).
  const ejecutarAcreditacion = async (confirmado = false) => {
    setEjecutando(true);
    setErrorEjecucion(null);
    setConfirmacionMovimiento(null);

    let participacionId = progreso?.participacionId || null;

    // Participación pendiente existente: se activa en vez de crear una duplicada.
    const pendiente = estadoTarjetaProyecto(proyectoSel) === "pendiente" ? proyectoSel.participacionEmpresa : null;

    if (!participacionId && pendiente) {
      try {
        await participacionService.transicionar(pendiente.id, "activa");
        participacionId = pendiente.id;
        setProgreso({ participacionId });
      } catch (err) {
        setErrorEjecucion({ paso: "participacion", mensaje: err.message || "No se pudo activar la Participación pendiente." });
        setEjecutando(false);
        return;
      }
    }

    if (!participacionId) {
      try {
        const participacion = await participacionService.crear({
          proyectoId: proyectoSel.id,
          empresaId: empresaSel.id,
          perfilParticipacionId: perfilSel.id,
          fechaInicio,
        });
        participacionId = participacion.id;
        setProgreso({ participacionId });
      } catch (err) {
        setErrorEjecucion({ paso: "participacion", mensaje: err.message || "No se pudo crear la Participación." });
        setEjecutando(false);
        return;
      }
    }

    if (seleccion.length > 0 && !progreso?.sujetosListo) {
      // acreditacionService.asignarEntidad decide solo: si la Persona/
      // Maquinaria ya está activa en otro Proyecto, la mueve (cierra la
      // anterior, crea la nueva, reutiliza su documentación vigente) en
      // vez de fallar por duplicado — mismo mecanismo que "Reemplazar
      // Acreditación".
      const resultados = await Promise.allSettled(
        seleccion.map((item) =>
          acreditacionService.asignarEntidad({
            entidadTipo: item.tipo === "persona" ? "persona" : "maquinaria",
            entidadId: item.id,
            proyectoDestinoId: proyectoSel.id,
            empresaId: empresaSel.id,
            perfilRecursoIds: item.perfilRecursoIds,
            fechaInicio,
            confirmado,
          }),
        ),
      );

      const fallidas = resultados
        .map((r, i) => ({ r, item: seleccion[i] }))
        .filter(({ r }) => r.status === "rejected");

      // Solo faltan confirmaciones de movimiento: se muestran los afectados (nombre, Empresa
      // actual, Proyecto) y se reintenta con confirmado: true. Las exitosas no se repiten.
      if (fallidas.length > 0 && fallidas.every(({ r }) => r.reason?.codigo === "CONFIRMACION_REQUERIDA")) {
        setSeleccion(fallidas.map(({ item }) => item));
        setProgreso({ participacionId });
        setConfirmacionMovimiento({
          afectados: fallidas.flatMap(({ r }) => r.reason?.detalle?.afectados || []),
        });
        setEjecutando(false);
        return;
      }

      if (fallidas.length > 0) {
        const exitosas = resultados
          .map((r, i) => ({ r, item: seleccion[i] }))
          .filter(({ r }) => r.status === "fulfilled");

        // Deja seleccionadas SOLO las que fallaron, para que un reintento
        // no vuelva a crear las que ya se crearon (evita duplicados).
        setSeleccion(fallidas.map(({ item }) => item));
        setProgreso({ participacionId });
        setErrorEjecucion({
          paso: "sujetos",
          mandanteId: mandanteEfectivo || null,
          mensaje:
            `La Participación se creó correctamente (no se duplicará si reintentas). ` +
            `${exitosas.length} de ${seleccion.length} personas/maquinarias se asignaron con éxito` +
            (exitosas.length > 0 ? ` (${exitosas.map(({ item }) => item.nombre).join(", ")}).` : ".") +
            ` Las siguientes fallaron: ${fallidas.map(({ item, r }) => `${item.nombre} — ${r.reason?.message || "error desconocido"}`).join("; ")}. ` +
            `No se creó el Expediente todavía — corrige y reintenta.`,
        });
        setEjecutando(false);
        return;
      }

      setProgreso({ participacionId, sujetosListo: true });
    } else if (!progreso?.sujetosListo) {
      setProgreso({ participacionId, sujetosListo: true });
    }

    try {
      // Si la Participación pendiente ya tenía un Expediente en curso, se reutiliza.
      const expedienteId = pendiente?.expedienteId || (await expedienteService.crear({ participacionId })).id;
      // Documentación elegida en el paso Empresa: se guarda en el expediente recién creado (escritura
      // aparte, mismo endpoint y Bitácora que la pestaña Documentación). Si falla, el expediente NO
      // se revierte: se avisa en su detalle.
      let falloRepositorio = false;
      if (repositorioWizard) {
        try {
          if (repositorioWizard.tipo === "local") await traspasarCarpetaWizard(profile?.uid, sesionWizard, expedienteId);
          await repositorioDocumentalService.actualizar(expedienteId, repositorioWizard.tipo === "local"
            ? { tipo: "local", etiqueta: repositorioWizard.etiqueta, mapeo: repositorioWizard.mapeo }
            : { tipo: "sharepoint", url: repositorioWizard.url, etiqueta: repositorioWizard.etiqueta, mapeo: repositorioWizard.mapeo });
          // Carpeta de cada persona/maquinaria elegida desde la carpeta (en su participación).
          for (const s of seleccion.filter((x) => x.carpetaRelativa)) {
            await repositorioDocumentalService.asignarCarpetaSujeto(expedienteId, {
              tipo: s.tipo, sujetoId: s.id, carpetaRelativa: s.carpetaRelativa,
            });
          }
        } catch {
          falloRepositorio = true;
        }
      }
      limpiarEstadoGuardado();
      navigate(`/expedientes/${expedienteId}${falloRepositorio ? "?aviso=repositorio" : ""}`);
    } catch (err) {
      setProgreso({ participacionId, sujetosListo: true });
      setErrorEjecucion({
        paso: "expediente",
        mensaje:
          `La Participación y las personas/maquinarias asignadas ya se crearon correctamente (no se duplicarán si reintentas). ` +
          `El Expediente falló: ${err.message || "error desconocido"}.`,
      });
      setEjecutando(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate("/dashboard")}
            className="p-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 transition-colors shadow-sm"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-primary-lighter text-primary-dark flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-carbon-dark tracking-tight">Nueva Acreditación</h2>
              <p className="text-xs text-gray-500 mt-1">Vincula una Empresa a un Proyecto y arma su Expediente en un solo flujo.</p>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={handleReiniciar}
          disabled={ejecutando}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-xs font-semibold text-gray-600 transition-colors shadow-sm disabled:opacity-50"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Reiniciar
        </button>
      </div>

      <StepIndicator step={step} pasos={pasosVisibles} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
      <div className="lg:col-span-2 min-w-0 space-y-6">
      <div
        data-asistente-ref={REF_PASO[step] || undefined}
        className={`bg-white p-6 rounded-2xl border border-gray-100 shadow-card scroll-mt-24 ${CLASE_RESALTADO}`}
      >
        {step === 1 && !mandanteFijo && (
          <PasoMandante
            mandantes={mandantes}
            error={errorMandantes}
            mandanteId={mandanteIdWizard}
            onSeleccionar={handleSeleccionarMandante}
          />
        )}
        {step === 2 && (
          <PasoEmpresa
            mandanteId={mandanteEfectivo}
            empresaId={empresaSel?.id}
            onSeleccionar={handleSeleccionarEmpresa}
          />
        )}
        {step === 2 && (empresaSel || avisoDocumentacion) && (
          <DocumentacionWizard
            key={`${sesionWizard}|${empresaSel?.id || ""}`}
            valor={repositorioWizard}
            carpeta={carpetaWizard}
            aviso={avisoDocumentacion}
            onCambiar={(valor) => { setRepositorioWizard(valor); setAvisoDocumentacion(null); }}
          />
        )}
        {step === 3 && (
          <PasoProyecto
            mandanteId={mandanteEfectivo}
            empresaId={empresaSel?.id}
            empresaSel={empresaSel}
            proyectoId={proyectoSel?.id}
            onSeleccionar={handleSeleccionarProyecto}
            onCambiarEmpresa={progreso?.participacionId ? undefined : () => setStep(2)}
            avisoPerfil={perfilSugerido}
          />
        )}
        {step === 4 && (
          <PasoPerfil
            mandanteId={mandanteEfectivo}
            perfilId={perfilSel?.id}
            perfilFijo={perfilFijo}
            onSeleccionar={setPerfilSel}
            empresaSel={empresaSel}
            proyectoSel={proyectoSel}
          />
        )}
        {step === 5 && (
          <PasoAsignaciones
            mandanteId={mandanteEfectivo}
            empresaId={empresaSel?.id}
            proyectoSel={proyectoSel}
            seleccion={seleccion}
            onCambiarSeleccion={setSeleccion}
            mostrarErrores={erroresPaso5}
            onIrAProblema={(ref) => irAProblema(5, ref)}
            carpeta={repositorioWizard?.tipo === "local" ? carpetaWizard : null}
            mapeo={repositorioWizard?.mapeo || null}
            onCambiarMapeo={(tipo, ruta) => setRepositorioWizard((r) => (r ? {
              ...r, mapeo: { ...(r.mapeo || MAPEO_VACIO), [tipo === "persona" ? "carpetaPersonas" : "carpetaRecursos"]: ruta },
            } : r))}
          />
        )}
        {step === 6 && (
          <PasoRequerimientos
            empresaId={empresaSel?.id}
            perfilParticipacionId={perfilSel?.id}
            fechaInicio={fechaInicio}
            seleccion={seleccion}
            empresaNombre={empresaSel?.razonSocial}
            onCargado={setPreviewRequerimientos}
          />
        )}
        {step === PASO_CONFIRMACION && (
          <PasoResumen
            empresaSel={empresaSel}
            proyectoSel={proyectoSel}
            perfilSel={perfilSel}
            seleccion={seleccion}
            fechaInicio={fechaInicio}
            onFechaInicioChange={setFechaInicio}
            preview={previewRequerimientos}
            ejecutando={ejecutando}
            progreso={progreso}
            errorEjecucion={errorEjecucion}
            onConfirmar={() => ejecutarAcreditacion(false)}
            requisitosPerfil={requisitosPerfil}
            onIrAPaso={setStep}
            problemas={problemas}
            onCorregir={irAProblema}
            repositorio={repositorioWizard}
          />
        )}
      </div>

      {step === 5 && seleccion.length > 0 && (
        <div className="p-3 rounded-xl bg-sky-50 border border-sky-200 text-sky-800 text-xs">
          {seleccion.length} {seleccion.length === 1 ? "recurso será asignado" : "recursos serán asignados"} a {proyectoSel?.nombre}.
          {trasladosCount > 0 && (
            <span> {trasladosCount} de ellas {trasladosCount === 1 ? "será trasladada" : "serán trasladadas"} desde otro proyecto.</span>
          )}
          {" "}Nada se guarda hasta confirmar en el último paso.
        </div>
      )}

      {step === 3 && proyectoNoAplica && (
        <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs">
          {MENSAJE_NO_APLICA}
        </div>
      )}

      {step < PASO_CONFIRMACION && (
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={handleAtras}
            className="px-5 py-2.5 text-sm font-semibold text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 rounded-xl transition-all shadow-sm"
          >
            Atrás
          </button>
          <div className="flex flex-col items-end gap-1">
            <button
              type="button"
              onClick={handleContinuar}
              disabled={!puedeContinuar}
              className="px-6 py-2.5 text-sm font-semibold text-white bg-primary hover:bg-primary-dark rounded-xl shadow-md shadow-primary/25 transition-all disabled:opacity-50"
            >
              {step === 6 && pendientesRequerimientos > 0 ? `Continuar con ${pendientesRequerimientos} ${pendientesRequerimientos === 1 ? "pendiente" : "pendientes"} →` : step === 6 ? "Continuar →" : "Continuar"}
            </button>
            {step === 6 && pendientesRequerimientos > 0 && (
              <p className="text-[11px] text-slate-400">Podrás completar estos requisitos posteriormente desde el expediente.</p>
            )}
          </div>
        </div>
      )}
      {step === PASO_CONFIRMACION && !progreso?.participacionId && (
        <div className="flex items-center justify-start">
          <button
            type="button"
            onClick={handleAtras}
            className="px-5 py-2.5 text-sm font-semibold text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 rounded-xl transition-all shadow-sm"
          >
            Volver a revisar
          </button>
        </div>
      )}
      </div>

      <ResumenAcreditacionPanel
        mandanteSel={mandanteSel}
        empresaSel={empresaSel}
        proyectoSel={proyectoSel}
        perfilSel={perfilSel}
        seleccion={seleccion}
        mostrarRequerimientos={step >= 6}
        preview={previewRequerimientos}
        cargandoPreview={step === 6 && !previewRequerimientos}
        mostrarExpediente={step >= 4 && step < 6}
        requisitosTotal={requisitosPerfil ? requisitosPerfil.length : null}
        reutilizadosEmpresa={previewEmpresa ? previewEmpresa.reutilizables : null}
        mostrarDocumentacion={step === 5}
        documentacion={previewSeleccion}
        proyectoActualId={proyectoSel?.id}
        repositorio={empresaSel ? repositorioWizard : undefined}
      />
      </div>
      {confirmacionMovimiento && (
        <ConfirmacionModal
          peligro
          titulo="Se finalizarán asignaciones vigentes"
          mensaje={`Para asignarlas a ${proyectoSel?.nombre || "este Proyecto"}, las siguientes personas/maquinarias dejarán sus asignaciones actuales. La Participación ya quedó creada; confirme para continuar.`}
          items={confirmacionMovimiento.afectados.map((a) => ({
            key: `${a.tipo}-${a.id}-${a.proyectoId}`,
            principal: a.nombre,
            secundario: `Empresa actual: ${a.empresaNombre || "—"} · Proyecto: ${a.proyectoNombre || "—"}`,
          }))}
          textoConfirmar="Confirmar y continuar"
          ocupado={ejecutando}
          onCancelar={() => setConfirmacionMovimiento(null)}
          onConfirmar={() => ejecutarAcreditacion(true)}
        />
      )}
    </div>
  );
};

// El Mandante en contexto se resuelve ANTES de montar el asistente, porque de él dependen los pasos
// visibles, el paso inicial y la validez del borrador guardado.
export const AcreditacionWizardPage = () => {
  const contexto = useMandanteContexto();
  if (!contexto.modo) {
    return <div className="py-16 text-center text-slate-400 text-xs">Cargando...</div>;
  }
  const mandanteFijo = contexto.modo === "fijo" || contexto.modo === "unico" ? contexto.mandanteId : null;
  return (
    <AsistenteAcreditacion
      mandanteFijo={mandanteFijo}
      mandantes={contexto.mandantes}
      errorMandantes={contexto.error}
    />
  );
};
