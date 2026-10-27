import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Building2, FileWarning, UserPlus, UserRound } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { revisionIAService } from "../../services/revisionIAService";
import { plantillaEstructuraService } from "../../services/plantillaEstructuraService";
import {
  obtenerEjecucion, suscribirEjecucion, cancelarEjecucion, hayEjecucionEnCurso,
} from "../../services/fuentes/ejecutorRevision";
import { useSesionRevisionEnVivo } from "../../hooks/useSesionRevisionEnVivo";
import { ErrorBanner } from "../../components/shared/ErrorBanner";
import { ConfirmacionModal } from "../../components/shared/ConfirmacionModal";
import { Tabs } from "../../components/shared/Tabs";
import { ResultadoTipoCard } from "../../components/revisiones-ia/ResultadoTipoCard";
import { CorregirResultadoModal } from "../../components/revisiones-ia/CorregirResultadoModal";
import { CompletitudEmpresa } from "../../components/revisiones-ia/CompletitudEmpresa";
import { formatFecha } from "../../utils/fechas";
import {
  CLASE_BADGE, ESTADO_ENLACE, ESTADO_SESION, ROLES_OPERAN_REVISIONES, formatRun, formatUsd, semaforoEmpresa,
} from "../../utils/revisionIA";

const ESTADO_ARCHIVO = {
  en_cola: { label: "En cola", clase: "text-slate-400" },
  enviando: { label: "Procesando…", clase: "text-primary" },
  procesado: { label: "Procesado", clase: "text-sage-dark" },
  error: { label: "Error", clase: "text-red-600" },
  cancelado: { label: "Cancelado", clase: "text-slate-400" },
};

// Ejecución local (cola de envío del navegador) como estado de React.
const useEjecucion = (sesionId) => {
  const suscribir = useCallback((avisar) => suscribirEjecucion(sesionId, avisar), [sesionId]);
  const version = useSyncExternalStore(suscribir, () => obtenerEjecucion(sesionId)?.version ?? -1);
  return version >= 0 ? obtenerEjecucion(sesionId) : null;
};

// Entidades (personas) de una empresa con sus resultados de IA y archivos enviados.
const entidadesDeEmpresa = (empresaCarpeta, resultados, procesamientos, ejecucion) => {
  const entidades = new Map();
  const de = (clave) => {
    if (!entidades.has(clave)) entidades.set(clave, { clave, resultados: [], archivos: new Map() });
    return entidades.get(clave);
  };
  const deLaEmpresa = (x) => (x.empresaCarpeta || "") === (empresaCarpeta || "");
  ejecucion?.archivos.forEach((a) => {
    if (a.entidadClave?.startsWith(`${empresaCarpeta}|`) || !empresaCarpeta) {
      de(a.entidadClave).archivos.set(a.ruta, { nombre: a.nombre, estado: a.estado, error: a.error });
    }
  });
  procesamientos.filter(deLaEmpresa).forEach((p) => {
    de(p.carpetaRelativa).archivos.set(p.archivoRef?.rutaRelativa, {
      nombre: p.archivoRef?.nombre, estado: p.estado, error: p.error, tipoDetectado: p.tipoDetectado,
      descripcion: p.tipoDetectadoDescripcion, reutilizado: Boolean(p.reutilizadoDe),
    });
  });
  resultados.filter(deLaEmpresa).forEach((r) => de(r.entidadClave || r.carpetaRelativa).resultados.push(r));
  return [...entidades.values()];
};

// Empresas de la sesión: las detectadas (con enlace) o, en sesiones anteriores a la plantilla, una
// sola agrupación.
const empresasDeSesion = (sesion) => (sesion.empresasDetectadas?.length ? sesion.empresasDetectadas
  : [{ empresaCarpeta: "", nombreEmpresaDetectado: sesion.carpetaRaizNombre, empresaNombre: null, expedienteId: null }]);

