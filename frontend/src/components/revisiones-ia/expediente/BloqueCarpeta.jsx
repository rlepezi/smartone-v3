import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, FolderOpen, KeyRound, Trash2 } from "lucide-react";
import { revisionIAService } from "../../../services/revisionIAService";
import {
  soportaSelectorCarpeta, seleccionarCarpeta, leerArbol, estadoPermiso, pedirPermiso, existeCarpeta,
  obtenerCarpetaExpediente, guardarCarpetaExpediente, quitarCarpetaExpediente,
} from "../../../services/fuentes/carpetaLocal";
import { subcarpetaUnicaDeEmpresa, puedeVincularSola } from "../../../services/fuentes/carpetaBase";
import { useCarpetaBase } from "../../../hooks/useCarpetaBase";
import { validarCarpetaEmpresa } from "../../../utils/carpetaEmpresa";
import { guardarAnalisis } from "../../../utils/analisisCarpeta";
import { SelectorCarpetaEmpresa } from "../../expedientes/documentacion/SelectorCarpetaEmpresa";
import { ValidacionCarpetaEmpresa } from "../../expedientes/documentacion/ValidacionCarpetaEmpresa";
import { Toast } from "../../shared/Toast";
import { CLASE_SECUNDARIO } from "./estilos";

// Resumen de la carpeta analizada: secciones reconocidas y personas encontradas.
const resumirPlan = (plan) => {
  const empresa = plan.empresas[0];
  const personas = (empresa?.entidades || []).filter((e) => e.entidadTipo === "persona").length;
  if (plan.tipoEstructura === "libre") {
    return { libre: true, personas, archivos: empresa?.archivosIA.length || 0 };
  }
  const secciones = (empresa?.secciones || []).filter((s) =>
    s.seccionClave && !s.entidadCarpeta && !["faltante", "no_aplica"].includes(s.estado)).length;
  return { libre: false, secciones, personas };
};

