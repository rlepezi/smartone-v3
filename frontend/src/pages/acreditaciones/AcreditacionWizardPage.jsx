import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Check, RotateCcw, Sparkles } from "lucide-react";
import { useMandanteContexto } from "../../hooks/useMandanteContexto";
import { participacionService } from "../../services/participacionService";
import { expedienteService } from "../../services/expedienteService";
import { acreditacionService } from "../../services/acreditacionService";
import { perfilParticipacionService } from "../../services/perfilParticipacionService";
import { mandanteService } from "../../services/mandanteService";
import { proyectoService } from "../../services/proyectoService";
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
import { PasoCarpetaEmpresa } from "./wizard/PasoCarpetaEmpresa";
import { CarpetaProyecto } from "../../components/proyectos/CarpetaProyecto";
import { esCarpetaDestacada } from "../../utils/carpetasSujetos";
import { esPlanillaListado, personasDeListado } from "../../utils/listadoPersonal";
import { vehiculosDeListado } from "../../utils/listadoVehiculos";
import { leerPlanilla } from "../../utils/planillas";
import { CarpetaWizardPanel } from "./wizard/CarpetaWizardPanel";
import { repositorioDocumentalService } from "../../services/repositorioDocumentalService";
import { carpetaEmpresaService } from "../../services/carpetaEmpresaService";
import { limpiarCarpetasWizard } from "../../services/fuentes/carpetaLocal";
import { MAPEO_VACIO } from "../../utils/repositorioDocumental";
import { validarCarpetaEmpresa, carpetaDeUrlSharePoint } from "../../utils/carpetaEmpresa";

