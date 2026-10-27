import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, FolderOpen, KeyRound, Trash2 } from "lucide-react";
import { revisionIAService } from "../../../services/revisionIAService";
import {
  soportaSelectorCarpeta, seleccionarCarpeta, leerArbol, estadoPermiso, pedirPermiso,
  obtenerCarpetaExpediente, guardarCarpetaExpediente, quitarCarpetaExpediente,
} from "../../../services/fuentes/carpetaLocal";
import { CLASE_PRIMARIO, CLASE_SECUNDARIO } from "./estilos";

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

// Bloque 1 "Carpeta del expediente": elige la carpeta de la EMPRESA (no el repositorio), la valida
// con el analizador de estructura y guarda su handle en este navegador (IndexedDB) y solo su
// nombre en el backend. Avisa si la carpeta no parece de la empresa del expediente.
export const BloqueCarpeta = ({
  expedienteId, mandanteId, usuarioId, config, coincidencia, empresaNombre, puedeEditar, onGuardar, onAcceso,
}) => {
  const [registro, setRegistro] = useState(null);
  const [permiso, setPermiso] = useState(null);
  const [resumen, setResumen] = useState(null);
  const [repositorio, setRepositorio] = useState(null);
  const [noReconocida, setNoReconocida] = useState(null);
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState(null);
  const modo = config?.modoEstructura || "plantilla";

  useEffect(() => {
    let vigente = true;
    obtenerCarpetaExpediente(usuarioId, expedienteId)
      .then(async (reg) => {
        if (!vigente) return;
        setRegistro(reg);
        setPermiso(reg ? await estadoPermiso(reg.handle).catch(() => "prompt") : null);
      })
      .catch(() => { if (vigente) setRegistro(null); });
    return () => { vigente = false; };
  }, [usuarioId, expedienteId]);

  // El bloque 3 (Validar) necesita el handle con permiso concedido.
  useEffect(() => {
    onAcceso?.(registro && permiso === "granted" ? registro.handle : null);
  }, [registro, permiso, onAcceso]);

  const analizar = async (handle, modoEstructura) => {
    const leida = await leerArbol(handle);
    return revisionIAService.analizar({ mandanteId, arbol: leida.arbol, modoEstructura });
  };

  // Valida la carpeta elegida y, si es de una empresa, la deja configurada.
  const usarCarpeta = async (handle, modoEstructura = modo) => {
    setTrabajando(true);
    setError(null);
    setRepositorio(null);
    setNoReconocida(null);
    try {
      const plan = await analizar(handle, modoEstructura);
      if (plan.tipoEstructura === "repositorio") {
        setRepositorio({ handle, empresas: plan.empresas.filter((e) => !e.esSubcontrato).map((e) => e.empresaCarpeta) });
        return;
      }
      if (!plan.tipoEstructura) {
        setNoReconocida({ handle, mensaje: plan.advertencias?.[0] || "No se reconoce la estructura de la plantilla." });
        return;
      }
      const reg = await guardarCarpetaExpediente(usuarioId, expedienteId, handle);
      setRegistro(reg);
      setPermiso("granted");
      setResumen(resumirPlan(plan));
      await onGuardar({ carpetaNombre: handle.name, modoEstructura });
    } catch (err) {
      setError(err.message || "No se pudo leer la carpeta.");
    } finally {
      setTrabajando(false);
    }
  };

  const elegir = async () => {
    const handle = await seleccionarCarpeta(registro?.handle || null).catch(() => null);
    if (handle) await usarCarpeta(handle);
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
      await onGuardar({ carpetaNombre: null });
    } finally {
      setTrabajando(false);
    }
  };

  const carpetaNombre = config?.carpetaNombre || null;

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

      {carpetaNombre && !registro && (
        <p className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600">
          Carpeta configurada: <b>{carpetaNombre}</b>. En este navegador debe seleccionarla de nuevo.
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
              <button type="button" onClick={elegir} disabled={trabajando} className={CLASE_SECUNDARIO}>Cambiar</button>
              <button type="button" onClick={quitar} disabled={trabajando} className={CLASE_SECUNDARIO}>
                <Trash2 className="w-3.5 h-3.5" /> Quitar
              </button>
            </>
          )}
        </div>
      )}

      {!registro && puedeEditar && soportaSelectorCarpeta() && (
        <button type="button" onClick={elegir} disabled={trabajando} className={CLASE_PRIMARIO}>
          <FolderOpen className="w-4 h-4" /> {trabajando ? "Analizando carpeta..." : "Seleccionar carpeta de la empresa"}
        </button>
      )}
      {trabajando && registro && <p className="text-[11px] text-slate-400">Analizando carpeta...</p>}

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
        </div>
      )}

      {coincidencia && !coincidencia.corresponde && carpetaNombre && (
        <p className="flex items-start gap-1.5 p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
          La carpeta "{carpetaNombre}" no parece corresponder a {empresaNombre || "la empresa del expediente"}. Puede continuar; quedó registrado en la Bitácora.
        </p>
      )}
      {modo === "libre" && carpetaNombre && (
        <p className="text-[11px] text-slate-500">Carpeta libre: la IA lee todos los documentos y los enlaza a cada persona por su RUN.</p>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
};
