import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Check, RotateCcw, Sparkles } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
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
import { ResumenAcreditacionPanel } from "../../components/shared/ResumenAcreditacionPanel";

// `id` es el identificador interno y fijo de cada paso (lo usan `step`, los "Editar" del resumen y
// el estado guardado). El número que ve el usuario es la posición dentro de los pasos VISIBLES: para
// roles con Mandante fijo el paso Mandante se omite y Empresa pasa a ser el 1.
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

// Roles cuyo Mandante viene fijo desde su perfil: no eligen Mandante en el wizard.
const ROLES_MANDANTE_FIJO = ["mandante_admin", "mandante_lector"];

const hoyISO = () => new Date().toISOString().slice(0, 10);

// El wizard se pierde por completo si el usuario navega a otra pantalla
// (p.ej. a Personas a crear una desde el flujo completo) y vuelve — el
// componente se desmonta y todo su estado en memoria se descarta. Se
// persiste en sessionStorage (vive solo en esta pestaña, se limpia sola
// al cerrarla) para poder reconstruirlo al volver a montar. Se guarda
// bajo una sola clave global: solo tiene sentido un flujo de "Nueva
// Acreditación" a la vez por pestaña.
//
// v2: con el paso Mandante los ids de paso cambiaron (Empresa pasó de 1 a 2, etc.) y el Mandante
// es obligatorio, así que un borrador de la versión anterior (clave sin sufijo) se descarta en vez
// de reinterpretarse: no tiene Mandante y su `step` apuntaría a otro paso.
const STORAGE_KEY = "smartone.nuevaAcreditacionWizard.v2";
const STORAGE_KEY_ANTERIOR = "smartone.nuevaAcreditacionWizard";