// Identificador de esta sesión del asistente: clave temporal de la carpeta local elegida antes de
// que exista el expediente.
const nuevaSesionWizard = () => (typeof crypto !== "undefined" && crypto.randomUUID ?
  crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

// `id` es el identificador interno y fijo de cada paso (lo usan `step`, los "Editar" del resumen y
// el estado guardado). El número que ve el usuario es la posición dentro de los pasos VISIBLES: para
// roles con Mandante fijo, o cuando hay un solo Mandante activo, el paso Mandante se omite y
// Proyecto pasa a ser el 1. Orden: Mandante → Proyecto (y su carpeta, opcional) → Carpeta de la
// empresa (opcional; deduce la empresa) → Empresa → Perfil → Personas → Maquinarias →
// Requerimientos → Confirmación.
const PASOS = [
  { id: 1, label: "Mandante" },
  { id: 2, label: "Proyecto" },
  { id: 3, label: "Carpeta" },
  { id: 4, label: "Empresa" },
  { id: 5, label: "Perfil" },
  { id: 6, label: "Personas" },
  { id: 7, label: "Maquinarias" },
  { id: 8, label: "Requerimientos" },
  { id: 9, label: "Confirmación" },
];
const PASO_CONFIRMACION = 9;
// Pasos de asignaciones y el tipo de cada uno.
const PASO_PERSONAS = 6;
const PASO_MAQUINARIAS = 7;
const TIPO_DE_PASO = { [PASO_PERSONAS]: "persona", [PASO_MAQUINARIAS]: "recurso" };
const PASO_DE_TIPO = { persona: PASO_PERSONAS, recurso: PASO_MAQUINARIAS };


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
//  - v4: Proyecto antes que Empresa, paso Carpeta y carpeta del proyecto.
//  - v5: Personas y Maquinarias en pasos separados.
const BORRADOR_VERSION = 5;
const STORAGE_KEY = `smartone.nuevaAcreditacionWizard.v${BORRADOR_VERSION}`;
const STORAGE_KEYS_ANTERIORES = [
  "smartone.nuevaAcreditacionWizard",
  "smartone.nuevaAcreditacionWizard.v2",
  "smartone.nuevaAcreditacionWizard.v3",
  "smartone.nuevaAcreditacionWizard.v4",
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
  // Carpeta de empresa del futuro expediente (opcional, paso Empresa), dentro de la fuente documental
  // del Mandante: { tipo, ruta, etiqueta, url, fuenteId, mapeo } | null. Al confirmar se vincula
  // (find-or-create). El handle local de la subcarpeta vive en IndexedDB con una clave temporal de
  // esta sesión del asistente. Un borrador con el formato anterior (sin ruta) se descarta.
  const [sesionWizard, setSesionWizard] = useState(() => leerBorradorValido(mandanteFijo)?.sesionWizard || nuevaSesionWizard());
  const [repositorioWizard, setRepositorioWizard] = useState(() => {
    const r = leerBorradorValido(mandanteFijo)?.repositorioWizard || null;
    return r?.ruta ? r : null;
  });
  const carpetaWizard = useCarpetaWizard(profile?.uid, sesionWizard);
  // Carpeta del proyecto en el asistente: la que ya tiene el proyecto, o la elegida/cambiada aquí
  // (`cambiada`: al confirmar se guarda en el proyecto). { valor, cambiada }.
  const [carpetaProyecto, setCarpetaProyecto] = useState(() => leerBorradorValido(mandanteFijo)?.carpetaProyecto || { valor: null, cambiada: false });
  // Relación de la Empresa elegida con el Proyecto (participacionEmpresa), pedida al elegirla.
  const [relacionCargando, setRelacionCargando] = useState(false);
  // Listados (planillas) abiertos en la vista de la carpeta en los pasos Personas y Maquinarias:
  // { persona, recurso }, cada uno { tipo, ruta, nombre, filas } | null. No se guardan en el borrador.
  const [listados, setListados] = useState({ persona: null, recurso: null });
  // Se quitó u omitió la carpeta de la empresa: la del proyecto ya no se elige sola.
  const [carpetaEmpresaDescartada, setCarpetaEmpresaDescartada] = useState(false);
  const pedidoRelacion = useRef(0);
  // Vista previa de la carpeta local de la empresa, abierta mientras se avanza por los pasos.
  const [verCarpeta, setVerCarpeta] = useState(false);

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
        seleccion, fechaInicio, previewRequerimientos, progreso, sesionWizard, repositorioWizard, carpetaProyecto,
      }));
    } catch {
      // sessionStorage lleno o bloqueado (modo privado) — no es crítico,
      // el wizard sigue funcionando en memoria para esta misma sesión.
    }
  }, [step, empresaSel, mandanteIdWizard, proyectoSel, perfilSel, perfilFijo, perfilSugerido, seleccion, fechaInicio, previewRequerimientos, progreso, sesionWizard, repositorioWizard, carpetaProyecto]);

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

  // Sidebar (pasos Perfil y Personas y Maquinarias): requisitos del Perfil y avance estimado por reutilización de nivel
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
    if (!TIPO_DE_PASO[step] || !perfilSel?.id || !empresaSel?.id) {
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
  // Selección del paso de asignaciones actual (Personas o Maquinarias).
  const seleccionPaso = seleccion.filter((s) => s.tipo === TIPO_DE_PASO[step]);
  const trasladosCount = seleccionPaso.filter(
    (s) => s.participacionActiva && s.participacionActiva.proyectoId !== proyectoSel?.id,
  ).length;

  // Vista de la carpeta en los pasos Personas / Maquinarias: marca la carpeta ya elegida para ese
  // tipo o, si no hay, las sugeridas por su nombre ("personal", "trabajadores"; "maquinarias",
  // "vehículos"…).
  const tipoPaso = TIPO_DE_PASO[step] || null;
  // Pasos Personas y Maquinarias: una planilla abierta en la vista se lee como listado (personas:
  // nombre, RUT y cargo; vehículos: descripción, patente, marca y modelo). Si no trae una tabla
  // reconocible, no cambia el listado anterior.
  const leerListado = async (ruta, archivo) => {
    if (!tipoPaso || !esPlanillaListado(archivo?.name)) return;
    try {
      const hojas = await leerPlanilla(archivo);
      const filas = tipoPaso === "persona" ? personasDeListado(hojas) : vehiculosDeListado(hojas);
      if (filas.length) setListados((l) => ({ ...l, [tipoPaso]: { tipo: tipoPaso, ruta, nombre: archivo.name, filas } }));
    } catch {
      // Planilla ilegible: la vista ya muestra su error.
    }
  };
  const rutaElegidaPaso = tipoPaso === "persona" ? repositorioWizard?.mapeo?.carpetaPersonas
    : tipoPaso === "recurso" ? repositorioWizard?.mapeo?.carpetaRecursos : null;
  const marcarCarpeta = !tipoPaso ? null : (ruta, nombre) => {
    if (rutaElegidaPaso) {
      return ruta === rutaElegidaPaso ? { texto: tipoPaso === "persona" ? "Carpeta del personal" : "Carpeta de maquinarias", clase: "bg-primary-lighter text-primary border-primary/20" } : null;
    }
    return esCarpetaDestacada(nombre, tipoPaso)
      ? { texto: tipoPaso === "persona" ? "Sugerida para personas" : "Sugerida para maquinarias", clase: "bg-sage-lighter text-sage-darker border-sage-light" }
      : null;
  };

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
    !proyectoSel && {
      paso: 2, ref: REF_PASO[2], etiqueta: "Ir a Proyecto",
      mensaje: `Falta seleccionar el Proyecto (Paso ${numeroPaso(2)}).`,
    },
    !empresaSel && {
      paso: 4, ref: REF_PASO[4], etiqueta: "Ir a Empresa",
      mensaje: `Falta seleccionar la Empresa (Paso ${numeroPaso(4)}).`,
    },
    proyectoNoAplica && { paso: 4, ref: REF_PASO[4], etiqueta: "Ir a Empresa", mensaje: MENSAJE_NO_APLICA },
    !perfilSel && {
      paso: 5, ref: REF_PASO[5], etiqueta: "Ir a Perfil",
      mensaje: `Falta elegir el Perfil de Participación (Paso ${numeroPaso(5)}).`,
    },
    !fechaInicio && {
      paso: PASO_CONFIRMACION, ref: REF_FECHA_INICIO, etiqueta: "Ir a la fecha",
      mensaje: "Falta la fecha de inicio.",
    },
    ...sinPerfil.map((s) => ({
      paso: PASO_DE_TIPO[s.tipo], ref: refRecurso(s.tipo, s.id), etiqueta: `Ir a ${s.nombre}`,
      mensaje: `Falta el Perfil de Recurso de ${s.nombre} (Paso ${numeroPaso(PASO_DE_TIPO[s.tipo])}).`,
    })),
  ].filter(Boolean);

  // Único punto de navegación a un problema: vuelve al paso (sin perder datos) y, cuando el
  // elemento ya está en pantalla, hace scroll, lo resalta y le da foco.
  const irAProblema = (paso, ref) => {
    if (TIPO_DE_PASO[paso]) setErroresPaso5(true);
    setStep(paso);
    enfocarElemento(ref);
  };

  // Paso Requerimientos: requisitos pendientes (sin documentación reutilizable) del preview ya calculado.
  const pendientesRequerimientos = previewRequerimientos?.total ? previewRequerimientos.total.total - previewRequerimientos.total.reutilizables : 0;

  const claveVerificacion = empresaSel && repositorioWizard
    ? [mandanteEfectivo, empresaSel.id, proyectoSel?.id || "", repositorioWizard.ruta || "", repositorioWizard.url || ""].join("|")
    : null;
  const [verificacion, setVerificacion] = useState({ clave: null, error: null });
  useEffect(() => {
    if (!claveVerificacion) return undefined;
    let vigente = true;
    carpetaEmpresaService.verificar({
      mandanteId: mandanteEfectivo, empresaId: empresaSel.id, proyectoId: proyectoSel?.id || null,
      ...(repositorioWizard.tipo === "sharepoint" ? { url: repositorioWizard.url } : { ruta: repositorioWizard.ruta }),
      ...(repositorioWizard.esCarpetaProyecto ? { carpetaProyecto: { ruta: repositorioWizard.ruta, url: repositorioWizard.url || null } } : {}),
    })
      .then(() => { if (vigente) setVerificacion({ clave: claveVerificacion, error: null }); })
      .catch((err) => { if (vigente) setVerificacion({ clave: claveVerificacion, error: err.message || "No se pudo verificar la carpeta." }); });
    return () => { vigente = false; };
    // claveVerificacion resume todo lo que se verifica.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claveVerificacion]);

  // La carpeta elegida (opcional) debe ser de la Empresa elegida: si no, no se avanza. Sin carpeta
  // no hay validación; tampoco con la carpeta del proyecto (su nombre es el del proyecto).
  const carpetaNoCoincide = Boolean(empresaSel && repositorioWizard) && !repositorioWizard.esCarpetaProyecto && !validarCarpetaEmpresa(
    repositorioWizard.tipo === "local" ? repositorioWizard.etiqueta : carpetaDeUrlSharePoint(repositorioWizard.url),
    empresaSel,
  ).valida;

  // La carpeta elegida se verifica en el backend (sin escribir): de la empresa, no vinculada a otro
  // expediente activo y, con el proyecto ya elegido, de ese proyecto. Mientras siga elegida con
  // error, el asistente no avanza.
  const verificandoCarpeta = Boolean(claveVerificacion) && verificacion.clave !== claveVerificacion;
  const errorCarpeta = claveVerificacion && verificacion.clave === claveVerificacion ? verificacion.error : null;

  const puedeContinuar =
    step === 1 ? Boolean(mandanteEfectivo) :
    step === 2 ? Boolean(proyectoSel) :
    step === 3 ? !errorCarpeta && !verificandoCarpeta :
    step === 4 ? Boolean(empresaSel) && !relacionCargando && !proyectoNoAplica && !carpetaNoCoincide && !errorCarpeta && !verificandoCarpeta :
    step === 5 ? Boolean(perfilSel) :
    step === 6 ? true :
    step === 7 ? true :
    step === 8 ? true : false;

  const handleAtras = () => {
    if (progreso?.participacionId) return; // ya se creó algo, no retrocede
    if (step === primerPaso) {
      navigate("/dashboard");
      return;
    }
    setStep((s) => s - 1);
  };

  const handleContinuar = () => {
    if (step === 4 && proyectoNoAplica) return;
    if (!puedeContinuar) return;
    // Pasos Personas y Maquinarias: no avanzan con seleccionados de su tipo sin perfil (sin
    // seleccionados sí).
    const sinPerfilPaso = sinPerfil.filter((s) => s.tipo === TIPO_DE_PASO[step]);
    if (sinPerfilPaso.length > 0) {
      irAProblema(step, refRecurso(sinPerfilPaso[0].tipo, sinPerfilPaso[0].id));
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
    setCarpetaProyecto({ valor: null, cambiada: false });
    setCarpetaEmpresaDescartada(false);
    setListados({ persona: null, recurso: null });
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
    carpetaWizard.olvidar();
    setRepositorioWizard(null);
    setCarpetaProyecto({ valor: null, cambiada: false });
  };

  // Paso Proyecto. Otro Proyecto invalida la carpeta de la empresa, la Empresa y el Perfil (la
  // situación de la Empresa depende del Proyecto); la carpeta del proyecto parte de la que ya tiene.
  const handleSeleccionarProyecto = (proyecto) => {
    if (proyecto?.id === proyectoSel?.id) return;
    setProyectoSel(proyecto);
    setCarpetaProyecto({ valor: proyecto?.repositorioDocumental || null, cambiada: false });
    setEmpresaSel(null);
    setPerfilSel(null);
    setPerfilFijo(false);
    setPerfilSugerido(null);
    carpetaWizard.olvidar();
    setRepositorioWizard(null);
    setVerCarpeta(false);
    setCarpetaEmpresaDescartada(false);
    setListados({ persona: null, recurso: null });
  };

  // Paso Empresa (o la deducida desde la carpeta). Con el Proyecto ya elegido, se pide la relación
  // de la Empresa con él (participacionEmpresa, misma regla del backend): ya participa → "No
  // aplica"; pendiente → se completa con su Perfil (fijo); si no, el Perfil se preselecciona cuando
  // el Mandante tiene uno solo.
  const handleSeleccionarEmpresa = async (empresa) => {
    // Volver a elegir la misma Empresa no debe borrar el avance ya hecho.
    if (empresaSel?.id === empresa?.id) {
      setEmpresaSel(empresa);
      return;
    }
    setEmpresaSel(empresa);
    setPerfilSel(null);
    setPerfilFijo(false);
    setPerfilSugerido(null);
    if (!empresa || !proyectoSel) return;
    const pedido = ++pedidoRelacion.current;
    setRelacionCargando(true);
    try {
      const lista = await proyectoService.listar({ mandanteId: mandanteEfectivo, empresaId: empresa.id });
      if (pedido !== pedidoRelacion.current) return;
      const relacion = (lista || []).find((x) => x.id === proyectoSel.id)?.participacionEmpresa || null;
      const conRelacion = { ...proyectoSel, participacionEmpresa: relacion };
      setProyectoSel(conRelacion);
      const pendiente = estadoTarjetaProyecto(conRelacion) === "pendiente" ? relacion : null;
      if (pendiente) {
        // Se completa la Participación existente: su Perfil ya está definido.
        const perfil = await perfilParticipacionService.obtenerPorId(pendiente.perfilParticipacionId);
        if (pedido !== pedidoRelacion.current) return;
        setPerfilSel(perfil);
        setPerfilFijo(true);
        return;
      }
      if (estadoTarjetaProyecto(conRelacion) === "no_aplica") return;
      const disponibles = await perfilParticipacionService.listar({ mandanteId: mandanteEfectivo, estado: "activo" });
      if (pedido !== pedidoRelacion.current) return;
      if ((disponibles || []).length === 1) {
        // Solo preselecciona: no bloquea (el usuario puede elegir otro en el paso Perfil).
        setPerfilSel(disponibles[0]);
        setPerfilSugerido(disponibles[0].nombre);
      }
    } catch (err) {
      // Sin la relación ni la preselección el paso Perfil se comporta como siempre.
      console.error("No se pudo consultar la relación de la Empresa con el Proyecto:", err);
    } finally {
      if (pedido === pedidoRelacion.current) setRelacionCargando(false);
    }
  };

  // Paso Carpeta: al elegir una subcarpeta local se abre su vista previa al costado (la carpeta del
  // proyecto no: se abre desde "Ver carpeta" del resumen).
  const handleCambiarCarpetaEmpresa = (valor) => {
    setRepositorioWizard(valor);
    if (valor?.tipo === "local" && !valor.esCarpetaProyecto) setVerCarpeta(true);
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
      // Carpetas: después de la participación y el expediente (el backend exige que la empresa
      // participe en el proyecto para registrar su carpeta). Si algo falla, el expediente NO se
      // revierte: se avisa en su detalle con el enlace para vincularla.
      // 1) Carpeta del proyecto, si se eligió o cambió aquí.
      let falloCarpetaProyecto = false;
      if (carpetaProyecto.cambiada) {
        try {
          const v = carpetaProyecto.valor;
          await proyectoService.actualizarRepositorioDocumental(proyectoSel.id, v ? { tipo: v.tipo, ruta: v.ruta, url: v.url || null } : null);
        } catch {
          falloCarpetaProyecto = true;
        }
      }
      // 2) Carpeta de la empresa: se registra en `carpetas` (proyecto + empresa; la ya registrada se
      // reutiliza) y se vincula al expediente, igual que "Vincular" desde el expediente.
      let falloRepositorio = false;
      if (repositorioWizard) {
        try {
          // Carpeta de empresa (find-or-create + validación) y, en ella, la carpeta del personal y la
          // de maquinarias elegidas en Asignaciones.
          const carpetaEmpresa = await carpetaEmpresaService.vincular(repositorioWizard.tipo === "sharepoint"
            ? { expedienteId, url: repositorioWizard.url } : { expedienteId, ruta: repositorioWizard.ruta });
          const { carpetaPersonas = null, carpetaRecursos = null } = repositorioWizard.mapeo || {};
          if (carpetaPersonas || carpetaRecursos) {
            await carpetaEmpresaService.actualizar(carpetaEmpresa.id, { carpetaPersonas, carpetaRecursos });
          }
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
      const avisos = new URLSearchParams();
      if (falloRepositorio) avisos.set("aviso", "repositorio");
      if (falloCarpetaProyecto) avisos.set("avisoProyecto", proyectoSel.id);
      navigate(`/expedientes/${expedienteId}${avisos.toString() ? `?${avisos}` : ""}`);
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

  const carpetaLocal = repositorioWizard?.tipo === "local";
  const panelCarpeta = verCarpeta && carpetaLocal;

  return (
    <div className={`${panelCarpeta ? "max-w-[112rem]" : "max-w-6xl"} mx-auto space-y-6`}>
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

      <div className={panelCarpeta ? "grid grid-cols-1 xl:grid-cols-[minmax(0,6fr)_minmax(0,5fr)] gap-6 items-start" : ""}>
      {panelCarpeta && (
        <CarpetaWizardPanel
          key={sesionWizard}
          carpeta={carpetaWizard}
          etiqueta={repositorioWizard.etiqueta}
          mandanteId={mandanteEfectivo}
          abrirCarpeta={step === PASO_PERSONAS ? repositorioWizard.mapeo?.carpetaPersonas || null
            : step === PASO_MAQUINARIAS ? repositorioWizard.mapeo?.carpetaRecursos || null : null}
          marcar={marcarCarpeta}
          onArchivo={leerListado}
          onCerrar={() => setVerCarpeta(false)}
        />
      )}
      <div className={`grid grid-cols-1 ${panelCarpeta ? "2xl:grid-cols-3" : "lg:grid-cols-3"} gap-6 items-start min-w-0`}>
      <div className={`${panelCarpeta ? "2xl:col-span-2" : "lg:col-span-2"} min-w-0 space-y-6`}>
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
          <PasoProyecto
            mandanteId={mandanteEfectivo}
            proyectoId={proyectoSel?.id}
            onSeleccionar={handleSeleccionarProyecto}
          >
            {proyectoSel && (
              <section className="pt-5 mt-1 border-t border-slate-100 space-y-2">
                <div>
                  <h4 className="text-sm font-bold text-carbon-dark">Carpeta del proyecto (opcional)</h4>
                  <p className="text-xs text-slate-500">La carpeta que contiene una subcarpeta por empresa. Con ella, en el paso siguiente se elige la de la empresa con un clic.</p>
                </div>
                <CarpetaProyecto
                  key={proyectoSel.id}
                  mandanteId={mandanteEfectivo}
                  usuarioId={profile?.uid}
                  valor={carpetaProyecto.valor}
                  onCambiar={(valor) => setCarpetaProyecto({ valor, cambiada: true })}
                  puedeConfigurarBase={profile?.rol === "superadmin"}
                  onOmitir={() => setStep(3)}
                />
                {carpetaProyecto.cambiada && (
                  <p className="text-[11px] text-slate-500">Se guardará en el proyecto al confirmar la acreditación.</p>
                )}
              </section>
            )}
          </PasoProyecto>
        )}
        {step === 3 && (
          <PasoCarpetaEmpresa
            key={`${sesionWizard}|${proyectoSel?.id || ""}`}
            mandanteId={mandanteEfectivo}
            usuarioId={profile?.uid}
            puedeConfigurarBase={profile?.rol === "superadmin"}
            proyectoId={proyectoSel?.id || null}
            carpetaProyecto={carpetaProyecto.valor}
            valor={repositorioWizard}
            carpeta={carpetaWizard}
            onCambiar={handleCambiarCarpetaEmpresa}
            empresaSel={empresaSel}
            onElegirEmpresa={handleSeleccionarEmpresa}
            onOmitir={async () => { await carpetaWizard.olvidar(); setRepositorioWizard(null); setVerCarpeta(false); setCarpetaEmpresaDescartada(true); setStep(4); }}
            autoProyecto={!carpetaEmpresaDescartada}
            onDescartar={() => setCarpetaEmpresaDescartada(true)}
            errorCarpeta={errorCarpeta}
            verificando={verificandoCarpeta}
          />
        )}
        {step === 4 && (
          <PasoEmpresa
            mandanteId={mandanteEfectivo}
            empresaId={empresaSel?.id}
            onSeleccionar={handleSeleccionarEmpresa}
            proyectoId={proyectoSel?.id || null}
            proyectoNombre={proyectoSel?.nombre || null}
            avisoPerfil={perfilSugerido}
            avisoCarpeta={carpetaNoCoincide
              ? `La carpeta «${repositorioWizard.etiqueta || repositorioWizard.ruta}» no corresponde a ${empresaSel?.razonSocial}. Elige otra empresa o cambia la carpeta en el paso anterior.`
              : errorCarpeta ? `Carpeta de la empresa: ${errorCarpeta}` : null}
          />
        )}
        {step === 5 && (
          <PasoPerfil
            mandanteId={mandanteEfectivo}
            perfilId={perfilSel?.id}
            perfilFijo={perfilFijo}
            onSeleccionar={setPerfilSel}
            empresaSel={empresaSel}
            proyectoSel={proyectoSel}
          />
        )}
        {TIPO_DE_PASO[step] && (
          <PasoAsignaciones
            key={TIPO_DE_PASO[step]}
            soloTipo={TIPO_DE_PASO[step]}
            mandanteId={mandanteEfectivo}
            empresaId={empresaSel?.id}
            proyectoSel={proyectoSel}
            seleccion={seleccion}
            onCambiarSeleccion={setSeleccion}
            mostrarErrores={erroresPaso5}
            onIrAProblema={(ref) => irAProblema(step, ref)}
            listado={listados[TIPO_DE_PASO[step]] || null}
            onQuitarListado={() => setListados((l) => ({ ...l, [TIPO_DE_PASO[step]]: null }))}
            onListado={(tipo, listado) => setListados((l) => ({ ...l, [tipo]: listado }))}
            carpeta={repositorioWizard?.tipo === "local" ? carpetaWizard : null}
            mapeo={repositorioWizard?.mapeo || null}
            onCambiarMapeo={(tipo, ruta) => setRepositorioWizard((r) => (r ? {
              ...r, mapeo: { ...(r.mapeo || MAPEO_VACIO), [tipo === "persona" ? "carpetaPersonas" : "carpetaRecursos"]: ruta },
            } : r))}
          />
        )}
        {step === 8 && (
          <PasoRequerimientos
            empresaId={empresaSel?.id}
            perfilParticipacionId={perfilSel?.id}
            fechaInicio={fechaInicio}
            seleccion={seleccion}
            empresaNombre={empresaSel?.razonSocial}
            fechaTerminoProyecto={proyectoSel?.fechaTerminoReprogramada || proyectoSel?.fechaTermino || null}
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
            onIrAPaso={setStep}
            problemas={problemas}
            onCorregir={irAProblema}
            repositorio={repositorioWizard}
            carpetaProyecto={carpetaProyecto.valor}
          />
        )}
      </div>

      {TIPO_DE_PASO[step] && seleccionPaso.length > 0 && (
        <div className="p-3 rounded-xl bg-sky-50 border border-sky-200 text-sky-800 text-xs">
          {seleccionPaso.length} {TIPO_DE_PASO[step] === "persona"
            ? (seleccionPaso.length === 1 ? "persona será asignada" : "personas serán asignadas")
            : (seleccionPaso.length === 1 ? "maquinaria será asignada" : "maquinarias serán asignadas")} a {proyectoSel?.nombre}.
          {trasladosCount > 0 && (
            <span> {trasladosCount} de ellas {trasladosCount === 1 ? "será trasladada" : "serán trasladadas"} desde otro proyecto.</span>
          )}
          {" "}Nada se guarda hasta confirmar en el último paso.
        </div>
      )}

      {step === 4 && proyectoNoAplica && (
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
              title={step === 4 && carpetaNoCoincide ? "La carpeta elegida no corresponde a la empresa seleccionada" : undefined}
              className="px-6 py-2.5 text-sm font-semibold text-white bg-primary hover:bg-primary-dark rounded-xl shadow-md shadow-primary/25 transition-all disabled:opacity-50"
            >
              {step === 8 ? "Continuar →" : "Continuar"}
            </button>
            {step === 8 && pendientesRequerimientos > 0 && (
              <p className="text-[11px] text-slate-400">
                {pendientesRequerimientos} {pendientesRequerimientos === 1 ? "requerimiento quedará" : "requerimientos quedarán"} por evaluar en el expediente.
              </p>
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
        mostrarExpediente={step >= 5 && step < 8}
        requisitosTotal={requisitosPerfil ? requisitosPerfil.length : null}
        reutilizadosEmpresa={previewEmpresa ? previewEmpresa.reutilizables : null}
        mostrarDocumentacion={Boolean(TIPO_DE_PASO[step])}
        documentacion={previewSeleccion}
        proyectoActualId={proyectoSel?.id}
        repositorio={empresaSel ? repositorioWizard : undefined}
        carpetaAbierta={panelCarpeta}
        onVerCarpeta={carpetaLocal ? () => setVerCarpeta((v) => !v) : null}
      />
      </div>
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