// Detalle de una sesión de Revisiones IA: progreso en vivo (onSnapshot) y, por empresa, la
// completitud contra la plantilla y la validación con IA (Aceptar / Corregir / Descartar).
export const SesionRevisionPage = () => {
  const { sesionId } = useParams();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const puedeOperar = ROLES_OPERAN_REVISIONES.includes(profile?.rol);
  const [inicial, setInicial] = useState(null);
  const [plantilla, setPlantilla] = useState(null);
  const [error, setError] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [confirmarCancelar, setConfirmarCancelar] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const [corrigiendo, setCorrigiendo] = useState(null);
  const [descartando, setDescartando] = useState(null);
  const [resolviendo, setResolviendo] = useState(false);
  const [pestanas, setPestanas] = useState({});
  const ejecucion = useEjecucion(sesionId);

  // Primera carga por la API (valida el acceso, trae la completitud y el mandanteId para las
  // consultas en vivo).
  useEffect(() => {
    let vigente = true;
    revisionIAService.detalle(sesionId)
      .then((d) => {
        if (!vigente) return;
        setInicial(d);
        plantillaEstructuraService.obtenerActiva(d.sesion.mandanteId)
          .then((p) => { if (vigente && p?.id === d.sesion.plantillaId) setPlantilla(p); })
          .catch(() => {});
      })
      .catch((err) => { if (vigente) setError(err.message || "No se pudo cargar la revisión."); });
    return () => { vigente = false; };
  }, [sesionId]);

  const vivo = useSesionRevisionEnVivo(sesionId, inicial?.sesion?.mandanteId);
  const sesion = vivo.sesion || inicial?.sesion || null;
  const procesamientos = vivo.procesamientos || inicial?.procesamientos || [];
  const resultados = vivo.resultados || inicial?.resultados || [];
  const completitud = inicial?.completitud || [];

  // Aviso al cerrar o recargar mientras se envían archivos (la cola vive en esta pestaña).
  useEffect(() => {
    const alSalir = (e) => {
      if (!hayEjecucionEnCurso()) return undefined;
      e.preventDefault();
      e.returnValue = "";
      return "";
    };
    window.addEventListener("beforeunload", alSalir);
    return () => window.removeEventListener("beforeunload", alSalir);
  }, []);

  const resolver = async (resultado, accion, extra = {}) => {
    setResolviendo(true);
    setError(null);
    setAviso(null);
    try {
      const r = await revisionIAService.resolver(resultado.id, { accion, ...extra });
      const partes = [];
      if (r.evaluacionesCreadas) partes.push(`${r.evaluacionesCreadas} ${r.evaluacionesCreadas === 1 ? "evaluación creada" : "evaluaciones creadas"}`);
      if (r.mensaje) partes.push(r.mensaje);
      if (r.errores?.length) partes.push(`Con errores: ${r.errores.map((e) => e.mensaje).join(" · ")}`);
      setAviso(partes.join(". ") || (accion === "descartar" ? "Resultado descartado." : "Listo."));
      setCorrigiendo(null);
      setDescartando(null);
      if (!vivo.resultados) setInicial(await revisionIAService.detalle(sesionId));
    } catch (err) {
      setError(err.message || "No se pudo resolver el resultado.");
    } finally {
      setResolviendo(false);
    }
  };

  const alResolver = (resultado, accion) => {
    if (accion === "corregir") setCorrigiendo(resultado);
    else if (accion === "descartar") setDescartando(resultado);
    else resolver(resultado, "aceptar");
  };

  const cancelar = async () => {
    setCancelando(true);
    try {
      await cancelarEjecucion(sesionId);
      setConfirmarCancelar(false);
      if (!vivo.sesion) setInicial(await revisionIAService.detalle(sesionId));
    } catch (err) {
      setError(err.message || "No se pudo cancelar la revisión.");
    } finally {
      setCancelando(false);
    }
  };

  if (!sesion) {
    return (
      <div className="space-y-4">
        <ErrorBanner message={error} />
        {!error && <div className="h-40 rounded-2xl bg-white border border-slate-100 animate-pulse" aria-hidden="true" />}
      </div>
    );
  }

  const t = sesion.totales || {};
  const conIA = sesion.modo !== "completitud";
  const terminados = (t.procesados || 0) + (t.errores || 0);
  const avance = t.archivos ? Math.min(100, Math.round((terminados / t.archivos) * 100)) : 100;
  const estado = ESTADO_SESION[sesion.estado] || ESTADO_SESION.en_proceso;
  const enProceso = sesion.estado === "en_proceso";
  const interrumpida = enProceso && !ejecucion;

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <button type="button" onClick={() => navigate("/revisiones-ia")} aria-label="Volver" className="p-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 shadow-sm">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-bold text-gray-900 tracking-tight">{sesion.nombre}</h2>
            <span className={`${CLASE_BADGE} ${estado.clase}`}>{estado.label}</span>
            <span className={`${CLASE_BADGE} bg-slate-100 text-slate-600 border-slate-200`}>{conIA ? "Completitud + IA" : "Solo completitud"}</span>
          </div>
          <p className="text-xs text-gray-500">
            {formatFecha(sesion.createdAt)} · Carpeta {sesion.carpetaRaizNombre}
            {sesion.plantillaVersion ? ` · Plantilla v${sesion.plantillaVersion}` : ""}{sesion.modelo ? ` · Modelo ${sesion.modelo}` : ""}
          </p>
        </div>
        {puedeOperar && enProceso && (
          <button type="button" onClick={() => setConfirmarCancelar(true)} className="px-4 py-2 rounded-xl border border-red-200 bg-white text-xs font-bold text-red-600 hover:bg-red-50">
            Cancelar revisión
          </button>
        )}
      </div>

      <ErrorBanner message={error || vivo.error || ejecucion?.error} />
      {aviso && <p role="status" className="text-xs font-semibold text-sage-dark">{aviso}</p>}
      {interrumpida && (
        <p className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800">
          El envío de archivos no está activo en esta pestaña (la página se recargó o se abrió en otra). Los archivos
          pendientes no se enviarán; puede cancelar la revisión y empezar una nueva.
        </p>
      )}

      {conIA && (
        <section className="bg-white p-5 rounded-2xl border border-slate-100 shadow-card space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-xs text-slate-600">Validación IA: {terminados} de {t.archivos || 0} archivos ({avance}%)</p>
            <p className="text-xs text-slate-600">
              Costo: <span className="font-black text-carbon-dark">{formatUsd(sesion.costoRealUsd, 4)}</span>
              <span className="text-slate-400"> · estimado {formatUsd(sesion.costoEstimadoUsd, 4)}</span>
            </p>
          </div>
          <div className="h-2 rounded-full bg-slate-100 overflow-hidden" role="progressbar" aria-valuenow={avance} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full bg-primary transition-all" style={{ width: `${avance}%` }} />
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-slate-500">
            <span>Personas: <b className="text-carbon-dark">{t.carpetas || 0}</b></span>
            <span>Procesados: <b className="text-carbon-dark">{t.procesados || 0}</b></span>
            <span>Errores: <b className="text-red-600">{t.errores || 0}</b></span>
            <span>Excluidos de la IA: <b className="text-carbon-dark">{t.omitidos || 0}</b></span>
            <span>Cumple: <b className="text-sage-dark">{t.cumple || 0}</b></span>
            <span>No cumple: <b className="text-red-600">{t.noCumple || 0}</b></span>
            <span>Revisión humana: <b className="text-amber-600">{t.revisionHumana || 0}</b></span>
          </div>
        </section>
      )}

      {empresasDeSesion(sesion).map((empresa) => {
        const filas = completitud.filter((f) => (f.empresaCarpeta || "") === empresa.empresaCarpeta);
        const entidades = entidadesDeEmpresa(empresa.empresaCarpeta, resultados, procesamientos, ejecucion);
        const libre = sesion.modoEstructura === "libre";
        const pestana = libre ? "ia" : pestanas[empresa.empresaCarpeta] || (filas.length || !conIA ? "completitud" : "ia");
        const semaforo = semaforoEmpresa(filas.filter((f) => !f.entidadCarpeta));
        return (
          <section key={empresa.empresaCarpeta || "sesion"} className="bg-white rounded-2xl border border-slate-100 shadow-card p-5 space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <Building2 className="w-5 h-5 text-primary" />
              <div className="min-w-0 mr-auto">
                <p className="text-sm font-bold text-carbon-dark">
                  {empresa.empresaNombre || empresa.nombreEmpresaDetectado}
                  {empresa.esSubcontrato && <span className="ml-2 text-[11px] font-semibold text-slate-500">(subcontrato)</span>}
                </p>
                <p className="text-[11px] text-slate-400">
                  {empresa.empresaCarpeta}{empresa.textoProyecto ? ` · ${empresa.textoProyecto}` : ""}
                  {empresa.expedienteId && <> · <Link to={`/expedientes/${empresa.expedienteId}`} className="text-primary hover:underline">Ver expediente</Link></>}
                  {!empresa.empresaId && empresa.empresaCarpeta && " · Sin enlace"}
                </p>
              </div>
              {filas.length > 0 && (
                <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-600">
                  <span className={`w-2.5 h-2.5 rounded-full ${semaforo.clase}`} aria-hidden="true" /> {semaforo.label}
                </span>
              )}
            </div>
            <Tabs
              tabs={[...(libre ? [] : [{ key: "completitud", label: "Completitud" }]), ...(conIA ? [{ key: "ia", label: `Validación IA (${entidades.length})` }] : [])]}
              active={pestana}
              onChange={(k) => setPestanas((p) => ({ ...p, [empresa.empresaCarpeta]: k }))}
            />
            {pestana === "completitud" ? (
              <CompletitudEmpresa empresa={empresa} filas={filas} plantilla={plantilla} />
            ) : entidades.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-400">Aún no hay archivos procesados para esta empresa.</p>
            ) : (
              <div className="space-y-3">
                {entidades.map((ent) => {
                  const principal = ent.resultados[0] || null;
                  const enlace = ESTADO_ENLACE[principal?.estadoEnlace];
                  const run = principal?.runDocumento || principal?.runCarpeta;
                  const nombrePersona = principal?.personaNombre ||
                    [principal?.datosConsolidados?.nombres, principal?.datosConsolidados?.apellidos].filter(Boolean).join(" ") ||
                    (principal?.entidadCarpeta || "").split("/").pop();
                  const archivos = [...ent.archivos.values()];
                  const otros = archivos.filter((a) => a.tipoDetectado === "OTRO");
                  return (
                    <details key={ent.clave} open={ent.resultados.some((r) => r.estado === "propuesto")} className="rounded-xl border border-slate-100 [&_summary::-webkit-details-marker]:hidden">
                      <summary className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 cursor-pointer select-none">
                        <UserRound className="w-4 h-4 text-slate-400" />
                        <span className="text-sm font-bold text-carbon-dark">{nombrePersona || "Persona"}</span>
                        {run && <span className="text-xs text-slate-500">{formatRun(run)}</span>}
                        {enlace && <span className={`${CLASE_BADGE} ${enlace.clase}`}>{enlace.label}</span>}
                        {principal?.seccionesOrigen?.length > 0 && (
                          <span className="text-[11px] text-slate-400 sm:ml-auto">{principal.seccionesOrigen.join(" · ")}</span>
                        )}
                      </summary>
                      <div className="px-4 pb-4 space-y-3">
                        {principal?.estadoEnlace === "persona_no_existe" && puedeOperar && (
                          <Link
                            to={`/personas/nuevo?${new URLSearchParams({
                              rut: run || "", nombre: principal.datosConsolidados?.nombres || "", apellido: principal.datosConsolidados?.apellidos || "",
                            }).toString()}`}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-[11px] font-bold text-carbon-dark hover:bg-slate-50"
                          >
                            <UserPlus className="w-3.5 h-3.5" /> Crear persona con estos datos
                          </Link>
                        )}
                        {principal?.estadoEnlace === "sin_participacion" && principal.personaId && (
                          <Link to={`/personas/${principal.personaId}`} className="inline-flex items-center gap-1.5 text-[11px] font-bold text-primary hover:text-primary-dark">
                            <UserRound className="w-3.5 h-3.5" /> Ver la persona
                          </Link>
                        )}
                        {ent.resultados.map((r) => (
                          <ResultadoTipoCard key={r.id} resultado={r} puedeResolver={puedeOperar} onResolver={alResolver} resolviendo={resolviendo} />
                        ))}
                        {otros.length > 0 && (
                          <div className="rounded-xl border border-dashed border-slate-200 p-3 space-y-1">
                            <p className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500"><FileWarning className="w-3.5 h-3.5" /> Documentos no normalizados</p>
                            {otros.map((a) => <p key={a.nombre} className="text-[11px] text-slate-600">{a.nombre} — {a.descripcion || "sin descripción"}</p>)}
                          </div>
                        )}
                        <ul className="text-[11px] divide-y divide-slate-50">
                          {archivos.map((a) => {
                            const meta = ESTADO_ARCHIVO[a.estado] || ESTADO_ARCHIVO.en_cola;
                            return (
                              <li key={`${ent.clave}-${a.nombre}`} className="flex flex-wrap items-center gap-x-3 py-1">
                                <span className="text-slate-600 truncate max-w-[60%]">{a.nombre}</span>
                                <span className={`font-semibold ${meta.clase}`}>{meta.label}</span>
                                {a.reutilizado && <span className="text-slate-400">reutilizado (sin costo)</span>}
                                {a.error && <span className="text-red-600">{a.error}</span>}
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    </details>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}

      {confirmarCancelar && (
        <ConfirmacionModal
          peligro
          titulo="Cancelar la revisión"
          mensaje="Los archivos que aún no se enviaron no se procesarán. Lo ya procesado se conserva."
          textoConfirmar="Cancelar revisión"
          textoCancelar="Seguir"
          ocupado={cancelando}
          onConfirmar={cancelar}
          onCancelar={() => setConfirmarCancelar(false)}
        />
      )}
      {descartando && (
        <ConfirmacionModal
          titulo="Descartar el resultado"
          mensaje="No se crearán evaluaciones para este documento."
          textoConfirmar="Descartar"
          ocupado={resolviendo}
          onConfirmar={() => resolver(descartando, "descartar")}
          onCancelar={() => setDescartando(null)}
        />
      )}
      {corrigiendo && (
        <CorregirResultadoModal
          resultado={corrigiendo}
          ocupado={resolviendo}
          onConfirmar={(datos) => resolver(corrigiendo, "corregir", datos)}
          onCancelar={() => setCorrigiendo(null)}
        />
      )}
    </div>
  );
};