const leerEstadoGuardado = () => {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
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

export const AcreditacionWizardPage = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  // Mandante fijo del actor (mandante_admin): el paso Mandante se omite y este es el del flujo.
  const mandanteFijo = ROLES_MANDANTE_FIJO.includes(profile?.rol) ? profile?.mandanteId || null : null;
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
  const [seleccion, setSeleccion] = useState(() => leerBorradorValido(mandanteFijo)?.seleccion || []); // [{tipo, id, nombre, rol}]
  const [fechaInicio, setFechaInicio] = useState(() => leerBorradorValido(mandanteFijo)?.fechaInicio || hoyISO());
  const [previewRequerimientos, setPreviewRequerimientos] = useState(() => leerBorradorValido(mandanteFijo)?.previewRequerimientos || null);

  const [ejecutando, setEjecutando] = useState(false);
  const [progreso, setProgreso] = useState(() => leerBorradorValido(mandanteFijo)?.progreso || null); // {participacionId, asignacionesListo, expedienteId}
  const [errorEjecucion, setErrorEjecucion] = useState(null); // {paso, mensaje}

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
        step, empresaSel, mandanteIdWizard, proyectoSel, perfilSel, perfilFijo, perfilSugerido,
        seleccion, fechaInicio, previewRequerimientos, progreso,
      }));
    } catch {
      // sessionStorage lleno o bloqueado (modo privado) — no es crítico,
      // el wizard sigue funcionando en memoria para esta misma sesión.
    }
  }, [step, empresaSel, mandanteIdWizard, proyectoSel, perfilSel, perfilFijo, perfilSugerido, seleccion, fechaInicio, previewRequerimientos, progreso]);

  // Borrador de la versión anterior del wizard (sin paso Mandante): se descarta, ver STORAGE_KEY.
  useEffect(() => {
    try {
      sessionStorage.removeItem(STORAGE_KEY_ANTERIOR);
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
        seleccion: seleccion.map((s) => ({ tipo: s.tipo, id: s.id })),
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

  // Error real que impide crear (no cuenta un simple pendiente de documentación).
  const personaSinRol = seleccion.find((s) => s.tipo === "persona" && !s.rol);
  const motivoBloqueo =
    !mandanteEfectivo ? `falta seleccionar el Mandante (Paso ${numeroPaso(1)}).` :
    !empresaSel ? `falta seleccionar la Empresa (Paso ${numeroPaso(2)}).` :
    !proyectoSel ? `falta seleccionar el Proyecto (Paso ${numeroPaso(3)}).` :
    proyectoNoAplica ? MENSAJE_NO_APLICA :
    !perfilSel ? `falta elegir el Perfil de Participación (Paso ${numeroPaso(4)}).` :
    !fechaInicio ? "falta la fecha de inicio." :
    personaSinRol ? `falta el rol de ${personaSinRol.nombre} (Paso ${numeroPaso(5)}).` :
    null;

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
  };

  // Paso 1. Cambiar de Mandante con avance posterior pide confirmación y limpia Proyecto, Perfil,
  // Personas y Maquinarias y Requerimientos (todos dependen del Mandante). La Empresa se conserva:
  // es un catálogo global (RN-021), sigue siendo válida para cualquier Mandante.
  const handleSeleccionarMandante = (mandante) => {
    if (!mandante || mandante.id === mandanteIdWizard) return;
    const hayAvance = Boolean(proyectoSel || perfilSel || seleccion.length > 0 || previewRequerimientos);
    if (mandanteIdWizard && hayAvance && !window.confirm(
      "¿Cambiar de Mandante? Se limpiarán el Proyecto, el Perfil, las Personas y Maquinarias y los " +
      "Requerimientos ya elegidos. La Empresa se conserva.",
    )) {
      return;
    }
    setMandanteIdWizard(mandante.id);
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
    setPerfilFijo(false);
    setPerfilSugerido(null);
    // Cambiar de Empresa invalida el Proyecto/Perfil ya elegidos — el
    // Proyecto podría ya no ser válido para la nueva Empresa (si ya tiene
    // una Participación activa ahí, PasoProyecto lo excluye de la lista).
    setProyectoSel(null);
    setPerfilSel(null);
    // El Mandante NO se toca: se eligió en el Paso 1 y es independiente de la Empresa.
  };

  const ejecutarAcreditacion = async () => {
    setEjecutando(true);
    setErrorEjecucion(null);

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

    if (seleccion.length > 0 && !progreso?.asignacionesListo) {
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
            rol: item.tipo === "persona" ? item.rol : undefined,
            fechaInicio,
          }),
        ),
      );

      const fallidas = resultados
        .map((r, i) => ({ r, item: seleccion[i] }))
        .filter(({ r }) => r.status === "rejected");

      if (fallidas.length > 0) {
        const exitosas = resultados
          .map((r, i) => ({ r, item: seleccion[i] }))
          .filter(({ r }) => r.status === "fulfilled");

        // Deja seleccionadas SOLO las que fallaron, para que un reintento
        // no vuelva a crear las que ya se crearon (evita duplicados).
        setSeleccion(fallidas.map(({ item }) => item));
        setProgreso({ participacionId });
        // Fallas por Rol/Clasificación que no es un Perfil de Recurso activo del Mandante: se
        // guarda quién falló para ofrecer los enlaces de solución (ver PasoResumen).
        const solucionables = fallidas
          .filter(({ r }) => /no está configurad/i.test(r.reason?.message || ""))
          // `valor`: el rol/clasificación exacto que el backend rechazó (va entre comillas simples).
          .map(({ item, r }) => ({
            tipo: item.tipo, id: item.id, nombre: item.nombre,
            valor: (r.reason?.message || "").match(/'([^']+)'/)?.[1] || null,
          }));
        setErrorEjecucion({
          paso: "asignaciones",
          solucionables,
          mandanteId: mandanteEfectivo || null,
          mensaje:
            `La Participación se creó correctamente (no se duplicará si reintentas). ` +
            `${exitosas.length} de ${seleccion.length} asignaciones se crearon con éxito` +
            (exitosas.length > 0 ? ` (${exitosas.map(({ item }) => item.nombre).join(", ")}).` : ".") +
            ` Las siguientes fallaron: ${fallidas.map(({ item, r }) => `${item.nombre} — ${r.reason?.message || "error desconocido"}`).join("; ")}. ` +
            `No se creó el Expediente todavía — corrige y reintenta.`,
        });
        setEjecutando(false);
        return;
      }

      setProgreso({ participacionId, asignacionesListo: true });
    } else if (!progreso?.asignacionesListo) {
      setProgreso({ participacionId, asignacionesListo: true });
    }

    try {
      // Si la Participación pendiente ya tenía un Expediente en curso, se reutiliza.
      const expedienteId = pendiente?.expedienteId || (await expedienteService.crear({ participacionId })).id;
      limpiarEstadoGuardado();
      navigate(`/expedientes/${expedienteId}`);
    } catch (err) {
      setProgreso({ participacionId, asignacionesListo: true });
      setErrorEjecucion({
        paso: "expediente",
        mensaje:
          `La Participación y las Asignaciones ya se crearon correctamente (no se duplicarán si reintentas). ` +
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
      <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-card">
        {step === 1 && !mandanteFijo && (
          <PasoMandante
            mandanteId={mandanteIdWizard}
            onSeleccionar={handleSeleccionarMandante}
          />
        )}
        {step === 2 && (
          <PasoEmpresa
            empresaId={empresaSel?.id}
            onSeleccionar={handleSeleccionarEmpresa}
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
            onConfirmar={ejecutarAcreditacion}
            requisitosPerfil={requisitosPerfil}
            onIrAPaso={setStep}
            motivoBloqueo={motivoBloqueo}
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
      />
      </div>
    </div>
  );
};