// Bloque 1 "Carpeta del expediente": la MISMA carpeta que Acreditación y la pestaña Documentación
// (al guardar aquí se refleja allá, salvo una carpeta libre). Se elige entre las subcarpetas de la
// carpeta principal del Mandante, con la misma validación estricta (validarCarpetaEmpresa): una
// carpeta de otra empresa no se guarda. Si este navegador aún no la tiene y hay UNA sola subcarpeta
// de la empresa en la carpeta principal, se vincula sola y se avisa. La carpeta se analiza con la
// plantilla de estructura; el handle queda en este navegador (IndexedDB) y en el backend solo su nombre.
export const BloqueCarpeta = ({
  expedienteId, mandanteId, usuarioId, config, empresa, puedeEditar, puedeConfigurarBase = false, onGuardar, onAcceso,
}) => {
  const [registro, setRegistro] = useState(null);
  const [permiso, setPermiso] = useState(null);
  const [resumen, setResumen] = useState(null);
  const [repositorio, setRepositorio] = useState(null);
  const [noReconocida, setNoReconocida] = useState(null);
  const [rechazada, setRechazada] = useState(null);
  const [eligiendo, setEligiendo] = useState(false);
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState(null);
  const [aviso, setAviso] = useState(null);
  // Carpeta recordada en este navegador que ya no existe (se movió, se renombró o se eliminó).
  const [perdida, setPerdida] = useState(null);
  const base = useCarpetaBase(usuarioId, mandanteId);
  const modo = config?.modoEstructura || "plantilla";
  const carpetaNombre = config?.carpetaNombre || null;
  const cerrarAviso = useCallback(() => setAviso(null), []);

  // Cada análisis queda en este navegador para el panel de documentos (ubicación por estructura).
  const analizar = useCallback(async (handle, modoEstructura) => {
    const leida = await leerArbol(handle);
    const plan = await revisionIAService.analizar({ mandanteId, arbol: leida.arbol, modoEstructura });
    if (plan.tipoEstructura && plan.tipoEstructura !== "repositorio" && modoEstructura !== "libre") {
      guardarAnalisis(usuarioId, expedienteId, handle.name, plan);
    }
    return plan;
  }, [mandanteId, usuarioId, expedienteId]);

  // Valida la carpeta elegida (empresa y estructura) y, si corresponde, la deja configurada.
  const usarCarpeta = useCallback(async (handle, modoEstructura = modo) => {
    setError(null);
    setRepositorio(null);
    setNoReconocida(null);
    if (empresa && !validarCarpetaEmpresa(handle.name, empresa).valida) {
      setRechazada(handle.name);
      return false;
    }
    setRechazada(null);
    setTrabajando(true);
    try {
      const plan = await analizar(handle, modoEstructura);
      if (plan.tipoEstructura === "repositorio") {
        setRepositorio({ handle, empresas: plan.empresas.filter((e) => !e.esSubcontrato).map((e) => e.empresaCarpeta) });
        return false;
      }
      if (!plan.tipoEstructura) {
        setNoReconocida({ handle, mensaje: plan.advertencias?.[0] || "No se reconoce la estructura de la plantilla." });
        return false;
      }
      await onGuardar({ carpetaNombre: handle.name, modoEstructura });
      const reg = await guardarCarpetaExpediente(usuarioId, expedienteId, handle);
      setRegistro(reg);
      setPermiso("granted");
      setPerdida(null);
      setResumen(resumirPlan(plan));
      setEligiendo(false);
      return true;
    } catch (err) {
      setError(err.message || "No se pudo leer la carpeta.");
      return false;
    } finally {
      setTrabajando(false);
    }
  }, [modo, empresa, analizar, onGuardar, usuarioId, expedienteId]);

  // Carpeta de este navegador; si no la tiene, vinculación automática desde la carpeta principal
  // (solo con UNA subcarpeta de la empresa, y si no hay otra carpeta configurada).
  useEffect(() => {
    let vigente = true;
    (async () => {
      const reg = await obtenerCarpetaExpediente(usuarioId, expedienteId).catch(() => null);
      if (reg) {
        const estado = await estadoPermiso(reg.handle).catch(() => "prompt");
        // Con permiso se puede comprobar que siga existiendo; si no, se trata como no vinculada
        // (y se intenta la vinculación automática desde la carpeta principal).
        if (estado !== "granted" || await existeCarpeta(reg.handle)) {
          if (vigente) { setRegistro(reg); setPermiso(estado); }
          return;
        }
        if (vigente) setPerdida(reg.handle.name);
      }
      if (!empresa || (!carpetaNombre && !puedeEditar)) return;
      const unica = await subcarpetaUnicaDeEmpresa({ usuarioId, mandanteId, empresa }).catch(() => null);
      if (!vigente || !puedeVincularSola(unica, carpetaNombre)) return;
      const mensaje = `Se vinculó automáticamente la carpeta «${unica.nombre}» (única de la empresa en la carpeta principal).`;
      if (carpetaNombre) {
        // Ya configurada: solo se recuerda en este navegador.
        const nuevo = await guardarCarpetaExpediente(usuarioId, expedienteId, unica.handle);
        if (!vigente) return;
        setRegistro(nuevo);
        setPermiso("granted");
        setPerdida(null);
        setAviso(mensaje);
        setResumen(resumirPlan(await analizar(unica.handle, modo)));
      } else if (await usarCarpeta(unica.handle)) {
        if (vigente) setAviso(mensaje);
      }
    })().catch(() => {});
    return () => { vigente = false; };
    // Solo al abrir el expediente: la vinculación automática no se repite en cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuarioId, expedienteId, empresa?.id]);

  // El bloque 3 (Validar) necesita el handle con permiso concedido.
  useEffect(() => {
    onAcceso?.(registro && permiso === "granted" ? registro.handle : null);
  }, [registro, permiso, onAcceso]);

  const elegirManual = async () => {
    const handle = await seleccionarCarpeta(registro?.handle || null).catch(() => null);
    if (handle) await usarCarpeta(handle);
  };

  const elegirDeBase = async (nombre) => {
    try {
      await usarCarpeta(await base.subcarpeta(nombre));
    } catch {
      setError("No se pudo abrir esa carpeta.");
    }
  };

  const elegirDelRepositorio = async (nombre) => {
    try {
      await usarCarpeta(await repositorio.handle.getDirectoryHandle(nombre));
    } catch {
      setError("No se pudo abrir la carpeta de esa empresa.");
    }
  };

  const confirmarAcceso = async () => {
    setError(null);
    if (!(await pedirPermiso(registro.handle).catch(() => false))) {
      setPermiso("prompt");
      setError("El navegador no dio permiso para leer la carpeta.");
      return;
    }
    setPermiso("granted");
    setTrabajando(true);
    try {
      setResumen(resumirPlan(await analizar(registro.handle, modo)));
    } catch (err) {
      setError(err.message || "No se pudo analizar la carpeta.");
    } finally {
      setTrabajando(false);
    }
  };

  const quitar = async () => {
    setTrabajando(true);
    try {
      await quitarCarpetaExpediente(usuarioId, expedienteId).catch(() => null);
      setRegistro(null);
      setPermiso(null);
      setResumen(null);
      setRechazada(null);
      await onGuardar({ carpetaNombre: null });
    } finally {
      setTrabajando(false);
    }
  };

  // Carpeta configurada que no pasa la validación (de antes de esta regla): se ofrece corregirla.
  const validacionActual = empresa && carpetaNombre && !rechazada ? validarCarpetaEmpresa(carpetaNombre, empresa) : null;
  const mostrarSelector = puedeEditar && soportaSelectorCarpeta() && (eligiendo || !registro);

  return (
    <div className="space-y-3">
      <fieldset>
        <legend className="block text-xs font-semibold text-gray-700 mb-1.5">Fuente</legend>
        <div className="flex flex-wrap gap-3">
          <label className="flex items-center gap-2 px-3 py-2 rounded-xl border border-primary bg-primary-lighter/50 text-xs">
            <input type="radio" name="fuente-expediente" checked readOnly className="text-primary" /> Carpeta local
          </label>
          <label className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-100 text-xs text-slate-400 cursor-not-allowed" title="Disponible cuando se conecte SharePoint">
            <input type="radio" name="fuente-expediente" disabled /> SharePoint
            <span className="px-1.5 py-0.5 rounded-full bg-slate-100 text-[10px] font-bold text-slate-500">Próximamente</span>
          </label>
        </div>
      </fieldset>

      {!soportaSelectorCarpeta() && (
        <p className="text-xs text-amber-700">Este navegador no permite recordar carpetas. Use Chrome o Edge en un computador.</p>
      )}

      {perdida && !registro && (
        <p className="flex items-start gap-1.5 p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
          La carpeta «{perdida}» que este navegador tenía vinculada ya no se encuentra (se movió, se renombró o se eliminó). Elíjala de nuevo.
        </p>
      )}
      {carpetaNombre && !registro && (
        <p className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600">
          Carpeta configurada: <b>{carpetaNombre}</b>. Este navegador aún no la tiene vinculada: elíjala desde la carpeta principal.
        </p>
      )}

      {registro && (
        <div className="flex flex-wrap items-center gap-3 p-3 rounded-xl border border-slate-200">
          <FolderOpen className="w-5 h-5 text-primary" />
          <div className="min-w-0 mr-auto">
            <p className="text-sm font-bold text-carbon-dark truncate">{registro.handle.name}</p>
            <p className="text-[11px] text-slate-500">
              {permiso === "granted"
                ? <span className="inline-flex items-center gap-1 text-sage-dark font-semibold"><CheckCircle2 className="w-3 h-3" /> Acceso concedido</span>
                : <span className="text-amber-700 font-semibold">Confirme el acceso para leerla</span>}
              {resumen && (resumen.libre
                ? ` · Carpeta libre · ${resumen.personas} ${resumen.personas === 1 ? "carpeta de persona" : "carpetas de personas"} · ${resumen.archivos} archivos legibles`
                : ` · ${resumen.secciones} secciones reconocidas · ${resumen.personas} ${resumen.personas === 1 ? "persona" : "personas"}`)}
            </p>
          </div>
          {permiso !== "granted" && (
            <button type="button" onClick={confirmarAcceso} disabled={trabajando} className={CLASE_SECUNDARIO}>
              <KeyRound className="w-3.5 h-3.5" /> Confirmar acceso
            </button>
          )}
          {puedeEditar && (
            <>
              <button type="button" onClick={() => setEligiendo((v) => !v)} disabled={trabajando} className={CLASE_SECUNDARIO}>
                {eligiendo ? "Cancelar cambio" : "Cambiar"}
              </button>
              <button type="button" onClick={quitar} disabled={trabajando} className={CLASE_SECUNDARIO}>
                <Trash2 className="w-3.5 h-3.5" /> Quitar
              </button>
            </>
          )}
        </div>
      )}

      {validacionActual && (
        <ValidacionCarpetaEmpresa
          nombreCarpeta={carpetaNombre}
          resultado={validacionActual}
          empresaNombre={empresa.razonSocial}
          onElegirOtra={puedeEditar && !validacionActual.valida ? () => setEligiendo(true) : undefined}
          onQuitar={puedeEditar && !validacionActual.valida ? quitar : undefined}
        />
      )}

      {rechazada && (
        <ValidacionCarpetaEmpresa
          nombreCarpeta={rechazada}
          resultado={validarCarpetaEmpresa(rechazada, empresa)}
          empresaNombre={empresa?.razonSocial}
          onElegirOtra={() => { setRechazada(null); setEligiendo(true); }}
          onQuitar={() => setRechazada(null)}
        />
      )}

      {mostrarSelector && (
        <div className="p-3 rounded-xl border border-slate-100 space-y-2">
          {trabajando && <p className="text-[11px] text-slate-400">Analizando carpeta...</p>}
          <SelectorCarpetaEmpresa
            base={base}
            empresa={empresa}
            seleccionada={registro?.handle.name || null}
            onElegir={elegirDeBase}
            onManual={elegirManual}
            puedeConfigurarBase={puedeConfigurarBase}
            autoElegir={false}
          />
        </div>
      )}
      {trabajando && !mostrarSelector && <p className="text-[11px] text-slate-400">Analizando carpeta...</p>}

      {repositorio && (
        <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 space-y-2">
          <p>Elija la carpeta de esta empresa, no el repositorio. Empresas detectadas:</p>
          <div className="flex flex-wrap gap-2">
            {repositorio.empresas.map((nombre) => (
              <button key={nombre} type="button" onClick={() => elegirDelRepositorio(nombre)} disabled={trabajando} className={CLASE_SECUNDARIO}>{nombre}</button>
            ))}
          </div>
        </div>
      )}

      {noReconocida && (
        <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 space-y-2">
          <p className="flex items-start gap-1.5"><AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" /> {noReconocida.mensaje}</p>
          <button type="button" onClick={() => usarCarpeta(noReconocida.handle, "libre")} disabled={trabajando} className={CLASE_SECUNDARIO}>
            Usar como carpeta libre (sin estructura)
          </button>
          <p className="text-[11px]">Una carpeta libre se usa solo en Revisiones IA: no cambia la carpeta de la pestaña Documentación.</p>
        </div>
      )}
      {modo === "libre" && carpetaNombre && (
        <p className="text-[11px] text-slate-500">Carpeta libre: la IA lee todos los documentos y los enlaza a cada persona por su RUN. No cambia la carpeta de la pestaña Documentación.</p>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
      <Toast mensaje={aviso} onCerrar={cerrarAviso} />
    </div>
  );
};
